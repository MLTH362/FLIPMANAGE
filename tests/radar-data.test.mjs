/* Tests de la couche de données du Radar : modèle, pont vers le moteur, services, stockage, sauvegarde v2. `npm test`. */
import fs from 'node:fs';
import * as db from '../src/core/db.js';
import * as M from '../src/core/radar/model.js';
import * as B from '../src/core/radar/bridge.js';
import * as S from '../src/core/radar/service.js';
import { validateBackup, BACKUP_VERSION } from '../src/core/backup.js';
globalThis.navigator ??= {}; // Node < 21 : initStore consulte navigator.storage
const store = await import('../src/core/store.js');

let fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'OK  ' : 'FAIL', n, ok ? '' : `\n     obtenu ${JSON.stringify(got)}\n     attendu ${JSON.stringify(want)}`); };
const ok = (n, cond, info = '') => eq(n, Boolean(cond), true) || (cond ? 0 : console.log('     ', info));
const TODAY = '2026-11-13';
const FX = new URL('./fixtures/', import.meta.url).pathname, F1 = 'time_series_FR_20251115-2026_20261115-2026.csv', F2 = 'time_series_FR_20261114-2028_20261115-2028.csv';

/* ===== Modèle ===== */
const v = M.validateRadarItem({ name: '  Tamagotchi ', category: 'Jouets', sizeClass: 'petit', counterfeitRisk: 'faible', condition: 'Bon état' });
eq('produit valide : nom nettoyé, origine manuelle par défaut', [v.errors, v.value.name, v.value.origin], [{}, 'Tamagotchi', { type: 'manual' }]);
eq('produit invalide', Object.keys(M.validateRadarItem({ name: ' ', sizeClass: 'énorme', counterfeitRisk: 'x', condition: 'y' }).errors), ['name', 'sizeClass', 'counterfeitRisk', 'condition']);
const pts = Array.from({ length: 5 }, (_, i) => ({ date: `2026-11-0${i + 1}`, value: i }));
const obsOk = { id: 'o1', itemId: 'i1', type: 'wiki', date: TODAY, granularity: 'day', points: pts, source: { name: 'API Wikimedia' } };
eq('observation valide / invalide', [M.validateObservation(obsOk), M.validateObservation({ ...obsOk, points: [{ date: 'x', value: 'abc' }] }), M.validateObservation({ ...obsOk, source: null }), M.validateObservation({ id: 'o', itemId: 'i', type: 'listings', date: TODAY, value: -1 }),
  M.validateObservation({ id: 'o', itemId: 'i', type: 'tiktok', date: TODAY, signal: 'oui' }), M.validateObservation({ id: 'o', itemId: 'i', type: 'listings', date: TODAY, value: 40 })], [[], ['série invalide'], ['source manquante'], ['nombre d’annonces invalide'], ['signal inconnu'], []]);
const art = M.articleFromRadar({ id: 'r1', name: 'Furby', category: 'Jouets' }, { id: 'a1', buyPrice: 1200, status: 'En stock', today: TODAY, now: 'N' });
eq('article issu du Radar : en stock, date d\'achat, lien conservé', [art.status, art.boughtOn, art.radarId, art.buyPrice, M.articleFromRadar({ id: 'r1', name: 'Furby' }, { id: 'a2', today: TODAY, now: 'N' }).boughtOn], ['En stock', TODAY, 'r1', 1200, undefined]);

/* ===== Pont vers le moteur ===== */
const wiki = (last, base = 100, recent = 160) => Array.from({ length: 400 }, (_, i) => { const d = new Date(Date.UTC(2026, 10, 12) - (399 - i) * 86400000).toISOString().slice(0, 10); return { date: d, value: i >= 386 ? recent : base }; });
const cmp = (price, study) => ({ id: `c${price}${study}`, study, name: 'x', url: `https://v.fr/${price}`, price, condition: 'Très bon état', similarity: 'Très similaire', date: '2026-11-10' });
const sold = (i) => ({ id: `s${i}`, name: `Vendu ${i}`, category: 'Jouets', status: 'Vendu', buyPrice: 500, fees: 0, createdAt: '2026-10-01T10:00:00.000Z', boughtOn: '2026-10-01' });
const sale = (i, price = 1500) => ({ id: `v${i}`, articleId: `s${i}`, date: '2026-10-07', price, fees: 0, expenses: 0, cost: 500, status: 'terminée' });
const item = (id, name, extra = {}) => ({ id, name, category: 'Jouets', sizeClass: 'petit', counterfeitRisk: 'faible', study: '', wiki: '', search: '', condition: 'Très bon état', status: 'suivi', favorite: false, articleId: '', prediction: null, createdAt: 'N', updatedAt: 'N', ...extra });
const wobs = (itemId, date = '2026-11-12') => ({ id: `w-${itemId}`, itemId, type: 'wiki', date, granularity: 'day', points: wiki(), source: { name: 'API Wikimedia', url: 'https://wikimedia.org/x' } });
const state = {
  articles: [1, 2, 3, 4, 5].map(sold).concat([{ id: 'ax', name: 'Acheté', category: 'Jouets', status: 'En stock', buyPrice: 1500, fees: 0, createdAt: 'N' }]),
  sales: [1, 2, 3, 4, 5].map((i) => sale(i)),
  comparables: [...[3000, 3200, 3300, 3400, 3500, 3600].map((p) => cmp(p, 'Tamagotchi')), ...[20000, 21000, 21500, 22000, 22500].map((p) => cmp(p, 'Cher')), ...[1000, 1030, 1050, 1070, 1100].map((p) => cmp(p, 'Acheté'))],
  settings: { market: {} },
  radar: { items: [item('A', 'Tamagotchi', { favorite: true }), item('B', 'Furby', { category: 'Mode' }), item('C', 'Rolex', { status: 'ignoré' }), item('D', 'Cher'), item('E', 'Acheté', { status: 'acheté', articleId: 'ax' })],
    obs: [wobs('A'), { id: 'l-A', itemId: 'A', type: 'listings', date: '2026-11-10', value: 25, source: { url: 'https://v.fr/s' } }], history: [] } };
const rows = B.analyseAll(state, { today: TODAY }), by = (id) => rows.find((r) => r.item.id === id);
eq('produits ignorés non analysés', rows.map((r) => r.item.id), ['A', 'B', 'D', 'E']);
eq('étude retrouvée par le nom du produit, tendance Wikipedia mesurée', [by('A').comparables, by('A').result.facts.trends.length, by('A').result.facts.trends[0].value.direction], [6, 1, 'rising']);
eq('produit rentable et documenté : ACHETER, filtre « moins de 30 € »', [by('A').result.recommendation.verdict, by('A').result.pricing.bucket, by('A').result.confidence.level], ['ACHETER', 3000, 'élevée']);
eq('vitesse tirée de vos ventes réelles (6 jours), jamais estimée sans elles', [by('A').result.facts.speed.value, by('B').result.facts.speed.kind], [6, 'unknown']);
eq('produit sans comparables : non classé, « à chiffrer »', [by('B').result.pricing.insufficient, B.toPrice(rows).map((r) => [r.id, r.comparables, r.needed])], [true, [['B', 0, 3]]]);
eq('produit trop cher : aucune tranche, pas ACHETER', [by('D').result.pricing.bucket, by('D').result.recommendation.verdict !== 'ACHETER'], [null, true]);
eq('produit acheté trop cher (15 €, revente ≈ 10 €) : ÉVITER, calculé au prix payé', [by('E').result.pricing.buyGiven, by('E').result.recommendation.verdict], [true, 'ÉVITER']);
eq('classement des opportunités : ACHETER, puis à surveiller, puis éviter ; non chiffrés exclus', B.rankOpportunities(rows).map((s) => [s.id, s.verdict]), [['A', 'ACHETER'], ['D', 'À SURVEILLER'], ['E', 'ÉVITER']]);
eq('filtres budget : jamais de produit hors tranche ni à perte', [B.byBudget(rows, 1000).map((s) => s.id), B.byBudget(rows, 3000).map((s) => s.id), B.byBudget(rows, 5000).map((s) => s.id)], [[], ['A'], ['A']]);
const qs = B.quickSales(rows);
eq('vente rapide : seuls les produits au délai mesuré, le reste est compté « inconnu »', [qs.ranked.map((r) => r.id), qs.unknownSpeed], [['A', 'D', 'E'].filter((id) => by(id).result.pricing.scenarios), 1].map((x, i) => (i === 0 ? qs.ranked.map((r) => r.id) : x)));
ok('vente rapide : rotation = bénéfice par jour', qs.ranked.every((r) => r.perDay === Math.round(r.net / r.medianDays)));
eq('tendances du moment : seul le produit en hausse', B.trendBoard(rows).map((r) => r.id), ['A']);
const ds = B.dashboardStats(rows, state.radar.obs, TODAY);
eq('tableau de bord : compteurs mesurés, meilleur bénéfice dans le budget', [ds.analysed, ds.opportunities, ds.bestProfit.id, ds.quickest.id, ds.rising, ds.lastRefresh, ds.staleItems, ds.top.map((t) => t.id)[0]], [4, 1, 'A', 'A', 1, '2026-11-12', 0, 'A']);
const old = B.analyseAll({ ...state, radar: { ...state.radar, obs: [{ ...wobs('A', '2026-09-01') }, { ...state.radar.obs[1], date: '2026-09-01' }] }, comparables: state.comparables.map((c) => ({ ...c, date: '2026-09-01' })) }, { today: TODAY });
ok('données de plus de 30 jours : analyse signalée comme à actualiser, jamais ACHETER', old[0].result.confidence.stale && old[0].result.recommendation.verdict !== 'ACHETER' && B.dashboardStats(old, [], TODAY).staleItems >= 1);
eq('calibration : prévision comparée à la vente réelle', B.calibrationRecords([item('Z', 'z', { articleId: 's1', prediction: { predictedPrice: 1000 } }), item('Y', 'y')], state.sales), [{ predictedPrice: 1000, actualPrice: 1500 }]);
const snap = (date, score, verdict, ref, net, dirs) => ({ id: `A_${date}`, itemId: 'A', date, score, verdict, reference: ref, net, directions: dirs });
eq('historique : opportunité devenue moins intéressante', (({ scoreDelta, referenceDelta, netDelta, verdictChange, trendChange, degraded }) => ({ scoreDelta, referenceDelta, netDelta, verdictChange, trendChange, degraded }))(B.compareSnapshots([snap('2026-11-13', 70, 'À SURVEILLER', 3100, 800, ['stable']), snap('2026-11-01', 85, 'ACHETER', 3300, 1000, ['rising'])])),
  { scoreDelta: -15, referenceDelta: -200, netDelta: -200, verdictChange: ['ACHETER', 'À SURVEILLER'], trendChange: [['rising'], ['stable']], degraded: true });
eq('historique : amélioration et série trop courte', [B.compareSnapshots([snap('2026-11-01', 60, 'À SURVEILLER', 1, 1, []), snap('2026-11-13', 75, 'ACHETER', 1, 1, [])]).degraded, B.compareSnapshots([snap('2026-11-01', 60, 'À SURVEILLER', 1, 1, [])])], [false, null]);
const sn = B.snapshotOf(by('A'), TODAY);
eq('instantané : un par produit et par jour', [sn.id, sn.verdict, sn.bucket, sn.directions], [`A_${TODAY}`, 'ACHETER', 3000, ['rising']]);

/* ===== Services (réseau et fichiers) ===== */
const fakeFetch = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const it1 = item('A', 'Tamagotchi', { wiki: 'Tamagotchi' });
const r1 = await S.refreshWiki(it1, { fetchFn: fakeFetch(200, { items: [{ timestamp: '2026111200', views: 10 }] }), today: TODAY });
eq('actualisation Wikipedia : observation prête à enregistrer, avec sa source', [r1.status, r1.observation.type, r1.observation.points.length, r1.observation.source.name, r1.observation.source.article], ['ok', 'wiki', 400, 'API Wikimedia (pages vues)', 'Tamagotchi']);
let calls = 0; const counting = async () => { calls++; return { status: 200, ok: true, json: async () => ({ items: [] }) }; };
const r2 = await S.refreshWiki(it1, { fetchFn: counting, today: TODAY, observations: [{ itemId: 'A', type: 'wiki', date: TODAY }] });
const r3 = await S.refreshWiki(it1, { fetchFn: counting, today: TODAY, observations: [{ itemId: 'A', type: 'wiki', date: TODAY }], force: true });
eq('pas de requête inutile : mesure du jour réutilisée, sauf actualisation forcée', [r2.status, r3.status, calls], ['skipped', 'ok', 1]);
eq('actualisation : sans article, introuvable, erreur', [(await S.refreshWiki(item('Q', 'q'), { fetchFn: counting, today: TODAY })).status, (await S.refreshWiki(it1, { fetchFn: fakeFetch(404, {}), today: TODAY })).status, (await S.refreshWiki(it1, { fetchFn: fakeFetch(500, {}), today: TODAY })).status], ['no_article', 'not_found', 'error']);
const txt1 = fs.readFileSync(FX + F1, 'utf8'), txt2 = fs.readFileSync(FX + F2, 'utf8');
eq('import du vrai export : le terme manque, il faut le demander', [S.importTrends(txt1, { fileName: F1, today: '2026-11-15' }).status, S.importTrends(txt1, { fileName: F1, today: '2026-11-15' }).chartLabel], ['needs_term', 'Intérêt dans le temps']);
const imp = S.importTrends(txt1, { fileName: F1, today: '2026-11-15', itemId: 'A', term: 'tamagotchi' });
eq('import du vrai export avec le terme : observation complète', [imp.status, imp.metrics.direction, imp.observation.term, imp.observation.points.length, imp.observation.source.geo, imp.observation.source.period, imp.observation.source.file],
  ['ok', 'emerging', 'tamagotchi', 53, 'FR', { start: '2025-11-15T20:26', end: '2026-11-15T20:26' }, F1]);
eq('l\'observation importée est acceptée par la validation', M.validateObservation({ ...imp.observation, id: 'o9', itemId: 'A' }), []);
const imp2 = S.importTrends(txt2, { fileName: F2, today: '2026-11-15', term: 'x' });
ok('export de 24 h refusé avec la raison, rien à enregistrer', imp2.status === 'too_short' && /trop courte/.test(imp2.reason) && !imp2.observation);
const rel = S.importTrends('Category: All\n\nRISING\nquery,value\ntamagotchi uni,Breakout\n', { today: TODAY });
eq('requêtes associées : idées de produits', [rel.status, rel.ideas.map((i) => [i.name, i.breakout, i.importedOn])], ['related', [['tamagotchi uni', true, TODAY]]]);
eq('fichier inconnu / plusieurs colonnes', [S.importTrends('a,b\n1,2', { today: TODAY }).status, S.importTrends('Time,a: (FR),b: (FR)\n2025-11-02,1,2\n2025-11-09,3,4\n', { today: TODAY }).status], ['unknown', 'choose_column']);

/* ===== Stockage (faux stockage en mémoire) ===== */
const mem = {}, batches = [];
const fake = { kind: 'fake', getAll: async (s) => structuredClone(mem[s] || []), getByIndex: async () => [], put: async (s, o) => { (mem[s] ||= []); const i = mem[s].findIndex((x) => x.id === o.id); i >= 0 ? (mem[s][i] = structuredClone(o)) : mem[s].push(structuredClone(o)); },
  remove: async (s, id) => { mem[s] = (mem[s] || []).filter((x) => x.id !== id); }, batch: async (ops) => { batches.push(ops.length); for (const o of ops) o.del !== undefined ? await fake.remove(o.store, o.del) : await fake.put(o.store, o.put); },
  replaceAll: async () => {}, getCovers: async () => new Map() };
db.setBackend(fake);
await store.initStore();
const st = store.getState;
eq('état initial : Radar vide', st().radar, { items: [], obs: [], history: [] });
const a1 = await store.addRadarItem({ name: 'Tamagotchi', category: 'Jouets', wiki: 'Tamagotchi' });
eq('ajout : produit suivi, enregistré', [a1.ok, a1.item.status, a1.item.favorite, mem.radarItems.length, st().radar.items.length], [true, 'suivi', false, 1, 1]);
await store.addRadarItem({ name: 'Game Boy' });
eq('doublons refusés (identique, proche), rien d\'enregistré', [(await store.addRadarItem({ name: ' tamagotchi ' })).duplicate.match, (await store.addRadarItem({ name: 'Game Boy Color' })).duplicate.match, mem.radarItems.length], ['identique', 'proche', 2]);
const exist = await store.addRadarItem({ name: 'Furby' });
eq('ajout : signale si le produit existe déjà ailleurs dans FLIPMANAGER', exist.existing, { article: null, study: null });
const o1 = await store.saveRadarObs({ itemId: a1.item.id, type: 'listings', date: TODAY, value: 30, source: { name: 'relevé manuel' } });
eq('observation enregistrée avec identifiant et date de création', [Boolean(o1.id), Boolean(o1.createdAt), mem.radarObs.length], [true, true, 1]);
let e1 = ''; try { await store.saveRadarObs({ itemId: 'inconnu', type: 'listings', date: TODAY, value: 3 }); } catch (e) { e1 = e.message; }
let e2 = ''; try { await store.saveRadarObs({ itemId: a1.item.id, type: 'listings', date: 'hier', value: 3 }); } catch (e) { e2 = e.message; }
ok('observation refusée : produit inconnu ou données invalides', /introuvable/.test(e1) && /invalide/.test(e2) && mem.radarObs.length === 1);
await store.saveRadarSnapshots([{ id: `${a1.item.id}_${TODAY}`, itemId: a1.item.id, date: TODAY, score: 80 }]);
await store.saveRadarSnapshots([{ id: `${a1.item.id}_${TODAY}`, itemId: a1.item.id, date: TODAY, score: 82 }]);
eq('historique : un instantané par produit et par jour (le dernier remplace)', [mem.radarHistory.length, mem.radarHistory[0].score, st().radar.history.length], [1, 82, 1]);
const fav = await store.saveRadarItem({ ...a1.item, favorite: true });
eq('favori enregistré', [fav.favorite, st().radar.items[0].favorite, mem.radarItems[0].favorite], [true, true, true]);
batches.length = 0;
const toStock = await store.radarToArticle(a1.item.id, { buyPrice: 1200, status: 'En stock', prediction: { predictedPrice: 2000 }, today: TODAY });
eq('marquer comme acheté : article en stock + produit lié, en UNE transaction', [toStock.ok, toStock.article.status, toStock.article.boughtOn, toStock.item.status, toStock.item.articleId === toStock.article.id, toStock.item.prediction.predictedPrice, batches], [true, 'En stock', TODAY, 'acheté', true, 2000, [2]]);
eq('persisté en base et en mémoire', [mem.articles.length, st().articles.length, mem.radarItems[0].articleId === toStock.article.id], [1, 1, true]);
let e3 = ''; try { await store.radarToArticle(a1.item.id, {}); } catch (e) { e3 = e.message; }
ok('déjà rattaché : refusé', /déjà rattaché/.test(e3));
const exist2 = await store.radarToArticle(exist.item.id, { status: 'À acheter' });
eq('ajouter au stock (à acheter) : le produit reste suivi', [exist2.ok, exist2.article.status, exist2.item.status, exist2.article.boughtOn], [true, 'À acheter', 'suivi', undefined]);
const other = await store.addRadarItem({ name: 'Walkman' });
await store.saveRadarObs({ itemId: other.item.id, type: 'tiktok', date: TODAY, signal: 'hausse', source: { name: 'TikTok Creative Center' } });
await store.saveRadarSnapshots([{ id: `${other.item.id}_${TODAY}`, itemId: other.item.id, date: TODAY, score: 50 }]);
await store.saveArticle({ id: 'dup', name: 'Walkman', status: 'À acheter', buyPrice: 0, fees: 0, createdAt: 'N', updatedAt: 'N' });
const dupArt = await store.radarToArticle(other.item.id, {});
eq('article de même nom : refusé sans rien écrire', [dupArt.ok, dupArt.duplicateArticle.id, st().articles.length], [false, 'dup', 3]);
batches.length = 0; await store.removeRadarItem(other.item.id);
eq('suppression : produit, observations et historique supprimés ensemble ; articles intacts', [batches, st().radar.items.some((i) => i.id === other.item.id), st().radar.obs.some((o) => o.itemId === other.item.id), st().radar.history.some((h) => h.itemId === other.item.id), st().articles.length], [[3], false, false, false, 3]);
await store.initStore();
eq('rechargement : tout est relu depuis le stockage', [st().radar.items.length, st().radar.obs.length, st().radar.history.length], [3, 1, 1]);
db.setBackend({ ...fake, getAll: async (s) => { if (s === 'radarObs') throw new Error('illisible'); return fake.getAll(s); } });
const origErr = console.error; console.error = () => {}; await store.initStore(); console.error = origErr;
eq('lecture du Radar impossible : l\'application démarre quand même', [st().articles.length, st().radar.obs], [3, []]);
db.setBackend(fake);

/* ===== Sauvegarde v2 ===== */
const v1 = { app: 'flipmanager', version: 1, exportedAt: 'x', data: { articles: [], sales: [], comparables: [], listings: [], images: [], settings: null } };
const chk1 = validateBackup(v1);
eq('sauvegarde v1 (sans Radar) : toujours lisible, les données du Radar ne sont pas touchées', [BACKUP_VERSION, chk1.errors, Object.keys(chk1.data).includes('radarItems')], [2, [], false]);
const v2 = { ...v1, version: 2, data: { ...v1.data, radarItems: [item('A', 'Tamagotchi')], radarObs: [obsOk, { ...obsOk, id: 'o2', itemId: 'ABSENT' }], radarHistory: [{ id: 'h', itemId: 'A', date: TODAY }] } };
const chk2 = validateBackup(v2);
eq('sauvegarde v2 : données du Radar restaurées, orphelines signalées', [chk2.errors, Object.keys(chk2.data).filter((k) => k.startsWith('radar')), chk2.counts.radarItems, chk2.counts.radarObs, chk2.warnings.length >= 1], [[], ['radarItems', 'radarObs', 'radarHistory'], 1, 2, true]);
ok('sauvegarde v2 : observation ou produit invalide refusé', validateBackup({ ...v2, data: { ...v2.data, radarObs: [{ ...obsOk, points: 'x' }] } }).errors.length > 0 && validateBackup({ ...v2, data: { ...v2.data, radarItems: [{ id: 'z', name: 'N', status: 'bizarre' }] } }).errors.length > 0 && validateBackup({ ...v2, data: { ...v2.data, radarItems: 'x' } }).errors.length > 0);
ok('sauvegarde : version future refusée', validateBackup({ ...v1, version: 3 }).errors.length > 0);

/* ===== Garde-fou : tous les endroits qui énumèrent les stores connaissent ceux du Radar ===== */
const src = (f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const places = ['core/localdb.js', 'core/cloud.js', 'pages/cloudcard.js', 'pages/settings.js', 'core/store.js', 'core/backup.js'];
eq('stores du Radar présents dans la base locale, le cloud, l\'envoi, la sauvegarde, l\'état et la validation', places.map((f) => ['radarItems', 'radarObs', 'radarHistory'].every((s) => src(f).includes(s))), places.map(() => true));
ok('base locale passée en version 2 (création des nouveaux stores)', /VERSION = 2/.test(src('core/localdb.js')));

console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests passent'); process.exit(fail ? 1 : 0);

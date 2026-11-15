/* Tests du moteur Radar : `npm test`. Couvre les 8 cas du cahier des charges, les imports CSV, la tendance, les prix,
   la provenance des données (une donnée inconnue reste inconnue) et des propriétés sur des milliers de cas aléatoires. */
import * as R from '../src/core/radar/index.js';
import { saleAt } from '../src/core/finance.js';

let fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'OK  ' : 'FAIL', n, ok ? '' : `\n     obtenu ${JSON.stringify(got)}\n     attendu ${JSON.stringify(want)}`); };
const ok = (n, cond, info = '') => eq(n, Boolean(cond), true) || (cond ? 0 : console.log('     ', info));

const TODAY = '2026-11-13';
const cmp = (price, extra = {}) => ({ study: 'X', name: 'x', url: `https://v.fr/${price}`, price, condition: 'Très bon état', similarity: 'Très similaire', date: '2026-11-10', ...extra });
const comps = (prices, extra) => prices.map((p) => cmp(p, extra));
const item = { id: 'i1', name: 'Tamagotchi', category: 'Jouets', sizeClass: 'petit', counterfeitRisk: 'faible', condition: 'Très bon état' };
const rising = { name: 'Google Trends', date: '2026-11-10', metrics: { status: 'ok', direction: 'rising', ratio: 1.4, persistence: 1, seasonal: false } };
const falling = { name: 'Google Trends', date: '2026-11-10', metrics: { status: 'ok', direction: 'falling', ratio: 0.6, persistence: 0, seasonal: false } };
const sales5 = { n: 5, nDelay: 5, medianDays: 6, profitMedian: 900 };
const listings = (n) => ({ value: n, date: '2026-11-10', url: 'https://v.fr/s' });
const base = { item, today: TODAY };
const series = (values, start = '2025-01-05', step = 7) => values.map((v, i) => ({ date: R.addDays(start, i * step), value: v }));

/* ===== 1. Produit très rentable ===== */
const good = R.analyseOpportunity({ ...base, comparables: comps([3000, 3200, 3300, 3400, 3500, 3600]), trends: [rising], attention: 0.9, ownSales: sales5, activeListings: listings(25) });
eq('très rentable : prix (référence, idéal, maximum)', [good.pricing.reference, good.pricing.idealBuy, good.pricing.maxBuy], [3342, 2228, 3075]);
eq('très rentable : ACHETER, filtre « moins de 30 € »', [good.recommendation.verdict, good.pricing.bucket], ['ACHETER', 3000]);
ok('très rentable : note >= 80, confiance élevée, rien de plafonné', good.score >= 80 && good.confidence.level === 'élevée' && !good.bands.capped, `${good.score} ${good.confidence.level}`);
eq('très rentable : trois scénarios cohérents (prudent < réaliste < optimiste)', [good.pricing.prices.prudent < good.pricing.prices.realistic, good.pricing.prices.realistic < good.pricing.prices.optimistic], [true, true]);

/* ===== 2. Produit populaire mais peu rentable (acheté 9,50 €, revendu environ 10,50 €) ===== */
const thin = R.analyseOpportunity({ ...base, comparables: comps([1000, 1030, 1050, 1070, 1100]), buy: 950, trends: [rising], attention: 1, ownSales: sales5, activeListings: listings(25) });
ok('populaire mais peu rentable : attention maximale mais rentabilité faible', thin.criteria.find((c) => c.id === 'demand').points > 15 && thin.criteria.find((c) => c.id === 'profit').points < 8);
ok('populaire mais peu rentable : pas ACHETER (bénéfice prudent trop faible)', thin.recommendation.verdict !== 'ACHETER' && thin.recommendation.blockers.includes('prudent'), thin.recommendation.verdict);

/* ===== 3. Trop de concurrence ===== */
const crowded = R.analyseOpportunity({ ...base, comparables: comps([3000, 3200, 3300, 3400, 3500, 3600]), trends: [rising], attention: 0.9, ownSales: sales5, activeListings: listings(500) });
eq('trop de concurrence : 0 point sur 10', crowded.criteria.find((c) => c.id === 'competition').points, 0);
ok('trop de concurrence : note inférieure, et le chiffre relevé est cité', crowded.score < good.score && crowded.explain[3].a.includes('500'));

/* ===== 4. Budget : produit trop cher, et produit cher à revendre mais achetable sous 50 € ===== */
const pricey = R.analyseOpportunity({ ...base, comparables: comps([20000, 21000, 21500, 22000, 22500]), trends: [rising], attention: 0.9, ownSales: sales5, activeListings: listings(25) });
ok('budget dépassé : aucune tranche, jamais ACHETER, blocage « budget »', pricey.pricing.bucket === null && pricey.recommendation.verdict !== 'ACHETER' && pricey.recommendation.blockers.includes('budget'));
const resale70 = R.analyseOpportunity({ ...base, comparables: comps([6800, 6900, 7000, 7100, 7200]), trends: [rising], attention: 0.9, ownSales: sales5, activeListings: listings(25) });
eq('revente à 70 € mais achat possible sous 50 € : tranche 50 €, distinction signalée', [resale70.pricing.bucket, resale70.pricing.resaleAboveBudget], [5000, true]);

/* ===== 5. Données manquantes : rien n'est inventé ===== */
const empty = R.analyseOpportunity({ ...base, item: { id: 'e', name: 'Inconnu', category: 'Jouets' } });
eq('données manquantes : tous les critères inconnus, aucune note', [empty.criteria.every((c) => !c.known && c.points === null), empty.score, empty.coverage], [true, null, 0]);
eq('données manquantes : À SURVEILLER, confiance faible', [empty.recommendation.verdict, empty.confidence.level], ['À SURVEILLER', 'faible']);
ok('données manquantes : aucune réponse ne contient un montant, toutes « inconnues »', empty.explain.every((e) => e.kind === 'unknown' && !e.a.includes('€')), JSON.stringify(empty.explain.map((e) => e.kind)));
ok('données manquantes : faits inconnus', empty.facts.referencePrice.kind === 'unknown' && empty.facts.competition.kind === 'unknown' && empty.facts.speed.kind === 'unknown');
const onlyTrend = R.analyseOpportunity({ ...base, item: { id: 'e', name: 'X' }, trends: [rising] });
eq('seule la tendance est connue : couverture 10 %, étiquette plafonnée, pas ACHETER', [onlyTrend.coverage, onlyTrend.bands.capped || onlyTrend.bands.shown, onlyTrend.recommendation.verdict], [0.1, true, 'À SURVEILLER']);

/* ===== 6. Tendance en baisse ===== */
const down = R.analyseOpportunity({ ...base, comparables: comps([3000, 3200, 3300, 3400, 3500, 3600]), trends: [falling], attention: 0.9, ownSales: sales5, activeListings: listings(25) });
ok('tendance en baisse : 0 point, pas ACHETER', down.criteria.find((c) => c.id === 'trend').points === 0 && down.recommendation.verdict !== 'ACHETER' && down.recommendation.blockers.includes('tendance'));
eq('baisse + note inférieure à 60 : ÉVITER', R.recommend({ pricing: good.pricing, score: 55, confidence: good.confidence, trends: [falling] }).verdict, 'ÉVITER');

/* ===== 7. Bénéfice négatif : jamais de gain affiché ===== */
const loss = R.analyseOpportunity({ ...base, comparables: comps([1000, 1030, 1050, 1070, 1100]), buy: 1500, trends: [rising], attention: 1 });
const sc = loss.pricing.scenarios;
ok('bénéfice négatif : tous les scénarios sont négatifs et égaux à prix - achat', Object.values(sc).every((s) => s.net < 0 && s.net === s.price - 1500), JSON.stringify(sc));
eq('bénéfice négatif : ÉVITER, rentabilité à 0 point', [loss.recommendation.verdict, loss.criteria.find((c) => c.id === 'profit').points], ['ÉVITER', 0]);

/* ===== 8. Produit déjà présent ===== */
const existing = [{ id: 'r1', name: 'Game Boy Color' }, { id: 'r2', name: 'Tamagotchi' }];
eq('doublon : identique, proche, absent, ignoré', [R.findRadarDuplicate(existing, ' tamagotchi ')?.match, R.findRadarDuplicate(existing, 'Nintendo Game Boy Color')?.match, R.findRadarDuplicate(existing, 'Furby'), R.findRadarDuplicate(existing, 'Tamagotchi', 'r2')], ['identique', 'proche', null, null]);
const me = R.matchesExisting({ articles: [{ id: 'a1', name: 'Tamagotchi' }], comparables: [{ study: 'Furby' }] }, 'furby');
eq('déjà dans FLIPMANAGER : article et étude de marché', [R.matchesExisting({ articles: [{ id: 'a1', name: 'Tamagotchi' }], comparables: [] }, 'TAMAGOTCHI').article?.id, me.study], ['a1', 'Furby']);

/* ===== Import CSV Google Trends ===== */
const en = 'Category: All categories\n\nWeek,tamagotchi: (France)\n2025-11-16,12\n2025-11-23,<1\n2025-11-30,14\n';
const p1 = R.parseTrendsCsv(en);
eq('CSV série (en-têtes anglais)', [p1.kind, p1.category, p1.granularity, p1.terms[0].term, p1.terms[0].geo, p1.terms[0].points], ['timeseries', 'All categories', 'week', 'tamagotchi', 'France', [{ date: '2025-11-16', value: 12 }, { date: '2025-11-23', value: 0 }, { date: '2025-11-30', value: 14 }]]);
const fr = 'Catégorie : Toutes catégories\n\nSemaine,tamagotchi: (France),furby: (France)\n2025-11-16,12,5\n2025-11-23,,7\n';
const p2 = R.parseTrendsCsv(fr);
eq('CSV plusieurs termes, cellule vide = donnée absente', [p2.terms.map((t) => t.term), p2.terms[0].points[1].value, p2.terms[1].points[1].value], [['tamagotchi', 'furby'], null, 7]);
eq('CSV mensuel avec point-virgule', [R.parseTrendsCsv('Mois;game boy: (France)\n2025-01;40\n2025-02;55\n').granularity, R.parseTrendsCsv('Mois;game boy: (France)\n2025-01;40\n2025-02;55\n').terms[0].points[1]], ['month', { date: '2025-02-01', value: 55 }]);
const rel = 'Category: All categories\n\nTOP\nquery,value\ngame boy,100\ngame boy color,64\n\nRISING\nquery,value\ntamagotchi uni,Breakout\ngame boy pocket,+450%\nfurby 1998,120\n';
const p3 = R.parseTrendsCsv(rel);
eq('CSV requêtes associées (TOP / RISING)', [p3.kind, p3.items.length, p3.items[2], p3.items[3], p3.items[4]], ['related', 5, { query: 'tamagotchi uni', section: 'rising', breakout: true, value: null, percent: true }, { query: 'game boy pocket', section: 'rising', breakout: false, value: 450, percent: true }, { query: 'furby 1998', section: 'rising', breakout: false, value: 120, percent: true }]);
eq('CSV requêtes associées (en-têtes français probables)', R.parseTrendsCsv('Catégorie : Toutes\n\nPrincipales\nrequête,valeur\nwalkman,100\n\nEn hausse\nrequête,valeur\ndiscman,Pic\n').items.map((i) => [i.section, i.query, i.breakout]), [['top', 'walkman', false], ['rising', 'discman', true]]);
eq('CSV non reconnu', [R.parseTrendsCsv('a,b\n1,2\n').kind, R.parseTrendsCsv('').kind], ['unknown', 'unknown']);

/* ===== Mesure de la tendance ===== */
const flat = (n, v) => Array(n).fill(v);
const tm = (vals, g = 'week') => R.trendMetrics(series(vals), { granularity: g });
eq('tendance : hausse soutenue', (({ direction, ratio, persistence }) => [direction, ratio, persistence])(tm([...flat(26, 20), ...flat(8, 30)])), ['rising', 1.5, 1]);
eq('tendance : pic ponctuel (pas une tendance)', tm([...flat(26, 10), ...flat(7, 10), 200]).direction, 'spike');
eq('tendance : en baisse', tm([...flat(26, 20), ...flat(8, 12)]).direction, 'falling');
eq('tendance : stable', tm([...flat(26, 20), ...flat(8, 21)]).direction, 'stable');
eq('tendance : démarre de zéro', tm([...flat(26, 0), ...flat(8, 6)]).direction, 'emerging');
eq('tendance : hausse irrégulière', tm([...flat(26, 10), 40, 40, 40, 5, 5, 5, 5, 5]).direction, 'volatile');
eq('tendance : série trop courte = insuffisante, pas de ratio inventé', [tm([1, 2, 3, 4, 5]).status, tm([1, 2, 3, 4, 5]).ratio], ['insufficient', undefined]);
const seasonalVals = Array.from({ length: 110 }, (_, i) => (i >= 102 || (i >= 50 && i < 58) ? 25 : 10));
eq('tendance : même hausse l\'an dernier = saisonnière', [tm(seasonalVals).direction, tm(seasonalVals).seasonal], ['rising', true]);
eq('tendance : hausse sans précédent = non saisonnière', tm([...flat(102, 10), ...flat(8, 25)]).seasonal, false);

/* ===== Wikipedia (API Wikimedia) ===== */
eq('Wikipedia : URL', R.wikiPageviewsUrl({ article: 'Game Boy', start: '2025-11-01', end: '2025-11-10' }), 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/fr.wikipedia/all-access/user/Game_Boy/daily/20251101/20251110');
ok('Wikipedia : titre accentué encodé', R.wikiPageviewsUrl({ article: 'Pokémon (jeu de cartes)', start: '2025-11-01', end: '2025-11-02' }).includes('/Pok%C3%A9mon_(jeu_de_cartes)/'));
eq('Wikipedia : jours absents = 0 vue', R.parseWikiPageviews({ items: [{ timestamp: '2025111100', views: 5 }, { timestamp: '2025111300', views: 9 }] }, '2025-11-11', '2025-11-14'), [{ date: '2025-11-11', value: 5 }, { date: '2025-11-12', value: 0 }, { date: '2025-11-13', value: 9 }, { date: '2025-11-14', value: 0 }]);
const fakeFetch = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const w1 = await R.fetchWikiSeries(fakeFetch(200, { items: [{ timestamp: '2026112000', views: 7 }] }), { article: 'Furby', days: 3, today: '2026-11-22' });
eq('Wikipedia : réponse valide', [w1.status, w1.points.length, w1.source.retrievedAt, w1.granularity], ['ok', 3, '2026-11-22', 'day']);
eq('Wikipedia : article introuvable / erreur serveur / réseau coupé', [(await R.fetchWikiSeries(fakeFetch(404, {}), { article: 'Zzz', today: TODAY })).status, (await R.fetchWikiSeries(fakeFetch(500, {}), { article: 'Zzz', today: TODAY })).status, (await R.fetchWikiSeries(async () => { throw new Error('réseau'); }, { article: 'Zzz', today: TODAY })).status], ['not_found', 'error', 'error']);
eq('Wikipedia : introuvable = aucun point (jamais des zéros)', (await R.fetchWikiSeries(fakeFetch(404, {}), { article: 'Zzz', today: TODAY })).points, undefined);
eq('limitation des requêtes : mesure du jour réutilisée, ancienne refaite', [R.isFresh('2026-11-13', TODAY), R.isFresh('2026-11-11', TODAY), R.isFresh(null, TODAY)], [true, false, false]);

/* ===== Prix, budgets, calculs exacts ===== */
eq('tranches de budget', [1000, 1001, 2000, 4999, 5000, 5001, 0, null].map((c) => R.budgetBucket(c)), [1000, 2000, 2000, 5000, 5000, null, null, null]);
const fees = { feeFixed: 70, feeRate: 500 };
const m1 = { qty: 1, shipMode: 'total', ship: 0, pack: 0, other: 0, feeFixed: 70, feeRate: 500, chargeRate: 0 };
const mc = R.maxCostFor(3000, 100, fees);
eq('coût maximal exact avec frais fixes et en %', [mc, saleAt({ ...m1, buy: mc }, 3000).profit, saleAt({ ...m1, buy: mc + 1 }, 3000).profit], [2680, 100, 99]);
eq('coût maximal impossible', R.maxCostFor(150, 100, { feeFixed: 100, feeRate: 0 }), null);
const optNo = R.opportunityPricing(comps([3000, 3200, 3300, 3400]), {});
eq('optimiste non justifié sous 5 annonces', [optNo.prices.optimistic, optNo.optimisticOk, typeof optNo.optimisticReason], [null, false, 'string']);
eq('moins de 3 annonces : données insuffisantes', [R.opportunityPricing(comps([3000, 3200]), {}).insufficient, R.opportunityPricing([], {}).insufficient], [true, true]);
eq('annonces « peu similaires » exclues du prix', R.opportunityPricing([...comps([3000, 3200, 3300, 3400, 3500, 3600]), cmp(90000, { similarity: 'Peu similaire' })], {}).reference, 3342);
const cal = R.calibration([{ predictedPrice: 1000, actualPrice: 900 }, { predictedPrice: 2000, actualPrice: 1800 }, { predictedPrice: 3000, actualPrice: 2700 }, { predictedPrice: 1500, actualPrice: 1350 }, { predictedPrice: 2500, actualPrice: 2250 }]);
eq('calibration : 5 ventes, ratio 0,9', [cal.active, cal.factor, cal.n, cal.meanAbsErrorPct], [true, 0.9, 5, 10]);
eq('calibration : inactive sous 5 ventes, prix inchangé', [R.calibration([{ predictedPrice: 1000, actualPrice: 500 }]).active, R.applyCalibration(1000, R.calibration([]))], [false, 1000]);
eq('calibration : facteur borné à 0,85', [R.calibration(Array(6).fill({ predictedPrice: 1000, actualPrice: 400 })).factor, R.calibration(Array(6).fill({ predictedPrice: 1000, actualPrice: 400 })).clamped], [0.85, true]);
const calP = R.opportunityPricing(comps([3000, 3200, 3300, 3400, 3500, 3600]), { calibration: cal });
eq('calibration appliquée aux prix prévus, et signalée', [calP.prices.realistic, calP.calibrated], [3008, true]);
ok('prévision figée à l\'achat', R.makePrediction(good, TODAY).predictedPrice === good.pricing.prices.realistic);

/* ===== Détection de tendances et d'idées ===== */
const mk = (id, cat, direction, ratio, persistence, meanRecent) => ({ id, name: id, category: cat, metrics: { status: 'ok', direction, ratio, persistence, meanRecent } });
const watch = [mk('a', 'Jeux', 'rising', 2, 1, 50), mk('b', 'Jeux', 'rising', 1.5, 0.8, 80), mk('c', 'Jouets', 'spike', 3, 0.2, 20), mk('d', 'Jouets', 'falling', 0.5, 0, 90), mk('e', 'Mode', 'emerging', null, null, 10), mk('f', 'Mode', 'stable', 1, 0.5, 30), { id: 'g', name: 'g', category: 'Mode', metrics: { status: 'insufficient' } }];
eq('produits émergents classés, pic exclu', R.rankEmerging(watch).map((i) => [i.id, i.emergence]), [['a', 1], ['b', 0.4], ['e', 0.5]].sort((x, y) => y[1] - x[1]));
eq('catégories en hausse', R.emergingCategories(watch).map((c) => [c.category, c.measured, c.rising, c.flagged]), [['Jeux', 2, 2, true], ['Mode', 2, 1, true], ['Jouets', 2, 0, false]]);
eq('percentile d\'attention : inconnu sous 5 produits mesurés', R.attentionPercentiles(watch.slice(0, 3)).get('a'), null);
eq('percentile d\'attention : classement parmi 6 produits mesurés', [R.attentionPercentiles(watch).get('d'), R.attentionPercentiles(watch).get('e')], [1, 1 / 6]);
const ideas = R.ideasFromRelated(p3, { known: ['Game Boy', 'furby 1998'], importedOn: TODAY });
eq('idées issues de Google Trends : hausses d\'abord, doublons écartés', ideas.map((i) => [i.name, i.breakout]), [['tamagotchi uni', true], ['game boy pocket', false], ['game boy color', false]]);
ok('idées : origine et date d\'import conservées', ideas[0].origin.startsWith('Google Trends') && ideas[0].importedOn === TODAY);
eq('idées : fichier de séries = aucune idée', R.ideasFromRelated(p1), []);

/* ===== Recherches suggérées ===== */
eq('lien Vinted exact', R.vintedSearchUrl({ text: 'game boy', priceTo: 30, order: 'newest_first' }), 'https://www.vinted.fr/catalog?search_text=game+boy&price_to=30&order=newest_first');
eq('lien Vinted : tri inconnu ou texte vide refusés', [(() => { try { R.vintedSearchUrl({ text: 'x', order: 'zzz' }); } catch (e) { return 'refusé'; } })(), (() => { try { R.vintedSearchUrl({ text: ' ' }); } catch (e) { return 'refusé'; } })()], ['refusé', 'refusé']);
const sg = R.searchSuggestions({ name: 'Furby' }, 1000);
eq('suggestions : 4 recherches, plafond de budget respecté', [sg.length, sg[0].url.includes('price_to=10'), sg[2].url.includes('price_to'), sg[3].url.startsWith('https://trends.google.com/trends/explore')], [4, true, false, true]);
ok('liste de départ : unique, éditoriale, sans prix', R.WATCHLIST.length >= 20 && new Set(R.WATCHLIST.map((w) => w.id)).size === R.WATCHLIST.length && R.WATCHLIST.every((w) => w.editorial && w.wiki && w.category && !('price' in w)));

/* ===== Ventes réelles (vitesse de vente) ===== */
const arts = [{ id: 'a1', name: 'A', category: 'Jouets', buyPrice: 500, fees: 0, createdAt: '2026-10-01T10:00:00.000Z' }, { id: 'a2', name: 'B', category: 'Jouets', buyPrice: 500, fees: 0, createdAt: '2026-10-05T10:00:00.000Z', boughtOn: '2026-10-05' }, { id: 'a3', name: 'C', category: 'Mode', buyPrice: 500, fees: 0, createdAt: '2026-10-01T10:00:00.000Z' }];
const sls = [{ id: 's1', articleId: 'a1', date: '2026-10-11', price: 1500, fees: 0, expenses: 0, cost: 500, status: 'terminée' }, { id: 's2', articleId: 'a2', date: '2026-10-25', price: 1500, fees: 0, expenses: 0, cost: 500, status: 'terminée' },
  { id: 's3', articleId: 'a3', date: '2026-10-09', price: 900, fees: 0, expenses: 0, cost: 500, status: 'terminée' }, { id: 's4', articleId: 'a1', date: '2026-10-12', price: 100, fees: 0, expenses: 0, cost: 500, status: 'remboursée' }];
const st = R.ownSalesStats(arts, sls, (a) => a.category === 'Jouets');
eq('ventes réelles : délais 10 et 20 jours, remboursée exclue', [st.n, st.nDelay, st.medianDays, st.profitMedian], [2, 2, 15, 1000]);
eq('vitesse inconnue sous 3 ventes (même avec des données)', R.analyseOpportunity({ ...base, ownSales: st }).facts.speed.kind, 'unknown');

/* ===== Propriétés sur des cas aléatoires ===== */
const r = (n) => Math.floor(Math.random() * n), pick = (a) => a[r(a.length)];
const SIMS = ['Très similaire', 'Similaire', 'Peu similaire'], DIRS = ['rising', 'falling', 'stable', 'spike', 'volatile', 'emerging'];
let bad = [];
for (let k = 0; k < 4000; k++) {
  const cs = Array.from({ length: r(12) }, () => cmp(100 + r(30000), { similarity: pick(SIMS), date: r(5) ? `2026-10-${String(1 + r(28)).padStart(2, '0')}` : '2026-11-12', url: r(2) ? 'https://v.fr/a' : '' }));
  const market = r(2) ? {} : { feeFixed: r(150), feeRate: r(1500), minProfit: r(500) };
  const tr = Array.from({ length: r(3) }, () => ({ name: 'T', date: '2026-11-10', metrics: r(5) ? { status: 'ok', direction: pick(DIRS), ratio: r(4) ? 0.3 + r(30) / 10 : null, persistence: r(11) / 10, seasonal: !r(4) } : { status: 'insufficient' } }));
  const buy = r(3) ? null : r(8000);
  const a = R.analyseOpportunity({ ...base, item: { id: 'p', name: 'p', sizeClass: pick(['petit', 'moyen', 'grand', undefined]), counterfeitRisk: pick(['faible', 'moyen', 'élevé', undefined]) }, comparables: cs, market, trends: tr, buy,
    activeListings: r(2) ? listings(1 + r(600)) : null, attention: r(2) ? r(101) / 100 : null, ownSales: r(2) ? { n: r(12), nDelay: r(12), medianDays: r(90), profitMedian: 100 } : null });
  const p = a.pricing, rec = a.recommendation, fail1 = (m) => bad.push(`${m} ${JSON.stringify({ cs: cs.length, market, buy })}`);
  if (a.criteria.some((c) => (c.known ? c.points < 0 || c.points > c.max : c.points !== null))) fail1('points hors limites ou inventés');
  if (a.score !== null && (a.score < 0 || a.score > 100)) fail1('note hors 0-100');
  if (a.coverage < 0 || a.coverage > 1 || (a.score === null) !== (a.coverage === 0)) fail1('couverture incohérente');
  if (a.bands.raw && R.RADAR.bands.indexOf(a.bands.shown) > R.RADAR.bands.indexOf(a.bands.raw)) fail1('étiquette affichée supérieure à la brute');
  if (!p.insufficient) {
    if (p.idealBuy != null && (p.maxBuy == null || p.idealBuy > p.maxBuy)) fail1('idéal supérieur au maximum');
    if (p.scenarios) for (const s of Object.values(p.scenarios)) if (s.net !== s.price - s.fees - p.testBuy || (s.net < 0 && s.roi > 0)) fail1('bénéfice incohérent');
    if (p.bucket !== null && (p.testBuy > p.bucket || p.testBuy > R.RADAR.maxBudget)) fail1('tranche de budget incohérente');
    if (p.scenarios && p.maxBuy != null && p.idealBuy != null && !buy && p.scenarios.prudent.net < p.minNet) fail1('prix idéal sous le bénéfice minimum au prix prudent');
  }
  if (rec.verdict === 'ACHETER' && (rec.blockers.length || p.testBuy > R.RADAR.maxBudget || p.scenarios.prudent.net < p.minNet || a.score < 70 || a.confidence.level === 'faible' || a.confidence.stale)) fail1('ACHETER sans toutes les conditions');
  if (p.insufficient && rec.verdict !== 'À SURVEILLER') fail1('prix inconnus mais verdict tranché');
  if (a.explain.length !== 9 || a.explain.some((e) => /NaN|undefined|null/.test(e.a))) fail1('explication invalide');
}
eq('propriétés : note, couverture, prix, budget, verdict, explications (4 000 cas)', bad.slice(0, 3), []);

console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests passent'); process.exit(fail ? 1 : 0);

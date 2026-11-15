/* Moteur du Radar : assemble prix, note, confiance, recommandation et explications d'une opportunité.
   Pur et testable : aucune interface, aucun accès réseau ni base de données. */
import { RADAR } from './config.js';
import { VERIFIED, ESTIMATE, UNKNOWN, verified, estimate, unknown, eur, fmtPct } from './facts.js';
import { opportunityPricing } from './pricing.js';
import { comp, scoreCriterion, trendValue, speedValue, competitionValue, clamp01, overallScore, bandsFor } from './scoring.js';
import { confidence as computeConfidence } from './confidence.js';
import { recommend } from './recommend.js';
import { saleDelay } from '../stats.js';
import { saleProfit } from '../sales.js';

export { RADAR, opportunityPricing, recommend };
export * from './facts.js';
export { budgetBucket, priceDispersion, maxCostFor } from './pricing.js';
export { calibration, applyCalibration, makePrediction } from './calibration.js';
export { parseTrendsCsv, parseCsv, trendMetrics, fetchWikiSeries, wikiPageviewsUrl, parseWikiPageviews, isFresh, addDays } from './timeseries.js';
export { rankEmerging, emergingCategories, attentionPercentiles, ideasFromRelated, findRadarDuplicate, matchesExisting, norm } from './discover.js';
export { vintedSearchUrl, googleTrendsUrl, searchSuggestions } from './suggest.js';
export { WATCHLIST } from './watchlist.js';
export { scoreCriterion, overallScore, bandsFor, attentionPercentile } from './scoring.js';

const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

/* Ventes réellement enregistrées par l'utilisateur pour les articles retenus par match(article). */
export function ownSalesStats(articles, sales, match = () => true) {
  const byId = new Map(articles.map((a) => [a.id, a]));
  const rows = sales.filter((s) => s.status === 'terminée').map((s) => ({ s, a: byId.get(s.articleId) })).filter(({ a }) => a && match(a));
  const days = rows.map(({ s, a }) => saleDelay(s, a)).filter((d) => d != null);
  return { n: rows.length, nDelay: days.length, medianDays: median(days), profitMedian: median(rows.map(({ s, a }) => saleProfit(s, a))) };
}

const DIR = { rising: 'en hausse', spike: 'pic ponctuel', volatile: 'hausse irrégulière', falling: 'en baisse', stable: 'stable', emerging: 'émergente' };

function criteriaFor({ pricing, trends, activeListings, attention, ownSales, item, cfg }) {
  const w = cfg.weights, r = pricing?.scenarios?.realistic, salesOk = ownSales && ownSales.nDelay >= cfg.minSalesForSpeed;
  const profit = !r ? [] : r.net <= 0 ? [comp('roi', 'Rentabilité', 0, 1, ESTIMATE, `bénéfice net nul ou négatif au prix réaliste (${eur(r.net)})`)]
    : [comp('roi', 'ROI', r.roi == null ? null : clamp01(r.roi / cfg.roiFull), 1, ESTIMATE, `ROI ${fmtPct(r.roi)} au prix réaliste (estimation)`),
       comp('net', 'Bénéfice net', clamp01(r.net / cfg.netFull), 1, ESTIMATE, `bénéfice net ${eur(r.net)} par article (estimation)`)];
  const demand = [comp('attention', 'Attention du public', attention, 2, ESTIMATE, `attention du public supérieure ou égale à ${Math.round((attention ?? 0) * 100)} % des produits suivis (estimation, indice d’intérêt et non volume de ventes)`),
    comp('sales', 'Ventes réelles', ownSales && ownSales.n >= cfg.minSalesForSpeed ? clamp01(ownSales.n / cfg.demandSalesFull) : null, 1, VERIFIED, `${ownSales?.n} vente(s) réelle(s) de ce type enregistrée(s)`)];
  const speed = [comp('days', 'Délai de vente réel', salesOk ? speedValue(ownSales.medianDays, cfg) : null, 1, VERIFIED, `délai médian de ${ownSales?.medianDays} jour(s) sur ${ownSales?.nDelay} vente(s) réelle(s)`)];
  const competition = [comp('listings', 'Annonces actives similaires', competitionValue(activeListings?.value, cfg), 1, VERIFIED, `${activeListings?.value} annonce(s) active(s) relevée(s) le ${activeListings?.date ?? 'date inconnue'}`)];
  const trend = trends.map((t) => comp(`trend:${t.name}`, `Tendance (${t.name})`, trendValue(t.metrics, cfg), 1, VERIFIED,
    `${t.name} : ${DIR[t.metrics?.direction] ?? 'inconnue'}${t.metrics?.ratio != null ? ` (x${String(t.metrics.ratio).replace('.', ',')})` : ''}${t.metrics?.seasonal ? ', saisonnière' : ''}`));
  const cv = pricing?.dispersion, size = { petit: 1, moyen: 0.6, grand: 0.2 }[item.sizeClass], fake = { faible: 1, moyen: 0.6, élevé: 0.2 }[item.counterfeitRisk];
  const risk = [comp('dispersion', 'Dispersion des prix', cv == null ? null : 1 - clamp01(cv / 0.5), 1, ESTIMATE, `prix des annonces dispersés de ${Math.round((cv ?? 0) * 100)} %`),
    comp('size', 'Taille et envoi', size ?? null, 1, ESTIMATE, `produit ${item.sizeClass} (estimation)`),
    comp('fake', 'Risque de contrefaçon', fake ?? null, 1, ESTIMATE, `risque de contrefaçon ${item.counterfeitRisk} (estimation)`),
    comp('safety', 'Marge de sécurité', r ? (pricing.scenarios.prudent.net > 0 ? 1 : 0) : null, 2, ESTIMATE, pricing?.scenarios?.prudent?.net > 0 ? 'bénéfice positif même au prix prudent' : 'bénéfice nul ou négatif au prix prudent')];
  return [scoreCriterion('profit', 'Rentabilité nette', w.profit, profit), scoreCriterion('demand', 'Demande estimée', w.demand, demand), scoreCriterion('speed', 'Vitesse de vente', w.speed, speed),
    scoreCriterion('competition', 'Concurrence', w.competition, competition), scoreCriterion('trend', 'Évolution de la tendance', w.trend, trend), scoreCriterion('risk', 'Niveau de risque', w.risk, risk)];
}

const kindOf = (...ks) => (ks.every((k) => k === UNKNOWN) ? UNKNOWN : ks.includes(ESTIMATE) || ks.includes(UNKNOWN) ? ESTIMATE : VERIFIED);

/* Réponses aux neuf questions de la recommandation. Une réponse sans donnée dit « inconnu » et n'avance aucun chiffre. */
function explain(r, ownSales, cfg) {
  const by = Object.fromEntries(r.criteria.map((c) => [c.id, c])), p = r.pricing, s = p?.scenarios, rec = r.recommendation;
  const detail = (id) => (by[id].known ? by[id].components.filter((c) => c.value != null).map((c) => c.detail).join(' ; ') : null);
  const q = (question, answer, kind) => ({ q: question, a: answer, kind });
  return [
    q('Pourquoi ce produit est-il intéressant ?', `${rec.verdict} : ${rec.reasons.join(' ')}${r.score == null ? '' : ` Note ${r.score}/100 sur ${Math.round(r.coverage * 100)} % des critères, confiance ${r.confidence.level}.`}`, r.score == null ? UNKNOWN : ESTIMATE),
    q('Pourquoi pourrait-il se vendre rapidement ?', by.speed.known ? `D’après vos ventes réelles : ${detail('speed')}.` : `Inconnu : il faut au moins ${cfg.minSalesForSpeed} ventes réelles de ce type pour estimer la vitesse. La popularité n’est pas la vitesse de vente.`, by.speed.known ? VERIFIED : UNKNOWN),
    q('Quelle est sa demande estimée ?', by.demand.known ? `${detail('demand')}.` : 'Inconnue : aucune mesure d’attention du public ni vente réelle.', by.demand.known ? kindOf(...by.demand.components.filter((c) => c.value != null).map((c) => c.kind)) : UNKNOWN),
    q('Quelle est la concurrence ?', by.competition.known ? `${detail('competition')}.` : 'Inconnue : relevez le nombre d’annonces actives similaires sur Vinted.', by.competition.known ? VERIFIED : UNKNOWN),
    q('Quel prix faut-il essayer de payer ?', p && !p.insufficient && p.idealBuy != null ? `Idéal ${eur(p.idealBuy)}, maximum conseillé ${eur(p.maxBuy)} (estimations à partir de ${p.counts.used} annonces).` : p?.insufficient ? 'Inconnu : données de prix insuffisantes.' : 'Aucun prix d’achat ne laisse un bénéfice suffisant.', p && !p.insufficient ? ESTIMATE : UNKNOWN),
    q('Quel prix de revente viser ?', p && !p.insufficient ? `Prudent ${eur(p.prices.prudent)}, réaliste ${eur(p.prices.realistic)}${p.prices.optimistic != null ? `, optimiste ${eur(p.prices.optimistic)}` : ` (${p.optimisticReason})`}. Ce sont des prix affichés par des vendeurs, pas des prix payés.` : 'Inconnu : données de prix insuffisantes.', p && !p.insufficient ? ESTIMATE : UNKNOWN),
    q('Quel bénéfice peut-on espérer ?', s ? `Pour un achat à ${eur(p.testBuy)} : ${eur(s.prudent.net)} (prudent), ${eur(s.realistic.net)} (réaliste)${s.optimistic ? `, ${eur(s.optimistic.net)} (optimiste)` : ''}, avant cotisations.` : 'Inconnu : aucun scénario calculable.', s ? ESTIMATE : UNKNOWN),
    q('Quels sont les risques ?', by.risk.known ? `${detail('risk')}.${by.risk.missing.length ? ` Inconnu : ${by.risk.missing.join(', ')}.` : ''}` : 'Inconnus : aucune donnée sur les risques.', by.risk.known ? ESTIMATE : UNKNOWN),
    q('Est-ce le bon moment pour l’acheter ?', by.trend.known ? `${detail('trend')}.${r.confidence.stale ? ` Attention : données de ${r.confidence.ageDays} jours, à actualiser.` : ''}` : 'Inconnu : aucune mesure de tendance (importez un CSV Google Trends).', by.trend.known ? VERIFIED : UNKNOWN),
  ];
}

/* item : { id, name, category, condition, sizeClass, counterfeitRisk } ; comparables : relevés de l'étude de marché ;
   trends : [{ name, metrics, date }] ; activeListings : { value, date, url } ; attention : percentile 0..1 ou null ;
   ownSales : ownSalesStats() ; buy : prix d'achat réel (centimes) si connu ; today : 'AAAA-MM-JJ'. */
export function analyseOpportunity({ item, comparables = [], market = {}, trends = [], activeListings = null, attention = null, ownSales = null, observations = [], buy = null, calibration = null, today, cfg = RADAR }) {
  const pricing = opportunityPricing(comparables, { market, myCondition: item.condition || '', buy, calibration, cfg });
  const criteria = criteriaFor({ pricing, trends, activeListings, attention, ownSales, item, cfg });
  const { score, coverage } = overallScore(criteria);
  const obs = [...comparables.filter((c) => c.date).map((c) => ({ date: c.date, verifiable: Boolean(c.url) })), ...trends.filter((t) => t.date).map((t) => ({ date: t.date, verifiable: true })),
    ...(activeListings?.date ? [{ date: activeListings.date, verifiable: Boolean(activeListings.url) }] : []), ...observations];
  const confidence = computeConfidence({ n: pricing.counts?.used ?? 0, observations: obs, coverage, today, cfg });
  const recommendation = recommend({ pricing, score, confidence, trends, cfg });
  const priced = !pricing.insufficient;
  const facts = {
    referencePrice: priced ? estimate(pricing.reference, `médiane et moyenne pondérée de ${pricing.counts.used} annonce(s) relevée(s)`) : unknown('données de prix insuffisantes'),
    idealBuy: priced && pricing.idealBuy != null ? estimate(pricing.idealBuy, 'calculé à partir du prix réaliste, des frais et du ROI visé') : unknown('prix d’achat non calculable'),
    competition: activeListings?.value != null ? verified(activeListings.value, activeListings.url || 'relevé manuel', activeListings.date) : unknown('annonces actives non relevées'),
    speed: ownSales && ownSales.nDelay >= cfg.minSalesForSpeed ? verified(ownSales.medianDays, `${ownSales.nDelay} vente(s) réelle(s) enregistrée(s)`) : unknown(`moins de ${cfg.minSalesForSpeed} ventes réelles`),
    trends: trends.map((t) => (t.metrics?.status === 'ok' ? verified(t.metrics, t.name, t.date) : unknown(`${t.name} : série insuffisante`))),
  };
  const result = { id: item.id, item, pricing, criteria, score, coverage, bands: bandsFor(score, confidence.level, cfg), confidence, recommendation, facts, own: ownSales, calibrated: Boolean(calibration?.active) };
  return { ...result, explain: explain(result, ownSales, cfg) };
}

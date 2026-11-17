/* Pont entre les données de FLIPMANAGER et le moteur : prépare les entrées de chaque produit suivi, analyse l'ensemble,
   puis propose les classements (opportunités, budget, vente rapide, à chiffrer) et l'historique. Fonctions pures. */
import { analyseOpportunity, ownSalesStats, trendMetrics, attentionPercentiles, calibration, makePrediction, norm, RADAR } from './index.js';
import { isKnown } from './facts.js';
import { articleCost } from '../articles.js';
import { ITEM_STATUS } from './model.js';

const newestFirst = (a, b) => b.date.localeCompare(a.date);

/* Dernière observation de chaque série (même type et même terme) pour un produit. */
export function latestObservations(obs, itemId, types) {
  const seen = new Set(), out = [];
  for (const o of obs.filter((x) => x.itemId === itemId && types.includes(x.type)).sort(newestFirst)) {
    const key = `${o.type}:${o.term || ''}`; if (seen.has(key)) continue; seen.add(key); out.push(o);
  }
  return out;
}

/* Tendances mesurées (Wikipedia, Google Trends) : recalculées à la date du jour, la période en cours étant écartée. */
export function trendsFor(itemId, obs, today) {
  return latestObservations(obs, itemId, ['wiki', 'trends']).map((o) => ({
    type: o.type, name: o.type === 'wiki' ? 'Wikipedia (pages vues)' : `Google Trends : ${o.term || 'terme inconnu'}`, date: o.date, source: o.source,
    metrics: trendMetrics(o.points, { granularity: o.granularity, today }) }));
}

/* Comparables de l'étude de marché liée (par le nom de l'étude, ou à défaut par le nom du produit). */
export function comparablesFor(item, comparables) {
  const key = norm(item.study || item.name);
  return comparables.filter((c) => norm(c.study) === key);
}

/* Prévisions du Radar comparées aux ventes réelles (produits achetés via le Radar puis vendus). */
export function calibrationRecords(items, sales) {
  const out = [];
  for (const it of items) {
    const s = it.articleId && it.prediction?.predictedPrice ? sales.find((x) => x.articleId === it.articleId && x.status === 'terminée') : null;
    if (s) out.push({ predictedPrice: it.prediction.predictedPrice, actualPrice: s.price });
  }
  return out;
}

/* Analyse tous les produits non ignorés. Retourne [{ item, result, comparables }]. */
export function analyseAll(state, { today, cfg = RADAR } = {}) {
  const { articles, sales, comparables, settings, radar } = state;
  const items = radar.items.filter((i) => i.status !== ITEM_STATUS.IGNORED);
  const pre = items.map((item) => ({ item, trends: trendsFor(item.id, radar.obs, today) }));
  const attention = attentionPercentiles(pre.map(({ item, trends }) => ({ id: item.id, metrics: trends.find((t) => t.type === 'wiki')?.metrics })));
  const cal = calibration(calibrationRecords(radar.items, sales), cfg);
  return pre.map(({ item, trends }) => {
    const comps = comparablesFor(item, comparables), art = item.articleId ? articles.find((a) => a.id === item.articleId) : null;
    const lst = latestObservations(radar.obs, item.id, ['listings'])[0];
    const result = analyseOpportunity({ item, comparables: comps, market: settings.market || {}, trends, today, cfg, calibration: cal,
      buy: art && item.status === ITEM_STATUS.BOUGHT && art.buyPrice > 0 ? articleCost(art) : null,
      activeListings: lst ? { value: lst.value, date: lst.date, url: lst.source?.url } : null, attention: attention.get(item.id) ?? null,
      ownSales: item.category ? ownSalesStats(articles, sales, (a) => norm(a.category) === norm(item.category)) : null,
      observations: latestObservations(radar.obs, item.id, ['tiktok']).map((o) => ({ date: o.date, verifiable: Boolean(o.source?.url) })) });
    return { item, result, comparables: comps.length };
  });
}

/* ---------- Classements ---------- */
const VERDICT_RANK = { 'ACHETER': 0, 'À SURVEILLER': 1, 'ÉVITER': 2 };
const net = (r) => r.result.pricing.scenarios?.realistic?.net ?? null;
const summary = (r) => ({ id: r.item.id, name: r.item.name, category: r.item.category, favorite: r.item.favorite, verdict: r.result.recommendation.verdict, score: r.result.score,
  band: r.result.bands.shown, confidence: r.result.confidence.level, reference: r.result.pricing.reference ?? null, idealBuy: r.result.pricing.idealBuy ?? null,
  maxBuy: r.result.pricing.maxBuy ?? null, bucket: r.result.pricing.bucket ?? null, net: net(r), roi: r.result.pricing.scenarios?.realistic?.roi ?? null,
  medianDays: r.result.facts.speed.kind === 'verified' ? r.result.facts.speed.value : null, resaleAboveBudget: r.result.pricing.resaleAboveBudget ?? false });

/* Meilleures opportunités : seulement les produits chiffrés ; ACHETER d'abord, puis note décroissante. */
export const rankOpportunities = (rows) => rows.filter((r) => !r.result.pricing.insufficient).map(summary)
  .sort((a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] || (b.score ?? -1) - (a.score ?? -1) || (b.net ?? 0) - (a.net ?? 0));

/* Produits sans comparables suffisants : ils ne peuvent pas être classés par budget sans inventer un prix. */
export const toPrice = (rows) => rows.filter((r) => r.result.pricing.insufficient).map((r) => ({ id: r.item.id, name: r.item.name, category: r.item.category, comparables: r.comparables, needed: r.result.pricing.needed }));

/* Filtre budget (centimes) : produits dont le prix d'achat conseillé tient dans la tranche, du bénéfice le plus élevé au plus faible. */
export const byBudget = (rows, capCents) => rows.filter((r) => r.result.pricing.bucket != null && r.result.pricing.bucket <= capCents).map(summary).filter((s) => s.net != null && s.net > 0).sort((a, b) => b.net - a.net);

/* Vente rapide : uniquement les produits dont le délai de vente est mesuré sur vos ventes réelles. Rotation = bénéfice par jour. */
export function quickSales(rows) {
  const all = rows.map(summary), known = all.filter((r) => r.medianDays != null && r.net != null)
    .map((r) => ({ ...r, perDay: Math.round(r.net / Math.max(1, r.medianDays)) })).sort((a, b) => a.medianDays - b.medianDays || b.perDay - a.perDay);
  return { ranked: known, unknownSpeed: all.length - known.length };
}

/* Tendances du moment : produits en hausse parmi les suivis (mesures Wikipedia et Google Trends). */
export function trendBoard(rows) {
  return rows.map((r) => ({ id: r.item.id, name: r.item.name, category: r.item.category, trends: r.result.facts.trends.filter(isKnown).map((f) => ({ source: f.source, date: f.date, ...f.value })) }))
    .filter((r) => r.trends.some((t) => ['rising', 'emerging'].includes(t.direction)));
}

export function dashboardStats(rows, obs, today, cfg = RADAR) {
  const sums = rows.map(summary), priced = sums.filter((s) => s.net != null && s.net > 0 && s.bucket != null); // hors budget ou perte : jamais « meilleur bénéfice »
  const best = priced.length ? priced.reduce((m, s) => (s.net > m.net ? s : m)) : null, fast = priced.filter((s) => s.medianDays != null);
  const quickest = fast.length ? fast.reduce((m, s) => (s.medianDays < m.medianDays ? s : m)) : null, dates = obs.map((o) => o.date).sort();
  return { analysed: rows.length, opportunities: sums.filter((s) => s.verdict === 'ACHETER').length, bestProfit: best && { id: best.id, name: best.name, net: best.net },
    quickest: quickest && { id: quickest.id, name: quickest.name, medianDays: quickest.medianDays }, rising: trendBoard(rows).length, lastRefresh: dates.length ? dates[dates.length - 1] : null,
    staleItems: rows.filter((r) => r.result.confidence.stale).length, top: sums.filter((s) => s.verdict !== 'ÉVITER' && s.score != null && s.reference != null).sort((a, b) => b.score - a.score).slice(0, 5) };
}

/* ---------- Historique ---------- */
export const snapshotOf = (r, today) => ({ id: `${r.item.id}_${today}`, itemId: r.item.id, date: today, score: r.result.score, confidence: r.result.confidence.level, verdict: r.result.recommendation.verdict,
  reference: r.result.pricing.reference ?? null, idealBuy: r.result.pricing.idealBuy ?? null, maxBuy: r.result.pricing.maxBuy ?? null, bucket: r.result.pricing.bucket ?? null, net: net(r),
  directions: r.result.facts.trends.filter(isKnown).map((f) => f.value.direction), createdAt: today });

/* Évolution entre les deux dernières analyses d'un produit ; une opportunité « devenue moins intéressante » est signalée. */
export function compareSnapshots(snaps) {
  const s = [...snaps].sort((a, b) => a.date.localeCompare(b.date));
  if (s.length < 2) return null;
  const [a, b] = s.slice(-2), delta = (x, y) => (x == null || y == null ? null : y - x);
  return { from: a.date, to: b.date, scoreDelta: delta(a.score, b.score), referenceDelta: delta(a.reference, b.reference), netDelta: delta(a.net, b.net),
    verdictChange: a.verdict === b.verdict ? null : [a.verdict, b.verdict], trendChange: JSON.stringify(a.directions) === JSON.stringify(b.directions) ? null : [a.directions, b.directions],
    degraded: (VERDICT_RANK[b.verdict] ?? 0) > (VERDICT_RANK[a.verdict] ?? 0) || (delta(a.score, b.score) ?? 0) <= -10 };
}
export { makePrediction };

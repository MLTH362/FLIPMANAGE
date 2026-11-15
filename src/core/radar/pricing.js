/* Prix et rentabilité d'une opportunité. Réutilise l'étude de marché (market.js) et le calculateur (finance.js) :
   mêmes comparables, même référence, mêmes frais. Montants en centimes entiers. */
import { analyse as marketAnalyse, evaluate, DEFAULT_MARKET } from '../market.js';
import { saleAt } from '../finance.js';
import { applyCalibration } from './calibration.js';
import { RADAR } from './config.js';

const feeInput = (cost, m) => ({ qty: 1, buy: cost, shipMode: 'total', ship: 0, pack: 0, other: 0, feeFixed: m.feeFixed, feeRate: m.feeRate, chargeRate: 0 });

/* Coût d'achat maximal pour garder au moins `target` de bénéfice net en vendant à `price` ; null si impossible. Exact (les frais ne dépendent pas du coût). */
export const maxCostFor = (price, target, m) => { const c = saleAt(feeInput(0, m), price).profit - target; return c >= 0 ? c : null; };

/* Filtre budget : plus petite tranche (10, 20, 30, 40, 50 €) qui contient le montant ; null au-delà de 50 € ou si le montant n'est pas valide. */
export const budgetBucket = (cents, cfg = RADAR) => (cents == null || cents <= 0 ? null : cfg.budgets.find((b) => cents <= b) ?? null);

/* Dispersion des prix (écart-type / moyenne) des annonces retenues ; null en dessous de 3 annonces. */
export function priceDispersion(comparables) {
  const p = comparables.filter((c) => Number.isInteger(c.price) && c.price > 0 && (c.similarity || 'Similaire') !== 'Peu similaire').map((c) => c.price);
  if (p.length < 3) return null;
  const mean = p.reduce((t, x) => t + x, 0) / p.length;
  return Math.round(Math.sqrt(p.reduce((t, x) => t + (x - mean) ** 2, 0) / p.length) / mean * 1000) / 1000;
}

export function opportunityPricing(comparables, { market = {}, myCondition = '', buy = null, calibration = null, cfg = RADAR } = {}) {
  const m = { ...DEFAULT_MARKET, ...market }, A = marketAnalyse(comparables, { market: m, myCondition });
  if (A.insufficient) return { insufficient: true, counts: A.counts, needed: m.minComparables, warnings: A.warnings };
  const sc = (p) => applyCalibration(p, calibration), optimisticOk = A.counts.veryClose >= 2 && A.counts.used >= 5;
  const prices = { prudent: sc(A.prices.competitive), realistic: sc(A.prices.balanced), optimistic: optimisticOk ? sc(A.prices.maximizing) : null };
  const reference = sc(A.reference), minNet = Math.max(m.minProfit, cfg.minNetFloor);

  const maxBuy = maxCostFor(prices.prudent, minNet, m); // conseillé : même au prix prudent, le bénéfice minimum est atteint
  let idealBuy = maxCostFor(prices.realistic, minNet, m); // idéal : au prix réaliste, ROI >= idealRoi et bénéfice minimum atteint
  if (idealBuy != null) idealBuy = Math.min(idealBuy, Math.floor(saleAt(feeInput(0, m), prices.realistic).profit * 100 / (100 + cfg.idealRoi)));
  if (idealBuy != null && (maxBuy == null || idealBuy <= 0)) idealBuy = null;
  else if (idealBuy != null) idealBuy = Math.min(idealBuy, maxBuy);

  const testBuy = buy != null ? buy : idealBuy;
  const scenarios = testBuy == null ? null : Object.fromEntries(Object.entries(prices).filter(([, p]) => p != null).map(([k, p]) => [k, evaluate(p, testBuy, m)]));
  return { insufficient: false, reference, prices, optimisticOk, optimisticReason: optimisticOk ? null : 'Scénario optimiste non justifié : il faut au moins 5 annonces retenues dont 2 « très similaires ».',
    minNet, maxBuy, idealBuy, buyGiven: buy != null, testBuy, scenarios, bucket: budgetBucket(testBuy, cfg), maxBuyBucket: budgetBucket(maxBuy, cfg),
    resaleAboveBudget: reference > cfg.maxBudget, counts: A.counts, warnings: A.warnings, calibrated: Boolean(calibration?.active), dispersion: priceDispersion(comparables) };
}

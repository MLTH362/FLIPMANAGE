/* Calibration : compare les prévisions du Radar aux ventes réelles. Ce n'est PAS de l'intelligence artificielle :
   une simple correction statistique. Tant qu'il y a moins de minSalesForCalibration produits vendus, rien n'est corrigé.
   records : [{ predictedPrice, actualPrice }] en centimes (produits achetés via le Radar, puis vendus). */
import { RADAR } from './config.js';
import { roundDiv } from '../finance.js';

const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const r2 = (x) => Math.round(x * 100) / 100;

export function calibration(records, cfg = RADAR) {
  const valid = records.filter((r) => r.predictedPrice > 0 && r.actualPrice > 0), n = valid.length;
  if (n < cfg.minSalesForCalibration) return { active: false, n, needed: cfg.minSalesForCalibration, factor: 1 };
  const ratio = median(valid.map((r) => r.actualPrice / r.predictedPrice)), [lo, hi] = cfg.calibrationBounds, factor = Math.min(hi, Math.max(lo, ratio));
  const absErr = valid.reduce((t, r) => t + Math.abs(r.actualPrice - r.predictedPrice) / r.predictedPrice, 0) / n;
  return { active: true, n, medianRatio: r2(ratio), factor: r2(factor), clamped: r2(ratio) !== r2(factor), meanAbsErrorPct: r2(absErr * 100) };
}

/* Applique le facteur à un prix prévu (centimes) ; sans calibration active, le prix est inchangé. */
export const applyCalibration = (price, cal) => (cal?.active ? roundDiv(price * Math.round(cal.factor * 100), 100) : price);

/* Prévision figée au moment de « Marquer comme acheté », pour la comparer plus tard au résultat réel. */
export const makePrediction = (r, today) => ({ date: today, predictedPrice: r.pricing?.prices?.realistic ?? null, predictedNet: r.pricing?.scenarios?.realistic?.net ?? null,
  idealBuy: r.pricing?.idealBuy ?? null, maxBuy: r.pricing?.maxBuy ?? null, score: r.score, confidence: r.confidence?.level ?? null });

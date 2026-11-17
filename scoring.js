/* Note sur 100 : six critères pondérés, chacun justifié. Un critère sans donnée est « inconnu » (jamais estimé au hasard) :
   la note est calculée sur les critères connus puis ramenée sur 100, avec le taux de couverture. */
import { RADAR } from './config.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const r1 = (x) => Math.round(x * 10) / 10;
export const comp = (id, label, value, weight, kind, detail) => ({ id, label, value, weight, kind, detail });

export function scoreCriterion(id, label, max, components) {
  const known = components.filter((c) => c.value != null), missing = components.filter((c) => c.value == null).map((c) => c.label);
  if (!known.length) return { id, label, max, known: false, points: null, value: null, components, missing, justification: `${label} : inconnu (aucune donnée disponible).` };
  const w = known.reduce((t, c) => t + c.weight, 0), value = known.reduce((t, c) => t + c.value * c.weight, 0) / w, points = r1(max * value);
  return { id, label, max, known: true, points, value: Math.round(value * 1000) / 1000, components, missing, justification: `${label} : ${points}/${max}, ${known.map((c) => c.detail).join(' ; ')}.` };
}

/* Valeurs 0..1 des composantes */
export function trendValue(m, cfg = RADAR) {
  if (!m || m.status !== 'ok') return null;
  const t = cfg.trend; let v;
  if (m.direction === 'emerging') v = Math.min(0.8, 0.4 + 0.1 * (m.positives ?? 3)); // démarrage de zéro : prudent, d'autant moins sûr que peu de points sont positifs
  else if (m.ratio <= t.falling) v = 0;
  else if (m.ratio < 1) v = 0.4 * (m.ratio - t.falling) / (1 - t.falling);
  else v = m.ratio < 1.5 ? 0.4 + 0.6 * (m.ratio - 1) / 0.5 : 1;
  if (m.direction === 'spike') v = Math.min(v, 0.3);
  if (m.direction === 'volatile') v = Math.min(v, 0.5);
  if (m.seasonal) v *= 0.7;
  return clamp01(Math.round(v * 1000) / 1000);
}
export const speedValue = (days, cfg = RADAR) => clamp01((cfg.speedZeroDays - days) / (cfg.speedZeroDays - cfg.speedFullDays));
export const competitionValue = (n, cfg = RADAR) => (n == null || n <= 0 ? null : n <= cfg.competitionFull ? 1 : n >= cfg.competitionZero ? 0 : 1 - Math.log(n / cfg.competitionFull) / Math.log(cfg.competitionZero / cfg.competitionFull));
/* Part des produits suivis qui ont une attention publique inférieure ou égale ; au moins 5 produits comparés. */
export const attentionPercentile = (value, all) => { const v = all.filter((x) => x != null); return value == null || v.length < 5 ? null : v.filter((x) => x <= value).length / v.length; };
export { clamp01 };

export function overallScore(criteria, cfg = RADAR) {
  const known = criteria.filter((c) => c.known), max = known.reduce((t, c) => t + c.max, 0), coverage = Math.round(max) / 100;
  if (!max) return { score: null, coverage: 0, note: 'Note impossible à calculer : aucune donnée disponible.' };
  if (coverage < cfg.minCoverage) return { score: null, coverage, note: `Note non calculée : seulement ${Math.round(coverage * 100)} % des critères sont renseignés (minimum ${Math.round(cfg.minCoverage * 100)} %).` };
  return { score: Math.round(known.reduce((t, c) => t + c.points, 0) / max * 100), coverage, note: null };
}

/* Classement. La confiance plafonne l'étiquette affichée : faible -> « À surveiller » au mieux ; moyenne -> « Très bonne » au mieux. */
export function bandsFor(score, level, cfg = RADAR) {
  if (score == null) return { raw: null, shown: null, capped: false, note: null };
  let raw = 0; cfg.bandMins.forEach((m, i) => { if (score >= m) raw = i; });
  const cap = level === 'élevée' ? 4 : level === 'moyenne' ? 3 : 1, shown = Math.min(raw, cap);
  return { raw: cfg.bands[raw], shown: cfg.bands[shown], capped: shown < raw, note: shown < raw ? `Note plafonnée à « ${cfg.bands[shown]} » : confiance ${level}.` : null };
}

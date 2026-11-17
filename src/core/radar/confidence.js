/* Confiance : distincte de la note. Elle dépend de la quantité, de la fraîcheur, de la vérifiabilité et de la couverture des données.
   observations : [{ date: 'AAAA-MM-JJ', verifiable: boolean }] (annonces relevées, mesures importées). */
import { RADAR } from './config.js';

const dayNum = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };

export function confidence({ n = 0, observations = [], coverage = 0, today, cfg = RADAR }) {
  const sample = n >= 8 ? 1 : n >= 5 ? 0.75 : n >= 3 ? 0.5 : n >= 1 ? 0.2 : 0;
  const dates = observations.map((o) => o.date).filter(Boolean).sort(), newest = dates.length ? dates[dates.length - 1] : null;
  const age = newest ? dayNum(today) - dayNum(newest) : null;
  const fresh = age == null ? 0 : age <= 7 ? 1 : age <= cfg.freshness.fresh ? 0.8 : age <= cfg.freshness.stale ? 0.4 : 0;
  const verif = observations.length ? observations.filter((o) => o.verifiable).length / observations.length : 0;
  const total = Math.round(35 * sample + 25 * fresh + 15 * verif + 25 * Math.min(1, coverage));
  let level = total >= 70 ? 'élevée' : total >= 45 ? 'moyenne' : 'faible';
  const capped = level === 'élevée' && coverage < cfg.highConfidenceCoverage;
  if (capped) level = 'moyenne'; // beaucoup de données de prix mais trop de critères inconnus : pas de confiance élevée
  const reasons = [`${n} annonce(s) comparable(s) retenue(s)`, age == null ? 'aucune date de relevé' : `données relevées il y a ${age} jour(s)`,
    `${Math.round(verif * 100)} % des relevés ont une source vérifiable`, `${Math.round(Math.min(1, coverage) * 100)} % des critères sont renseignés${capped ? ' (confiance plafonnée à « moyenne » : moins de 60 %)' : ''}`];
  return { score: total, level, ageDays: age, stale: age != null && age > cfg.freshness.stale, parts: { sample, fresh, verif, coverage }, reasons };
}

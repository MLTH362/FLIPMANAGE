/* Recommandation ACHETER / À SURVEILLER / ÉVITER, fondée sur des règles lisibles et pas seulement sur la note.
   ACHETER exige TOUTES ces conditions : prix d'achat <= 50 €, bénéfice net suffisant même au prix prudent, note >= 70,
   confiance au moins moyenne, données récentes, tendance ni en baisse ni ponctuelle. */
import { RADAR } from './config.js';
import { eur } from './facts.js';

export const VERDICTS = { BUY: 'ACHETER', WATCH: 'À SURVEILLER', AVOID: 'ÉVITER' };

export function recommend({ pricing, score, confidence, trends = [], cfg = RADAR }) {
  if (!pricing || pricing.insufficient)
    return { verdict: VERDICTS.WATCH, blockers: ['prix'], reasons: ['Données de prix insuffisantes : relevez des comparables sur Vinted avant toute décision.'] };
  const s = pricing.scenarios, dirs = trends.map((t) => t.metrics?.direction).filter(Boolean);
  if (pricing.maxBuy == null || pricing.idealBuy == null || !s)
    return { verdict: VERDICTS.AVOID, blockers: ['rentabilité'], reasons: ['Même au prix prudent, aucun prix d’achat ne laisse un bénéfice net suffisant.'] };
  if (pricing.buyGiven && s.realistic.net <= 0)
    return { verdict: VERDICTS.AVOID, blockers: ['perte'], reasons: [`À ce prix d’achat, le bénéfice net au prix réaliste est de ${eur(s.realistic.net)} : vous ne gagneriez rien.`] };
  if (dirs.includes('falling') && score != null && score < 60)
    return { verdict: VERDICTS.AVOID, blockers: ['tendance'], reasons: ['La tendance est en baisse et la note est inférieure à 60.'] };

  const blockers = [], reasons = [];
  if (pricing.testBuy > cfg.maxBudget) { blockers.push('budget'); reasons.push(`Prix d’achat nécessaire (${eur(pricing.testBuy)}) supérieur au budget de ${eur(cfg.maxBudget)}.`); }
  if (s.prudent.net < pricing.minNet) { blockers.push('prudent'); reasons.push(`Au prix prudent, le bénéfice net (${eur(s.prudent.net)}) est inférieur au minimum de ${eur(pricing.minNet)}.`); }
  if (score == null || score < 70) { blockers.push('score'); reasons.push(score == null ? 'Note impossible à calculer : données insuffisantes.' : `Note de ${score}/100, inférieure à 70.`); }
  if (confidence.level === 'faible') { blockers.push('confiance'); reasons.push('Confiance faible dans les données.'); }
  if (confidence.stale) { blockers.push('fraîcheur'); reasons.push(`Données trop anciennes (${confidence.ageDays} jours) : à actualiser.`); }
  if (dirs.includes('falling')) { blockers.push('tendance'); reasons.push('Tendance en baisse.'); }
  if (dirs.includes('spike')) { blockers.push('pic'); reasons.push('Hausse due à un pic ponctuel, pas à une tendance durable.'); }
  if (!blockers.length) return { verdict: VERDICTS.BUY, blockers, reasons: [`Bénéfice net prudent ${eur(s.prudent.net)}, réaliste ${eur(s.realistic.net)}, pour un achat à ${eur(pricing.testBuy)}.`] };
  return { verdict: VERDICTS.WATCH, blockers, reasons };
}

/* Détection : repérer les produits et catégories en hausse parmi les produits suivis, proposer des idées à partir des
   « requêtes associées » Google Trends importées, éviter les doublons. Fonctions pures. */
import { attentionPercentile } from './scoring.js';

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* items : [{ id, name, category, metrics }] avec metrics = trendMetrics(). Seules les hausses soutenues ou les démarrages
   de zéro sont retenus ; un pic ponctuel n'est pas une tendance. Classement : (ratio - 1) x persistance. */
export function rankEmerging(items) {
  return items.filter((i) => i.metrics?.status === 'ok' && ['rising', 'emerging'].includes(i.metrics.direction))
    .map((i) => ({ ...i, emergence: i.metrics.direction === 'emerging' ? 0.5 : Math.round((i.metrics.ratio - 1) * (i.metrics.persistence ?? 1) * 100) / 100 }))
    .sort((a, b) => b.emergence - a.emergence);
}

/* Catégories dont au moins minShare des produits mesurés sont en hausse (avec au moins minItems produits mesurés). */
export function emergingCategories(items, { minItems = 2, minShare = 0.5 } = {}) {
  const by = new Map();
  for (const i of items.filter((x) => x.metrics?.status === 'ok')) {
    const g = by.get(i.category) || { category: i.category, measured: 0, rising: 0, ratios: [] };
    g.measured++; if (['rising', 'emerging'].includes(i.metrics.direction)) g.rising++; if (i.metrics.ratio != null) g.ratios.push(i.metrics.ratio); by.set(i.category, g);
  }
  return [...by.values()].map((g) => ({ category: g.category, measured: g.measured, rising: g.rising, share: Math.round(g.rising / g.measured * 100) / 100,
    flagged: g.measured >= minItems && g.rising / g.measured >= minShare })).sort((a, b) => b.share - a.share || b.measured - a.measured);
}

/* Percentile d'attention de chaque produit parmi les produits mesurés (au moins 5), d'après la moyenne récente de pages vues. */
export function attentionPercentiles(items) {
  const levels = items.map((i) => (i.metrics?.status === 'ok' ? i.metrics.meanRecent : null));
  return new Map(items.map((i, k) => [i.id, attentionPercentile(levels[k], levels)]));
}

/* Idées de produits issues d'un export « Requêtes associées » : hausses (RISING) d'abord, « Breakout » en tête.
   known : noms déjà suivis ou étudiés, pour éviter les doublons. Données mesurées (fichier Google Trends), jamais complétées. */
export function ideasFromRelated(parsed, { known = [], limit = 20, importedOn = null } = {}) {
  if (parsed?.kind !== 'related') return [];
  const seen = new Set(known.map(norm)), out = [];
  const order = [...parsed.items].sort((a, b) => (b.section === 'rising') - (a.section === 'rising') || (b.breakout === true) - (a.breakout === true) || (b.value ?? 0) - (a.value ?? 0));
  for (const it of order) {
    const key = norm(it.query); if (!key || seen.has(key)) continue; seen.add(key);
    out.push({ name: it.query, section: it.section, breakout: it.breakout, value: it.value, percent: it.percent, category: parsed.category, importedOn,
      origin: `Google Trends : requêtes associées (${it.section === 'rising' ? 'en hausse' : 'populaires'})` });
    if (out.length >= limit) break;
  }
  return out;
}

/* Doublons : même nom (identique) ou nom contenu dans l'autre avec au moins 2 mots (proche). */
export function findRadarDuplicate(items, name, ignoreId = null) {
  const n = norm(name), nt = n.split(' ').filter(Boolean);
  for (const i of items) {
    if (i.id === ignoreId) continue;
    const m = norm(i.name), mt = m.split(' ').filter(Boolean);
    if (m === n) return { id: i.id, name: i.name, match: 'identique' };
    const [small, big] = nt.length <= mt.length ? [nt, mt] : [mt, nt];
    if (small.length >= 2 && small.every((t) => big.includes(t))) return { id: i.id, name: i.name, match: 'proche' };
  }
  return null;
}

/* Le produit existe-t-il déjà ailleurs dans FLIPMANAGER (article ou étude de marché) ? */
export function matchesExisting({ articles = [], comparables = [] }, name) {
  const n = norm(name);
  return { article: articles.find((a) => norm(a.name) === n) || null, study: [...new Set(comparables.map((c) => c.study))].find((s) => norm(s) === n) || null };
}

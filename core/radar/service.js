/* Services du Radar : actualisation Wikipedia et import de fichiers Google Trends. Aucun accès base de données ici :
   ces fonctions retournent l'observation à enregistrer (ou la raison de ne rien faire). Le réseau est injecté. */
import { fetchWikiSeries, isFresh, parseTrendsCsv, parseTrendsFileName, trendMetrics, ideasFromRelated } from './index.js';

/* Actualise la fréquentation Wikipedia d'un produit. Une mesure de moins d'un jour est réutilisée : pas de requête inutile. */
export async function refreshWiki(item, { fetchFn, today, observations = [], force = false }) {
  if (!item.wiki) return { status: 'no_article' };
  const last = observations.filter((o) => o.itemId === item.id && o.type === 'wiki').sort((a, b) => a.date.localeCompare(b.date)).pop();
  if (!force && last && isFresh(last.date, today, 1)) return { status: 'skipped', observation: last };
  const r = await fetchWikiSeries(fetchFn, { article: item.wiki, today });
  if (r.status !== 'ok') return { status: r.status, error: r.error, url: r.url };
  return { status: 'ok', observation: { itemId: item.id, type: 'wiki', date: today, granularity: 'day', points: r.points, source: { name: 'API Wikimedia (pages vues)', url: r.url, article: item.wiki } } };
}

/* Importe un export Google Trends.
   - « Requêtes associées » (TOP / RISING) : retourne des idées de produits à étudier ;
   - série temporelle : retourne l'observation. Le terme recherché ne figure pas dans les exports récents : il doit être fourni (needs_term) ;
   - série trop courte (ex. 24 h) : refusée avec la raison, rien n'est enregistré. */
export function importTrends(text, { fileName = '', today, itemId = null, term = '', column = null }) {
  const p = parseTrendsCsv(text);
  if (p.kind === 'related') return { status: 'related', category: p.category, ideas: ideasFromRelated(p, { importedOn: today }) };
  if (p.kind !== 'timeseries') return { status: 'unknown', error: p.error };
  if (p.terms.length > 1 && (column == null || column < 0 || column >= p.terms.length)) return { status: 'choose_column', terms: p.terms.map((t, i) => ({ index: i, label: t.term || t.chartLabel })) };
  const t = p.terms[column ?? 0], meta = parseTrendsFileName(fileName), name = String(term || t.term || '').trim();
  if (!name) return { status: 'needs_term', chartLabel: t.chartLabel, period: meta };
  const m = trendMetrics(t.points, { granularity: p.granularity, today });
  if (m.status !== 'ok') return { status: 'too_short', reason: m.reason, metrics: m };
  return { status: 'ok', metrics: m, observation: { itemId, type: 'trends', date: today, term: name, granularity: p.granularity, points: t.points,
    source: { name: 'Google Trends (export CSV)', file: fileName || null, geo: t.geo || meta?.geo || null, period: meta ? { start: meta.start, end: meta.end } : null } } };
}

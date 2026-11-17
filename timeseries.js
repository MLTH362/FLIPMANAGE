/* Séries temporelles : import des CSV Google Trends, séries Wikipedia (API Wikimedia), mesure de la tendance.
   Fonctions pures (le réseau est injecté). Les valeurs Google Trends sont un indice relatif 0-100, pas des volumes. */
import { RADAR } from './config.js';

const dayNum = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d || 1) / 86400000); };
export const addDays = (iso, n) => new Date((dayNum(iso) + n) * 86400000).toISOString().slice(0, 10);
const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;
const r2 = (x) => Math.round(x * 100) / 100;

/* ---------- CSV ---------- */
export function parseCsv(text, delimiter) {
  const src = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!delimiter) { const head = src.slice(0, 2000), n = (c) => head.split(c).length - 1; delimiter = [',', ';', '\t'].sort((a, b) => n(b) - n(a))[0]; }
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim()));
}

const DATE_RE = /^\d{4}-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:?\d{2})?)?)?$/;
/* Dans les exports récents, la 2e colonne porte le titre du graphique et non le terme recherché : le terme est alors inconnu. */
const CHART_LABEL_RE = /^(int[ée]r[êe]t dans le temps|requ[êe]tes associ[ée]es|sujets associ[ée]s|int[ée]r[êe]t par .+|interest over time|related queries|related topics|interest by .+)$/i;
const TOP_RE = /^(top|principales?|populaires?|les plus populaires)$/i, RISING_RE = /^(rising|en hausse|en forte hausse|tendances?)$/i;
const cleanTerm = (s) => s.replace(/:\s*\([^)]*\)\s*$/, '').trim();
const geoOf = (s) => (/:\s*\(([^)]*)\)\s*$/.exec(s) || [])[1] || null;

function granularityOf(dates) {
  if (dates.some((d) => d.length > 10)) return 'intraday';
  if (dates.length && dates.every((d) => d.length === 7)) return 'month';
  const diffs = dates.slice(1).map((d, i) => dayNum(d) - dayNum(dates[i])).sort((a, b) => a - b), med = diffs[Math.floor(diffs.length / 2)];
  return med === 1 ? 'day' : med === 7 ? 'week' : 'unknown';
}

/* Reconnaît un export Google Trends : « Intérêt dans le temps » (séries) ou « Requêtes associées » (TOP / RISING).
   Le format des fichiers français n'a pas pu être vérifié sur un vrai export : les en-têtes sont reconnus avec tolérance. */
export function parseTrendsCsv(text) {
  const rows = parseCsv(text);
  const category = ((rows.find((r) => /^(cat[ée]gorie|category)\s*:/i.test(r[0])) || [''])[0].replace(/^[^:]+:\s*/, '')) || null;

  const hi = rows.findIndex((r, i) => r.length >= 2 && /^(semaine|jour|mois|week|day|month|time|date)\b/i.test(r[0]) && rows[i + 1] && DATE_RE.test(rows[i + 1][0] || ''));
  if (hi >= 0) {
    const head = rows[hi], data = [];
    for (let i = hi + 1; i < rows.length && DATE_RE.test(rows[i][0] || ''); i++) data.push(rows[i]);
    const dates = data.map((r) => (r[0].length === 7 ? `${r[0]}-01` : r[0]));
    const val = (c) => { if (c == null || c === '') return null; if (/^<\s*1$/.test(c)) return 0; const n = Number(String(c).replace(',', '.')); return Number.isFinite(n) ? n : null; };
    const terms = head.slice(1).map((h, j) => ({ term: CHART_LABEL_RE.test(cleanTerm(h)) ? null : cleanTerm(h), termKnown: !CHART_LABEL_RE.test(cleanTerm(h)), chartLabel: cleanTerm(h), geo: geoOf(h),
      points: data.map((r, i) => ({ date: dates[i], value: val(r[j + 1]) })) }));
    return { kind: 'timeseries', category, granularity: granularityOf(data.map((r) => (r[0].length === 7 ? r[0] : r[0]))), terms };
  }

  const items = []; let section = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], first = r[0] || '', only = r.slice(1).every((c) => c === '');
    if (only && TOP_RE.test(first)) { section = 'top'; i++; continue; }          // la ligne suivante est l'en-tête « requête, valeur »
    if (only && RISING_RE.test(first)) { section = 'rising'; i++; continue; }
    if (!first) { if (r.every((c) => c === '')) section = section && null; continue; }
    if (section && r.length >= 2) {
      const raw = r[1], breakout = /breakout|^pic|sans pr[ée]c[ée]dent|forte hausse/i.test(raw);
      const pct = /^\+?\s*([\d\s.,]+)\s*%$/.exec(raw), num = Number(String(pct ? pct[1] : raw).replace(/\s/g, '').replace(',', '.'));
      items.push({ query: first, section, breakout, value: breakout || !Number.isFinite(num) ? null : num, percent: Boolean(pct) || section === 'rising' });
    }
  }
  if (items.length) return { kind: 'related', category, items };
  return { kind: 'unknown', error: 'Format non reconnu : exportez « Intérêt dans le temps » ou « Requêtes associées » depuis Google Trends (bouton de téléchargement CSV).' };
}

/* Le nom du fichier exporté donne le périmètre et la période (ex. time_series_FR_20251115-2026_20261115-2026.csv : FR, du 15/11/2025 20:26 au 15/11/2026 20:26).
   Il ne contient PAS le terme recherché. Déduit du nom : à présenter comme tel. */
export function parseTrendsFileName(name) {
  const m = /^time_series_([A-Za-z0-9-]*)_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(String(name).split(/[\\/]/).pop());
  return m ? { geo: m[1] || null, start: `${m[2]}-${m[3]}-${m[4]}T${m[5]}:${m[6]}`, end: `${m[7]}-${m[8]}-${m[9]}T${m[10]}:${m[11]}` } : null;
}

/* ---------- Wikipedia : fréquentation d'un article (API Wikimedia, publique, données CC0) ---------- */
export function wikiPageviewsUrl({ article, start, end, project = 'fr.wikipedia', access = 'all-access', agent = 'user' }) {
  const title = encodeURIComponent(String(article).trim().replace(/ /g, '_'));
  return `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${project}/${access}/${agent}/${title}/daily/${start.replace(/-/g, '')}/${end.replace(/-/g, '')}`;
}

/* Réponse de l'API -> un point par jour de start à end (les jours absents de la réponse valent 0 vue). */
export function parseWikiPageviews(json, start, end) {
  const byDay = new Map((json?.items || []).map((it) => [`${it.timestamp.slice(0, 4)}-${it.timestamp.slice(4, 6)}-${it.timestamp.slice(6, 8)}`, it.views]));
  const out = [];
  for (let d = start; dayNum(d) <= dayNum(end); d = addDays(d, 1)) out.push({ date: d, value: byDay.get(d) ?? 0 });
  return out;
}

/* Récupère la série d'un article. fetchFn est injecté (fetch du navigateur, ou un faux dans les tests).
   Un article sans données (404) est « not_found » : jamais remplacé par des zéros. */
export async function fetchWikiSeries(fetchFn, { article, days = 400, today, project = 'fr.wikipedia' }) {
  const end = addDays(today, -1), start = addDays(end, -(days - 1)), url = wikiPageviewsUrl({ article, start, end, project });
  try {
    const res = await fetchFn(url, { headers: { 'Api-User-Agent': 'FLIPMANAGER/1.0 (usage personnel)' } });
    if (res.status === 404) return { status: 'not_found', url };
    if (!res.ok) return { status: 'error', error: `HTTP ${res.status}`, url };
    return { status: 'ok', points: parseWikiPageviews(await res.json(), start, end), granularity: 'day', source: { name: 'API Wikimedia (pages vues)', url, retrievedAt: today } };
  } catch (e) { return { status: 'error', error: e.message, url }; }
}

/* Évite de refaire une requête inutile : une mesure de moins de maxDays jours est réutilisée. */
export const isFresh = (date, today, maxDays = 1) => Boolean(date) && dayNum(today) - dayNum(date) <= maxDays;

/* ---------- Mesure de la tendance ---------- */
/* points : [{ date, value }] triés par date ; valeurs absentes ignorées.
   ratio = moyenne de la période récente / moyenne de la période de comparaison précédente.
   Directions : rising (hausse soutenue), spike (pic ponctuel, pas une tendance), volatile (hausse irrégulière),
   falling, stable, emerging (démarre de zéro). seasonal : la même hausse s'est produite à la même période l'an dernier. */
export function trendMetrics(points, { granularity = 'unknown', today = null, cfg = RADAR } = {}) {
  let pts = points.filter((p) => p.value != null).sort((a, b) => a.date.localeCompare(b.date)); const t = cfg.trend;
  if (granularity === 'intraday' || (pts.length > 1 && (Date.parse(pts[pts.length - 1].date) - Date.parse(pts[0].date)) / 86400000 < 14))
    return { status: 'insufficient', n: pts.length, reason: 'Période trop courte pour mesurer une tendance : exportez au moins 12 mois (ou 90 jours en données quotidiennes).' };
  // Le dernier point d'une série Google est une période encore en cours : incomplète, elle est écartée.
  let droppedPartial = null; const periodDays = { day: 1, week: 7, month: 28 }[granularity];
  if (today && periodDays && pts.length && dayNum(pts[pts.length - 1].date) + periodDays > dayNum(today)) droppedPartial = pts.pop().date;
  const n = pts.length;
  const k = t.recent[granularity] ?? Math.max(2, Math.round(n * 0.2)), bmax = t.baseline[granularity] ?? Math.max(4, Math.round(n * 0.6));
  if (n < k + 4) return { status: 'insufficient', n, needed: k + 4, reason: `Série trop courte : ${n} point(s), ${k + 4} nécessaires.` };
  const recent = pts.slice(-k), baseline = pts.slice(Math.max(0, n - k - bmax), n - k);
  const mr = mean(recent.map((p) => p.value)), mb = mean(baseline.map((p) => p.value));
  const out = { status: 'ok', n, from: pts[0].date, to: pts[n - 1].date, granularity, meanRecent: r2(mr), meanBase: r2(mb), recentPoints: k, droppedPartial };
  if (mb === 0) { // aucun intérêt avant la période récente : démarrage de zéro (pas de ratio possible)
    const positives = recent.filter((p) => p.value > 0).length;
    return { ...out, ratio: null, positives, direction: positives >= 2 ? 'emerging' : positives === 1 ? 'spike' : 'stable', persistence: null, seasonal: false };
  }
  const ratio = r2(mr / mb), persistence = r2(recent.filter((p) => p.value >= mb).length / k), sum = recent.reduce((s, p) => s + p.value, 0);
  const isSpike = k >= 3 && sum > 0 && Math.max(...recent.map((p) => p.value)) / sum >= t.spike && ratio >= t.rising;
  const direction = isSpike ? 'spike' : ratio >= t.rising ? (persistence >= t.persistence ? 'rising' : 'volatile') : ratio <= t.falling ? 'falling' : 'stable';

  let seasonal = false; // même fenêtre un an plus tôt (364 jours), si la série couvre plus de 400 jours et que la fenêtre est courte
  const rs = dayNum(recent[0].date), re = dayNum(recent[k - 1].date);
  if (dayNum(out.to) - dayNum(out.from) >= 400 && re - rs <= 120) {
    const ly = pts.filter((p) => dayNum(p.date) >= rs - 364 && dayNum(p.date) <= re - 364), lb = pts.filter((p) => dayNum(p.date) < rs - 364).slice(-bmax);
    if (ly.length >= 3 && lb.length >= 3 && mean(lb.map((p) => p.value)) > 0) seasonal = mean(ly.map((p) => p.value)) / mean(lb.map((p) => p.value)) >= t.rising;
  }
  return { ...out, ratio, direction, persistence, seasonal };
}

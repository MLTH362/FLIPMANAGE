/* Modèle de données du Radar : produits suivis, observations (mesures datées), validation, passage vers le stock.
   Trois stores : radarItems (produits suivis), radarObs (observations avec leur source), radarHistory (instantanés d'analyses).
   Les favoris sont un indicateur du produit ; les résultats réels restent dans les ventes (rattachées par articleId) : rien n'est dupliqué. */
import { CONDITIONS } from '../constants.js';

export const ITEM_STATUS = { TRACKED: 'suivi', BOUGHT: 'acheté', IGNORED: 'ignoré' };
export const SIZES = ['petit', 'moyen', 'grand'], FAKE_RISKS = ['faible', 'moyen', 'élevé'];
export const OBS_TYPES = ['wiki', 'trends', 'listings', 'tiktok'], TIKTOK_SIGNALS = ['hausse', 'présent', 'absent'], GRANULARITIES = ['day', 'week', 'month'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* Produit suivi (formulaire ou idée importée). Retourne { errors, value }. */
export function validateRadarItem(f) {
  const errors = {}, t = (k) => String(f[k] ?? '').trim();
  const max = (k, n, label) => { if (t(k).length > n) errors[k] = `${label} : ${n} caractères maximum.`; };
  if (!t('name')) errors.name = 'Le nom du produit est obligatoire.';
  max('name', 120, 'Nom'); max('category', 60, 'Catégorie'); max('wiki', 200, 'Article Wikipedia'); max('search', 120, 'Recherche'); max('study', 80, 'Étude');
  if (t('sizeClass') && !SIZES.includes(t('sizeClass'))) errors.sizeClass = 'Taille invalide.';
  if (t('counterfeitRisk') && !FAKE_RISKS.includes(t('counterfeitRisk'))) errors.counterfeitRisk = 'Risque invalide.';
  if (t('condition') && !CONDITIONS.includes(t('condition'))) errors.condition = 'État invalide.';
  return { errors, value: { name: t('name'), category: t('category'), wiki: t('wiki'), search: t('search'), study: t('study'), sizeClass: t('sizeClass'), counterfeitRisk: t('counterfeitRisk'),
    condition: t('condition'), origin: f.origin && typeof f.origin === 'object' ? f.origin : { type: 'manual' } } };
}

export const newRadarItem = (value, id, now) => ({ ...value, id, status: ITEM_STATUS.TRACKED, favorite: false, articleId: '', prediction: null, createdAt: now, updatedAt: now });

/* Observation : une mesure ou un relevé daté, toujours accompagné de sa source.
   wiki / trends : { points: [{ date, value }], granularity, source } ; listings : { value } ; tiktok : { signal }. */
export function validateObservation(o) {
  const errors = [];
  if (!o || typeof o !== 'object') return ['Observation invalide.'];
  if (typeof o.id !== 'string' || !o.id) errors.push('identifiant manquant');
  if (typeof o.itemId !== 'string' || !o.itemId) errors.push('produit manquant');
  if (!OBS_TYPES.includes(o.type)) errors.push('type inconnu');
  if (!DATE_RE.test(o.date || '')) errors.push('date invalide');
  if (o.type === 'wiki' || o.type === 'trends') {
    if (!Array.isArray(o.points) || !o.points.length || o.points.some((p) => !p || typeof p.date !== 'string' || !(p.value === null || Number.isFinite(p.value)))) errors.push('série invalide');
    if (!GRANULARITIES.includes(o.granularity)) errors.push('granularité inconnue');
    if (!o.source || typeof o.source.name !== 'string') errors.push('source manquante');
  }
  if (o.type === 'listings' && !(Number.isInteger(o.value) && o.value >= 0)) errors.push('nombre d’annonces invalide');
  if (o.type === 'tiktok' && !TIKTOK_SIGNALS.includes(o.signal)) errors.push('signal inconnu');
  return errors;
}

/* Article à créer dans « Mes articles » à partir d'un produit du Radar. « À acheter » = achat prévu ; « En stock » = acheté. */
export function articleFromRadar(item, { id, buyPrice = 0, fees = 0, status = 'À acheter', targetPrice = null, today, now }) {
  return { id, name: item.name, category: item.category || '', condition: item.condition || '', description: '', buyPrice, fees, targetPrice, supplierUrl: '', status,
    ...(status === 'En stock' ? { boughtOn: today } : {}), radarId: item.id, createdAt: now, updatedAt: now };
}

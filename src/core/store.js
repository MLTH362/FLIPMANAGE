/* État applicatif + persistance IndexedDB. Montants en centimes entiers.
   article = { id, name, category, condition, description, buyPrice, fees, targetPrice|null,
               supplierUrl, status, createdAt, updatedAt }
   sale    = { id, articleId, date, price, fees, expenses, status: 'terminée'|'annulée'|'remboursée' } */
import * as db from './db.js';
import { DEFAULT_MARKET } from './market.js';
import { migrateArticle, findDuplicate } from './articles.js';
import { uid } from '../utils/dom.js';
import { ITEM_STATUS, newRadarItem, validateObservation, articleFromRadar } from './radar/model.js';
import { findRadarDuplicate, matchesExisting } from './radar/discover.js';
import { withCostSnapshot, backfillCosts } from './sales.js';
import { STATUS_MIGRATION } from './constants.js';
import { deleteArticleImages } from './images.js';

const DEFAULT_SETTINGS = { id: 'main', budget: 0, currency: 'EUR', goals: [100, 200, 300, 500, 1000], minMargin: 0, chargeRate: 0, monthlyGoal: 0, walletGoal: 0, walletMoves: [], lastBackupAt: '', market: { ...DEFAULT_MARKET } };
const state = { articles: [], sales: [], comparables: [], listings: [], radar: { items: [], obs: [], history: [] }, settings: { ...DEFAULT_SETTINGS } };
const subs = new Set();

export const getState = () => state;
export const subscribe = (fn) => (subs.add(fn), () => subs.delete(fn));
export const emit = () => subs.forEach((fn) => fn(state));

export async function initStore() {
  const [articles, sales, comparables, listings, settings] = await Promise.all([db.getAll('articles'), db.getAll('sales'), db.getAll('comparables'), db.getAll('listings'), db.getAll('settings')]);
  const old = articles.filter((a) => STATUS_MIGRATION[a.status]); // anciens noms de statut : renommés une fois, puis enregistrés
  if (old.length) { try { await db.batch(old.map((a) => ({ store: 'articles', put: migrateArticle(a) }))); } catch (e) { console.error('Migration des statuts impossible', e); } }
  state.articles = articles.map((a) => migrateArticle(a) || a);
  const fix = backfillCosts(sales, state.articles); // anciennes ventes : coût de l'article figé une fois
  if (fix.length) { try { await db.batch(fix.map((s) => ({ store: 'sales', put: s }))); } catch (e) { console.error('Migration des coûts impossible', e); } }
  const fixed = new Map(fix.map((s) => [s.id, s]));
  state.sales = sales.map((s) => fixed.get(s.id) || s); state.comparables = comparables; state.listings = listings;
  const saved = settings.find((s) => s.id === 'main') || {};
  state.settings = { ...DEFAULT_SETTINGS, ...saved, market: { ...DEFAULT_MARKET, ...(saved.market || {}) } }; // anciennes bases : valeurs par défaut ajoutées
  // Radar : une lecture impossible ne doit jamais empêcher le reste de l'application de démarrer
  const [rItems, rObs, rHist] = await Promise.all(['radarItems', 'radarObs', 'radarHistory'].map((s) => db.getAll(s).catch((e) => { console.error(`Radar : lecture de « ${s} » impossible`, e); return []; })));
  state.radar = { items: rItems, obs: rObs, history: rHist };
  navigator.storage?.persist?.(); // demande au navigateur de ne pas purger les données
  emit();
}

/* Écrit d'abord en base : l'état mémoire n'est modifié que si l'écriture a réussi. */
export async function saveArticle(article) {
  await db.put('articles', article);
  const i = state.articles.findIndex((a) => a.id === article.id);
  if (i >= 0) state.articles[i] = article; else state.articles.push(article);
  emit();
}

/* Un article avec des ventes ne peut pas être supprimé (son coût sert au bénéfice réalisé) ; sinon l'article et ses photos sont supprimés. */
export async function removeArticle(id) {
  if (state.sales.some((s) => s.articleId === id)) throw new Error('cet article a des ventes enregistrées (les supprimer fausserait vos bénéfices).');
  await deleteArticleImages(id);
  await db.remove('articles', id);
  state.articles = state.articles.filter((a) => a.id !== id);
  emit();
}

/* Statut de l'article déduit de la vente : terminée -> Vendu ; annulée/remboursée -> l'article revient en stock. */
function articleAfter(sale, art) {
  if (!art) return null;
  const status = sale.status === 'terminée' ? 'Vendu' : art.status === 'Vendu' ? 'En stock' : art.status;
  return status === art.status ? null : { ...art, status, updatedAt: new Date().toISOString() };
}

/* Vente + mise à jour de l'article dans une seule transaction : aucun état intermédiaire possible. */
export async function saveSale(input) {
  const art0 = state.articles.find((a) => a.id === input.articleId);
  const sale = withCostSnapshot(input, state.sales.find((x) => x.id === input.id), art0); // coût de l'article figé à la vente
  const art = articleAfter(sale, art0);
  await db.batch([{ store: 'sales', put: sale }, ...(art ? [{ store: 'articles', put: art }] : [])]);
  const i = state.sales.findIndex((x) => x.id === sale.id);
  if (i >= 0) state.sales[i] = sale; else state.sales.push(sale);
  if (art) state.articles = state.articles.map((a) => (a.id === art.id ? art : a));
  emit();
}

export async function removeSale(id) {
  const sale = state.sales.find((x) => x.id === id), art0 = state.articles.find((a) => a.id === sale?.articleId);
  const art = sale?.status === 'terminée' && art0?.status === 'Vendu' ? { ...art0, status: 'En stock', updatedAt: new Date().toISOString() } : null;
  await db.batch([{ store: 'sales', del: id }, ...(art ? [{ store: 'articles', put: art }] : [])]);
  state.sales = state.sales.filter((x) => x.id !== id);
  if (art) state.articles = state.articles.map((a) => (a.id === art.id ? art : a));
  emit();
}

/* ---------- Étude de marché ---------- */
export async function saveComparable(c) {
  await db.put('comparables', c);
  const i = state.comparables.findIndex((x) => x.id === c.id);
  if (i >= 0) state.comparables[i] = c; else state.comparables.push(c);
  emit();
}

export async function removeComparables(ids) {
  await db.batch(ids.map((id) => ({ store: 'comparables', del: id })));
  state.comparables = state.comparables.filter((c) => !ids.includes(c.id));
  emit();
}

/* Réglages de l'étude de marché (écrits en base avant de modifier l'état). */
export async function saveMarketSettings(market) {
  const next = { ...state.settings, market: { ...DEFAULT_MARKET, ...market } };
  await db.put('settings', next);
  state.settings = next;
  emit();
}

/* Réglages généraux (+ éventuellement une partie des réglages de l'étude de marché), écrits en base avant l'état. */
export async function saveSettings(general, marketPatch = {}) {
  const next = { ...state.settings, ...general, market: { ...state.settings.market, ...marketPatch } };
  await db.put('settings', next);
  state.settings = next;
  emit();
}

/* ---------- Brouillons d'annonces ---------- */
export async function saveListing(l) {
  await db.put('listings', l);
  const i = state.listings.findIndex((x) => x.id === l.id);
  if (i >= 0) state.listings[i] = l; else state.listings.push(l);
  emit();
}

export async function removeListing(id) {
  await db.remove('listings', id);
  state.listings = state.listings.filter((x) => x.id !== id);
  emit();
}

/* ---------- Radar tendances ---------- */
const upsert = (list, rec) => { const i = list.findIndex((x) => x.id === rec.id); if (i >= 0) list[i] = rec; else list.push(rec); };

/* Ajoute un produit suivi. Un doublon (nom identique ou proche) est refusé : { ok: false, duplicate }.
   `existing` indique si le produit figure déjà dans les articles ou les études de marché (information, sans blocage). */
export async function addRadarItem(draft) {
  const duplicate = findRadarDuplicate(state.radar.items, draft.name);
  if (duplicate) return { ok: false, duplicate };
  const item = newRadarItem(draft, uid(), new Date().toISOString());
  await db.put('radarItems', item);
  state.radar.items.push(item); emit();
  return { ok: true, item, existing: matchesExisting(state, draft.name) };
}

export async function saveRadarItem(item) {
  const rec = { ...item, updatedAt: new Date().toISOString() };
  await db.put('radarItems', rec); upsert(state.radar.items, rec); emit();
  return rec;
}

/* Supprime un produit suivi avec ses observations et son historique, en une seule transaction. Les articles et ventes ne sont pas touchés. */
export async function removeRadarItem(id) {
  const obs = state.radar.obs.filter((o) => o.itemId === id), hist = state.radar.history.filter((h) => h.itemId === id);
  await db.batch([{ store: 'radarItems', del: id }, ...obs.map((o) => ({ store: 'radarObs', del: o.id })), ...hist.map((h) => ({ store: 'radarHistory', del: h.id }))]);
  state.radar = { items: state.radar.items.filter((i) => i.id !== id), obs: state.radar.obs.filter((o) => o.itemId !== id), history: state.radar.history.filter((h) => h.itemId !== id) };
  emit();
}

/* Enregistre une observation (mesure ou relevé daté avec sa source). Refusée si elle est invalide ou si le produit n'existe pas. */
export async function saveRadarObs(input) {
  const rec = { ...input, id: input.id || uid(), createdAt: input.createdAt || new Date().toISOString() }, errors = validateObservation(rec);
  if (errors.length) throw new Error(`observation invalide : ${errors.join(', ')}.`);
  if (!state.radar.items.some((i) => i.id === rec.itemId)) throw new Error('produit du Radar introuvable.');
  await db.put('radarObs', rec); upsert(state.radar.obs, rec); emit();
  return rec;
}

export async function removeRadarObs(id) {
  await db.remove('radarObs', id);
  state.radar.obs = state.radar.obs.filter((o) => o.id !== id); emit();
}

/* Instantanés d'analyse (un par produit et par jour : un nouvel instantané du même jour remplace le précédent). */
export async function saveRadarSnapshots(snaps) {
  if (!snaps.length) return;
  await db.batch(snaps.map((s) => ({ store: 'radarHistory', put: s })));
  for (const s of snaps) upsert(state.radar.history, s);
  emit();
}

/* « Ajouter au stock » (status « À acheter ») ou « Marquer comme acheté » (status « En stock », prévision figée pour la calibration).
   L'article et le produit du Radar sont écrits dans une seule transaction. Un article de même nom est refusé : { ok: false, duplicateArticle }. */
export async function radarToArticle(itemId, { buyPrice = 0, fees = 0, status = 'À acheter', targetPrice = null, prediction = null, today = new Date().toISOString().slice(0, 10) } = {}) {
  const item = state.radar.items.find((i) => i.id === itemId);
  if (!item) throw new Error('produit du Radar introuvable.');
  if (item.articleId && state.articles.some((a) => a.id === item.articleId)) throw new Error('ce produit est déjà rattaché à un article.');
  const duplicateArticle = findDuplicate(state.articles, item.name);
  if (duplicateArticle) return { ok: false, duplicateArticle };
  const now = new Date().toISOString(), article = articleFromRadar(item, { id: uid(), buyPrice, fees, status, targetPrice, today, now });
  const updated = { ...item, articleId: article.id, status: status === 'En stock' ? ITEM_STATUS.BOUGHT : item.status, prediction: prediction ?? item.prediction, updatedAt: now };
  await db.batch([{ store: 'articles', put: article }, { store: 'radarItems', put: updated }]);
  state.articles.push(article); upsert(state.radar.items, updated); emit();
  return { ok: true, article, item: updated };
}

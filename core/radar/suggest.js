/* Suggestions de recherches à effectuer soi-même. Le Radar n'interroge pas Vinted : il construit des liens de recherche
   ordinaires que l'utilisateur ouvre dans son navigateur, puis il relève lui-même les annonces (ou colle leur contenu). */
import { RADAR } from './config.js';

const ORDERS = ['relevance', 'newest_first', 'price_low_to_high', 'price_high_to_low'];

/* Lien de recherche Vinted (paramètres de catalogue publics : search_text, price_from, price_to, order). Prix en euros entiers. */
export function vintedSearchUrl({ text, priceFrom = null, priceTo = null, order = 'relevance', domain = 'www.vinted.fr' }) {
  const t = String(text ?? '').trim();
  if (!t) throw new Error('Texte de recherche vide');
  if (!ORDERS.includes(order)) throw new Error(`Tri inconnu : ${order}`);
  const q = new URLSearchParams({ search_text: t });
  if (priceFrom != null) q.set('price_from', String(priceFrom));
  if (priceTo != null) q.set('price_to', String(priceTo));
  q.set('order', order);
  return `https://${domain}/catalog?${q}`;
}

export const googleTrendsUrl = (term, geo = 'FR') => `https://trends.google.com/trends/explore?date=today%2012-m&geo=${geo}&q=${encodeURIComponent(term)}`;

/* Quatre recherches utiles pour un produit et un budget (centimes). */
export function searchSuggestions(item, budgetCents = RADAR.maxBudget) {
  const cap = Math.max(1, Math.floor(budgetCents / 100)), text = item.search || item.name;
  return [
    { id: 'recent', label: `Annonces récentes à ${cap} € ou moins`, url: vintedSearchUrl({ text, priceTo: cap, order: 'newest_first' }), why: 'Repérer d’éventuelles bonnes affaires à acheter dans votre budget.' },
    { id: 'cheapest', label: `Les moins chères, ${cap} € ou moins`, url: vintedSearchUrl({ text, priceTo: cap, order: 'price_low_to_high' }), why: 'Connaître le prix d’entrée du marché.' },
    { id: 'resale', label: 'Annonces de revente (tous prix)', url: vintedSearchUrl({ text, order: 'relevance' }), why: 'Relever 5 à 8 annonces comparables (prix, état, lien) : elles servent à calculer le prix de revente.' },
    { id: 'trends', label: 'Intérêt dans le temps (Google Trends, 12 mois)', url: googleTrendsUrl(text), why: 'Télécharger le CSV puis l’importer dans le Radar pour mesurer la tendance.' },
  ];
}

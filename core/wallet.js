/* Wallet : un budget de départ qu'on cherche à faire grandir. Fonctions pures ; montants en centimes entiers.
   Règles :
   - Solde disponible (cash) = budget de départ + apports − retraits − coût des articles achetés + ventes encaissées.
   - « Acheté » = tout statut sauf « À acheter ». Un article vendu compte pour le coût figé à la vente.
   - Ventes encaissées = prix − frais de vente − dépenses, ventes terminées seulement (annulées et remboursées ne comptent pas).
   - Valeur du wallet = cash + stock au prix coûtant (en stock ou en vente). Un article archivé est compté comme dépensé, sans valeur.
   - Gain = valeur − budget de départ − apports nets = bénéfices réalisés − coût des articles archivés. */
import { articleCost } from './articles.js';
import { saleCost, saleProfit } from './sales.js';
import { startDate } from './stats.js';
import { roundDiv } from './finance.js';
import { toCents } from './validators.js';

export const STOCK_STATUSES = ['En stock', 'En vente'];
const pct = (a, b) => (b > 0 ? roundDiv(a * 10000, b) / 100 : null);

export const walletMoves = (settings) => (Array.isArray(settings?.walletMoves) ? settings.walletMoves : []);
/* Le wallet est actif dès qu'un budget de départ ou un apport est enregistré. */
export const walletActive = (settings) => (settings?.budget || 0) > 0 || walletMoves(settings).length > 0;

/* Tous les mouvements d'argent, dans l'ordre chronologique, avec effet sur le cash et sur la valeur. */
function events({ articles, sales, settings }, now) {
  const done = sales.filter((s) => s.status === 'terminée'), byId = new Map(articles.map((a) => [a.id, a]));
  const soldIds = new Map(done.map((s) => [s.articleId, s]));
  const out = [];
  for (const a of articles) {
    if (a.status === 'À acheter') continue;
    const sale = soldIds.get(a.id), cost = sale ? saleCost(sale, a) : articleCost(a);
    out.push({ date: startDate(a) || sale?.date || now, kind: 'achat', label: `Achat : ${a.name}`, cash: -cost, value: a.status === 'Archivé' ? -cost : 0, stock: a.status !== 'Archivé' && !sale ? cost : 0 });
  }
  for (const s of done) {
    const a = byId.get(s.articleId);
    if (!a) out.push({ date: s.date, kind: 'achat', label: 'Achat : article supprimé', cash: -(s.cost ?? 0), value: 0, stock: 0 }); // vente d'un article qui n'existe plus : son coût reste compté
    out.push({ date: s.date, kind: 'vente', label: `Vente : ${a?.name ?? 'article supprimé'}`, cash: s.price - s.fees - s.expenses, value: saleProfit(s, a), stock: 0 });
  }
  for (const m of walletMoves(settings)) out.push({ date: m.date, kind: m.amount >= 0 ? 'apport' : 'retrait', label: (m.amount >= 0 ? 'Apport' : 'Retrait') + (m.note ? ` : ${m.note}` : ''), cash: m.amount, value: m.amount, stock: 0, moveId: m.id });
  const order = { apport: 0, retrait: 0, achat: 1, vente: 2 };
  return out.map((e, i) => ({ ...e, i })).sort((x, y) => x.date.localeCompare(y.date) || order[x.kind] - order[y.kind] || x.i - y.i);
}

export function walletState(data, now = new Date().toISOString().slice(0, 10)) {
  const { articles, sales, settings } = data, start = settings?.budget || 0, goal = settings?.walletGoal || 0;
  const ev = events(data, now), moves = ev.filter((e) => e.moveId).reduce((t, e) => t + e.cash, 0);
  const sum = (kind) => ev.filter((e) => e.kind === kind).reduce((t, e) => t + e.cash, 0);
  const purchases = -sum('achat'), proceeds = sum('vente');
  const cash = start + moves - purchases + proceeds;
  const stockItems = articles.filter((a) => STOCK_STATUSES.includes(a.status));
  const stockCost = stockItems.reduce((t, a) => t + articleCost(a), 0);
  const archivedLoss = articles.filter((a) => a.status === 'Archivé').reduce((t, a) => t + articleCost(a), 0);
  const value = cash + stockCost, gain = value - start - moves, base = start + moves;
  const potential = cash + stockItems.reduce((t, a) => t + (a.targetPrice != null ? a.targetPrice : articleCost(a)), 0);
  return { active: walletActive(settings), start, goal, moves, purchases, proceeds, cash, stockCost, stockCount: stockItems.length, archivedLoss, value, gain,
    growth: pct(gain, base), multiple: base > 0 ? roundDiv(value * 100, base) / 100 : null, potential, potentialGain: potential - value,
    progress: goal > 0 ? Math.min(100, Math.max(0, roundDiv(value * 10000, goal) / 100)) : null, remaining: goal > 0 ? Math.max(0, goal - value) : null, reached: goal > 0 && value >= goal };
}

/* Évolution dans le temps : un point par date, avec cash et valeur cumulés ; et journal avec solde après chaque ligne. */
export function walletTimeline(data, now = new Date().toISOString().slice(0, 10)) {
  const start = data.settings?.budget || 0, ev = events(data, now);
  let cash = start, value = start;
  const ledger = [{ date: null, kind: 'depart', label: 'Budget de départ', amount: start, balance: start }], byDate = new Map();
  for (const e of ev) {
    cash += e.cash; value += e.value;
    ledger.push({ date: e.date, kind: e.kind, label: e.label, amount: e.cash, balance: cash, moveId: e.moveId });
    byDate.set(e.date, { date: e.date, cash, value });
  }
  // la valeur ajoute le stock au prix coûtant : valeur = départ + apports + bénéfices réalisés − articles archivés (cash + stock).
  return { points: [...byDate.values()], ledger };
}

/* Achat possible ? reste après achat et manque éventuel. */
export const afford = (cash, cost) => ({ after: cash - cost, enough: cash >= cost, missing: Math.max(0, cost - cash) });
/* Croissance du wallet sur une opération : bénéfice ÷ cash avant l'achat (en %). */
export const opGrowth = (cash, profit) => pct(profit, cash);

/* ---------- Validation ---------- */
const realDate = (iso) => { const [y, m, d] = iso.split('-').map(Number), t = new Date(y, m - 1, d); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d; };
const MAX = 100_000_000_00; // 100 millions

/* Budget de départ et objectif. requireBudget : le budget doit être supérieur à 0 (démarrage du wallet). */
export function validateWallet(f, { requireBudget = false } = {}) {
  const errors = {}, amount = (k) => { const s = (f[k] ?? '').toString().trim(); if (!s) return 0; const c = toCents(s); if (Number.isNaN(c)) { errors[k] = 'Montant invalide (exemple : 50 ou 12,50).'; return 0; } if (c > MAX) { errors[k] = 'Montant trop élevé.'; return 0; } return c; };
  const budget = amount('budget'), goal = amount('walletGoal');
  if (requireBudget && !errors.budget && budget <= 0) errors.budget = 'Indiquez un budget de départ supérieur à 0.';
  return { errors, value: { budget, walletGoal: goal } };
}

/* Apport ou retrait d'argent. */
export function validateMove(f) {
  const errors = {}, s = (f.amount ?? '').toString().trim(), date = (f.date ?? '').trim(), note = (f.note ?? '').trim();
  let amount = 0;
  if (!s) errors.amount = 'Indiquez un montant.'; else { amount = toCents(s); if (Number.isNaN(amount)) { errors.amount = 'Montant invalide (exemple : 20 ou 12,50).'; amount = 0; } else if (amount <= 0) errors.amount = 'Le montant doit être supérieur à 0.'; else if (amount > MAX) errors.amount = 'Montant trop élevé.'; }
  if (!['apport', 'retrait'].includes(f.kind)) errors.kind = 'Choisissez apport ou retrait.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !realDate(date)) errors.date = 'Date invalide.';
  if (note.length > 100) errors.note = '100 caractères maximum.';
  return { errors, value: { date, amount: f.kind === 'retrait' ? -amount : amount, note } };
}

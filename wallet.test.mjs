/* Tests du wallet : `npm test`. Exemples calculés à la main + test de propriété (gain = bénéfices réalisés − archivés). */
import { walletState, walletTimeline, afford, opGrowth, validateWallet, validateMove } from '../src/core/wallet.js';
import { saleProfit } from '../src/core/sales.js';
let fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'OK  ' : 'FAIL', n, ok ? '' : `obtenu ${JSON.stringify(got)}`); };
const art = (id, status, buy, fees = 0, extra = {}) => ({ id, name: 'Article ' + id, status, buyPrice: buy, fees, createdAt: '2026-10-01T10:00:00.000Z', ...extra });
const NOW = '2026-11-09';

// Départ 50,00 € ; A en stock (coût 10,00) ; B vendu (coût figé 20,00, vendu 35,00, frais 1,00, dépenses 2,00) ; C archivé (5,00) ; D à acheter (9,99, ignoré)
const articles = [art('A', 'En stock', 800, 200, { targetPrice: 1800 }), art('B', 'Vendu', 2500, 0), art('C', 'Archivé', 500), art('D', 'À acheter', 999)];
const sales = [{ id: 's1', articleId: 'B', date: '2026-10-20', price: 3500, fees: 100, expenses: 200, cost: 2000, status: 'terminée' }];
const settings = { budget: 5000, walletGoal: 10000, walletMoves: [] };
let W = walletState({ articles, sales, settings }, NOW);
eq('cash', W.cash, 4700);                       // 5000 − (1000 + 2000 + 500) + 3200 ; le coût figé (2000) prime sur le coût actuel de B (2500)
eq('valeur = cash + stock', [W.stockCost, W.value], [1000, 5700]);
eq('gain', [W.gain, W.growth], [700, 14]);      // 1200 de bénéfice réalisé − 500 archivé ; 700 / 5000
eq('article à acheter ignoré', W.purchases, 3500);
eq('valeur potentielle', [W.potential, W.potentialGain], [6500, 800]);  // 4700 + prix envisagé 1800 de A
eq('objectif', [W.progress, W.remaining, W.reached, W.multiple], [57, 4300, false, 1.14]);

// Ventes annulées ou remboursées : aucun encaissement
const W2 = walletState({ articles, sales: [...sales, { id: 's2', articleId: 'A', date: '2026-10-25', price: 9999, fees: 0, expenses: 0, status: 'remboursée' }], settings }, NOW);
eq('vente remboursée ignorée', [W2.cash, W2.value], [4700, 5700]);

// Apports et retraits : le gain ne change pas, la base de croissance si
W = walletState({ articles, sales, settings: { ...settings, walletMoves: [{ id: 'm1', date: '2026-10-22', amount: 1000, note: '' }, { id: 'm2', date: '2026-10-23', amount: -300, note: '' }] } }, NOW);
eq('apports / retraits', [W.moves, W.cash, W.value, W.gain, W.growth], [700, 5400, 6400, 700, 12.28]);

// Wallet inactif / vide
eq('inactif', [walletState({ articles: [], sales: [], settings: { budget: 0 } }, NOW).active, walletState({ articles: [], sales: [], settings: { budget: 5000 } }, NOW).active], [false, true]);
eq('base nulle : pas de pourcentage', walletState({ articles: [], sales: [], settings: { budget: 0 } }, NOW).growth, null);

// Journal et évolution : dernier point = état actuel
const T = walletTimeline({ articles, sales, settings }, NOW);
const last = T.points[T.points.length - 1];
eq('évolution cohérente', [last.cash, last.value], [4700, 5700]);
eq('journal : départ puis solde cumulé', [T.ledger[0].balance, T.ledger[T.ledger.length - 1].balance, T.ledger.length], [5000, 4700, 5]); // départ + 3 achats (A, B, C ; D « À acheter » ignoré) + 1 vente
eq('journal chronologique', T.ledger.slice(1).map((r) => r.date), ['2026-10-01', '2026-10-01', '2026-10-01', '2026-10-20']);

// Calculateur
eq('achat possible', afford(5000, 1200), { after: 3800, enough: true, missing: 0 });
eq('solde insuffisant', afford(1000, 1500), { after: -500, enough: false, missing: 500 });
eq('croissance d’une opération', [opGrowth(5000, 750), opGrowth(0, 750), opGrowth(2000, -100)], [15, null, -5]);

// Propriété : gain = Σ bénéfices réalisés − Σ coûts archivés, quelles que soient les données
let bad = 0; const r = (n) => Math.floor(Math.random() * n);
for (let k = 0; k < 2000; k++) {
  const arts = [], ss = [], statuses = ['À acheter', 'En stock', 'En vente', 'Vendu', 'Archivé'];
  for (let i = 0; i < 1 + r(8); i++) {
    const a = art('x' + i, statuses[r(5)], r(5000), r(500)); arts.push(a);
    if (a.status === 'Vendu') ss.push({ id: 's' + i, articleId: a.id, date: '2026-10-' + String(10 + r(18)), price: r(8000), fees: r(300), expenses: r(300), cost: r(4000), status: 'terminée' });
    if (r(4) === 0) ss.push({ id: 'z' + i, articleId: a.id, date: '2026-10-12', price: r(8000), fees: 0, expenses: 0, status: r(2) ? 'annulée' : 'remboursée' });
  }
  const moves = Array.from({ length: r(4) }, (_, i) => ({ id: 'm' + i, date: '2026-10-' + String(10 + r(18)), amount: (r(2) ? 1 : -1) * (1 + r(3000)), note: '' }));
  const st = { budget: r(20000), walletMoves: moves }, W3 = walletState({ articles: arts, sales: ss, settings: st }, NOW), T3 = walletTimeline({ articles: arts, sales: ss, settings: st }, NOW);
  const realised = ss.filter((s) => s.status === 'terminée').reduce((t, s) => t + saleProfit(s, arts.find((a) => a.id === s.articleId)), 0);
  const archived = arts.filter((a) => a.status === 'Archivé').reduce((t, a) => t + a.buyPrice + a.fees, 0);
  const lp = T3.points[T3.points.length - 1];
  if (W3.gain !== realised - archived || (lp && (lp.cash !== W3.cash || lp.value !== W3.value))) bad++;
}
eq('propriété : gain = réalisé − archivé ; évolution = état (2000 cas)', bad, 0);

// Validation
eq('budget valide / invalide', [validateWallet({ budget: '50', walletGoal: '100,5' }, { requireBudget: true }).value, Object.keys(validateWallet({ budget: 'abc' }).errors), Object.keys(validateWallet({ budget: '' }, { requireBudget: true }).errors), Object.keys(validateWallet({ budget: '0' }, { requireBudget: true }).errors)], [{ budget: 5000, walletGoal: 10050 }, ['budget'], ['budget'], ['budget']]);
eq('apport / retrait valides', [validateMove({ kind: 'apport', amount: '20', date: '2026-11-01', note: ' cadeau ' }).value, validateMove({ kind: 'retrait', amount: '5,5', date: '2026-11-01' }).value.amount], [{ date: '2026-11-01', amount: 2000, note: 'cadeau' }, -550]);
eq('mouvement invalide', [Object.keys(validateMove({ kind: 'x', amount: '0', date: '2026-02-30' }).errors)], [['amount', 'kind', 'date']]);
console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests passent'); process.exit(fail ? 1 : 0);

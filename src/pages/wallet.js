/* Module « Mon wallet » : un budget de départ qu'on fait grandir (suivi des achats, ventes, apports et objectif). */
import { Chart, registerables } from 'chart.js';
import { getState, saveSettings } from '../core/store.js';
import { walletState, walletTimeline, validateWallet, validateMove } from '../core/wallet.js';
import { money, dateFr, fromCents, symbol, today, pct } from '../utils/format.js';
import { esc, uid } from '../utils/dom.js';
import { chartColors } from '../utils/theme.js';
import { pageHeader, kpiCard, emptyState, confirmDialog, field, selectField, toast, refreshIcons } from '../components/ui.js';

Chart.register(...registerables);
const sp = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + pct(v)); // pourcentage signé
const tone = (c) => (c > 0 ? 'pos' : c < 0 ? 'neg' : '');
const metric = (label, value, hint = '', cls = '') => `<div class="metric"><span>${label}</span><strong class="${cls}">${value}</strong>${hint ? `<small>${hint}</small>` : ''}</div>`;
const bar = (p) => `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p)}"><i style="width:${p}%"></i></div>`;

/* Bandeau du dashboard : valeur du wallet, cash et progression vers l'objectif (ou invitation à démarrer). */
export function walletStrip(W, fmt) {
  if (!W.active) return '<a class="callout" href="#/wallet" style="text-decoration:none"><i data-lucide="wallet"></i><div><strong>Mon wallet</strong> : indiquez un budget de départ (par exemple 50 €) pour suivre sa croissance achat après achat.</div></a>';
  return `<a class="card wallet-strip" href="#/wallet"><div><div class="muted">Mon wallet</div><div class="ws-value">${fmt(W.value)}</div>
    <div class="muted">${fmt(W.cash)} disponibles${W.growth == null ? '' : ` · <span class="${tone(W.gain)}">${sp(W.growth)}</span> depuis le départ`}</div></div>
    ${W.goal > 0 ? `<div class="ws-goal"><div class="muted">${W.reached ? 'Objectif atteint' : `${pct(W.progress)} de l’objectif ${fmt(W.goal)}`}</div>${bar(W.progress)}</div>` : ''}</a>`;
}

const showErrors = (form, errors) => {
  form.querySelectorAll('.field').forEach((el) => el.classList.remove('invalid'));
  form.querySelectorAll('[data-err]').forEach((el) => { el.textContent = errors[el.dataset.err] || ''; if (errors[el.dataset.err]) el.parentElement.classList.add('invalid'); });
  const first = Object.keys(errors)[0];
  if (first) form.querySelector(`[name="${first}"]`).focus();
  return Boolean(first);
};
const fail = (err, what) => { console.error(err); toast(`${what} impossible : ${err.message}`); };

export function walletPage(view) {
  let chart = null;
  const draw = () => {
    chart?.destroy(); chart = null;
    const st = getState(), S = st.settings, cur = S.currency, fmt = (c) => money(c, cur), sym = symbol(cur), z = (c) => (c ? fromCents(c) : '');
    const W = walletState(st);

    /* ----- Démarrage : pas encore de budget ----- */
    if (!W.active) {
      view.innerHTML = pageHeader('Mon wallet', 'Partez d’un petit budget et faites-le grandir.') + `
        <form id="wf" class="card" novalidate autocomplete="off"><div class="card-title"><h2>Démarrer votre wallet</h2></div>
          <p class="muted">Indiquez la somme dont vous disposez pour acheter vos premiers articles. Le wallet suit ensuite chaque achat et chaque vente, et montre de combien votre budget a grandi.</p>
          <div class="preset-row">${[20, 50, 100, 200].map((n) => `<button type="button" class="btn btn-ghost btn-sm" data-preset="${n}">${n} ${sym}</button>`).join('')}</div>
          <div class="form-grid">
            ${field({ label: `Budget de départ (${sym})`, name: 'budget', placeholder: '50', inputmode: 'decimal', required: true })}
            ${field({ label: `Objectif (${sym})`, name: 'walletGoal', placeholder: '100', inputmode: 'decimal', hint: 'Facultatif : la valeur du wallet à atteindre (100 pour doubler 50).' })}</div>
          <p class="note">Les articles déjà enregistrés (statut autre que « À acheter ») sont comptés comme dépensés sur ce budget : indiquez la somme dont vous disposiez avant vos premiers achats.</p>
          <div class="modal-actions"><button type="submit" class="btn btn-primary" id="wsave"><i data-lucide="rocket"></i>Démarrer</button></div></form>`;
      const form = view.querySelector('#wf');
      view.querySelectorAll('[data-preset]').forEach((b) => { b.onclick = () => { form.elements.budget.value = b.dataset.preset; form.elements.budget.focus(); }; });
      form.onsubmit = async (e) => {
        e.preventDefault();
        const { errors, value } = validateWallet(Object.fromEntries(new FormData(form)), { requireBudget: true });
        if (showErrors(form, errors)) return;
        form.querySelector('#wsave').disabled = true;
        try { await saveSettings(value); toast('Wallet démarré'); draw(); } catch (err) { fail(err, 'Enregistrement'); form.querySelector('#wsave').disabled = false; }
      };
      refreshIcons(view); return;
    }

    /* ----- Wallet actif ----- */
    const T = walletTimeline(st), moves = [...(S.walletMoves || [])].sort((a, b) => b.date.localeCompare(a.date));
    const base = W.start + W.moves, goalBtns = [1.5, 2, 3].map((m) => `<button type="button" class="btn btn-ghost btn-sm" data-goalx="${m}">× ${String(m).replace('.', ',')}</button>`).join('');
    view.innerHTML = pageHeader('Mon wallet', 'Partez d’un petit budget et faites-le grandir.') + `
      ${W.cash < 0 ? `<div class="alert alert-bad" style="margin-bottom:16px">Votre solde est négatif de ${fmt(-W.cash)} : vos achats dépassent le budget. Indiquez un budget de départ plus élevé ou ajoutez un apport.</div>` : ''}
      <div class="kpis">
        ${kpiCard({ label: 'Disponible (cash)', value: fmt(W.cash), icon: 'wallet', hero: true, tone: W.cash < 0 ? 'neg' : '' })}
        ${kpiCard({ label: 'Valeur du wallet', value: fmt(W.value), icon: 'trending-up', hero: true })}
        ${kpiCard({ label: `Gain depuis le départ${W.growth == null ? '' : ` (${sp(W.growth)})`}`, value: fmt(W.gain), icon: 'sprout', tone: tone(W.gain) })}
        ${kpiCard({ label: `Stock au prix coûtant (${W.stockCount})`, value: fmt(W.stockCost), icon: 'archive' })}</div>
      <div class="grid-2"><div class="card"><div class="card-title"><h2>Objectif</h2><span>${W.goal > 0 ? fmt(W.goal) : 'non défini'}</span></div>
        ${W.goal > 0 ? `${bar(W.progress)}<p style="margin-top:12px">${W.reached ? '<strong class="pos">Objectif atteint.</strong> Vous pouvez en fixer un plus haut ci-dessous.' : `Encore <strong>${fmt(W.remaining)}</strong> à gagner (${pct(W.progress)} atteints).`}</p>`
          : '<p class="muted">Fixez une valeur à atteindre pour suivre votre progression.</p>'}
        <div class="preset-row"><span class="muted">Viser</span>${goalBtns}<span class="muted">votre capital (${fmt(base)})</span></div></div>
        <div class="card"><div class="card-title"><h2>Détails</h2></div><div class="metrics">
          ${metric('Budget de départ', fmt(W.start))}${metric('Apports nets', fmt(W.moves), 'apports − retraits')}
          ${metric('Total dépensé en achats', fmt(W.purchases))}${metric('Ventes encaissées', fmt(W.proceeds), 'après frais et dépenses')}
          ${metric('Multiple du capital', W.multiple == null ? '—' : `× ${W.multiple.toLocaleString('fr-FR')}`, 'valeur ÷ (départ + apports)')}
          ${metric('Valeur potentielle', fmt(W.potential), 'si tout le stock se vend au prix envisagé, avant frais de vente', tone(W.potentialGain))}</div>
          ${W.archivedLoss > 0 ? `<p class="note">Articles archivés : ${fmt(W.archivedLoss)} comptés comme dépensés, sans valeur.</p>` : ''}</div></div>
      <div class="card" style="margin-bottom:16px"><div class="card-title"><h2>Évolution</h2><span>Valeur et cash</span></div>
        <div class="chart-box"><canvas id="c-wallet"></canvas>${T.points.length ? '' : emptyState('line-chart', 'Pas encore de mouvement', 'La courbe apparaîtra avec vos premiers achats et ventes.')}</div></div>
      <div class="grid-2"><form id="ws" class="card" novalidate autocomplete="off"><div class="card-title"><h2>Réglages du wallet</h2></div><div class="form-grid">
          ${field({ label: `Budget de départ (${sym})`, name: 'budget', value: z(W.start), inputmode: 'decimal' })}
          ${field({ label: `Objectif (${sym})`, name: 'walletGoal', value: z(W.goal), inputmode: 'decimal', placeholder: 'Aucun' })}</div>
          <div class="modal-actions"><button type="button" class="btn btn-danger" id="reset">Réinitialiser le wallet</button><button type="submit" class="btn btn-primary" id="wsave">Enregistrer</button></div>
          <p class="note">Réinitialiser efface le budget, l’objectif et les apports ; vos articles et ventes ne sont pas modifiés.</p></form>
        <form id="mf" class="card" novalidate autocomplete="off"><div class="card-title"><h2>Apports et retraits</h2></div><div class="form-grid">
          ${selectField({ label: 'Type', name: 'kind', value: 'apport', options: [{ value: 'apport', label: 'Apport (j’ajoute de l’argent)' }, { value: 'retrait', label: 'Retrait (je reprends de l’argent)' }] })}
          ${field({ label: `Montant (${sym})`, name: 'amount', placeholder: '20', inputmode: 'decimal', required: true })}
          ${field({ label: 'Date', name: 'date', type: 'date', value: today(), required: true })}${field({ label: 'Note (facultatif)', name: 'note', placeholder: 'Ex. cadeau' })}</div>
          <div class="modal-actions"><button type="submit" class="btn btn-primary" id="msave">Ajouter</button></div>
          ${moves.length ? `<table style="margin-top:12px"><tbody>${moves.map((m) => `<tr><td>${dateFr(m.date)}</td><td>${m.amount >= 0 ? 'Apport' : 'Retrait'}${m.note ? ` : ${esc(m.note)}` : ''}</td><td class="num ${tone(m.amount)}">${fmt(m.amount)}</td>
            <td class="row-actions"><button type="button" class="icon-btn" data-delmove="${m.id}" aria-label="Supprimer"><i data-lucide="trash-2"></i></button></td></tr>`).join('')}</tbody></table>` : ''}
          <p class="note">Un apport n’est pas un gain : le gain ne compte que ce que vos ventes rapportent.</p></form></div>
      <div class="card"><div class="card-title"><h2>Journal</h2><span>${T.ledger.length - 1} opération(s)</span></div>
        <table><thead><tr><th>Date</th><th>Opération</th><th class="num">Montant</th><th class="num">Solde</th></tr></thead><tbody>
          ${[...T.ledger].reverse().slice(0, 80).map((r) => `<tr><td>${r.date ? dateFr(r.date) : '—'}</td><td>${esc(r.label)}</td><td class="num ${r.kind === 'depart' ? '' : tone(r.amount)}">${fmt(r.amount)}</td><td class="num">${fmt(r.balance)}</td></tr>`).join('')}</tbody></table>
        ${T.ledger.length > 81 ? '<p class="note">Les 80 opérations les plus récentes sont affichées.</p>' : ''}</div>`;

    // courbe : point de départ puis un point par date
    const C = chartColors(), labels = ['Départ', ...T.points.map((p) => dateFr(p.date))];
    if (T.points.length) chart = new Chart(view.querySelector('#c-wallet'), { type: 'line', data: { labels, datasets: [
      { label: 'Valeur du wallet', data: [W.start / 100, ...T.points.map((p) => p.value / 100)], borderColor: C.primary, backgroundColor: C.fill, fill: true, tension: .25, pointRadius: 3 },
      { label: 'Cash disponible', data: [W.start / 100, ...T.points.map((p) => p.cash / 100)], borderColor: C.grey, borderDash: [5, 4], tension: .25, pointRadius: 2 },
      ...(W.goal > 0 ? [{ label: 'Objectif', data: labels.map(() => W.goal / 100), borderColor: C.palette[3], borderDash: [2, 4], pointRadius: 0 }] : [])] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom' } } } });

    const saveGoal = async (goal) => { try { await saveSettings({ walletGoal: goal }); toast('Objectif enregistré'); draw(); } catch (err) { fail(err, 'Enregistrement'); } };
    view.querySelectorAll('[data-goalx]').forEach((b) => { b.onclick = () => saveGoal(Math.round(base * Number(b.dataset.goalx))); });
    const ws = view.querySelector('#ws');
    ws.onsubmit = async (e) => {
      e.preventDefault();
      const { errors, value } = validateWallet(Object.fromEntries(new FormData(ws)), { requireBudget: Boolean(S.budget) && !(S.walletMoves || []).length });
      if (showErrors(ws, errors)) return;
      ws.querySelector('#wsave').disabled = true;
      try { await saveSettings(value); toast('Wallet enregistré'); draw(); } catch (err) { fail(err, 'Enregistrement'); ws.querySelector('#wsave').disabled = false; }
    };
    view.querySelector('#reset').onclick = async () => {
      if (!(await confirmDialog({ title: 'Réinitialiser le wallet ?', confirmLabel: 'Réinitialiser', message: 'Le budget de départ, l’objectif et les apports seront effacés. Vos articles et vos ventes ne sont pas modifiés.' }))) return;
      try { await saveSettings({ budget: 0, walletGoal: 0, walletMoves: [] }); toast('Wallet réinitialisé'); draw(); } catch (err) { fail(err, 'Réinitialisation'); }
    };
    const mf = view.querySelector('#mf');
    mf.onsubmit = async (e) => {
      e.preventDefault();
      const { errors, value } = validateMove(Object.fromEntries(new FormData(mf)));
      if (showErrors(mf, errors)) return;
      mf.querySelector('#msave').disabled = true;
      try { await saveSettings({ walletMoves: [...(S.walletMoves || []), { id: uid(), ...value }] }); toast('Mouvement ajouté'); draw(); } catch (err) { fail(err, 'Enregistrement'); mf.querySelector('#msave').disabled = false; }
    };
    view.querySelectorAll('[data-delmove]').forEach((b) => { b.onclick = async () => {
      if (!(await confirmDialog({ title: 'Supprimer ce mouvement ?', message: 'Le solde de votre wallet sera recalculé.' }))) return;
      try { await saveSettings({ walletMoves: (S.walletMoves || []).filter((m) => m.id !== b.dataset.delmove) }); toast('Mouvement supprimé'); draw(); } catch (err) { fail(err, 'Suppression'); }
    }; });
    refreshIcons(view);
  };
  draw();
  return () => chart?.destroy();
}

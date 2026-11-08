/* Carte « Synchronisation cloud » de la page Paramètres. */
import * as local from '../core/localdb.js';
import { isConfigured, getUser, signIn, signOutCloud, ping, countRemote, backend as cloud, getWorkspace, getConfigProblem } from '../core/cloud.js';
import { backendKind } from '../core/db.js';
import { esc } from '../utils/dom.js';
import { confirmDialog, toast, refreshIcons } from '../components/ui.js';

const STORES = ['articles', 'sales', 'comparables', 'listings', 'settings', 'images'];
const box = (title, tag, body) => `<div class="card"><div class="card-title"><h2>${title}</h2><span>${tag}</span></div>${body}</div>`;

export async function mountCloudCard(el, { exportBackup }) {
  if (!el) return;
  if (!isConfigured()) {
    el.innerHTML = box('Synchronisation cloud', 'Non configurée', `${getConfigProblem() ? `<div class="alert alert-bad">${esc(getConfigProblem())}</div>` : ''}<p class="muted">Avec Firebase, vos données se synchronisent automatiquement entre vos appareils : plus besoin d’exporter ni d’importer un fichier de sauvegarde. Suivez le guide <strong>FIREBASE.md</strong> (environ 10 minutes, gratuit, sans carte bancaire), puis renseignez <code>src/firebase-config.js</code>.</p>`);
    return;
  }
  const user = getUser();
  if (!user) {
    el.innerHTML = box('Synchronisation cloud', 'Non connecté', `<p class="muted">Connectez-vous pour retrouver vos données sur tous vos appareils. Vos données actuelles de cet ordinateur ne sont ni modifiées ni envoyées tant que vous ne le demandez pas.</p>
      <div class="cloud-row"><button class="btn btn-primary" id="signin"><i data-lucide="log-in"></i>Se connecter avec Google</button></div>`);
    refreshIcons(el);
    el.querySelector('#signin').onclick = async (e) => {
      e.currentTarget.disabled = true;
      try { if (await signIn()) location.reload(); else e.currentTarget.disabled = false; }
      catch (err) { console.error(err); toast(err.code === 'auth/unauthorized-domain' ? 'Domaine non autorisé : ajoutez-le dans Firebase → Authentication → Paramètres → Domaines autorisés.' : 'Connexion impossible : ' + err.message); e.currentTarget.disabled = false; }
    };
    return;
  }

  const online = backendKind() === 'cloud', ws = getWorkspace();
  el.innerHTML = box('Synchronisation cloud', online ? (ws ? `Active · espace partagé « ${esc(ws)} »` : 'Active') : 'Cloud injoignable : mode local', `
    <p class="muted">Connecté en tant que <strong>${esc(user.email || user.displayName || 'utilisateur')}</strong>. ${ws ? 'Vous travaillez dans un <strong>espace partagé</strong> : les personnes autorisées voient et modifient les mêmes données que vous, en temps réel.' : 'Chaque modification est enregistrée dans le cloud automatiquement.'}</p>
    <div class="metrics" style="margin-top:12px"><div class="metric"><span>Articles dans le cloud</span><strong id="n-cloud">…</strong></div><div class="metric"><span>Articles sur cet ordinateur (non synchronisés)</span><strong id="n-local">…</strong></div></div>
    <div class="cloud-row"><button class="btn btn-ghost" id="upload"><i data-lucide="cloud-upload"></i>Envoyer les données de cet ordinateur vers le cloud</button>
      <button class="btn btn-ghost" id="ping"><i data-lucide="activity"></i>Tester la synchronisation</button>
      <button class="btn btn-ghost" id="signout"><i data-lucide="log-out"></i>Se déconnecter</button></div>
    <p class="note">« Envoyer » remplace le contenu du cloud par celui de cet ordinateur : à faire une seule fois, au premier démarrage. Un autre appareil n’a rien à envoyer : il lui suffit de se connecter.</p>`);
  refreshIcons(el);
  countRemote().then((n) => { el.querySelector('#n-cloud').textContent = n; }, () => { el.querySelector('#n-cloud').textContent = '—'; });
  local.getAll('articles').then((l) => { el.querySelector('#n-local').textContent = l.length; }, () => { el.querySelector('#n-local').textContent = '—'; });

  el.querySelector('#ping').onclick = async (e) => {
    e.currentTarget.disabled = true;
    try { await ping(); toast('Synchronisation opérationnelle'); } catch (err) { console.error(err); toast('Échec : ' + (err.code === 'permission-denied' ? 'accès refusé, vérifiez les règles Firestore (FIREBASE.md, étape 3).' : err.message)); }
    e.currentTarget.disabled = false;
  };
  el.querySelector('#signout').onclick = async () => { try { await signOutCloud(); location.reload(); } catch (err) { toast('Déconnexion impossible : ' + err.message); } };
  el.querySelector('#upload').onclick = async (e) => {
    const btn = e.currentTarget;
    if (!(await confirmDialog({ title: 'Envoyer vers le cloud ?', confirmLabel: 'Remplacer le cloud',
      message: `Le contenu actuel du cloud${ws ? ' (visible par tous les membres de l’espace partagé)' : ''} sera remplacé par les données de cet ordinateur (photos comprises). Une sauvegarde du cloud actuel est téléchargée avant.${ws ? ' N’envoyez rien depuis un appareil vide.' : ''}` }))) return;
    btn.disabled = true;
    try {
      if (online) await exportBackup('cloud-avant-envoi');
      const data = Object.fromEntries(await Promise.all(STORES.map(async (s) => [s, await local.getAll(s)])));
      toast('Envoi en cours… ne fermez pas la page.');
      await cloud.replaceAll(data);
      toast('Données envoyées vers le cloud'); setTimeout(() => location.reload(), 800);
    } catch (err) { console.error(err); toast('Envoi impossible : ' + err.message + ' Le cloud n’a pas été entièrement remplacé : relancez l’envoi.'); btn.disabled = false; }
  };
}

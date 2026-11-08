import './styles/app.css';
import { renderSidebar, setSyncFooter } from './components/Sidebar.js';
import { startRouter } from './router.js';
import { initStore } from './core/store.js';
import { setBackend } from './core/db.js';
import * as local from './core/localdb.js';
import { isConfigured, startCloud, backend as cloudBackend, onStatus, onError } from './core/cloud.js';
import { toast } from './components/ui.js';

renderSidebar(document.getElementById('sidebar'));

/* Cloud (facultatif) : actif seulement si firebase-config.js est rempli ET que l'utilisateur est connecté. */
let cloudUser = null;
if (isConfigured()) {
  try { cloudUser = await startCloud(); } catch (err) { console.error(err); toast('Synchronisation indisponible : mode local.'); }
}
if (cloudUser) {
  setBackend(cloudBackend);
  onStatus((s) => setSyncFooter(s));
  onError((e) => toast('Synchronisation impossible : ' + (e.code === 'permission-denied' ? 'accès refusé, vérifiez les règles Firestore.' : e.message)));
} else setSyncFooter('local', isConfigured());

let lastLoad = Date.now();
try {
  await initStore();
} catch (err) {
  console.error(err);
  if (cloudUser) { // cloud injoignable au démarrage : on affiche les données locales, sans rien envoyer
    setBackend(local); setSyncFooter('error');
    toast('Cloud injoignable : données locales affichées. Rechargez la page quand la connexion revient.');
    try { await initStore(); } catch (e) { console.error(e); }
  } else toast('Stockage local indisponible : les données ne seront pas conservées (navigation privée ?).');
}
startRouter(document.getElementById('view'));

/* Retour sur l'onglet après un moment : recharge les données (modifiées depuis un autre appareil) sans gêner la saisie. */
if (cloudUser) document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || Date.now() - lastLoad < 60000 || !navigator.onLine) return;
  if (document.querySelector('.overlay') || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  try { await initStore(); lastLoad = Date.now(); dispatchEvent(new HashChangeEvent('hashchange')); } catch (e) { console.error(e); }
});

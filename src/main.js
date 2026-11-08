import './styles/app.css';
import { renderSidebar, setSyncFooter } from './components/Sidebar.js';
import { startRouter } from './router.js';
import { initStore } from './core/store.js';
import { setBackend } from './core/db.js';
import * as local from './core/localdb.js';
import { isConfigured, startCloud, backend as cloudBackend, onStatus, onError, watch } from './core/cloud.js';
import { toast } from './components/ui.js';

/* Tout le démarrage est dans une fonction : pas de « top-level await », que le build de production ne supporte pas. */
async function boot() {
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

  /* Recharge les données modifiées ailleurs (autre appareil ou autre personne) sans gêner la saisie en cours. */
  const busy = () => document.querySelector('.overlay') || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  let waiting = false;
  async function refresh() {
    if (waiting || !navigator.onLine) return;
    waiting = true;
    while (busy()) await new Promise((r) => setTimeout(r, 4000)); // attend la fin d'une saisie ou d'une fenêtre ouverte
    waiting = false;
    try { await initStore(); lastLoad = Date.now(); dispatchEvent(new HashChangeEvent('hashchange')); } catch (e) { console.error(e); }
  }
  if (cloudUser) {
    watch(refresh); // changements des autres en temps réel
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - lastLoad > 60000) refresh(); });
  }
}

boot().catch((err) => { console.error(err); toast('Démarrage impossible : ' + err.message); });

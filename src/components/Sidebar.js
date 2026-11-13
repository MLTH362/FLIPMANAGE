import { icons, createIcons } from 'lucide';
import { ROUTES } from '../router.js';
import { getTheme, setTheme } from '../utils/theme.js';

export function renderSidebar(el) {
  el.innerHTML = `
    <div class="brand">
      <div class="brand-mark"><i data-lucide="trending-up"></i></div>
      <div><div class="brand-name">FLIPMANAGER</div><div class="brand-sub">Achat-revente</div></div>
    </div>
    <nav class="nav">
      ${ROUTES.map((r) => (r.id === 'parametres' ? '<div class="sep"></div>' : '') +
        `<a href="#/${r.id}" data-route="${r.id}"><i data-lucide="${r.icon}"></i>${r.label}</a>`).join('')}
    </nav>
    <button type="button" class="theme-btn" id="themebtn"></button>
    <div class="side-foot" id="syncfoot"></div>`;
  drawThemeButton();
  document.getElementById('themebtn').onclick = () => {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    drawThemeButton();
    dispatchEvent(new HashChangeEvent('hashchange')); // réaffiche la page : les graphiques reprennent les couleurs du thème
  };
  createIcons({ icons });
}

function drawThemeButton() {
  const dark = getTheme() === 'dark', b = document.getElementById('themebtn');
  b.innerHTML = `<i data-lucide="${dark ? 'sun' : 'moon'}"></i><span>${dark ? 'Mode clair' : 'Mode sombre'}</span>`;
  b.setAttribute('aria-label', dark ? 'Passer en mode clair' : 'Passer en mode sombre');
  createIcons({ icons });
}

export function setActive(id) {
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === id));
}

const FOOT = { local: 'Données stockées sur cet ordinateur', 'local-cloud': 'Mode local : cloud non connecté', synced: 'Synchronisé avec le cloud',
  syncing: 'Synchronisation en cours…', offline: 'Hors ligne : envoi dès le retour du réseau', error: 'Erreur de synchronisation' };
/* Indicateur du pied de sidebar : local | synced | syncing | offline | error. */
export function setSyncFooter(state, cloudAvailable = false) {
  const el = document.getElementById('syncfoot'); if (!el) return;
  const key = state === 'local' && cloudAvailable ? 'local-cloud' : state;
  el.innerHTML = `<span class="dot ${state}"></span>${FOOT[key]}`;
}

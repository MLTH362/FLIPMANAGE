/* Thème de l'interface : clair « Azur » (par défaut) ou sombre. Le choix est mémorisé sur cet appareil. */
export const getTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  try { localStorage.setItem('fm-theme', getTheme()); } catch { /* stockage indisponible : le choix n'est pas mémorisé */ }
}

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* Couleurs des graphiques, lues dans les jetons CSS au moment de l'affichage (donc toujours celles du thème actif). */
export const chartColors = () => ({
  primary: cssVar('--primary'), fill: cssVar('--chart-fill'), grey: cssVar('--chart-grey'), neg: cssVar('--neg'),
  card: cssVar('--card'), text: cssVar('--muted'), grid: cssVar('--chart-grid'),
  palette: [1, 2, 3, 4, 5, 6].map((i) => cssVar(`--c${i}`)),
});

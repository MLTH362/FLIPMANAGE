/* Provenance des informations du Radar. Chaque valeur affichée est :
   - « vérifiée » : mesurée à une source identifiée (API publique, fichier importé, annonce relevée, vente réelle) ;
   - « estimation » : calculée par le Radar à partir de mesures (modèle, scénario) ;
   - « inconnue » : aucune donnée. Une valeur inconnue reste inconnue : elle n'est jamais remplacée par un chiffre inventé. */
export const VERIFIED = 'verified', ESTIMATE = 'estimate', UNKNOWN = 'unknown';
export const verified = (value, source, date = null) => ({ value, kind: VERIFIED, source, date });
export const estimate = (value, basis) => ({ value, kind: ESTIMATE, source: basis, date: null });
export const unknown = (why) => ({ value: null, kind: UNKNOWN, source: why, date: null });
export const isKnown = (f) => Boolean(f) && f.kind !== UNKNOWN && f.value != null;

export const eur = (c) => `${(c / 100).toFixed(2).replace('.', ',')} €`;
export const fmtPct = (x) => (x == null ? '—' : `${x.toFixed(1).replace('.', ',')} %`);

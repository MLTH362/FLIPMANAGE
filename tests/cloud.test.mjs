/* Tests de la couche cloud (parties sans Firebase) : conversions de photos, lots, redirection local/cloud. `npm test`. */
import { toDoc, fromDoc, chunk, MAX_PHOTO_CHARS } from '../src/core/cloudDocs.js';
import { blobToDataUrl, dataUrlToBlob } from '../src/utils/blob.js';
import { isConfiguredWith, workspaceIdOf, basePath, configProblem } from '../src/core/cloud.js';
import * as db from '../src/core/db.js';
let fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'OK  ' : 'FAIL', n, ok ? '' : `obtenu ${JSON.stringify(got)}`); };
const bytes = async (b) => [...new Uint8Array(await b.arrayBuffer())];

const src = Uint8Array.from([0, 1, 2, 3, 250, 251, 255, 128, 64]);
const blob = new Blob([src], { type: 'image/webp' });
const url = await blobToDataUrl(blob);
eq('data URL', url.startsWith('data:image/webp;base64,'), true);
const back = dataUrlToBlob(url);
eq('aller-retour Blob <-> texte', [back.type, await bytes(back)], ['image/webp', [...src]]);

const doc = await toDoc('images', { id: 'i1', articleId: 'a1', order: 2, blob });
eq('photo -> document (sans Blob)', [Object.keys(doc).sort(), doc.type], [['articleId', 'data', 'id', 'order', 'type'], 'image/webp']);
const rec = fromDoc('images', doc);
eq('document -> photo', [rec.id, rec.articleId, rec.order, await bytes(rec.blob)], ['i1', 'a1', 2, [...src]]);
const art = { id: 'a1', name: 'Veste', buyPrice: 1000 };
eq('autres données inchangées', [await toDoc('articles', art), fromDoc('articles', art)], [art, art]);
let err = ''; try { await toDoc('images', { id: 'x', blob: new Blob([new Uint8Array(MAX_PHOTO_CHARS)], { type: 'image/webp' }) }); } catch (e) { err = e.message; }
eq('photo trop lourde refusée', /trop lourde/.test(err), true);

eq('lots', chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
eq('lots vides', chunk([], 3), []);
/* Test indépendant de votre vrai fichier firebase-config.js (rempli ou non). */
eq('configuration vide ou modèle = mode local', [isConfiguredWith(null), isConfiguredWith({}), isConfiguredWith({ apiKey: 'COLLEZ_ICI_VOTRE_CLE', projectId: '' }), isConfiguredWith({ apiKey: 'AIzaX', projectId: '' })], [false, false, false, false]);
eq('configuration remplie = cloud actif', isConfiguredWith({ apiKey: 'AIzaX', projectId: 'flipmanager-123', authDomain: 'a', appId: 'b' }), true);

/* Espace partagé : identifiant valide, chemin des données, protection contre une faute de frappe. */
const good = { apiKey: 'AIzaX', projectId: 'p' };
eq('espace partagé : identifiants', [workspaceIdOf(good), workspaceIdOf({ workspace: '' }), workspaceIdOf({ workspace: 'partage' }), workspaceIdOf({ workspace: 'Partage' }), workspaceIdOf({ workspace: 'a/b' }), workspaceIdOf({ workspace: 'ab' })], ['', '', 'partage', null, null, null]);
eq('chemin personnel / partagé', [basePath(good, 'u1'), basePath({ ...good, workspace: 'equipe-1' }, 'u1')], [['users', 'u1'], ['workspaces', 'equipe-1']]);
eq('espace invalide = cloud désactivé (pas d\'écriture au mauvais endroit)', [isConfiguredWith({ ...good, workspace: 'Mon Espace' }), configProblem({ ...good, workspace: 'Mon Espace' }) !== '', isConfiguredWith({ ...good, workspace: 'mon-espace' })], [false, true, true]);

/* Le reste de l'application passe par db.js : on vérifie la redirection vers le stockage actif. */
const calls = [];
const fake = { kind: 'cloud', getAll: async (s) => (calls.push(['getAll', s]), [1]), getByIndex: async (...a) => (calls.push(['idx', ...a]), []), put: async (...a) => calls.push(['put', ...a]),
  remove: async (...a) => calls.push(['rm', ...a]), batch: async (o) => calls.push(['batch', o.length]), replaceAll: async (d) => calls.push(['all', Object.keys(d)]), getCovers: async () => new Map() };
db.setBackend(fake);
await db.getAll('articles'); await db.getByIndex('images', 'articleId', 'a1'); await db.put('sales', { id: 's' }); await db.remove('sales', 's'); await db.batch([{}, {}]); await db.replaceAll({ articles: [] });
eq('db.js redirige vers le stockage actif', [db.backendKind(), calls], ['cloud', [['getAll', 'articles'], ['idx', 'images', 'articleId', 'a1'], ['put', 'sales', { id: 's' }], ['rm', 'sales', 's'], ['batch', 2], ['all', ['articles']]]]);
console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests passent'); process.exit(fail ? 1 : 0);

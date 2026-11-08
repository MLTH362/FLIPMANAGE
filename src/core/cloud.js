/* Synchronisation cloud (Firebase : connexion Google + Firestore). Chargé uniquement si firebase-config.js est rempli.
   Les données de chaque utilisateur vivent sous users/{uid}/{store}/{id}. Firestore garde un cache local (hors ligne) :
   les écritures sont instantanées et envoyées dès que la connexion revient. */
import { firebaseConfig } from '../firebase-config.js';
import { toDoc, fromDoc, chunk } from './cloudDocs.js';
import { blobToDataUrl, dataUrlToBlob } from '../utils/blob.js';

/* Le cloud est actif seulement si la configuration est remplie (clé réelle et identifiant de projet). */
export const isConfiguredWith = (cfg) => Boolean(cfg?.apiKey) && !/^COLLEZ/.test(cfg.apiKey) && Boolean(cfg.projectId);
export const isConfigured = () => isConfiguredWith(firebaseConfig);

let sdk = null, pending = 0, status = 'local', failed = false;
const statusSubs = new Set(), errorSubs = new Set();
const setStatus = (s) => { status = s; statusSubs.forEach((f) => f(s)); };
export const onStatus = (f) => { statusSubs.add(f); f(status); return () => statusSubs.delete(f); };
export const onError = (f) => { errorSubs.add(f); return () => errorSubs.delete(f); };
export const getUser = () => sdk?.user || null;

/* Initialise Firebase et attend l'état de connexion (restauré depuis le navigateur). Renvoie l'utilisateur ou null. */
export async function startCloud() {
  const [{ initializeApp }, A, F] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
  const app = initializeApp(firebaseConfig), auth = A.getAuth(app);
  const db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }), ignoreUndefinedProperties: true });
  sdk = { A, F, auth, db, user: null };
  await new Promise((resolve) => { let first = true; A.onAuthStateChanged(auth, (u) => { sdk.user = u; if (first) { first = false; resolve(); } }); });
  addEventListener('offline', () => sdk.user && setStatus('offline'));
  addEventListener('online', () => sdk.user && setStatus(pending ? 'syncing' : 'synced'));
  if (sdk.user) setStatus(navigator.onLine ? 'synced' : 'offline');
  return sdk.user;
}

export async function signIn() {
  const provider = new sdk.A.GoogleAuthProvider();
  try { await sdk.A.signInWithPopup(sdk.auth, provider); return true; }
  catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') { await sdk.A.signInWithRedirect(sdk.auth, provider); return false; }
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return false;
    throw e;
  }
}
export const signOutCloud = () => sdk.A.signOut(sdk.auth);

const need = () => { if (!sdk?.user) throw new Error('non connecté au cloud'); return sdk; };
const col = (store) => need().F.collection(sdk.db, 'users', sdk.user.uid, store);
const ref = (store, id) => sdk.F.doc(col(store), id);

/* Suit une écriture : état « synchronisation… » jusqu'à l'accusé du serveur, erreur signalée sans bloquer l'application. */
function track(promise) {
  if (!pending) failed = false;
  pending++; setStatus('syncing');
  promise.catch((e) => { failed = true; console.error(e); setStatus('error'); errorSubs.forEach((f) => f(e)); })
    .finally(() => { pending--; if (!pending && !failed) setStatus(navigator.onLine ? 'synced' : 'offline'); });
}

async function makeThumb(blob, max = 160) {
  const bmp = await createImageBitmap(blob), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  const small = await new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('miniature impossible'))), 'image/webp', 0.7));
  return blobToDataUrl(small);
}

/* Ajoute des opérations { store, put | del } à un lot Firestore. Chaque photo a une miniature dans « thumbs »
   pour afficher la liste des articles sans télécharger toutes les photos. */
async function addOps(batch, ops) {
  for (const op of ops) {
    if (op.del !== undefined) { batch.delete(ref(op.store, op.del)); if (op.store === 'images') batch.delete(ref('thumbs', op.del)); continue; }
    batch.set(ref(op.store, op.put.id), await toDoc(op.store, op.put));
    if (op.store === 'images') {
      try { batch.set(ref('thumbs', op.put.id), { id: op.put.id, articleId: op.put.articleId, order: op.put.order, data: await makeThumb(op.put.blob) }); }
      catch (e) { console.warn('Miniature non créée', e); }
    }
  }
}

const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error(msg)), ms))]);

export const backend = {
  kind: 'cloud',
  async getAll(store) { const snap = await sdk.F.getDocs(col(store)); return snap.docs.map((d) => fromDoc(store, d.data())); },
  async getByIndex(store, field, value) { const snap = await sdk.F.getDocs(sdk.F.query(col(store), sdk.F.where(field, '==', value))); return snap.docs.map((d) => fromDoc(store, d.data())); },
  async batch(ops) {
    need();
    for (const part of chunk(ops, 100)) { const b = sdk.F.writeBatch(sdk.db); await addOps(b, part); track(b.commit()); }
  },
  put(store, obj) { return this.batch([{ store, put: obj }]); },
  remove(store, id) { return this.batch([{ store, del: id }]); },
  async getCovers() {
    const snap = await sdk.F.getDocs(col('thumbs')), covers = new Map();
    for (const d of snap.docs.map((x) => x.data()).sort((a, b) => a.order - b.order)) if (!covers.has(d.articleId)) covers.set(d.articleId, dataUrlToBlob(d.data));
    return covers;
  },
  /* Remplace tout le contenu des stores donnés (restauration, envoi des données locales). Exige une connexion :
     on écrit d'abord les nouveaux documents, puis on supprime les anciens absents, avec accusé du serveur à chaque lot. */
  async replaceAll(data) {
    need();
    if (!navigator.onLine) throw new Error('connexion Internet requise');
    for (const name of Object.keys(data)) {
      const items = data[name], existing = (await sdk.F.getDocs(col(name))).docs.map((d) => d.id);
      for (const part of chunk(items, name === 'images' ? 8 : 200)) { const b = sdk.F.writeBatch(sdk.db); await addOps(b, part.map((o) => ({ store: name, put: o }))); await b.commit(); }
      const keep = new Set(items.map((o) => o.id));
      for (const part of chunk(existing.filter((id) => !keep.has(id)), 200)) { const b = sdk.F.writeBatch(sdk.db); await addOps(b, part.map((id) => ({ store: name, del: id }))); await b.commit(); }
    }
  },
};

/* Test de bout en bout : écrit un document et attend l'accusé du serveur (règles Firestore, connexion). */
export async function ping() {
  need();
  await withTimeout(sdk.F.setDoc(sdk.F.doc(sdk.db, 'users', sdk.user.uid, 'meta', 'ping'), { at: new Date().toISOString() }), 10000,
    'délai dépassé : vérifiez la connexion Internet et les règles Firestore');
}

export async function countRemote(store = 'articles') {
  const snap = await sdk.F.getCountFromServer(col(store));
  return snap.data().count;
}

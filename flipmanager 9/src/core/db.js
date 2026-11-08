/* Point d'entrée unique de la base de données. Le reste de l'application ne connaît que ce fichier :
   il redirige vers le stockage local (IndexedDB) ou vers le cloud (Firestore) selon que l'utilisateur est connecté. */
import * as local from './localdb.js';

let backend = local;
export const setBackend = (b) => { backend = b; };
export const backendKind = () => backend.kind;

export const openDb = () => local.openDb();
export const getAll = (store) => backend.getAll(store);
export const getByIndex = (store, index, value) => backend.getByIndex(store, index, value);
export const put = (store, obj) => backend.put(store, obj);
export const remove = (store, id) => backend.remove(store, id);
export const batch = (ops) => backend.batch(ops);
export const replaceAll = (data) => backend.replaceAll(data);
export const getCovers = () => backend.getCovers();

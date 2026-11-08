/* Conversion enregistrement local <-> document Firestore. Les photos (Blob) deviennent du texte base64 :
   Cloud Storage n'est pas utilisé car il exige une offre payante. Un document Firestore est limité à 1 Mo. */
import { blobToDataUrl, dataUrlToBlob } from '../utils/blob.js';

export const MAX_PHOTO_CHARS = 900_000;

export async function toDoc(store, obj) {
  if (store !== 'images') return obj;
  const { blob, ...rest } = obj, data = await blobToDataUrl(blob);
  if (data.length > MAX_PHOTO_CHARS) throw new Error('photo trop lourde pour la synchronisation (réduisez-la ou choisissez-en une autre)');
  return { ...rest, type: blob.type, data };
}

export function fromDoc(store, doc) {
  if (store !== 'images') return doc;
  const { data, type, ...rest } = doc;
  return { ...rest, blob: dataUrlToBlob(data) };
}

export const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

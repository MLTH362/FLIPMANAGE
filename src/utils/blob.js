/* Conversion Blob <-> texte (data URL), utilisable aussi sous Node pour les tests. */
export async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x4000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x4000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}
export function dataUrlToBlob(url) {
  const [head, b64] = url.split(','), bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: /^data:([^;]+)/.exec(head)[1] });
}

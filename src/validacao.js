function textoObrigatorio(valor, max) {
  if (typeof valor !== 'string') return null;
  const t = valor.trim();
  if (t.length === 0 || t.length > max) return null;
  return t;
}

function urlOuCaminho(valor) {
  if (typeof valor !== 'string' || valor.length === 0 || valor.length > 500) return null;
  if (valor.startsWith('https://')) return valor;
  if (valor.startsWith('/') && !valor.startsWith('//')) return valor;
  return null;
}

function corHex(valor) {
  return typeof valor === 'string' && /^#[0-9a-fA-F]{6}$/.test(valor) ? valor : null;
}

function listaDeUrls(valor, maxItens = 20) {
  if (!Array.isArray(valor) || valor.length > maxItens) return null;
  const saida = [];
  for (const item of valor) {
    if (typeof item !== 'string' || !item.startsWith('https://') || item.length > 500) return null;
    saida.push(item);
  }
  return saida;
}

const HOST_BLOB = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;

function numeroEntre(valor, min, max) {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= min && valor <= max ? valor : null;
}

function listaDeAdesivos(valor, maxItens = 20) {
  if (!Array.isArray(valor) || valor.length > maxItens) return null;
  const saida = [];
  const ids = new Set();
  for (const a of valor) {
    if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
    const id = typeof a.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(a.id) ? a.id : null;
    const src = typeof a.src === 'string' && a.src.length <= 500 && HOST_BLOB.test(a.src) ? a.src : null;
    const x = numeroEntre(a.x, -500, 2000);
    const y = numeroEntre(a.y, -500, 2000);
    const w = numeroEntre(a.w, 8, 2000);
    const h = numeroEntre(a.h, 8, 2000);
    const rot = numeroEntre(a.rot, -360, 360);
    if (!id || ids.has(id) || !src || x === null || y === null || w === null || h === null || rot === null) return null;
    if (typeof a.espelho !== 'boolean') return null;
    ids.add(id);
    saida.push({ id, src, x, y, w, h, rot, espelho: a.espelho });
  }
  return saida;
}

module.exports = { textoObrigatorio, urlOuCaminho, corHex, listaDeUrls, listaDeAdesivos };

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

module.exports = { textoObrigatorio, urlOuCaminho, corHex, listaDeUrls };

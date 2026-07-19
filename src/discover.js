// Localiza automáticamente la URL de un producto en una tienda a partir de su
// nombre, sin que el usuario tenga que pegar enlaces.
//   1. Búsqueda en DuckDuckGo HTML (sin JS) restringida al dominio de la tienda.
//   2. Respaldo: la propia página de búsqueda de la tienda, puntuando los
//      enlaces por coincidencia de palabras del producto.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Rutas que no son fichas de producto
const BAD_PATH = /buscar|busqueda|search|categoria|category|\/b\/|promocion|outlet|opiniones|blog/i;

const SEARCH_URLS = {
  'pccomponentes.com': (q) => `https://www.pccomponentes.com/buscar/?query=${encodeURIComponent(q)}`,
  'coolmod.com': (q) => `https://www.coolmod.com/busqueda?q=${encodeURIComponent(q)}`
};

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// DuckDuckGo envuelve los resultados en /l/?uddg=<url codificada>
function decodeDdgHref(href) {
  const m = /[?&]uddg=([^&]+)/.exec(href);
  if (m) {
    try { return decodeURIComponent(m[1]); } catch { return null; }
  }
  return /^https?:\/\//.test(href) ? href : null;
}

function parseDdgResults(html, domain) {
  const urls = [];
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = decodeDdgHref(m[1].replace(/&amp;/g, '&'));
    if (!url) continue;
    try {
      const u = new URL(url);
      if (!u.hostname.endsWith(domain)) continue;
      if (BAD_PATH.test(u.pathname) || u.pathname.length < 4) continue;
      urls.push(u.origin + u.pathname);
    } catch { /* URL inválida, se ignora */ }
  }
  return urls;
}

// Respaldo: enlaces de la página de búsqueda de la tienda puntuados por
// cuántas palabras del producto aparecen en el slug de la URL.
function parseStoreSearch(html, domain, query) {
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const re = /href="([^"#?]+)"/gi;
  let m, best = null, bestScore = 0;
  while ((m = re.exec(html)) !== null) {
    let url = m[1];
    if (url.startsWith('/')) url = `https://www.${domain}${url}`;
    let u;
    try { u = new URL(url); } catch { continue; }
    if (!u.hostname.endsWith(domain) || BAD_PATH.test(u.pathname) || u.pathname.length < 8) continue;
    const slug = u.pathname.toLowerCase();
    const score = tokens.reduce((acc, t) => acc + (slug.includes(t) ? 1 : 0), 0);
    if (score > bestScore) { best = u.origin + u.pathname; bestScore = score; }
  }
  // Exige al menos 2 coincidencias (o todas si el nombre es muy corto)
  return bestScore >= Math.min(2, tokens.length) ? best : null;
}

async function discoverProductUrl(query, domain) {
  try {
    const q = encodeURIComponent(`site:${domain} ${query}`);
    const urls = parseDdgResults(await fetchText(`https://html.duckduckgo.com/html/?q=${q}`), domain);
    if (urls.length > 0) return urls[0];
  } catch { /* se intenta el respaldo */ }

  const searchUrl = SEARCH_URLS[domain];
  if (searchUrl) {
    try {
      return parseStoreSearch(await fetchText(searchUrl(query)), domain, query);
    } catch { /* sin resultado */ }
  }
  return null;
}

module.exports = { discoverProductUrl, parseDdgResults, parseStoreSearch, decodeDdgHref };

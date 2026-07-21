// Localiza la ficha de un producto en una tienda a partir de su nombre.
// Este módulo son solo funciones puras de parseo y construcción de URLs
// (fáciles de testear); la descarga real de las páginas la hace el proceso
// principal usando el navegador Chromium embebido de Electron (ver main.js),
// que sortea el bloqueo anti-bot que devuelve 403 a las peticiones normales.

// Rutas que NO son fichas de producto y deben descartarse
const BAD_PATH = /buscar|busqueda|search|categoria|category|\/b\/|promocion|outlet|opiniones|blog|marcas|ofertas|cesta|carrito|login|cuenta/i;

const STORE_SEARCH = {
  'pccomponentes.com': (q) => `https://www.pccomponentes.com/buscar/?query=${encodeURIComponent(q)}`,
  'amazon.es': (q) => `https://www.amazon.es/s?k=${encodeURIComponent(q)}`
};

// Extrae el ASIN (identificador de 10 caracteres) de una URL de Amazon.
function extractAsin(url) {
  const m = /(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/|\/product\/|[?&]asin=)([A-Z0-9]{10})(?:[/?]|$)/i.exec(url || '');
  return m ? m[1].toUpperCase() : null;
}

// Primer producto de una página de resultados de Amazon: el primer enlace /dp/ASIN.
function parseAmazonSearch(html, host = 'www.amazon.es') {
  const m = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i.exec(html || '');
  return m ? `https://${host}/dp/${m[1].toUpperCase()}` : null;
}

function storeSearchUrl(domain, query) {
  return STORE_SEARCH[domain] ? STORE_SEARCH[domain](query) : `https://www.${domain}/`;
}

function bingSearchUrl(query, domain) {
  return `https://www.bing.com/search?q=${encodeURIComponent(`site:${domain} ${query}`)}`;
}

function ddgSearchUrl(query, domain) {
  return `https://duckduckgo.com/html/?q=${encodeURIComponent(`site:${domain} ${query}`)}`;
}

// Bing envuelve muchos resultados en /ck/a?...&u=a1<base64url>. Lo decodifica.
function decodeBingHref(href) {
  try {
    const u = new URL(href, 'https://www.bing.com');
    if (!u.hostname.endsWith('bing.com')) return href;
    const p = u.searchParams.get('u');
    if (p && p.startsWith('a1')) {
      const b64 = p.slice(2).replace(/-/g, '+').replace(/_/g, '/');
      return Buffer.from(b64, 'base64').toString('utf8');
    }
    return null;
  } catch { return null; }
}

// DuckDuckGo envuelve los resultados en /l/?uddg=<url codificada>
function decodeDdgHref(href) {
  const m = /[?&]uddg=([^&]+)/.exec(href);
  if (m) {
    try { return decodeURIComponent(m[1]); } catch { return null; }
  }
  return /^https?:\/\//.test(href) ? href : null;
}

function isProductPath(pathname) {
  return pathname.length >= 6 && !BAD_PATH.test(pathname);
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
      if (u.hostname.endsWith(domain) && isProductPath(u.pathname)) urls.push(u.origin + u.pathname);
    } catch { /* URL inválida */ }
  }
  return urls;
}

// Enlaces de una página de resultados de Bing filtrados por dominio de tienda
function parseBingResults(html, domain) {
  const urls = [];
  const re = /<a[^>]+href="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].replace(/&amp;/g, '&');
    const real = decodeBingHref(raw);
    if (!real) continue;
    let u;
    try { u = new URL(real); } catch { continue; }
    if (!u.hostname.endsWith(domain) || !isProductPath(u.pathname)) continue;
    const clean = u.origin + u.pathname;
    if (!urls.includes(clean)) urls.push(clean);
  }
  return urls;
}

// Página de resultados de la propia tienda: elige el enlace cuyo slug coincide
// con más palabras del nombre buscado.
function parseStoreSearch(html, domain, query) {
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const re = /href="([^"#?]+)"/gi;
  let m, best = null, bestScore = 0;
  while ((m = re.exec(html)) !== null) {
    let url = m[1];
    if (url.startsWith('/')) url = `https://www.${domain}${url}`;
    let u;
    try { u = new URL(url); } catch { continue; }
    if (!u.hostname.endsWith(domain) || !isProductPath(u.pathname) || u.pathname.length < 8) continue;
    const slug = u.pathname.toLowerCase();
    const score = tokens.reduce((acc, t) => acc + (slug.includes(t) ? 1 : 0), 0);
    if (score > bestScore) { best = u.origin + u.pathname; bestScore = score; }
  }
  return bestScore >= Math.min(2, tokens.length) ? best : null;
}

module.exports = {
  STORE_SEARCH, storeSearchUrl, bingSearchUrl, ddgSearchUrl,
  decodeDdgHref, decodeBingHref, parseDdgResults, parseBingResults, parseStoreSearch,
  extractAsin, parseAmazonSearch
};

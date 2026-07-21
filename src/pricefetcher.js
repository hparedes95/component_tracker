// Obtiene el precio actual de una página de producto de casi cualquier tienda.
// Estrategia, en orden de fiabilidad:
//   1. JSON-LD (schema.org Product/Offer) - usado por PcComponentes, Coolmod,
//      Newegg, MediaMarkt, Amazon (a veces), y la mayoría de tiendas modernas.
//   2. Metaetiquetas OpenGraph / product (og:price:amount, product:price:amount).
//   3. Microdatos itemprop="price".
//   4. Patrones JSON embebidos ("price": 123.45).

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchPrice(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const result = extractPrice(html);
  if (!result) throw new Error('No se encontró precio en la página');
  return result;
}

function extractPrice(html) {
  return fromJsonLd(html) || fromMetaTags(html) || fromItemprop(html) || fromAmazon(html) || fromJsonPatterns(html);
}

// --- Amazon: el precio de la caja de compra es el primer <span class="a-offscreen"> ---
function fromAmazon(html) {
  const m = /class="a-offscreen"\s*>\s*([^<]+?)\s*</i.exec(html);
  if (!m) return null;
  const price = parseNumber(m[1]);
  return price ? { price, currency: null } : null;
}

// --- 1. JSON-LD ---
function fromJsonLd(html) {
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const found = searchJsonLd(data);
    if (found) return found;
  }
  return null;
}

function searchJsonLd(node) {
  if (node == null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = searchJsonLd(item);
      if (found) return found;
    }
    return null;
  }
  // Un nodo Offer con precio
  const rawPrice = node.price ?? node.lowPrice;
  if (rawPrice != null) {
    const price = parseNumber(rawPrice);
    if (price) return { price, currency: node.priceCurrency || null };
  }
  for (const key of ['offers', '@graph', 'mainEntity', 'itemListElement', 'item', 'hasVariant']) {
    if (node[key]) {
      const found = searchJsonLd(node[key]);
      if (found) return found;
    }
  }
  return null;
}

// --- 2. Metaetiquetas ---
function fromMetaTags(html) {
  const price = metaContent(html, [
    'product:price:amount',
    'og:price:amount',
    'twitter:data1'
  ]);
  if (!price) return null;
  const parsed = parseNumber(price);
  if (!parsed) return null;
  const currency = metaContent(html, ['product:price:currency', 'og:price:currency']);
  return { price: parsed, currency: currency || null };
}

function metaContent(html, names) {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${name.replace(/[:]/g, '\\$&')}["'][^>]*content\\s*=\\s*["']([^"']+)["']|` +
      `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*(?:property|name)\\s*=\\s*["']${name.replace(/[:]/g, '\\$&')}["']`,
      'i'
    );
    const m = re.exec(html);
    if (m) return m[1] || m[2];
  }
  return null;
}

// --- 3. Microdatos ---
function fromItemprop(html) {
  const re = /itemprop\s*=\s*["']price["'][^>]*content\s*=\s*["']([^"']+)["']|content\s*=\s*["']([^"']+)["'][^>]*itemprop\s*=\s*["']price["']/i;
  const m = re.exec(html);
  if (!m) return null;
  const price = parseNumber(m[1] || m[2]);
  return price ? { price, currency: null } : null;
}

// --- 4. Patrones JSON embebidos ---
function fromJsonPatterns(html) {
  const patterns = [
    /"price"\s*:\s*"?(\d+(?:[.,]\d{1,2})?)"?/i,
    /"current_price"\s*:\s*"?(\d+(?:[.,]\d{1,2})?)"?/i,
    /"priceAmount"\s*:\s*"?(\d+(?:[.,]\d{1,2})?)"?/i
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) {
      const price = parseNumber(m[1]);
      if (price) return { price, currency: null };
    }
  }
  return null;
}

// Último recurso: busca precios en euros dentro del texto renderizado de la
// página (cuando no hay datos estructurados). Elige el valor más repetido y,
// en caso de empate, el mayor — el precio del producto suele destacar.
function extractPriceFromText(text) {
  if (typeof text !== 'string') return null;
  const values = [];
  const re = /(?:€|EUR)\s*([0-9][0-9.\s]*(?:,[0-9]{2})?|[0-9][0-9.,]*)|([0-9][0-9.\s]*,[0-9]{2}|[0-9]{2,}(?:[.,][0-9]{3})*)\s*(?:€|EUR)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const val = parseNumber(m[1] || m[2]);
    if (val && val >= 5 && val <= 20000) values.push(val);
  }
  if (values.length === 0) return null;
  const freq = new Map();
  for (const v of values) freq.set(v, (freq.get(v) || 0) + 1);
  let best = values[0], bestF = 0;
  for (const [v, f] of freq) {
    if (f > bestF || (f === bestF && v > best)) { best = v; bestF = f; }
  }
  return { price: best, currency: 'EUR' };
}

// Convierte "1.299,99", "1,299.99", "1299.99" o 1299.99 en un número.
function parseNumber(value) {
  if (typeof value === 'number') return value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  let s = value.trim().replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    // Formato europeo: 1.299,99
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // Formato anglosajón: 1,299.99
    s = s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

module.exports = { fetchPrice, extractPrice, extractPriceFromText, parseNumber };

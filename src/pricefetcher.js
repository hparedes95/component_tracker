// Obtiene el precio actual de una página de producto.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchPrice(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8' },
    redirect: 'follow', signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const result = extractPrice(html);
  if (!result) throw new Error('No se encontró precio en la página');
  return { ...result, image: extractImage(html), name: extractName(html) };
}

function extractImage(html) {
  const og = metaContent(html, ['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']);
  if (og && /^https?:\/\//.test(og)) return og;
  const m = /"image"\s*:\s*(?:"([^"]+)"|\[\s*"([^"]+)")/i.exec(html);
  let u = m && (m[1] || m[2]);
  if (u) {
    u = u.replace(/\\\//g, '/');
    if (/^https?:\/\//.test(u)) return u;
  }
  return null;
}

function extractPrice(html) {
  // Los datos estructurados tienen prioridad. Los patrones JSON genéricos se
  // mantienen al final porque pueden coincidir con precios no visibles.
  return fromJsonLd(html) || fromMetaTags(html) || fromItemprop(html) || fromAmazon(html) || fromJsonPatterns(html);
}

function fromAmazon(html) {
  let m = /class="[^"]*(?:priceToPay|apexPriceToPay|reinventPricePriceToPay)[^"]*"[\s\S]{0,260}?class="a-offscreen"\s*>\s*([^<]+?)\s*</i.exec(html);
  if (!m) m = /class="a-offscreen"\s*>\s*([^<]+?)\s*</i.exec(html);
  if (!m) return null;
  const price = parseNumber(m[1]);
  return price ? { price, currency: null } : null;
}

function extractName(html) {
  const og = metaContent(html, ['og:title', 'twitter:title']);
  if (og) return cleanText(og);
  const m = /"@type"\s*:\s*"Product"[\s\S]{0,400}?"name"\s*:\s*"([^"]+)"/i.exec(html);
  if (m) return cleanText(m[1]);
  const t = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return t ? cleanText(t[1]) : null;
}

function cleanText(s) {
  return String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
}

function fromJsonLd(html) {
  return jsonLdPrice(html, 'price') || jsonLdOfferPrice(html);
}

function parseJsonLdScripts(html) {
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    try { out.push(JSON.parse(m[1].trim())); } catch {}
  }
  return out;
}

function jsonLdPrice(html, field) {
  for (const data of parseJsonLdScripts(html)) {
    const found = searchJsonLd(data, field);
    if (found) return found;
  }
  return null;
}

// lowPrice de AggregateOffer representa el mínimo del conjunto de ofertas y
// puede pertenecer a otro vendedor. Nunca lo tratamos como precio actual.
function jsonLdOfferPrice(html) {
  for (const data of parseJsonLdScripts(html)) {
    const found = searchSafeOfferPrice(data);
    if (found) return found;
  }
  return null;
}

function searchSafeOfferPrice(node) {
  if (node == null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) { const found = searchSafeOfferPrice(item); if (found) return found; }
    return null;
  }
  const type = node['@type'];
  const isAggregate = type === 'AggregateOffer' || (Array.isArray(type) && type.includes('AggregateOffer'));
  if (!isAggregate && node.price != null) {
    const price = parseNumber(node.price);
    if (price) return { price, currency: node.priceCurrency || null };
  }
  for (const key of ['offers', '@graph', 'mainEntity', 'itemListElement', 'item', 'hasVariant']) {
    if (node[key]) { const found = searchSafeOfferPrice(node[key]); if (found) return found; }
  }
  return null;
}

function searchJsonLd(node, field) {
  if (node == null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) { const found = searchJsonLd(item, field); if (found) return found; }
    return null;
  }
  // For AggregateOffer, only `price` is accepted. `lowPrice` is intentionally
  // ignored because it can describe a different seller's offer.
  const type = node['@type'];
  const isAggregate = type === 'AggregateOffer' || (Array.isArray(type) && type.includes('AggregateOffer'));
  if (field === 'price' && node[field] != null && !(isAggregate && field === 'lowPrice')) {
    const price = parseNumber(node[field]);
    if (price) return { price, currency: node.priceCurrency || null };
  }
  for (const key of ['offers', '@graph', 'mainEntity', 'itemListElement', 'item', 'hasVariant']) {
    if (node[key]) { const found = searchJsonLd(node[key], field); if (found) return found; }
  }
  return null;
}

function fromMetaTags(html) {
  const price = metaContent(html, ['product:price:amount', 'og:price:amount', 'twitter:data1']);
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
      `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*(?:property|name)\\s*=\\s*["']${name.replace(/[:]/g, '\\$&')}["']`, 'i');
    const m = re.exec(html);
    if (m) return m[1] || m[2];
  }
  return null;
}

function fromItemprop(html) {
  const re = /itemprop\s*=\s*["']price["'][^>]*content\s*=\s*["']([^"']+)["']|content\s*=\s*["']([^"']+)["'][^>]*itemprop\s*=\s*["']price["']/i;
  const m = re.exec(html);
  if (!m) return null;
  const price = parseNumber(m[1] || m[2]);
  return price ? { price, currency: null } : null;
}

function fromJsonPatterns(html) {
  const patterns = [
    /(?:"|')current_price(?:"|')\s*:\s*(?:"|')?(\d+(?:[.,]\d{1,2})?)(?:"|')?/i,
    /(?:"|')priceAmount(?:"|')\s*:\s*(?:"|')?(\d+(?:[.,]\d{1,2})?)(?:"|')?/i
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) { const price = parseNumber(m[1]); if (price) return { price, currency: null }; }
  }
  return null;
}

function extractPriceFromText(text) {
  if (typeof text !== 'string') return null;
  const values = [];
  const re = /(?:€|EUR)\s*([0-9][0-9.\s]*(?:,[0-9]{2})?|[0-9][0-9.,]*)|([0-9][0-9.\s]*,[0-9]{2}|[0-9]{2,}(?:[.,][0-9]{3})*)\s*(?:€|EUR)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const val = parseNumber(m[1] || m[2]);
    if (val && val >= 5 && val <= 20000) values.push(val);
  }
  if (!values.length) return null;
  const freq = new Map();
  for (const v of values) freq.set(v, (freq.get(v) || 0) + 1);
  let best = values[0], bestF = 0;
  for (const [v, f] of freq) if (f > bestF || (f === bestF && v > best)) { best = v; bestF = f; }
  // A single arbitrary currency-looking number is too dangerous to trust.
  if (bestF < 2 && values.length > 1) return null;
  return { price: best, currency: 'EUR' };
}

function extractProducts(html) {
  const out = [];
  for (const data of parseJsonLdScripts(html)) collectProducts(data, out);
  const seen = new Set(), res = [];
  for (const p of out) { const k = p.url || p.name; if (k && p.name && !seen.has(k)) { seen.add(k); res.push(p); } }
  return res;
}

function collectProducts(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) collectProducts(x, out); return; }
  const type = node['@type'];
  const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'));
  if (isProduct && node.name) {
    const image = Array.isArray(node.image) ? node.image[0] : (typeof node.image === 'string' ? node.image : (node.image && node.image.url)) || null;
    const url = typeof node.url === 'string' ? node.url : (node.offers && node.offers.url) || null;
    out.push({ name: String(node.name).trim(), price: offerPrice(node.offers), image, url });
  }
  for (const k of ['@graph', 'itemListElement', 'item', 'hasVariant']) if (node[k]) collectProducts(node[k], out);
}

function offerPrice(offers) {
  if (!offers) return null;
  if (Array.isArray(offers)) { for (const o of offers) { const p = offerPrice(o); if (p) return p; } return null; }
  const type = offers['@type'];
  const aggregate = type === 'AggregateOffer' || (Array.isArray(type) && type.includes('AggregateOffer'));
  const raw = aggregate ? offers.price : offers.price;
  return raw != null ? parseNumber(raw) : null;
}

function parseNumber(value) {
  if (typeof value === 'number') return value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  let s = value.trim().replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

module.exports = { fetchPrice, extractPrice, extractPriceFromText, extractImage, extractName, extractProducts, parseNumber };

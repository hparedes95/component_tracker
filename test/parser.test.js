// Tests del extractor de precios: node test/parser.test.js
const assert = require('assert');
const { extractPrice, extractPriceFromText, extractImage, extractName, parseNumber } = require('../src/pricefetcher');

let passed = 0;
function t(name, fn) {
  fn();
  passed++;
  console.log('✓', name);
}

t('parseNumber formato europeo', () => {
  assert.strictEqual(parseNumber('1.299,99'), 1299.99);
  assert.strictEqual(parseNumber('1.299,99 €'), 1299.99);
});

t('parseNumber formato anglosajón', () => {
  assert.strictEqual(parseNumber('1,299.99'), 1299.99);
  assert.strictEqual(parseNumber('$1,299.99'), 1299.99);
});

t('parseNumber simple y número', () => {
  assert.strictEqual(parseNumber('599.95'), 599.95);
  assert.strictEqual(parseNumber(649), 649);
  assert.strictEqual(parseNumber(''), null);
  assert.strictEqual(parseNumber('gratis'), null);
});

t('JSON-LD Product con offers', () => {
  const html = `<html><script type="application/ld+json">
    {"@type":"Product","name":"RTX 4070","offers":{"@type":"Offer","price":"629.90","priceCurrency":"EUR"}}
  </script></html>`;
  assert.deepStrictEqual(extractPrice(html), { price: 629.9, currency: 'EUR' });
});

t('JSON-LD array con @graph y AggregateOffer', () => {
  const html = `<script type="application/ld+json">
    {"@graph":[{"@type":"Product","offers":{"@type":"AggregateOffer","lowPrice":1149.5,"priceCurrency":"EUR"}}]}
  </script>`;
  assert.deepStrictEqual(extractPrice(html), { price: 1149.5, currency: 'EUR' });
});

t('JSON-LD prioriza el precio mostrado sobre lowPrice (evita falsas bajadas)', () => {
  const html = `<script type="application/ld+json">
    {"@type":"Product","name":"X","offers":{"@type":"AggregateOffer","price":"649.90","lowPrice":"499.00","priceCurrency":"EUR"}}
  </script>`;
  assert.deepStrictEqual(extractPrice(html), { price: 649.9, currency: 'EUR' });
});

t('JSON-LD usa lowPrice solo si no hay price', () => {
  const html = `<script type="application/ld+json">
    {"@type":"Product","offers":{"@type":"AggregateOffer","lowPrice":"499.00","priceCurrency":"EUR"}}
  </script>`;
  assert.deepStrictEqual(extractPrice(html), { price: 499, currency: 'EUR' });
});

t('precio de Amazon toma el de la caja de compra (priceToPay), no el tachado', () => {
  const html = `
    <span class="a-price a-text-price"><span class="a-offscreen">899,00 €</span></span>
    <div class="a-price priceToPay"><span class="a-offscreen">799,00 €</span></div>`;
  assert.deepStrictEqual(extractPrice(html), { price: 799, currency: null });
});

t('extractName obtiene el nombre del producto', () => {
  assert.strictEqual(extractName('<meta property="og:title" content="MSI RTX 5070 Ti Ventus">'), 'MSI RTX 5070 Ti Ventus');
  assert.strictEqual(extractName('<title>Placa base X - Tienda</title>'), 'Placa base X - Tienda');
});

t('JSON-LD inválido no rompe y cae a meta tags', () => {
  const html = `<script type="application/ld+json">{esto no es json}</script>
    <meta property="product:price:amount" content="349,95">
    <meta property="product:price:currency" content="EUR">`;
  assert.deepStrictEqual(extractPrice(html), { price: 349.95, currency: 'EUR' });
});

t('meta tags og:price', () => {
  const html = `<meta property="og:price:amount" content="89.99">`;
  assert.deepStrictEqual(extractPrice(html), { price: 89.99, currency: null });
});

t('microdatos itemprop', () => {
  const html = `<span itemprop="price" content="459.00">459,00 €</span>`;
  assert.deepStrictEqual(extractPrice(html), { price: 459, currency: null });
});

t('patrón JSON embebido', () => {
  const html = `<script>window.__DATA__ = {"product":{"price":"1899.99","stock":true}}</script>`;
  assert.deepStrictEqual(extractPrice(html), { price: 1899.99, currency: null });
});

t('precio de Amazon desde a-offscreen (caja de compra)', () => {
  const html = `<div id="corePrice"><span class="a-price"><span class="a-offscreen">629,90 €</span></span></div>
    <span class="a-offscreen">999,00 €</span>`;
  assert.deepStrictEqual(extractPrice(html), { price: 629.9, currency: null });
});

t('sin precio devuelve null', () => {
  assert.strictEqual(extractPrice('<html><body>Página sin producto</body></html>'), null);
});

t('extractProducts saca la lista de productos de un ItemList (escaneo de mercado)', () => {
  const html = `<script type="application/ld+json">
    {"@type":"ItemList","itemListElement":[
      {"@type":"Product","name":"RTX 5070 Ti","url":"https://s/a","image":"https://s/a.jpg","offers":{"price":"879,90","priceCurrency":"EUR"}},
      {"@type":"Product","name":"RTX 5080","url":"https://s/b","offers":{"price":1199}}
    ]}</script>`;
  const r = require('../src/pricefetcher').extractProducts(html);
  assert.strictEqual(r.length, 2);
  assert.deepStrictEqual(r[0], { name: 'RTX 5070 Ti', price: 879.9, image: 'https://s/a.jpg', url: 'https://s/a' });
  assert.strictEqual(r[1].price, 1199);
});

t('extractImage saca la imagen de og:image o de JSON-LD', () => {
  assert.strictEqual(extractImage('<meta property="og:image" content="https://x.com/a.jpg">'), 'https://x.com/a.jpg');
  assert.strictEqual(extractImage('<script type="application/ld+json">{"image":"https:\\/\\/y.com\\/b.png"}</script>'), 'https://y.com/b.png');
  assert.strictEqual(extractImage('<html>sin imagen</html>'), null);
});

t('extractPriceFromText detecta el precio en euros del texto renderizado', () => {
  assert.deepStrictEqual(extractPriceFromText('Bla bla 629,90 € IVA incluido bla'), { price: 629.9, currency: 'EUR' });
  assert.deepStrictEqual(extractPriceFromText('Precio: € 1.899,00 hoy'), { price: 1899, currency: 'EUR' });
  assert.strictEqual(extractPriceFromText('sin precio por aquí'), null);
});

t('extractPriceFromText elige el valor más repetido (precio del producto)', () => {
  const txt = 'Añadir 1.299,00 € al carrito. Total 1.299,00 €. Envío 4,99 €.';
  assert.deepStrictEqual(extractPriceFromText(txt), { price: 1299, currency: 'EUR' });
});

// ---- Tests del descubridor de URLs ----
const { parseDdgResults, parseStoreSearch, parseBingResults, decodeDdgHref, decodeBingHref, extractAsin, parseAmazonSearch } = require('../src/discover');

t('decodeBingHref decodifica el redirect /ck/a de Bing a la URL real', () => {
  const real = 'https://www.amazon.es/dp/B0REAL1234';
  const b64 = Buffer.from(real).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  const href = `https://www.bing.com/ck/a?!&&p=xx&u=a1${b64}&ntb=1`;
  assert.strictEqual(decodeBingHref(href), real);
  assert.strictEqual(decodeBingHref('https://www.amazon.es/dp/B0DIRECT123'), 'https://www.amazon.es/dp/B0DIRECT123');
});

t('parseBingResults extrae la ficha de Amazon aunque venga como redirect', () => {
  const real = 'https://www.amazon.es/msi-rtx/dp/B0REAL1234';
  const b64 = Buffer.from(real).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  const html = `<a href="https://www.bing.com/ck/a?u=a1${b64}&ntb=1">MSI</a>`;
  assert.deepStrictEqual(parseBingResults(html, 'amazon.es'), ['https://www.amazon.es/msi-rtx/dp/B0REAL1234']);
});

t('extractAsin obtiene el ASIN de varias formas de URL de Amazon', () => {
  assert.strictEqual(extractAsin('https://www.amazon.es/dp/B0CGXXXX99'), 'B0CGXXXX99');
  assert.strictEqual(extractAsin('https://www.amazon.es/algun-nombre/dp/B0CGYYYY88/ref=sr_1_1'), 'B0CGYYYY88');
  assert.strictEqual(extractAsin('https://www.amazon.es/gp/product/B012345678?th=1'), 'B012345678');
  assert.strictEqual(extractAsin('https://www.pccomponentes.com/algo'), null);
});

t('parseAmazonSearch devuelve la primera ficha /dp/ASIN', () => {
  const html = `<div><a href="/sspa/click?url=/dp/B0PROMO001">anuncio</a>
    <a href="/msi-rtx/dp/B0REAL1234/ref=x">producto</a></div>`;
  assert.strictEqual(parseAmazonSearch(html, 'www.amazon.es'), 'https://www.amazon.es/dp/B0PROMO001');
});

t('parseBingResults filtra por dominio y descarta rutas de búsqueda', () => {
  const html = `
    <li class="b_algo"><h2><a href="https://www.coolmod.com/msi-geforce-rtx-5070-ventus">x</a></h2></li>
    <li class="b_algo"><h2><a href="https://www.otratienda.com/rtx-5070">y</a></h2></li>
    <a href="https://www.coolmod.com/busqueda?q=rtx">buscar</a>`;
  assert.deepStrictEqual(parseBingResults(html, 'coolmod.com'),
    ['https://www.coolmod.com/msi-geforce-rtx-5070-ventus']);
});

t('decodeDdgHref extrae la URL del redirect de DuckDuckGo', () => {
  assert.strictEqual(
    decodeDdgHref('//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.pccomponentes.com%2Fmsi-rtx-5070&rut=abc'),
    'https://www.pccomponentes.com/msi-rtx-5070'
  );
  assert.strictEqual(decodeDdgHref('https://www.coolmod.com/producto-x'), 'https://www.coolmod.com/producto-x');
  assert.strictEqual(decodeDdgHref('/relativo'), null);
});

t('parseDdgResults filtra por dominio y descarta búsquedas/categorías', () => {
  const html = `
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.pccomponentes.com%2Fbuscar%2F%3Fquery%3Drtx">busq</a>
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.otratienda.com%2Frtx-5070">otra</a>
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.pccomponentes.com%2Fmsi-geforce-rtx-5070-ventus">ficha</a>`;
  assert.deepStrictEqual(parseDdgResults(html, 'pccomponentes.com'),
    ['https://www.pccomponentes.com/msi-geforce-rtx-5070-ventus']);
});

t('parseStoreSearch puntúa enlaces por coincidencia con el producto', () => {
  const html = `
    <a href="/legal/condiciones">condiciones</a>
    <a href="/amd-ryzen-7-9800x3d-47ghz">Ryzen 7 9800X3D</a>
    <a href="/intel-core-ultra-5-245k">otro</a>`;
  assert.strictEqual(
    parseStoreSearch(html, 'pccomponentes.com', 'AMD Ryzen 7 9800X3D'),
    'https://www.pccomponentes.com/amd-ryzen-7-9800x3d-47ghz'
  );
  assert.strictEqual(parseStoreSearch('<a href="/legal/aviso-cosas">x</a>', 'pccomponentes.com', 'RTX 5090'), null);
});

console.log(`\n${passed} tests OK`);

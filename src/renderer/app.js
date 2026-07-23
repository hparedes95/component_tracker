// ---- Estado ----
const CATEGORIES = [
  { id: 'cpu', name: 'Procesadores', icon: '🧠' },
  { id: 'gpu', name: 'Tarjetas gráficas', icon: '🎮' },
  { id: 'ram', name: 'Memoria RAM', icon: '💾' },
  { id: 'mobo', name: 'Placas base', icon: '🔌' },
  { id: 'storage', name: 'Almacenamiento', icon: '💽' },
  { id: 'psu', name: 'Fuentes', icon: '⚡' },
  { id: 'case', name: 'Cajas', icon: '🗄️' },
  { id: 'cooling', name: 'Refrigeración', icon: '❄️' },
  { id: 'monitor', name: 'Monitores', icon: '🖥️' },
  { id: 'peripheral', name: 'Periféricos', icon: '⌨️' },
  { id: 'fullpc', name: 'PCs Gaming completas', icon: '🚀' }
];
const TIER_NAMES = { entrada: 'Gama entrada', media: 'Gama media', alta: 'Gama alta', entusiasta: 'Entusiasta' };
const STALE_MS = 12 * 60 * 60 * 1000; // actualizar al abrir si han pasado >12h

let state = { products: [], lastRefresh: 0 };
let activeCategory = null;   // se fija a la primera categoría con productos
let searchTerm = '';
let sortBy = 'recent';
const activeFilters = new Set();
let editingId = null;   // producto en edición en el modal de añadir
let detailId = null;    // producto abierto en el modal de detalle
let refreshing = false;

const $ = (id) => document.getElementById(id);

// ---- Utilidades ----
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

function fmtPrice(value, currency) {
  if (value == null) return '—';
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency || 'EUR' }).format(value);
  } catch {
    return value.toFixed(2) + ' ' + (currency || '€');
  }
}

function storeName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').split('.')[0];
  } catch {
    return 'tienda';
  }
}

const domainOf = (u) => {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
};

// Constructores de la URL de búsqueda de cada tienda (respaldo cuando aún no se
// ha localizado la ficha exacta del producto; permite "Abrir en tienda").
const STORE_SEARCH_URL = {
  'pccomponentes.com': (q) => `https://www.pccomponentes.com/buscar/?query=${encodeURIComponent(q)}`,
  'amazon.es': (q) => `https://www.amazon.es/s?k=${encodeURIComponent(q)}`
};

// ---- Amazon / Keepa: histórico de precios a largo plazo ----
const AMAZON_KEEPA_DOMAIN = {
  'amazon.com': 1, 'amazon.co.uk': 2, 'amazon.de': 3, 'amazon.fr': 4, 'amazon.co.jp': 5,
  'amazon.ca': 6, 'amazon.it': 8, 'amazon.es': 9, 'amazon.in': 10, 'amazon.com.mx': 11,
  'amazon.nl': 12, 'amazon.com.br': 13, 'amazon.se': 17
};
const extractAsin = (url) => {
  const m = /(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/|\/product\/|[?&]asin=)([A-Z0-9]{10})(?:[/?]|$)/i.exec(url || '');
  return m ? m[1].toUpperCase() : null;
};
// Devuelve {asin, domain} del primer origen de Amazon del producto, o null
const amazonInfo = (p) => {
  for (const s of p.sources) {
    const host = domainOf(s.url);
    if (host && host.startsWith('amazon')) {
      const asin = extractAsin(s.url);
      if (asin) return { asin, domain: AMAZON_KEEPA_DOMAIN[host] || 9 };
    }
  }
  return null;
};
const keepaImgUrl = (asin, domain, days) =>
  `https://graph.keepa.com/pricehistory.png?asin=${asin}&domain=${domain}` +
  `&width=820&height=280&range=${days}&amazon=1&new=1&used=0&salesrank=0`;
const keepaPageUrl = (asin, domain) => `https://keepa.com/#!product/${domain}-${asin}`;
// Imagen del producto directamente desde Amazon por ASIN (sin cargar la página)
const amazonImageUrl = (asin) => `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_.jpg`;
const storeSearchUrl = (domain, q) =>
  (STORE_SEARCH_URL[domain] ? STORE_SEARCH_URL[domain](q) : `https://www.${domain}/`);

// Icono discreto para cuando un producto aún no tiene imagen (sin emojis)
const PLACEHOLDER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="M4 16.5l4.5-4 3.5 3 3-2.5 4.5 4"/></svg>';

// Imagen del producto: la foto real extraída de la web (og:image) y, si aún no
// hay ninguna, la imagen de Amazon por ASIN como respaldo inmediato.
function productImage(p) {
  for (const s of p.sources) if (s.image) return s.image;
  const info = amazonInfo(p);
  return info ? amazonImageUrl(info.asin) : null;
}

// Mejor precio actual entre todas las tiendas del producto
function bestSource(p) {
  let best = null;
  for (const s of p.sources) {
    if (s.lastPrice != null && (!best || s.lastPrice < best.lastPrice)) best = s;
  }
  return best;
}

// Serie diaria del mejor precio (para gráficas y % de cambio)
function bestHistory(p) {
  const byDay = new Map();
  for (const s of p.sources) {
    for (const h of s.history || []) {
      const k = dayKey(h.t);
      const cur = byDay.get(k);
      if (!cur || h.price < cur.price) byDay.set(k, { t: h.t, price: h.price });
    }
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, v]) => ({ day, t: v.t, price: v.price }));
}

function priceChange(p) {
  const hist = bestHistory(p);
  if (hist.length < 2) return null;
  const prev = hist[hist.length - 2].price;
  const cur = hist[hist.length - 1].price;
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

function changeBadge(pct) {
  if (pct == null) return '<span class="change flat">—</span>';
  if (Math.abs(pct) < 0.005) return '<span class="change flat">= 0.0%</span>';
  const cls = pct < 0 ? 'down' : 'up';
  const arrow = pct < 0 ? '▼' : '▲';
  return `<span class="change ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 3200);
}

async function save() {
  await window.api.saveData(state);
}

// ---- Renderizado ----
function ensureActiveCategory() {
  if (!activeCategory || !state.products.some((p) => p.category === activeCategory)) {
    const first = CATEGORIES.find((c) => state.products.some((p) => p.category === c.id));
    activeCategory = first ? first.id : (CATEGORIES[0] && CATEGORIES[0].id);
  }
}

function render() {
  ensureActiveCategory();
  renderNav();
  renderGrid();
  renderStats();
  renderLastUpdate();
  updateRecsBadge();
}

function renderNav() {
  const nav = $('category-nav');
  nav.innerHTML = '';
  for (const cat of CATEGORIES) {
    const count = state.products.filter((p) => p.category === cat.id).length;
    if (count === 0) continue;
    const btn = document.createElement('button');
    btn.className = 'cat-item' + (activeCategory === cat.id ? ' active' : '');
    btn.innerHTML = `<span>${cat.icon}</span> ${cat.name} <span class="cat-count">${count}</span>`;
    btn.onclick = () => { activeCategory = cat.id; searchTerm = ''; $('search').value = ''; render(); };
    nav.appendChild(btn);
  }
}

// Filtros rápidos activables por chips
function passesFilters(p) {
  for (const f of activeFilters) {
    if (f === 'drops') { const c = priceChange(p); if (!(c != null && c < -0.005)) return false; }
    else if (f === 'atmin') { const st = computeStats(bestHistory(p)); if (!(st && st.cur <= st.min * 1.005)) return false; }
    else if (f === 'target') { const b = bestSource(p); if (!(p.targetPrice && b && b.lastPrice <= p.targetPrice)) return false; }
    else if (f === 'amazon') { if (!amazonInfo(p)) return false; }
  }
  return true;
}

// Ordena la lista; los productos sin precio quedan siempre al final
function sortProducts(list) {
  const priceOf = (p) => { const b = bestSource(p); return b && b.lastPrice != null ? b.lastPrice : null; };
  const cmpNum = (a, b, dir) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return (a - b) * dir;
  };
  const arr = [...list];
  switch (sortBy) {
    case 'price-asc': arr.sort((a, b) => cmpNum(priceOf(a), priceOf(b), 1)); break;
    case 'price-desc': arr.sort((a, b) => cmpNum(priceOf(a), priceOf(b), -1)); break;
    case 'name': arr.sort((a, b) => a.name.localeCompare(b.name, 'es')); break;
    case 'drop': arr.sort((a, b) => cmpNum(priceChange(a), priceChange(b), 1)); break;
    default: arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  return arr;
}

function visibleProducts() {
  const list = state.products.filter((p) => {
    // Al buscar se muestran coincidencias de todas las categorías; si no, la
    // categoría activa.
    if (searchTerm) {
      if (!p.name.toLowerCase().includes(searchTerm)) return false;
    } else if (p.category !== activeCategory) {
      return false;
    }
    if (!passesFilters(p)) return false;
    return true;
  });
  return sortProducts(list);
}

function renderGrid() {
  const grid = $('grid');
  const empty = $('empty-state');
  const products = visibleProducts();
  grid.innerHTML = '';

  const noneAtAll = state.products.length === 0;
  empty.classList.toggle('hidden', !noneAtAll);
  grid.classList.toggle('hidden', noneAtAll);
  if (noneAtAll) return;

  if (products.length === 0) {
    grid.innerHTML = '<div class="grid-empty">Ningún producto coincide con el filtro o la búsqueda.</div>';
    return;
  }

  for (const p of products) grid.appendChild(buildCard(p));
}

// Construye la tarjeta completa de un producto (imagen, precio, tiendas, gráfica).
function buildCard(p) {
  const best = bestSource(p);
  const pct = priceChange(p);
  const cat = CATEGORIES.find((c) => c.id === p.category);
  const hitTarget = p.targetPrice && best && best.lastPrice <= p.targetPrice;
  const img = productImage(p);

  const priceRow = best
    ? `<span class="card-price">${fmtPrice(best.lastPrice, best.currency)}</span>${changeBadge(pct)}`
    : '<span class="card-price no-price">Sin precio — pulsa ⟳</span>';

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-media">
      <div class="card-media-ph">${PLACEHOLDER_SVG}</div>
      ${img ? `<img class="card-img" loading="lazy" decoding="async" src="${escapeHtml(img)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()" />` : ''}
      <button class="card-refresh" title="Actualizar este producto">⟳</button>
    </div>
    <div class="card-body">
      <div class="card-name">${escapeHtml(p.name)}</div>
      <div class="badges">
        ${p.tier ? `<span class="badge badge-tier">${TIER_NAMES[p.tier] || p.tier}</span>` : ''}
        ${p.targetPrice ? `<span class="badge ${hitTarget ? 'badge-alert-hit' : 'badge-alert'}">🎯 ${fmtPrice(p.targetPrice, best && best.currency)}</span>` : ''}
      </div>
      <div class="card-price-row">${priceRow}</div>
      <canvas class="sparkline" width="300" height="42"></canvas>
      <div class="card-sources">
        ${p.sources.map((s) => s.error
          ? `<span class="source-chip error">${escapeHtml(s.store)} ✕</span>`
          : `<span class="source-chip">${escapeHtml(s.store)} <b>${fmtPrice(s.lastPrice, s.currency)}</b></span>`
        ).join('')}
      </div>
    </div>`;

  card.onclick = () => openDetail(p.id);
  card.querySelector('.card-refresh').onclick = async (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    if (btn.dataset.busy) return;      // evita doble pulsación
    btn.dataset.busy = '1';
    btn.classList.add('spinning');
    try {
      await refreshProduct(p);
      await save();
    } catch (err) {
      toast('No se pudo actualizar: ' + (err && err.message ? err.message : 'error'));
    }
    render();                          // reconstruye la tarjeta ya actualizada
  };
  drawSparkline(card.querySelector('.sparkline'), bestHistory(p));
  return card;
}

function renderStats() {
  $('stat-count').textContent = state.products.length;
  let drops = 0, rises = 0;
  for (const p of state.products) {
    const pct = priceChange(p);
    if (pct != null && pct < -0.005) drops++;
    else if (pct != null && pct > 0.005) rises++;
  }
  $('stat-drops').textContent = drops;
  $('stat-rises').textContent = rises;
}

function renderLastUpdate() {
  const el = $('last-update');
  el.textContent = state.lastRefresh
    ? 'Última actualización:\n' + new Date(state.lastRefresh).toLocaleString('es-ES')
    : 'Sin actualizar todavía';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- Gráficas (canvas, serie única) ----
function drawSparkline(canvas, hist) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (hist.length < 2) {
    ctx.fillStyle = '#667085';
    ctx.font = '11px system-ui';
    ctx.fillText(hist.length === 1 ? 'Historial desde hoy' : '', 4, H - 6);
    return;
  }
  const prices = hist.map((h) => h.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const pad = (max - min) * 0.15 || max * 0.05 || 1;
  const y = (v) => H - 4 - ((v - (min - pad)) / ((max + pad) - (min - pad))) * (H - 8);
  const x = (i) => 2 + (i / (hist.length - 1)) * (W - 4);

  const downTrend = prices[prices.length - 1] <= prices[0];
  const color = downTrend ? '#34c98e' : '#f0645a';

  ctx.beginPath();
  hist.forEach((h, i) => (i ? ctx.lineTo(x(i), y(h.price)) : ctx.moveTo(x(i), y(h.price))));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Relleno degradado sutil bajo la línea
  ctx.lineTo(x(hist.length - 1), H);
  ctx.lineTo(x(0), H);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, color + '33');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fill();
}

function drawDetailChart(canvas, hist, currency) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PAD = { l: 64, r: 14, t: 14, b: 26 };
  ctx.clearRect(0, 0, W, H);

  if (hist.length === 0) {
    ctx.fillStyle = '#667085';
    ctx.font = '13px system-ui';
    ctx.fillText('Todavía no hay historial. Los precios se registran en cada actualización diaria.', PAD.l, H / 2);
    return null;
  }

  const prices = hist.map((h) => h.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const pad = (max - min) * 0.12 || max * 0.04 || 1;
  const lo = min - pad, hi = max + pad;
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const x = (i) => hist.length === 1
    ? W / 2
    : PAD.l + (i / (hist.length - 1)) * (W - PAD.l - PAD.r);

  // Rejilla y etiquetas del eje Y (discretas)
  ctx.font = '11px system-ui';
  for (let g = 0; g <= 3; g++) {
    const v = lo + ((hi - lo) * g) / 3;
    const gy = y(v);
    ctx.strokeStyle = '#2a3040';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.l, gy);
    ctx.lineTo(W - PAD.r, gy);
    ctx.stroke();
    ctx.fillStyle = '#667085';
    ctx.textAlign = 'right';
    ctx.fillText(fmtPrice(v, currency), PAD.l - 8, gy + 4);
  }

  // Etiquetas de fecha (primera y última)
  ctx.textAlign = 'left';
  ctx.fillText(hist[0].day, PAD.l, H - 8);
  if (hist.length > 1) {
    ctx.textAlign = 'right';
    ctx.fillText(hist[hist.length - 1].day, W - PAD.r, H - 8);
  }

  // Línea de precio
  ctx.beginPath();
  hist.forEach((h, i) => (i ? ctx.lineTo(x(i), y(h.price)) : ctx.moveTo(x(i), y(h.price))));
  ctx.strokeStyle = '#7c6cf0';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Punto en el último valor
  const lastX = x(hist.length - 1), lastY = y(prices[prices.length - 1]);
  ctx.beginPath();
  ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#7c6cf0';
  ctx.fill();
  ctx.strokeStyle = '#1e2330';
  ctx.lineWidth = 2;
  ctx.stroke();

  return { x, y, PAD };
}

// Crosshair + tooltip al pasar el ratón por la gráfica de detalle
function attachChartHover(canvas, hist, currency, geom) {
  const tooltip = $('d-tooltip');
  canvas.onmousemove = null;
  canvas.onmouseleave = null;
  if (!geom || hist.length === 0) { tooltip.classList.add('hidden'); return; }

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    let idx = 0, bestDist = Infinity;
    hist.forEach((_, i) => {
      const d = Math.abs(geom.x(i) - mx);
      if (d < bestDist) { bestDist = d; idx = i; }
    });
    const h = hist[idx];
    // Redibuja y pinta el crosshair
    const g = drawDetailChart(canvas, hist, currency);
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#667085';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(g.x(idx), g.PAD.t);
    ctx.lineTo(g.x(idx), canvas.height - g.PAD.b);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(g.x(idx), g.y(h.price), 5, 0, Math.PI * 2);
    ctx.fillStyle = '#7c6cf0';
    ctx.fill();

    tooltip.innerHTML = `${h.day}<br><b>${fmtPrice(h.price, currency)}</b>`;
    tooltip.classList.remove('hidden');
    const px = (g.x(idx) / canvas.width) * rect.width;
    tooltip.style.left = Math.min(px + 14, rect.width - 120) + 'px';
    tooltip.style.top = '18px';
  };
  canvas.onmouseleave = () => {
    tooltip.classList.add('hidden');
    drawDetailChart(canvas, hist, currency);
  };
}

// ---- Actualización de precios ----
async function refreshProduct(p) {
  // Automático: si el producto no tiene ningún origen de Amazon, se le añade uno
  // (sin resolver) para que el bucle localice su ficha y aparezca el histórico
  // sin que el usuario tenga que pegar el enlace a mano.
  const hasAmazon = p.sources.some((s) => domainOf(s.url).startsWith('amazon') || (s.domain || '').startsWith('amazon'));
  if (!hasAmazon) {
    p.sources.push({
      id: uid(), domain: 'amazon.es', query: p.name,
      url: storeSearchUrl('amazon.es', p.name), store: 'amazon',
      resolved: false, lastPrice: null, currency: null, error: null, history: []
    });
  }

  for (const s of p.sources) {
    // Fuentes del catálogo: si aún no se ha localizado la ficha del producto en
    // la tienda, se intenta descubrir su URL real antes de leer el precio.
    if (s.query && !s.resolved) {
      try {
        const f = await window.api.discover(s.query, [s.domain || domainOf(s.url)]);
        if (f && f.length) { s.url = f[0].url; s.store = storeName(s.url); s.resolved = true; }
      } catch { /* se reintentará en la próxima actualización */ }
    }
    if (s.query && !s.resolved) {
      s.error = 'No localizado en la tienda todavía (reintenta con ⟳)';
      continue;
    }

    const res = await window.api.fetchPrice(s.url);
    if (res.ok) {
      // Verificación: si la ficha se localizó por búsqueda, confirmamos que el
      // producto de la página coincide; si no, no registramos un precio erróneo.
      if (s.query && res.name && !looksLikeSameProduct(p.name, res.name)) {
        s.productName = res.name;
        s.mismatch = true;
        s.error = 'El enlace no coincide con el producto — revísalo o edítalo';
        continue;
      }
      s.mismatch = false;
      if (res.name) s.productName = res.name;
      s.lastPrice = res.price;
      s.currency = res.currency || s.currency || 'EUR';
      if (res.image) s.image = res.image;
      s.error = null;
      s.history = s.history || [];
      const today = dayKey(Date.now());
      const last = s.history[s.history.length - 1];
      if (last && dayKey(last.t) === today) {
        last.t = Date.now();
        last.price = res.price;
      } else {
        s.history.push({ t: Date.now(), price: res.price });
      }
      if (s.history.length > 400) s.history = s.history.slice(-400);
    } else {
      s.error = res.error;
    }
  }
  checkAlert(p);
}

function checkAlert(p) {
  if (!p.targetPrice) return;
  const best = bestSource(p);
  if (!best) return;
  if (best.lastPrice <= p.targetPrice) {
    if (!p.alertNotified) {
      p.alertNotified = true;
      window.api.notify(
        '🎯 ¡Precio objetivo alcanzado!',
        `${p.name} está a ${fmtPrice(best.lastPrice, best.currency)} en ${best.store} (objetivo: ${fmtPrice(p.targetPrice, best.currency)})`
      );
    }
  } else {
    p.alertNotified = false;
  }
}

async function refreshAll(auto = false) {
  if (refreshing || state.products.length === 0) return;
  refreshing = true;
  const btn = $('btn-refresh');
  btn.classList.add('refreshing');
  btn.disabled = true;
  const bar = $('refresh-bar');
  const fill = $('refresh-bar-fill');
  const text = $('refresh-bar-text');
  bar.classList.remove('hidden');

  // Se procesan varios productos a la vez (más rápido) con un límite de
  // concurrencia para no abrir demasiadas páginas en el navegador a la vez.
  const total = state.products.length;
  const queue = [...state.products];
  let done = 0;
  const worker = async () => {
    while (queue.length) {
      const p = queue.shift();
      await refreshProduct(p);
      done++;
      text.textContent = `Actualizando ${done}/${total}…`;
      fill.style.width = ((done / total) * 100) + '%';
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, total) }, worker));

  fill.style.width = '100%';
  state.lastRefresh = Date.now();
  await save();
  render();

  setTimeout(() => bar.classList.add('hidden'), 800);
  btn.classList.remove('refreshing');
  btn.disabled = false;
  refreshing = false;
  if (!auto) toast('Precios actualizados ✓');
}

// ---- Modal añadir/editar ----
function openAdd(product = null) {
  editingId = product ? product.id : null;
  $('modal-add-title').textContent = product ? 'Editar producto' : 'Añadir producto';
  $('f-name').value = product ? product.name : '';
  $('f-target').value = product && product.targetPrice ? product.targetPrice : '';
  $('f-urls').value = product ? product.sources.map((s) => s.url).join('\n') : '';
  const sel = $('f-category');
  sel.innerHTML = CATEGORIES.filter((c) => c.id !== 'all')
    .map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`)
    .join('');
  sel.value = product ? product.category : 'gpu';
  $('f-tier').value = product && product.tier ? product.tier : 'media';
  $('f-tier-wrap').classList.toggle('hidden', sel.value !== 'fullpc');
  $('modal-add-error').classList.add('hidden');
  $('modal-add').classList.remove('hidden');
  $('f-name').focus();
}

async function saveAdd() {
  const name = $('f-name').value.trim();
  const category = $('f-category').value;
  const tier = category === 'fullpc' ? $('f-tier').value : null;
  const targetPrice = parseFloat($('f-target').value) || null;
  const urls = $('f-urls').value.split('\n').map((u) => u.trim()).filter(Boolean);

  const err = $('modal-add-error');
  if (!name) { err.textContent = 'Pon un nombre al producto.'; err.classList.remove('hidden'); return; }
  if (urls.length === 0) { err.textContent = 'Añade al menos una URL de producto.'; err.classList.remove('hidden'); return; }
  for (const u of urls) {
    if (!/^https?:\/\//i.test(u)) {
      err.textContent = `URL no válida: ${u}`;
      err.classList.remove('hidden');
      return;
    }
  }

  let product;
  if (editingId) {
    product = state.products.find((p) => p.id === editingId);
    product.name = name;
    product.category = category;
    product.tier = tier;
    product.targetPrice = targetPrice;
    // Conserva el historial de las URLs que se mantienen
    const oldByUrl = new Map(product.sources.map((s) => [s.url, s]));
    product.sources = urls.map((u) => oldByUrl.get(u) ||
      ({ id: uid(), url: u, store: storeName(u), resolved: true, lastPrice: null, currency: null, error: null, history: [] }));
  } else {
    product = {
      id: uid(), name, category, tier, targetPrice, alertNotified: false,
      createdAt: Date.now(),
      sources: urls.map((u) =>
        ({ id: uid(), url: u, store: storeName(u), resolved: true, lastPrice: null, currency: null, error: null, history: [] }))
    };
    state.products.push(product);
  }

  $('modal-add').classList.add('hidden');
  await save();
  render();
  toast('Obteniendo precio...');
  await refreshProduct(product);
  await save();
  render();
  const best = bestSource(product);
  toast(best ? `${product.name}: ${fmtPrice(best.lastPrice, best.currency)} ✓` : 'No se pudo obtener el precio (revisa la URL)');
}

// ---- Catálogo top ----
const CATALOG_STORES = ['pccomponentes.com', 'amazon.es'];

function trackedCatalogIds() {
  return new Set(state.products.map((p) => p.catalogId).filter(Boolean));
}

function renderCatalog() {
  const list = $('catalog-list');
  const tracked = trackedCatalogIds();
  list.innerHTML = '';
  let lastGroup = null;
  for (const entry of window.CATALOG) {
    const cat = CATEGORIES.find((c) => c.id === entry.category);
    const groupName = cat ? `${cat.icon} ${cat.name}` : entry.category;
    if (groupName !== lastGroup) {
      lastGroup = groupName;
      const h = document.createElement('div');
      h.className = 'catalog-group';
      h.textContent = groupName;
      list.appendChild(h);
    }
    const isTracked = tracked.has(entry.id);
    const product = isTracked ? state.products.find((p) => p.catalogId === entry.id) : null;
    const best = product ? bestSource(product) : null;

    const row = document.createElement('div');
    row.className = 'catalog-item';
    row.innerHTML = `
      <span class="catalog-item-name">${escapeHtml(entry.label)}</span>
      ${entry.tier ? `<span class="badge badge-tier">${TIER_NAMES[entry.tier]}</span>` : ''}
      ${best ? `<span class="catalog-price">${fmtPrice(best.lastPrice, best.currency)}</span>` : ''}
      <button class="btn btn-small ${isTracked ? 'btn-following' : 'btn-primary'}" ${isTracked ? 'disabled' : ''}>
        ${isTracked ? '✓ Siguiendo' : 'Seguir'}
      </button>`;
    if (!isTracked) {
      row.querySelector('button').onclick = (e) => addFromCatalog(entry, e.target);
    }
    list.appendChild(row);
  }
}

async function addFromCatalog(entry, btn) {
  btn.disabled = true;
  btn.textContent = 'Importando…';
  // El producto se importa SIEMPRE. Cada fuente arranca sin resolver y con la
  // URL de búsqueda de la tienda; refreshProduct localizará la ficha real y
  // leerá el precio. Así nunca se queda "sin importar" aunque una tienda falle.
  const product = {
    id: uid(), catalogId: entry.id, name: entry.label,
    category: entry.category, tier: entry.tier || null,
    targetPrice: null, alertNotified: false, createdAt: Date.now(),
    sources: CATALOG_STORES.map((domain) => ({
      id: uid(), domain, query: entry.query,
      url: storeSearchUrl(domain, entry.query), store: domain.split('.')[0],
      resolved: false, lastPrice: null, currency: null, error: null, history: []
    }))
  };
  state.products.push(product);
  render();          // el producto aparece al instante en la cuadrícula
  renderCatalog();
  await refreshProduct(product);   // localiza la ficha y lee el precio real
  await save();
  render();
  renderCatalog();
  const best = bestSource(product);
  toast(best
    ? `${entry.label}: ${fmtPrice(best.lastPrice, best.currency)} ✓`
    : `${entry.label} importado. Precio no disponible ahora — pulsa ⟳ para reintentar`);
  return !!best;
}

// Pack inicial: añade en un clic lo más top de cada gama
async function addStarterPack(btn) {
  const tracked = trackedCatalogIds();
  const pending = window.CATALOG.filter((e) => e.starter && !tracked.has(e.id));
  if (pending.length === 0) { toast('La selección top ya está añadida ✓'); return; }
  btn.disabled = true;
  const original = btn.textContent;
  let added = 0;
  for (let i = 0; i < pending.length; i++) {
    btn.textContent = `Añadiendo ${i + 1}/${pending.length}…`;
    const fake = document.createElement('button'); // botón ficticio para reutilizar el flujo
    if (await addFromCatalog(pending[i], fake)) added++;
  }
  btn.disabled = false;
  btn.textContent = original;
  toast(`Selección top: ${added}/${pending.length} productos añadidos ✓`);
}

// ---- Motor de recomendaciones ----
const categoryName = (id) => { const c = CATEGORIES.find((x) => x.id === id); return c ? c.name : id; };

function catalogById() {
  const m = new Map();
  for (const e of window.CATALOG) m.set(e.id, e);
  return m;
}

// Propone productos del catálogo que superan a lo que el usuario ya sigue.
function getRecommendations() {
  const trackedIds = trackedCatalogIds();
  const trackedNames = new Set(state.products.map((p) => p.name.toLowerCase()));
  const byId = catalogById();
  const cats = {};   // categoría seguida -> mejor rank que ya tiene el usuario (o null)
  for (const p of state.products) {
    const e = p.catalogId ? byId.get(p.catalogId) : window.CATALOG.find((c) => c.label.toLowerCase() === p.name.toLowerCase());
    if (!(p.category in cats)) cats[p.category] = null;
    if (e && typeof e.rank === 'number') cats[p.category] = Math.max(cats[p.category] ?? -Infinity, e.rank);
  }
  const recs = [];
  for (const cat in cats) {
    const owned = cats[cat];
    const candidates = window.CATALOG.filter((e) =>
      e.category === cat && typeof e.rank === 'number' &&
      !trackedIds.has(e.id) && !trackedNames.has(e.label.toLowerCase()));
    if (candidates.length === 0) continue;
    if (owned == null) {
      const top = candidates.reduce((a, b) => (b.rank > a.rank ? b : a));
      recs.push({ entry: top, reason: `Lo más top en ${categoryName(cat)}` });
    } else {
      for (const e of candidates) {
        if (e.rank > owned + 0.5) recs.push({ entry: e, reason: `Supera a lo mejor que sigues en ${categoryName(cat)}` });
      }
    }
  }
  recs.sort((a, b) => b.entry.rank - a.entry.rank);
  return recs;
}

function updateRecsBadge() {
  const n = getRecommendations().length;
  const b = $('recs-badge');
  b.textContent = n;
  b.classList.toggle('hidden', n === 0);
}

// Agrupa una lista por categoría, en el orden de CATEGORIES
function groupByCategory(items, catOf) {
  const res = [];
  for (const c of CATEGORIES) {
    if (c.id === 'all') continue;
    const g = items.filter((it) => catOf(it) === c.id);
    if (g.length) res.push({ cat: c, items: g });
  }
  return res;
}

function buildRecRow(r) {
  const e = r.entry;
  const cached = state.recPrices[e.id];
  const priceHtml = cached
    ? (cached.price != null ? fmtPrice(cached.price, cached.currency) : '—')
    : '<span class="rec-loading">buscando…</span>';
  const row = document.createElement('div');
  row.className = 'catalog-item';
  row.innerHTML = `
    <span class="catalog-item-name">${escapeHtml(e.label)}<span class="rec-reason">${escapeHtml(r.reason)}</span></span>
    ${e.tier ? `<span class="badge badge-tier">${TIER_NAMES[e.tier]}</span>` : ''}
    <span class="catalog-price rec-price" data-recid="${e.id}">${priceHtml}</span>
    <button class="btn btn-small btn-primary">Seguir</button>`;
  row.querySelector('button').onclick = (ev) => followRec(e, ev.target);
  return row;
}

function renderRecs() {
  const list = $('recs-list');
  const recs = getRecommendations();
  if (recs.length === 0) {
    list.innerHTML = '<div class="grid-empty">Estás al día 🎉 No hay nada mejor que lo que ya sigues. Cuando salgan novedades al mercado, aparecerán aquí.</div>';
    return;
  }
  list.innerHTML = '';
  // Agrupado por categoría y, dentro, por gama (mejor rendimiento primero)
  for (const g of groupByCategory(recs, (r) => r.entry.category)) {
    const h = document.createElement('div');
    h.className = 'catalog-group';
    h.textContent = `${g.cat.icon} ${g.cat.name}`;
    list.appendChild(h);
    g.items.sort((a, b) => b.entry.rank - a.entry.rank);
    for (const r of g.items) list.appendChild(buildRecRow(r));
  }
  fetchRecPrices(recs);   // rellena los precios en segundo plano
}

// Consulta el precio de cada recomendación (una vez, con caché de 24h) y va
// actualizando su celda en el panel según llegan.
let recPricesRunning = false;
async function fetchRecPrices(recs) {
  if (recPricesRunning) return;
  recPricesRunning = true;
  try {
    for (const r of recs) {
      const e = r.entry;
      const cached = state.recPrices[e.id];
      if (cached && Date.now() - cached.t < 24 * 3600 * 1000) continue;
      let url = cached && cached.url;
      if (!url) {
        try { const f = await window.api.discover(e.query, ['pccomponentes.com']); if (f && f.length) url = f[0].url; } catch { /* sin ficha */ }
      }
      let price = null, currency = 'EUR';
      if (url) {
        try { const res = await window.api.fetchPrice(url); if (res.ok) { price = res.price; currency = res.currency || 'EUR'; } } catch { /* sin precio */ }
      }
      state.recPrices[e.id] = { price, currency, url: url || null, t: Date.now() };
      await save();
      updateRecPriceCell(e.id);
    }
  } finally { recPricesRunning = false; }
}

function updateRecPriceCell(id) {
  const cell = document.querySelector(`.rec-price[data-recid="${id}"]`);
  if (!cell) return;
  const c = state.recPrices[id];
  cell.textContent = c && c.price != null ? fmtPrice(c.price, c.currency) : '—';
}

async function followRec(entry, btn) {
  await addFromCatalog(entry, btn);
  renderRecs();
  render();
}

// ---- Escaneo de mercado: busca novedades en la tienda por categoría ----
const CATEGORY_SCAN_TERMS = {
  gpu: 'tarjeta grafica', cpu: 'procesador', ram: 'memoria ram ddr5', mobo: 'placa base',
  storage: 'ssd nvme', psu: 'fuente alimentacion', case: 'caja pc torre',
  cooling: 'refrigeracion liquida cpu', monitor: 'monitor gaming', peripheral: 'teclado gaming',
  fullpc: 'pc gaming montado'
};
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ¿La página localizada corresponde al producto buscado? Compara "tokens fuertes"
// (modelos/capacidades con dígitos, p.ej. 5070, 9800x3d, 2tb) y acepta si al menos
// uno coincide. Evita registrar precios de un producto distinto (falsos positivos).
function strongTokens(s) {
  return (norm(s).match(/[a-z0-9]*\d[a-z0-9]*/g) || []).filter((t) => t.length >= 3);
}
function looksLikeSameProduct(intended, detected) {
  const a = strongTokens(intended);
  if (a.length === 0) return true;   // sin tokens discriminantes, no rechazamos
  const d = new Set(strongTokens(detected));
  return a.some((t) => d.has(t));
}

async function scanMarket(btn) {
  const cats = [...new Set(state.products.map((p) => p.category))];
  if (cats.length === 0) { toast('Sigue algún producto primero para escanear su categoría'); return; }
  btn.disabled = true;
  const original = btn.textContent;
  const trackedNames = state.products.map((p) => norm(p.name));
  const found = [];
  for (let i = 0; i < cats.length; i++) {
    const term = CATEGORY_SCAN_TERMS[cats[i]];
    if (!term) continue;
    btn.textContent = `Escaneando ${i + 1}/${cats.length}…`;
    let items = [];
    try { items = await window.api.scan(storeSearchUrl('pccomponentes.com', term)); } catch { /* categoría sin resultado */ }
    for (const it of items) {
      if (!it.name || !it.url) continue;
      const n = norm(it.name);
      if (trackedNames.some((t) => t.length > 3 && (n.includes(t) || t.includes(n)))) continue;
      found.push({ ...it, category: cats[i] });
    }
  }
  btn.disabled = false;
  btn.textContent = original;
  const seen = new Set(), uniq = [];
  for (const f of found) if (!seen.has(f.url)) { seen.add(f.url); uniq.push(f); }
  lastScanItems = uniq.slice(0, 60);
  renderScanResults();
  toast(uniq.length ? `${uniq.length} productos encontrados en la tienda` : 'No se encontraron novedades ahora — reintenta en un momento');
}

let lastScanItems = [];

function buildScanRow(it) {
  const row = document.createElement('div');
  row.className = 'catalog-item';
  row.innerHTML = `
    ${it.image ? `<img class="scan-thumb" src="${escapeHtml(it.image)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />` : ''}
    <span class="catalog-item-name">${escapeHtml(it.name)}</span>
    ${it.price ? `<span class="catalog-price">${fmtPrice(it.price, 'EUR')}</span>` : ''}
    <button class="btn btn-small btn-primary">Seguir</button>`;
  row.querySelector('button').onclick = (ev) => followScanned(it, ev.target);
  return row;
}

// Agrupa las novedades por categoría y ordena por precio dentro de cada una
function renderScanResults() {
  const title = $('scan-title'), list = $('scan-list');
  title.classList.toggle('hidden', lastScanItems.length === 0);
  list.innerHTML = '';
  const dir = $('recs-sort').value === 'price-asc' ? 1 : -1;
  for (const g of groupByCategory(lastScanItems, (it) => it.category)) {
    const h = document.createElement('div');
    h.className = 'catalog-group';
    h.textContent = `${g.cat.icon} ${g.cat.name}`;
    list.appendChild(h);
    g.items.sort((a, b) => ((a.price || 0) - (b.price || 0)) * dir);
    for (const it of g.items) list.appendChild(buildScanRow(it));
  }
}

async function followScanned(it, btn) {
  btn.disabled = true;
  btn.textContent = 'Añadiendo…';
  const product = {
    id: uid(), name: it.name, category: it.category, tier: null,
    targetPrice: null, alertNotified: false, createdAt: Date.now(),
    sources: [{
      id: uid(), url: it.url, store: storeName(it.url), resolved: true,
      lastPrice: it.price ?? null, currency: 'EUR', error: null, image: it.image || null,
      history: it.price ? [{ t: Date.now(), price: it.price }] : []
    }]
  };
  state.products.push(product);
  await save();
  render();
  await refreshProduct(product);
  await save();
  render();
  btn.textContent = '✓ Seguido';
  toast(`${it.name} añadido`);
}

// ---- Modal detalle ----
function openDetail(id) {
  detailId = id;
  const p = state.products.find((x) => x.id === id);
  if (!p) return;
  const best = bestSource(p);
  const pct = priceChange(p);
  const cat = CATEGORIES.find((c) => c.id === p.category);

  const dImg = $('d-image'), pImg = productImage(p);
  if (pImg) { dImg.src = pImg; dImg.onerror = () => dImg.classList.add('hidden'); dImg.classList.remove('hidden'); }
  else dImg.classList.add('hidden');

  $('d-name').textContent = p.name;
  $('d-badges').innerHTML = `
    <div class="badges">
      <span class="badge">${cat ? cat.icon + ' ' + cat.name : ''}</span>
      ${p.tier ? `<span class="badge badge-tier">${TIER_NAMES[p.tier]}</span>` : ''}
      ${p.targetPrice ? `<span class="badge badge-alert">🎯 Objetivo ${fmtPrice(p.targetPrice, best && best.currency)}</span>` : ''}
    </div>`;
  $('d-price').textContent = best ? fmtPrice(best.lastPrice, best.currency) : '—';
  const changeEl = $('d-change');
  changeEl.className = 'd-change ' + (pct == null ? 'flat' : pct < 0 ? 'down' : pct > 0 ? 'up' : 'flat');
  changeEl.textContent = pct == null ? 'Sin datos de cambio' :
    (pct < 0 ? '▼ ' : pct > 0 ? '▲ ' : '= ') + Math.abs(pct).toFixed(1) + '% desde ayer';

  $('d-sources').innerHTML = p.sources.map((s) => `
    <div class="d-source ${s.mismatch ? 'd-source-warn' : ''}">
      <div class="d-source-info">
        <span class="d-source-store">${escapeHtml(s.store)}</span>
        ${s.productName ? `<span class="d-source-detected">${escapeHtml(s.productName)}</span>` : ''}
      </div>
      <a class="d-source-link" data-url="${escapeHtml(s.url)}">Abrir ↗</a>
      ${s.error
        ? `<span class="d-source-err">${escapeHtml(s.error)}</span>`
        : `<span class="d-source-price ${best && s.id === best.id ? 'd-source-best' : ''}">${fmtPrice(s.lastPrice, s.currency)}</span>`}
    </div>`).join('');
  $('d-sources').querySelectorAll('.d-source-link').forEach((a) => {
    a.onclick = () => window.api.openExternal(a.dataset.url);
  });

  detailRangeDays = null;   // por defecto: todo el historial registrado
  keepaRangeDays = 1825;    // por defecto: 5 años en el histórico de Keepa
  renderDetailCharts(p);

  $('modal-detail').classList.remove('hidden');
}

// Rangos de tiempo seleccionables
const APP_RANGES = [
  { label: '90 días', days: 90 },
  { label: '1 año', days: 365 },
  { label: 'Todo', days: null }
];
const KEEPA_RANGES = [
  { label: '1 año', days: 365 },
  { label: '3 años', days: 1095 },
  { label: '5 años', days: 1825 },
  { label: 'Máx', days: 3650 }
];
let detailRangeDays = null;
let keepaRangeDays = 1825;

function historyWithin(hist, days) {
  if (!days) return hist;
  const cutoff = Date.now() - days * 86400000;
  return hist.filter((h) => h.t >= cutoff);
}

function computeStats(hist) {
  if (!hist.length) return null;
  const prices = hist.map((h) => h.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  return { min, max, avg, cur: prices[prices.length - 1] };
}

// Pinta las estadísticas, la gráfica del historial propio (con su rango) y,
// para productos de Amazon, el histórico de años atrás de Keepa.
function renderDetailCharts(p) {
  const best = bestSource(p);
  const currency = best && best.currency;
  const full = bestHistory(p);

  // Estadísticas sobre todo el historial registrado
  const stats = computeStats(full);
  const statsEl = $('d-stats');
  if (stats) {
    const vsMin = stats.min > 0 ? ((stats.cur - stats.min) / stats.min) * 100 : 0;
    statsEl.innerHTML = `
      <div class="stat-cell"><span>Actual</span><b>${fmtPrice(stats.cur, currency)}</b></div>
      <div class="stat-cell"><span>Mínimo</span><b class="good">${fmtPrice(stats.min, currency)}</b></div>
      <div class="stat-cell"><span>Máximo</span><b class="bad">${fmtPrice(stats.max, currency)}</b></div>
      <div class="stat-cell"><span>Media</span><b>${fmtPrice(stats.avg, currency)}</b></div>
      <div class="stat-cell"><span>vs mínimo</span><b class="${vsMin <= 0.5 ? 'good' : ''}">${vsMin <= 0.5 ? 'en mínimo 🔥' : '+' + vsMin.toFixed(1) + '%'}</b></div>`;
  } else {
    statsEl.innerHTML = '<div class="stat-cell"><span>Historial</span><b>registrando…</b></div>';
  }

  // Botones de rango del historial propio
  const rangeEl = $('d-range');
  rangeEl.innerHTML = APP_RANGES.map((r) =>
    `<button class="range-btn ${(r.days || null) === detailRangeDays ? 'active' : ''}" data-days="${r.days == null ? '' : r.days}">${r.label}</button>`
  ).join('');
  rangeEl.querySelectorAll('.range-btn').forEach((b) => {
    b.onclick = () => { detailRangeDays = b.dataset.days ? Number(b.dataset.days) : null; renderDetailCharts(p); };
  });

  // Gráfica del historial propio filtrada por el rango elegido
  const hist = historyWithin(full, detailRangeDays);
  const canvas = $('d-chart');
  const geom = drawDetailChart(canvas, hist, currency);
  attachChartHover(canvas, hist, currency, geom);

  // Histórico a largo plazo de Keepa — productos de Amazon
  const info = amazonInfo(p);
  const view = $('d-keepa-view'), prompt = $('d-keepa-prompt'), controls = $('d-keepa-controls');
  if (info) {
    view.classList.remove('hidden');
    prompt.classList.add('hidden');
    controls.classList.remove('hidden');

    // Selector de rango
    $('d-keepa-range').innerHTML = KEEPA_RANGES.map((r) =>
      `<button class="range-btn ${r.days === keepaRangeDays ? 'active' : ''}" data-days="${r.days}">${r.label}</button>`
    ).join('');
    $('d-keepa-range').querySelectorAll('.range-btn').forEach((b) => {
      b.onclick = () => { keepaRangeDays = Number(b.dataset.days); renderDetailCharts(p); };
    });

    // Imagen del histórico de Keepa
    const img = $('d-keepa-img'), fallback = $('d-keepa-fallback');
    fallback.classList.add('hidden');
    img.classList.remove('hidden');
    img.onerror = () => { img.classList.add('hidden'); fallback.classList.remove('hidden'); };
    img.src = keepaImgUrl(info.asin, info.domain, keepaRangeDays);
    $('d-keepa-link').onclick = (e) => {
      e.preventDefault();
      window.api.openExternal(keepaPageUrl(info.asin, info.domain));
    };
  } else {
    // Sin ASIN todavía: se ofrece pegar la URL de Amazon para activarlo
    view.classList.add('hidden');
    controls.classList.add('hidden');
    prompt.classList.remove('hidden');
    $('d-asin-input').value = '';
    $('d-asin-btn').onclick = () => setAmazonFromInput(p);
  }
}

// Añade/actualiza el origen de Amazon del producto a partir de una URL o ASIN
// pegados por el usuario, y activa al momento el histórico y el precio.
async function setAmazonFromInput(p) {
  const raw = $('d-asin-input').value.trim();
  const asin = extractAsin(raw) || (/^[A-Z0-9]{10}$/i.test(raw) ? raw.toUpperCase() : null);
  if (!asin) { toast('Pega una URL de Amazon válida o un ASIN de 10 caracteres'); return; }
  const url = `https://www.amazon.es/dp/${asin}`;
  let s = p.sources.find((x) => domainOf(x.url).startsWith('amazon'));
  if (s) {
    s.url = url; s.store = 'amazon'; s.domain = 'amazon.es'; s.resolved = true; s.query = undefined; s.error = null;
  } else {
    p.sources.push({ id: uid(), url, store: 'amazon', domain: 'amazon.es', resolved: true, lastPrice: null, currency: null, error: null, history: [] });
  }
  await save();
  renderDetailCharts(p);   // el gráfico histórico aparece de inmediato
  toast('Obteniendo precio de Amazon…');
  await refreshProduct(p);
  await save();
  render();
  renderDetailCharts(p);
}

// ---- Eventos ----
$('btn-add').onclick = () => openAdd();
$('btn-add-empty').onclick = () => openAdd();
$('btn-cancel-add').onclick = () => $('modal-add').classList.add('hidden');
$('btn-save-add').onclick = saveAdd;
$('f-category').onchange = (e) => $('f-tier-wrap').classList.toggle('hidden', e.target.value !== 'fullpc');

$('btn-recs').onclick = () => {
  renderRecs();
  lastScanItems = [];
  renderScanResults();
  $('modal-recs').classList.remove('hidden');
};
$('btn-close-recs').onclick = () => $('modal-recs').classList.add('hidden');
$('btn-scan').onclick = (e) => scanMarket(e.currentTarget);
$('recs-sort').onchange = () => renderScanResults();

const openCatalog = () => { renderCatalog(); $('modal-catalog').classList.remove('hidden'); };
$('btn-catalog').onclick = openCatalog;
$('btn-catalog-empty').onclick = openCatalog;
$('btn-close-catalog').onclick = () => $('modal-catalog').classList.add('hidden');
$('btn-starter').onclick = (e) => addStarterPack(e.target);
$('btn-starter-cat').onclick = (e) => addStarterPack(e.target);

$('btn-refresh').onclick = () => refreshAll(false);
let searchTimer = null;
$('search').oninput = (e) => {
  searchTerm = e.target.value.toLowerCase();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderGrid, 140);
};
$('sort').onchange = (e) => { sortBy = e.target.value; renderGrid(); };
document.querySelectorAll('#fb-chips .fb-chip').forEach((chip) => {
  chip.onclick = () => {
    const f = chip.dataset.filter;
    if (activeFilters.has(f)) activeFilters.delete(f); else activeFilters.add(f);
    chip.classList.toggle('active');
    renderGrid();
  };
});

$('btn-close-detail').onclick = () => $('modal-detail').classList.add('hidden');
$('btn-edit').onclick = () => {
  const p = state.products.find((x) => x.id === detailId);
  $('modal-detail').classList.add('hidden');
  if (p) openAdd(p);
};
$('btn-reset-history').onclick = async () => {
  const p = state.products.find((x) => x.id === detailId);
  if (!p) return;
  if (!confirm(`¿Reiniciar el historial de "${p.name}"? Se borran las lecturas anteriores (incluidas bajadas erróneas) y se empieza de cero con el precio actual.`)) return;
  for (const s of p.sources) {
    s.history = (s.lastPrice != null && !s.mismatch) ? [{ t: Date.now(), price: s.lastPrice }] : [];
  }
  p.alertNotified = false;
  await save();
  render();
  openDetail(p.id);
  toast('Historial reiniciado');
};
$('btn-delete').onclick = async () => {
  const p = state.products.find((x) => x.id === detailId);
  if (p && confirm(`¿Eliminar "${p.name}" y todo su historial de precios?`)) {
    state.products = state.products.filter((x) => x.id !== detailId);
    $('modal-detail').classList.add('hidden');
    await save();
    render();
  }
};

// Cerrar modales con clic fuera o Escape
document.querySelectorAll('.modal-overlay').forEach((ov) => {
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) ov.classList.add('hidden'); });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach((ov) => ov.classList.add('hidden'));
});

window.api.onAutoRefresh(() => refreshAll(true));

// ---- Arranque ----
(async function init() {
  state = await window.api.loadData();
  if (!state.products) state = { products: [], lastRefresh: 0 };
  if (!state.recPrices) state.recPrices = {};
  // Migración: se retira Coolmod (sustituida por Amazon) de datos anteriores.
  for (const p of state.products) {
    if (p.sources) p.sources = p.sources.filter((s) => domainOf(s.url) !== 'coolmod.com' && s.domain !== 'coolmod.com');
  }
  // Catálogo remoto: novedades/recomendaciones actualizadas sin reinstalar
  try {
    const remote = await window.api.fetchCatalog();
    if (remote && remote.length) window.CATALOG = remote;
  } catch { /* se usa el catálogo incorporado */ }
  render();
  // Actualización automática si los datos llevan más de 12h sin refrescar
  if (state.products.length > 0 && Date.now() - (state.lastRefresh || 0) > STALE_MS) {
    refreshAll(true);
  }
})();

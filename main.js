const { app, BrowserWindow, ipcMain, Notification, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { fetchPrice, extractPrice, extractPriceFromText, extractImage, extractName, extractProducts } = require('./src/pricefetcher');
const { storeSearchUrl, bingSearchUrl, ddgSearchUrl, parseStoreSearch, parseBingResults, parseDdgResults, parseAmazonSearch, extractAsin } = require('./src/discover');

const DATA_FILE = () => path.join(app.getPath('userData'), 'data.json');
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAX_SCRAPES = 3;
let activeScrapes = 0;
const scrapeQueue = [];
let mainWindow = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isHttpUrl(value) {
  try { const u = new URL(String(value)); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

async function withScrapeSlot(fn) {
  if (activeScrapes >= MAX_SCRAPES) await new Promise((resolve) => scrapeQueue.push(resolve));
  activeScrapes++;
  try { return await fn(); }
  finally { activeScrapes--; const next = scrapeQueue.shift(); if (next) next(); }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240, height: 800, minWidth: 620, minHeight: 500,
    backgroundColor: '#0f1117', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (isHttpUrl(url)) shell.openExternal(url); return { action: 'deny' }; });
}

async function loadRendered(url) {
  if (!isHttpUrl(url)) throw new Error('URL no válida');
  return withScrapeSlot(async () => {
    const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { sandbox: true, partition: 'scrape' } });
    win.webContents.setUserAgent(CHROME_UA);
    const work = (async () => {
      await win.loadURL(url).catch((e) => { if (!/ERR_ABORTED/i.test(String(e && e.message))) throw e; });
      for (let i = 0; i < 9; i++) {
        const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML').catch(() => null);
        if (html && (/application\\/ld\\+json/i.test(html) || /€/.test(html))) return html;
        await sleep(700);
      }
      return win.webContents.executeJavaScript('document.documentElement.outerHTML').catch(() => null);
    })();
    const guard = new Promise((_, rej) => setTimeout(() => rej(new Error('tiempo de espera agotado')), 30000));
    try { return await Promise.race([work, guard]); }
    finally { if (!win.isDestroyed()) win.destroy(); }
  });
}

function loadDataSafe() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE(), 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.products)) throw new Error('data.json inválido');
    return { products: parsed.products, lastRefresh: Number(parsed.lastRefresh) || 0 };
  } catch { return { products: [], lastRefresh: 0 }; }
}

function saveDataAtomic(data) {
  const file = DATA_FILE();
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (err) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

ipcMain.handle('data:load', () => loadDataSafe());
ipcMain.handle('data:save', (_e, data) => {
  if (!data || typeof data !== 'object' || !Array.isArray(data.products)) throw new Error('Datos inválidos');
  saveDataAtomic(data);
  return true;
});

ipcMain.handle('price:fetch', async (_e, url) => {
  if (!isHttpUrl(url)) return { ok: false, error: 'URL no válida' };
  try { const r = await fetchPrice(url); if (r && r.price) return { ok: true, via: 'directo', ...r }; } catch {}
  try {
    const html = await loadRendered(url);
    if (!html) return { ok: false, error: 'La página no cargó' };
    const r = extractPrice(html) || extractPriceFromText(html);
    if (r && r.price) return { ok: true, via: 'navegador', ...r, image: extractImage(html), name: extractName(html) };
    return { ok: false, error: 'No se encontró precio en la página' };
  } catch (err) { return { ok: false, error: err.message || 'Error de lectura' }; }
});

async function tryDiscover(url, parser) { if (!isHttpUrl(url)) return null; try { const html = await loadRendered(url); return html ? parser(html) : null; } catch { return null; } }
function firstAsinUrl(list, domain) { for (const h of list) { const asin = extractAsin(h); if (asin) return `https://www.${domain}/dp/${asin}`; } return null; }

ipcMain.handle('discover', async (_e, { query, domains }) => {
  if (typeof query !== 'string' || !query.trim() || !Array.isArray(domains)) return [];
  const results = [];
  for (const domain of domains.slice(0, 20)) {
    if (typeof domain !== 'string' || !/^[a-z0-9.-]+$/i.test(domain)) continue;
    let url = null;
    if (domain.startsWith('amazon')) {
      url = await tryDiscover(ddgSearchUrl(query, domain), (h) => firstAsinUrl(parseDdgResults(h, domain), domain));
      if (!url) url = await tryDiscover(storeSearchUrl(domain, query), (h) => parseAmazonSearch(h, `www.${domain}`));
      if (!url) url = await tryDiscover(bingSearchUrl(query, domain), (h) => { const hits = parseBingResults(h, domain); return hits.length ? firstAsinUrl(hits, domain) : null; });
    } else {
      url = await tryDiscover(storeSearchUrl(domain, query), (h) => parseStoreSearch(h, domain, query));
      if (!url) url = await tryDiscover(bingSearchUrl(query, domain), (h) => { const hits = parseBingResults(h, domain); return hits.length ? hits[0] : null; });
    }
    if (url) results.push({ domain, url });
  }
  return results;
});

const CATALOG_URL = 'https://raw.githubusercontent.com/hparedes95/component_tracker/claude/pc-price-tracker-q9nnlj/catalog.json';
ipcMain.handle('catalog:fetch', async () => { try { const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(10000) }); if (!res.ok) return null; const data = await res.json(); return Array.isArray(data) && data.length ? data : null; } catch { return null; } });
ipcMain.handle('scan', async (_e, url) => { if (!isHttpUrl(url)) return []; try { const html = await loadRendered(url); return html ? extractProducts(html) : []; } catch { return []; } });
ipcMain.handle('notify', (_e, { title, body }) => { if (Notification.isSupported()) new Notification({ title: String(title || ''), body: String(body || '') }).show(); });
ipcMain.handle('open-external', (_e, url) => { if (isHttpUrl(url)) shell.openExternal(url); });

app.whenReady().then(() => {
  session.fromPartition('scrape').webRequest.onBeforeRequest((details, cb) => { cb({ cancel: ['image', 'media', 'font'].includes(details.resourceType) }); });
  createWindow();
  if (!app.isPackaged) {
    try {
      let reloadTimer = null;
      fs.watch(path.join(__dirname, 'src', 'renderer'), { recursive: true }, () => { clearTimeout(reloadTimer); reloadTimer = setTimeout(() => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload(); }, 200); });
    } catch {}
  }
  setInterval(() => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('auto-refresh'); }, REFRESH_INTERVAL_MS);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

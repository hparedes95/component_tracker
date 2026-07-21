const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { fetchPrice, extractPrice, extractPriceFromText } = require('./src/pricefetcher');
const { storeSearchUrl, bingSearchUrl, parseStoreSearch, parseBingResults, parseAmazonSearch, extractAsin } = require('./src/discover');

const DATA_FILE = () => path.join(app.getPath('userData'), 'data.json');
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // cada 24 horas

// UA de Chrome real: algunas tiendas rechazan el UA por defecto de Electron
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

let mainWindow = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1117',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Carga una URL en un navegador Chromium oculto (real, con JS), espera a que
// el precio aparezca en el DOM y devuelve el HTML renderizado. Es la clave para
// leer precios de tiendas que bloquean las peticiones HTTP normales con 403.
async function loadRendered(url) {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: { sandbox: true }
  });
  win.webContents.setUserAgent(CHROME_UA);

  const work = (async () => {
    await win.loadURL(url).catch((e) => {
      // Un redirect puede abortar la carga inicial; se ignora y se sondea el DOM.
      if (!/ERR_ABORTED/i.test(String(e && e.message))) throw e;
    });
    for (let i = 0; i < 9; i++) {
      const html = await win.webContents
        .executeJavaScript('document.documentElement.outerHTML')
        .catch(() => null);
      if (html && (/application\/ld\+json/i.test(html) || /€/.test(html))) return html;
      await sleep(700);
    }
    return win.webContents.executeJavaScript('document.documentElement.outerHTML').catch(() => null);
  })();

  const guard = new Promise((_, rej) => setTimeout(() => rej(new Error('tiempo de espera agotado')), 30000));

  try {
    return await Promise.race([work, guard]);
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

// ---- Persistencia ----
ipcMain.handle('data:load', () => {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE(), 'utf8'));
  } catch {
    return { products: [], lastRefresh: 0 };
  }
});

ipcMain.handle('data:save', (_e, data) => {
  fs.writeFileSync(DATA_FILE(), JSON.stringify(data, null, 2));
  return true;
});

// ---- Lectura de precio ----
ipcMain.handle('price:fetch', async (_e, url) => {
  // 1) Intento rápido con petición HTTP normal (funciona en algunas tiendas)
  try {
    const r = await fetchPrice(url);
    if (r && r.price) return { ok: true, via: 'directo', ...r };
  } catch { /* bloqueado o sin precio: se usa el navegador */ }

  // 2) Navegador embebido: carga real de la página
  try {
    const html = await loadRendered(url);
    if (!html) return { ok: false, error: 'La página no cargó' };
    const r = extractPrice(html) || extractPriceFromText(html);
    if (r && r.price) return { ok: true, via: 'navegador', ...r };
    return { ok: false, error: 'No se encontró precio en la página' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ---- Descubrimiento de la URL del producto en cada tienda ----
ipcMain.handle('discover', async (_e, { query, domains }) => {
  const results = [];
  for (const domain of domains) {
    let url = null;
    const isAmazon = domain.startsWith('amazon');
    // a) Página de búsqueda de la propia tienda (cargada en el navegador)
    try {
      const html = await loadRendered(storeSearchUrl(domain, query));
      if (html) url = isAmazon ? parseAmazonSearch(html, `www.${domain}`) : parseStoreSearch(html, domain, query);
    } catch { /* se prueba Bing */ }
    // b) Respaldo: resultados de Bing restringidos al dominio de la tienda
    if (!url) {
      try {
        const html = await loadRendered(bingSearchUrl(query, domain));
        if (html) {
          const hits = parseBingResults(html, domain);
          if (isAmazon) {
            for (const h of hits) {
              const asin = extractAsin(h);
              if (asin) { url = `https://www.${domain}/dp/${asin}`; break; }
            }
          } else if (hits.length) {
            url = hits[0];
          }
        }
      } catch { /* sin resultado en esta tienda */ }
    }
    if (url) results.push({ domain, url });
  }
  return results;
});

// ---- Notificaciones de alerta de precio ----
ipcMain.handle('notify', (_e, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

ipcMain.handle('open-external', (_e, url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
});

app.whenReady().then(() => {
  createWindow();

  // Actualización automática diaria mientras la app esté abierta.
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auto-refresh');
    }
  }, REFRESH_INTERVAL_MS);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

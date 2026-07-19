const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { fetchPrice } = require('./src/pricefetcher');

const DATA_FILE = () => path.join(app.getPath('userData'), 'data.json');
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // cada 24 horas

let mainWindow = null;

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

  // Los enlaces externos se abren en el navegador, no dentro de la app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
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

// ---- Obtención de precios ----
ipcMain.handle('price:fetch', async (_e, url) => {
  try {
    return { ok: true, ...(await fetchPrice(url)) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
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
  // El renderer decide además al arrancar si los datos están obsoletos.
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

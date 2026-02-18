const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

let win;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width: 200,
    height: 200,
    // Position bottom-right corner with 20px margin
    x: width - 220,
    y: height - 220,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Pass clicks through to apps below
  win.setIgnoreMouseEvents(true);

  // Hide from macOS dock
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  win.loadFile('renderer/index.html');

  // Open DevTools only in dev mode (run with: electron . --dev)
  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

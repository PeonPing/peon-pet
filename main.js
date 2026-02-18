const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let win;

// Path to peon-ping state file
const STATE_FILE = path.join(os.homedir(), '.claude', 'hooks', 'peon-ping', '.state.json');

// Map raw hook event names to avatar animation states
const EVENT_TO_ANIM = {
  SessionStart:        'wave',
  Stop:                'celebrate',
  PermissionRequest:   'alarmed',
  PostToolUseFailure:  'facepalm',
  UserPromptSubmit:    'annoyed',
  PreCompact:          'alarmed',
};

let lastTimestamp = 0;

function readStateFile() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function startPolling() {
  setInterval(() => {
    const state = readStateFile();
    if (!state || !state.last_active) return;

    const { timestamp, event } = state.last_active;
    if (timestamp === lastTimestamp) return;
    lastTimestamp = timestamp;

    const anim = EVENT_TO_ANIM[event];
    if (!anim) return;

    if (win && !win.isDestroyed()) {
      win.webContents.send('peon-event', { anim, event });
    }
  }, 200);
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width: 200,
    height: 200,
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

  win.setIgnoreMouseEvents(true);

  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  win.loadFile('renderer/index.html');

  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  // Start polling once window is ready
  win.webContents.once('did-finish-load', startPolling);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

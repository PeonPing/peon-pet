const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let win;

// Path to peon-ping state file
const STATE_FILE = path.join(os.homedir(), '.claude', 'hooks', 'peon-ping', '.state.json');

// Map raw hook event names to avatar animation states
const EVENT_TO_ANIM = {
  SessionStart:       'waking',
  Stop:               'typing',
  UserPromptSubmit:   'typing',
  PermissionRequest:  'alarmed',
  PostToolUseFailure: 'alarmed',
  PreCompact:         'alarmed',
};

let lastTimestamp = 0;

const sessionActivity = new Map();
const SESSION_PRUNE_MS = 4 * 60 * 60 * 1000;

function updateSessionActivity(sessionId) {
  sessionActivity.set(sessionId, Date.now());
  const cutoff = Date.now() - SESSION_PRUNE_MS;
  for (const [id, t] of sessionActivity) {
    if (t < cutoff) sessionActivity.delete(id);
  }
}

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

    const { timestamp, event, session_id } = state.last_active;
    if (timestamp === lastTimestamp) return;
    lastTimestamp = timestamp;

    if (session_id) updateSessionActivity(session_id);

    if (win && !win.isDestroyed()) {
      const now = Date.now();
      const HOT_MS  = 30 * 1000;       // 30s  — actively working right now
      const WARM_MS = 5 * 60 * 1000;  // 5min — session open but idle
      const sessions = [...sessionActivity.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, t]) => ({
          id,
          hot:  (now - t) < HOT_MS,
          warm: (now - t) < WARM_MS,
        }));
      win.webContents.send('session-update', { sessions });
    }

    const anim = EVENT_TO_ANIM[event];
    if (anim && win && !win.isDestroyed()) {
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
    hasShadow: false,
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

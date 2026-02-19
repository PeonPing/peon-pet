const { app, BrowserWindow, screen, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  isValidSessionId,
  createSessionTracker,
  buildSessionStates,
  EVENT_TO_ANIM,
} = require('./lib/session-tracker');

let win;
let petVisible = true;

// Path to peon-ping state file
const STATE_FILE = path.join(os.homedir(), '.claude', 'hooks', 'peon-ping', '.state.json');

let lastTimestamp = 0;

const tracker = createSessionTracker();
const SESSION_PRUNE_MS = 10 * 60 * 1000;  // 10min — prune cold sessions
const HOT_MS  = 30 * 1000;       // 30s  — actively working right now
const WARM_MS = 2 * 60 * 1000;   // 2min — session open but idle

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

    const now = Date.now();

    if (isValidSessionId(session_id)) {
      if (event === 'SessionEnd') {
        tracker.remove(session_id);
      } else {
        // On SessionStart, deduplicate: if exactly one other session was seen
        // within the last 5s, it's likely the same window transitioning to a
        // resumed session (e.g. /resume in Claude Code) — replace it.
        if (event === 'SessionStart') {
          const existing = tracker.entries();
          const isNew = !existing.some(([id]) => id === session_id);
          if (isNew && existing.length === 1) {
            const [oldId, oldTime] = existing[0];
            if ((now - oldTime) < 5000) {
              tracker.remove(oldId);
            }
          }
        }
        tracker.update(session_id, now);
      }
      tracker.prune(now - SESSION_PRUNE_MS);
    }

    if (win && !win.isDestroyed()) {
      const sessions = buildSessionStates(tracker.entries(), now, HOT_MS, WARM_MS, 5);
      win.webContents.send('session-update', { sessions });
    }

    const anim = EVENT_TO_ANIM[event];
    if (anim && win && !win.isDestroyed()) {
      win.webContents.send('peon-event', { anim, event });
    }
  }, 200);
}

// Poll cursor position to enable mouse events only when hovering the window.
// This lets the renderer receive mousemove for tooltips while keeping click-through.
function startMouseTracking() {
  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const { x: cx, y: cy } = screen.getCursorScreenPoint();
    const [wx, wy] = win.getPosition();
    const [ww, wh] = win.getSize();
    const inside = cx >= wx && cx <= wx + ww && cy >= wy && cy <= wy + wh;
    win.setIgnoreMouseEvents(!inside);
  }, 50);
}

function buildDockMenu() {
  return Menu.buildFromTemplate([
    {
      label: petVisible ? 'Hide Pet' : 'Show Pet',
      click() {
        if (!win || win.isDestroyed()) return;
        if (petVisible) {
          win.hide();
        } else {
          win.show();
        }
        petVisible = !petVisible;
        app.dock.setMenu(buildDockMenu());
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click() {
        app.quit();
      },
    },
  ]);
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width: 200,
    height: 200,
    x: 20,
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

  win.loadFile('renderer/index.html');

  if (process.platform === 'darwin') {
    const iconPath = path.join(__dirname, 'renderer', 'assets', 'orc-dock-icon.png');
    app.dock.setIcon(iconPath);
    app.dock.setMenu(buildDockMenu());
  }

  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  // Start polling once window is ready
  win.webContents.once('did-finish-load', () => {
    startPolling();
    startMouseTracking();
  });
}

app.setName('Peon Pet');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}

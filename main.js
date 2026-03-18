const { app, BrowserWindow, screen, Menu, protocol, net, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  isValidSessionId,
  createSessionTracker,
  buildSessionStates,
  EVENT_TO_ANIM,
} = require('./lib/session-tracker');
const { JsonlWatcher } = require('./lib/jsonl-watcher');

let win;
let petVisible = true;

// --- Character system ---
// Per-character asset maps: canonical name → bundled filename
const BUNDLED_CHARS = {
  orc: {
    'sprite-atlas.png': 'orc-sprite-atlas.png',
    'borders.png':      'orc-borders.png',
    'bg.png':           'bg-pixel.png',
    'dock-icon.png':    'orc-dock-icon.png',
  },
  capybara: {
    'sprite-atlas.png': 'capybara-sprite-atlas.png',
    'borders.png':      'capybara-borders.png',
    'dock-icon.png':    'capybara-dock-icon.png',
  },
  'hello-kitty': {
    'sprite-atlas.png': 'hello-kitty-sprite-atlas.png',
    'borders.png':      'hello-kitty-borders.png',
    'dock-icon.png':    'hello-kitty-dock-icon.png',
  },
};

function parseArgPath(flag) {
  const i = process.argv.indexOf(flag);
  return (i !== -1 && process.argv[i + 1]) ? process.argv[i + 1] : null;
}

const argCharacter = parseArgPath('--character');

function loadPetConfig() {
  try {
    return JSON.parse(fs.readFileSync(
      path.join(app.getPath('userData'), 'peon-pet-config.json'), 'utf8'
    ));
  } catch { return {}; }
}

function registerCharacterProtocol() {
  const cfg = loadPetConfig();
  const char = argCharacter || cfg.character || 'orc';
  const assetsDir = path.join(__dirname, 'renderer', 'assets');
  const customCharDir = path.join(app.getPath('userData'), 'characters', char);
  const charMap = BUNDLED_CHARS[char] || {};

  protocol.handle('peon-asset', (request) => {
    const filename = new URL(request.url).hostname;
    // 1. User-installed character dir
    if (fs.existsSync(path.join(customCharDir, filename))) {
      return net.fetch('file://' + path.join(customCharDir, filename));
    }
    // 2. Bundled map: char-specific → orc fallback → filename as-is
    const mapped = charMap[filename] || BUNDLED_CHARS.orc[filename] || filename;
    return net.fetch('file://' + path.join(assetsDir, mapped));
  });

  return { char, assetsDir, customCharDir };
}

const tracker = createSessionTracker();
const sessionCwds = new Map();  // session_id → cwd string
const remoteSessionIds = new Set();
const remoteLastEvents = new Map();  // session_id → last event string
const SESSION_PRUNE_MS = 10 * 60 * 1000;  // 10min — prune cold sessions
const HOT_MS  = 30 * 1000;       // 30s  — actively working right now
const WARM_MS = 2 * 60 * 1000;   // 2min — session open but idle

async function readRemoteState(baseUrl) {
  try {
    const res = await net.fetch(`${baseUrl}/state`, { signal: AbortSignal.timeout(150) });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function handleSessionEvent({ sessionId, event, cwd, timestamp }) {
  if (!isValidSessionId(sessionId)) return;

  const now = Date.now();

  // SessionCwd: just update the display name, no tracker change
  if (event === 'SessionCwd') {
    if (cwd) {
      sessionCwds.set(sessionId, cwd);
      sendSessionUpdate(now);
    }
    return;
  }

  if (event === 'SessionEnd') {
    tracker.remove(sessionId);
    sessionCwds.delete(sessionId);
  } else if (event === 'SessionSeen') {
    // File existed at startup: register with actual file mtime, no animation, no dedup
    tracker.update(sessionId, timestamp || now);
    if (cwd) sessionCwds.set(sessionId, cwd);
  } else {
    if (event === 'SessionStart') {
      // Deduplicate /resume: if exactly one session was seen <5s ago, replace it
      const existing = tracker.entries();
      const isNew = !existing.some(([id]) => id === sessionId);
      if (isNew && existing.length === 1) {
        const [oldId, oldTime] = existing[0];
        if ((now - oldTime) < 5000) tracker.remove(oldId);
      }
    }
    tracker.update(sessionId, now);
    if (cwd) sessionCwds.set(sessionId, cwd);
  }

  tracker.prune(now - SESSION_PRUNE_MS);
  for (const id of sessionCwds.keys()) {
    if (!tracker.entries().some(([sid]) => sid === id)) sessionCwds.delete(id);
  }

  sendSessionUpdate(now);

  const anim = EVENT_TO_ANIM[event];
  if (anim && win && !win.isDestroyed()) {
    win.webContents.send('peon-event', { anim, event });
  }
}

function sendSessionUpdate(now) {
  if (!win || win.isDestroyed()) return;
  const sessions = buildSessionStates(tracker.entries(), now, HOT_MS, WARM_MS, 10);
  win.webContents.send('session-update', {
    sessions: sessions.map(s => ({
      ...s,
      cwd: sessionCwds.get(s.id) || null,
      name: sessionCwds.get(s.id) ? path.basename(sessionCwds.get(s.id)) : null,
    })),
  });
}

function syncRemoteSessionsToTracker(state) {
  if (!state || !state.sessions) return;
  const now = Date.now();
  const incoming = state.sessions;

  for (const [sid, entry] of Object.entries(incoming)) {
    if (!isValidSessionId(sid)) continue;
    tracker.update(sid, entry.timestamp * 1000);  // relay uses Unix seconds
    if (entry.cwd) sessionCwds.set(sid, entry.cwd);
    remoteSessionIds.add(sid);
    const anim = EVENT_TO_ANIM[entry.event];
    if (anim && entry.event !== remoteLastEvents.get(sid)) {
      remoteLastEvents.set(sid, entry.event);
      if (win && !win.isDestroyed()) win.webContents.send('peon-event', { anim, event: entry.event });
    }
  }

  for (const sid of [...remoteSessionIds]) {
    if (!incoming[sid]) {
      tracker.remove(sid);
      sessionCwds.delete(sid);
      remoteSessionIds.delete(sid);
      remoteLastEvents.delete(sid);
    }
  }

  sendSessionUpdate(now);
}

function startPolling() {
  const cfg = loadPetConfig();
  const remoteUrl = cfg.remoteUrl || 'http://127.0.0.1:19998';

  const watcher = new JsonlWatcher();

  watcher.on('session-event', handleSessionEvent);

  watcher.start();

  // Heartbeat: refresh session hot/warm status so the pet correctly decays.
  // Sessions with pending tools are kept hot so the pet stays awake during long tool runs.
  setInterval(() => {
    if (tracker.entries().length === 0) return;
    const now = Date.now();
    for (const sessionId of watcher.getActiveSessionIds()) {
      tracker.update(sessionId, now);
    }
    sendSessionUpdate(now);
  }, 5000);

  // Remote relay sync (less frequent, not time-critical)
  setInterval(async () => {
    syncRemoteSessionsToTracker(await readRemoteState(remoteUrl));
  }, 5000);
}

// --- Drag state ---
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let ignoringMouse = true;  // tracks last setIgnoreMouseEvents value

ipcMain.on('drag-start', () => {
  if (!win || win.isDestroyed()) return;
  isDragging = true;
  const { x: cx, y: cy } = screen.getCursorScreenPoint();
  const [wx, wy] = win.getPosition();
  dragOffsetX = cx - wx;
  dragOffsetY = cy - wy;
  if (ignoringMouse) {
    win.setIgnoreMouseEvents(false);
    ignoringMouse = false;
  }
});

ipcMain.on('drag-stop', () => {
  isDragging = false;
});

// Poll cursor position to enable mouse events only when hovering the window.
// This lets the renderer receive mousemove for tooltips while keeping click-through.
// During drag, moves the window to follow the cursor.
function startMouseTracking() {
  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const { x: cx, y: cy } = screen.getCursorScreenPoint();

    if (isDragging) {
      const nx = cx - dragOffsetX;
      const ny = cy - dragOffsetY;
      const [wx, wy] = win.getPosition();
      if (nx !== wx || ny !== wy) win.setPosition(nx, ny);
      return;
    }

    const [wx, wy] = win.getPosition();
    const [ww, wh] = win.getSize();
    const inside = cx >= wx && cx <= wx + ww && cy >= wy && cy <= wy + wh;
    if (inside !== !ignoringMouse) {
      win.setIgnoreMouseEvents(!inside);
      ignoringMouse = !inside;
    }
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

const { WIN_SIZE, WIN_MARGIN, cornerPosition } = require('./lib/window-position');

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const cfg = loadPetConfig();
  const { x, y } = cornerPosition(cfg.corner, width, height);

  win = new BrowserWindow({
    width: WIN_SIZE,
    height: WIN_SIZE,
    x,
    y,
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
    const cfg = loadPetConfig();
    const char = argCharacter || cfg.character || 'orc';
    const assetsDir = path.join(__dirname, 'renderer', 'assets');
    const customIcon = path.join(app.getPath('userData'), 'characters', char, 'dock-icon.png');
    const charMap = BUNDLED_CHARS[char] || {};
    const iconFile = charMap['dock-icon.png'] || BUNDLED_CHARS.orc['dock-icon.png'];
    const iconPath = fs.existsSync(customIcon) ? customIcon : path.join(assetsDir, iconFile);
    app.dock.setIcon(iconPath);
    app.dock.setMenu(buildDockMenu());
  }

  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  // Reset drag if renderer reloads or crashes
  win.webContents.on('did-finish-load', () => { isDragging = false; });

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
  app.whenReady().then(() => {
    registerCharacterProtocol();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}

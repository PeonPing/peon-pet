const { app, BrowserWindow, screen, Menu, protocol, net, ipcMain } = require('electron');
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
let lastPendingSubagentTs = 0; // tracks last seen pending_subagent_pack.ts to detect SubagentStart
const subAgentWindows = new Map(); // session_id → BrowserWindow
const subAgentCreatedAt = new Map(); // session_id → creation timestamp (ms)
const dummySessionIds = new Set(); // dev-only: protected from sync cleanup
const MAX_SUB_AGENT_WINDOWS = 5;
const SUB_AGENT_BASE_Y_OFFSET = 170; // px from bottom of work area to main pet
const SUB_AGENT_TTL_MS = 10 * 60 * 1000; // 10 min — destroy stale windows if SubagentStop never fired

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

// Path to peon-ping state file
const STATE_FILE = path.join(os.homedir(), '.claude', 'hooks', 'peon-ping', '.state.json');

let lastTimestamp = 0;

const tracker = createSessionTracker();
const sessionCwds = new Map();  // session_id → cwd string
const remoteSessionIds = new Set();
const remoteLastEvents = new Map();  // session_id → last event string
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

async function readRemoteState(baseUrl) {
  try {
    const res = await net.fetch(`${baseUrl}/state`, { signal: AbortSignal.timeout(150) });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function repositionSubAgentWindows() {
  const { height } = screen.getPrimaryDisplay().workAreaSize;
  let i = 0;
  for (const [, subWin] of subAgentWindows) {
    if (!subWin.isDestroyed()) {
      const mainY = height - SUB_AGENT_BASE_Y_OFFSET;
      subWin.setPosition(20, mainY - (i + 1) * 100);
      i++;
    }
  }
}

function createSubAgentWindow(sessionId) {
  if (subAgentWindows.size >= MAX_SUB_AGENT_WINDOWS) return;
  if (subAgentWindows.has(sessionId)) return;

  const { height } = screen.getPrimaryDisplay().workAreaSize;
  const idx = subAgentWindows.size;

  const subWin = new BrowserWindow({
    width: 100,
    height: 100,
    x: 20,
    y: (height - SUB_AGENT_BASE_Y_OFFSET) - (idx + 1) * 100,
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

  subWin.setIgnoreMouseEvents(true);

  subWin.loadFile('renderer/index.html');

  subWin.webContents.once('did-finish-load', () => {
    subWin.webContents.send('peon-config', { size: 100, subAgent: true });
    subWin.webContents.send('peon-event', { anim: 'waking', event: 'SessionStart' });
    startMouseTrackingForWindow(subWin);
  });

  // Don't quit app when sub-agent window closes
  subWin.on('closed', () => {
    subAgentWindows.delete(sessionId);
    subAgentCreatedAt.delete(sessionId);
    repositionSubAgentWindows();
  });

  if (!petVisible) subWin.hide();

  subAgentWindows.set(sessionId, subWin);
  subAgentCreatedAt.set(sessionId, Date.now());
}

function destroySubAgentWindow(sessionId) {
  const subWin = subAgentWindows.get(sessionId);
  if (subWin && !subWin.isDestroyed()) {
    subWin.destroy();
  }
  subAgentWindows.delete(sessionId);
  subAgentCreatedAt.delete(sessionId);
  repositionSubAgentWindows();
}

function syncSubAgentWindows(state) {
  // TTL sweep: destroy windows that have been open too long (e.g. SubagentStop never fired)
  const now = Date.now();
  const expired = [...subAgentCreatedAt.entries()]
    .filter(([sid, createdAt]) => now - createdAt > SUB_AGENT_TTL_MS && !dummySessionIds.has(sid))
    .map(([sid]) => sid);
  for (const sid of expired) destroySubAgentWindow(sid);

  // Detect SubagentStart: pending_subagent_pack.ts is updated by peon.sh on each SubagentStart
  const pendingPack = state.pending_subagent_pack;
  if (pendingPack?.ts > lastPendingSubagentTs) {
    lastPendingSubagentTs = pendingPack.ts;
    createSubAgentWindow(`peon_sub_${Math.round(pendingPack.ts * 1000)}`);
  }
}

function initLastPendingSubagentTs() {
  const state = readStateFile();
  const ts = state?.pending_subagent_pack?.ts;
  if (ts) lastPendingSubagentTs = ts;
}

function processStateUpdate(state, lastTs, setLastTs) {
  if (!state || !state.last_active) return lastTs;

  const { timestamp, event, session_id, cwd } = state.last_active;
  if (timestamp === lastTs) return lastTs;
  setLastTs(timestamp);

  const now = Date.now();

  if (isValidSessionId(session_id)) {
    if (event === 'SessionEnd') {
      tracker.remove(session_id);
      sessionCwds.delete(session_id);
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
      if (cwd) sessionCwds.set(session_id, cwd);
    }
    tracker.prune(now - SESSION_PRUNE_MS);
    // Keep sessionCwds in sync with tracker
    for (const id of sessionCwds.keys()) {
      if (!tracker.entries().some(([sid]) => sid === id)) sessionCwds.delete(id);
    }
  }

  if (win && !win.isDestroyed()) {
    const sessions = buildSessionStates(tracker.entries(), now, HOT_MS, WARM_MS, 10);
    const sessionsWithCwd = sessions.map(s => ({
      ...s,
      cwd: sessionCwds.get(s.id) || null,
    }));
    win.webContents.send('session-update', { sessions: sessionsWithCwd });
  }

  const anim = EVENT_TO_ANIM[event];
  if (anim && win && !win.isDestroyed()) {
    win.webContents.send('peon-event', { anim, event });
  }

  return timestamp;
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

  if (win && !win.isDestroyed()) {
    const sessions = buildSessionStates(tracker.entries(), now, HOT_MS, WARM_MS, 10);
    const sessionsWithCwd = sessions.map(s => ({ ...s, cwd: sessionCwds.get(s.id) || null }));
    win.webContents.send('session-update', { sessions: sessionsWithCwd });
  }
}

function startPolling() {
  initLastPendingSubagentTs();
  const cfg = loadPetConfig();
  const remoteUrl = cfg.remoteUrl || 'http://127.0.0.1:19998';

  setInterval(async () => {
    const state = readStateFile();
    if (state) syncSubAgentWindows(state);
    // Detect SubagentStop: each Stop event (SubagentStop maps to Stop in peon.sh)
    // destroys the oldest pseudo sub-agent window. Parent's own final Stop is a no-op.
    if (state?.last_active?.timestamp !== lastTimestamp && state?.last_active?.event === 'Stop') {
      const oldest = [...subAgentWindows.keys()]
        .filter(id => id.startsWith('peon_sub_') && !dummySessionIds.has(id))
        .sort((a, b) => (subAgentCreatedAt.get(a) || 0) - (subAgentCreatedAt.get(b) || 0))[0];
      if (oldest) destroySubAgentWindow(oldest);
    }
    processStateUpdate(state, lastTimestamp, (ts) => { lastTimestamp = ts; });
    syncRemoteSessionsToTracker(await readRemoteState(remoteUrl));
  }, 200);
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
function startMouseTrackingForWindow(targetWin) {
  const intervalId = setInterval(() => {
    if (!targetWin || targetWin.isDestroyed()) {
      clearInterval(intervalId);
      return;
    }
    const { x: cx, y: cy } = screen.getCursorScreenPoint();

    if (targetWin === win && isDragging) {
      const nx = cx - dragOffsetX;
      const ny = cy - dragOffsetY;
      const [wx, wy] = targetWin.getPosition();
      if (nx !== wx || ny !== wy) targetWin.setPosition(nx, ny);
      return;
    }

    const [wx, wy] = targetWin.getPosition();
    const [ww, wh] = targetWin.getSize();
    const inside = cx >= wx && cx <= wx + ww && cy >= wy && cy <= wy + wh;
    if (targetWin === win) {
      if (inside !== !ignoringMouse) {
        targetWin.setIgnoreMouseEvents(!inside);
        ignoringMouse = !inside;
      }
    } else {
      targetWin.setIgnoreMouseEvents(!inside);
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
          for (const [, subWin] of subAgentWindows) {
            if (!subWin.isDestroyed()) subWin.hide();
          }
        } else {
          win.show();
          for (const [, subWin] of subAgentWindows) {
            if (!subWin.isDestroyed()) subWin.show();
          }
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

  // Clean up sub-agent windows when main window closes
  win.on('closed', () => {
    for (const subWin of subAgentWindows.values()) {
      if (!subWin.isDestroyed()) subWin.destroy();
    }
    subAgentWindows.clear();
  });

  // Start polling once window is ready
  win.webContents.once('did-finish-load', () => {
    startPolling();
    startMouseTrackingForWindow(win);

    // Dev-only: spawn dummy sub-agents for visual testing
    if (process.argv.includes('--spawn-test')) {
      const dummyIds = ['dummy-1', 'dummy-2', 'dummy-3'];
      for (const id of dummyIds) {
        dummySessionIds.add(id);
        createSubAgentWindow(id);
      }
      setTimeout(() => {
        for (const id of dummyIds) {
          dummySessionIds.delete(id);
          destroySubAgentWindow(id);
        }
      }, 3000);
    }
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

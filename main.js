const { app, BrowserWindow, screen, Menu, protocol, net } = require('electron');
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
const subAgentWindows = new Map(); // session_id → BrowserWindow
const subAgentCreatedAt = new Map(); // session_id → creation timestamp (ms)
const dummySessionIds = new Set(); // dev-only: protected from sync cleanup
const MAX_SUB_AGENT_WINDOWS = 5;
const SUB_AGENT_BASE_Y_OFFSET = 170; // px from bottom of work area to main pet
const SUB_AGENT_TTL_MS = 10 * 60 * 1000; // 10 min — destroy stale windows if SubagentStop never fired

// --- Character system ---
// Per-character asset maps: canonical name → bundled filename
// Only entries that differ from orc defaults need to be listed.
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

  const agentSessions = state.agent_sessions || [];
  const activeIds = new Set();

  // Create windows for active sub-agent sessions
  for (const sid of agentSessions) {
    activeIds.add(sid);
    createSubAgentWindow(sid);
  }

  // Destroy windows for sub-agent sessions that are no longer active
  for (const sid of [...subAgentWindows.keys()]) {
    if (!activeIds.has(sid) && !dummySessionIds.has(sid)) {
      destroySubAgentWindow(sid);
    }
  }
}

function startPolling() {
  setInterval(() => {
    const state = readStateFile();
    if (!state || !state.last_active) return;

    // Sync sub-agent windows each tick
    syncSubAgentWindows(state);

    const { timestamp, event, session_id, cwd } = state.last_active;
    if (timestamp === lastTimestamp) return;
    lastTimestamp = timestamp;

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

    // Route animation events to the main window
    const anim = EVENT_TO_ANIM[event];
    if (anim && win && !win.isDestroyed()) {
      win.webContents.send('peon-event', { anim, event });
    }
  }, 200);
}

// Poll cursor position to enable mouse events only when hovering the window.
// This lets the renderer receive mousemove for tooltips while keeping click-through.
function startMouseTrackingForWindow(targetWin) {
  const intervalId = setInterval(() => {
    if (!targetWin || targetWin.isDestroyed()) {
      clearInterval(intervalId);
      return;
    }
    const { x: cx, y: cy } = screen.getCursorScreenPoint();
    const [wx, wy] = targetWin.getPosition();
    const [ww, wh] = targetWin.getSize();
    const inside = cx >= wx && cx <= wx + ww && cy >= wy && cy <= wy + wh;
    targetWin.setIgnoreMouseEvents(!inside);
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

function createWindow() {
  const { height } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width: 200,
    height: 200,
    x: 18,
    y: height - 20,
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
      }, 20000);
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

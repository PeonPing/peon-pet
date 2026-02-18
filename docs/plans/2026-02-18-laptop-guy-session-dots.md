# Laptop Guy + Session Dots Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the placeholder peon sprite with the laptop-guy pixel art character (sleeping when idle, reacting to peon-ping events), add a row of session status dots above the avatar showing active vs idle Claude Code sessions, and fix critical bugs found in code review.

**Architecture:** The laptop-guy-atlas.png needs its checkerboard background stripped to real alpha transparency. `renderer/app.js` gets a new 4-row ANIM_CONFIG, updated event mapping, a 30s idle timer that triggers the sleeping animation, and session dot meshes tracked from in-memory session timestamps. The Electron window expands to 200×230px. Bug fixes (setTimeout loop, shake decay formula) are bundled into the relevant tasks.

**Tech Stack:** Electron, Three.js r183, Node.js canvas (background stripping), PIL/Python fallback

---

## Key Context

**Working directory:** `/Users/garysheng/Documents/github-repos/peonping-repos/peon-ping-avatar`

**Sprite atlas:** `renderer/assets/laptop-guy-atlas.png` — 1264×848px, RGB (no alpha yet), 6 cols × 4 rows, ~210×212px per frame

**Current atlas frame size math:**
- Frame width: `1264 / 6 ≈ 210.67` → UV repeat `1/6`
- Frame height: `848 / 4 = 212` → UV repeat `1/4`
- Three.js UV math handles non-integer frame sizes cleanly with NearestFilter

**New ANIM_CONFIG (4 rows):**
```js
const ANIM_CONFIG = {
  sleeping: { row: 0, frames: 6, fps: 3,  loop: true  },
  waking:   { row: 1, frames: 6, fps: 8,  loop: false },
  typing:   { row: 2, frames: 6, fps: 8,  loop: false },
  alarmed:  { row: 3, frames: 6, fps: 8,  loop: false },
};
```

**New EVENT_TO_ANIM:**
```js
const EVENT_TO_ANIM = {
  SessionStart:       'waking',
  Stop:               'typing',
  UserPromptSubmit:   'typing',
  PermissionRequest:  'alarmed',
  PostToolUseFailure: 'alarmed',
  PreCompact:         'alarmed',
};
```

**Session dots:** In-memory `Map<sessionId, { lastEventTime }>` updated on each poll. Green dot = active (event within 30s), grey = idle. Max 5 dots, 10×10 world-units each, 4-unit gap, centered horizontally at top of scene.

**Window change:** `height: 230` (was 200), `y: screenHeight - 250` (was `screenHeight - 220`). Camera: `OrthographicCamera(-100, 100, 115, -115)` (was -100 to 100).

---

## Task 1: Strip checkerboard background from laptop-guy-atlas.png

**Files:**
- Create: `scripts/strip-atlas-bg.js`
- Modify: `renderer/assets/laptop-guy-atlas.png` (overwrite with RGBA version)

The current PNG has no alpha channel — the "transparent" checkerboard is baked as grey/white pixels. This task creates a script that detects the two checkerboard colors from the image corners and replaces them with transparency.

**Step 1: Write `scripts/strip-atlas-bg.js`**

```js
// Strips the AI-generated checkerboard background from laptop-guy-atlas.png
// and writes a new RGBA PNG with true transparency.
// The checkerboard has two alternating colors sampled from the image corners.

const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const INPUT  = path.join(__dirname, '../renderer/assets/laptop-guy-atlas.png');
const OUTPUT = INPUT; // overwrite in place

const TOLERANCE = 30; // color match tolerance (0-255)

async function main() {
  const img = await loadImage(INPUT);
  const { width, height } = img;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, width, height);
  const px = data.data;

  // Sample the two checkerboard colors from the top-left corner region.
  // A checkerboard repeats at ~8-16px intervals. Sample a 30x30 region
  // and collect unique colors (ignoring character colors by taking the most common).
  const colorCounts = new Map();
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 30; x++) {
      const i = (y * width + x) * 4;
      const key = `${Math.round(px[i]/10)*10},${Math.round(px[i+1]/10)*10},${Math.round(px[i+2]/10)*10}`;
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }
  }

  // Take the two most common colors in the sampled region — those are the checkerboard
  const sorted = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]);
  const bgColors = sorted.slice(0, 2).map(([key]) => key.split(',').map(Number));
  console.log('Detected background colors:', bgColors);

  function isBackground(r, g, b) {
    return bgColors.some(([br, bg, bb]) =>
      Math.abs(r - br) < TOLERANCE &&
      Math.abs(g - bg) < TOLERANCE &&
      Math.abs(b - bb) < TOLERANCE
    );
  }

  // Replace background pixels with transparent
  let replaced = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (isBackground(px[i], px[i+1], px[i+2])) {
      px[i+3] = 0; // alpha = 0
      replaced++;
    }
  }

  ctx.putImageData(data, 0, 0);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(OUTPUT, buffer);

  const total = (width * height);
  console.log(`Replaced ${replaced}/${total} pixels (${Math.round(replaced/total*100)}%)`);
  console.log(`Saved RGBA PNG: ${OUTPUT} (${width}x${height})`);
}

main().catch(console.error);
```

**Step 2: Run it**

```bash
cd /Users/garysheng/Documents/github-repos/peonping-repos/peon-ping-avatar && node scripts/strip-atlas-bg.js
```

Expected output:
```
Detected background colors: [ [177, 177, 177], [130, 130, 130] ]  (exact values may vary)
Replaced 287000/1071872 pixels (27%)
Saved RGBA PNG: .../renderer/assets/laptop-guy-atlas.png (1264x848)
```

If replacement % is less than 10% or more than 60%, the background detection may have failed — re-run with adjusted TOLERANCE (try 20 or 40).

**Step 3: Verify with Python**

```bash
python3 -c "
from PIL import Image
img = Image.open('renderer/assets/laptop-guy-atlas.png')
print('Mode:', img.mode)  # should be RGBA
print('Size:', img.size)
"
```

Expected: `Mode: RGBA`

**Step 4: Commit**

```bash
cd /Users/garysheng/Documents/github-repos/peonping-repos/peon-ping-avatar && git add scripts/strip-atlas-bg.js renderer/assets/laptop-guy-atlas.png && git commit -m "feat: strip checkerboard background from laptop-guy atlas, add alpha"
```

---

## Task 2: Fix critical bugs from code review

**Files:**
- Modify: `renderer/app.js`
- Modify: `renderer/index.html`
- Modify: `package.json`

These bugs were found in the initial code review and must be fixed before building on top of the existing code.

**Step 1: Read current `renderer/app.js`** to see the existing code structure.

**Step 2: Fix bug 1 — setTimeout fires multiple times at animation end**

Find the animation end block in the render loop (inside `if (frameTimer >= 1 / cfg.fps)`). It currently looks like:

```js
} else {
  currentFrame = cfg.frames - 1;
  setTimeout(() => playAnim('idle'), 300);
}
```

Replace with a `pendingIdle` flag. Add this variable near the top of `renderer/app.js` (with other state variables):

```js
let pendingIdle = false;
```

Update the animation end block to:

```js
} else {
  currentFrame = cfg.frames - 1;
  if (!pendingIdle) {
    pendingIdle = true;
    setTimeout(() => {
      pendingIdle = false;
      playAnim('sleeping');  // Note: return to sleeping, not idle
    }, 300);
  }
}
```

Also add `pendingIdle = false;` as the first line inside `playAnim`:

```js
function playAnim(animName) {
  pendingIdle = false;
  if (!ANIM_CONFIG[animName]) return;
  // ... rest unchanged
}
```

**Step 3: Fix bug 2 — shake decay is frame-rate dependent**

Find this line in the render loop:
```js
shakeIntensity = Math.max(0, shakeIntensity - SHAKE_DECAY * delta * 60 * delta);
```

Replace with:
```js
shakeIntensity = Math.max(0, shakeIntensity - SHAKE_DECAY * delta);
```

**Step 4: Fix bug 3 — dead `v.y` field in particle velocity**

Find the particle velocity initialization in `burstParticles()`:
```js
particleVelocities[i] = {
  x: Math.cos(angle) * speed,
  y: Math.abs(Math.sin(angle)) * speed + 20,
  vy: Math.abs(Math.sin(angle)) * speed + 20,
  gravity: -60 - Math.random() * 40,
};
```

Remove the dead `y` field:
```js
particleVelocities[i] = {
  x: Math.cos(angle) * speed,
  vy: Math.abs(Math.sin(angle)) * speed + 20,
  gravity: -60 - Math.random() * 40,
};
```

**Step 5: Add Content Security Policy to `renderer/index.html`**

Inside the `<head>` block, add after `<meta charset="UTF-8">`:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self';">
```

**Step 6: Move `canvas` to devDependencies in `package.json`**

In `package.json`:
- Remove `"canvas": "^3.2.1"` from `dependencies`
- Add `"canvas": "^3.2.1"` to `devDependencies`

**Step 7: Commit**

```bash
cd /Users/garysheng/Documents/github-repos/peonping-repos/peon-ping-avatar && git add renderer/app.js renderer/index.html package.json && git commit -m "fix: setTimeout loop bug, shake decay formula, dead particle field, CSP header, canvas devDep"
```

---

## Task 3: Update ANIM_CONFIG and event mapping for laptop guy

**Files:**
- Modify: `renderer/app.js`
- Modify: `main.js`

**Step 1: Update ANIM_CONFIG in `renderer/app.js`**

Replace the existing `ANIM_CONFIG` object:

```js
const ATLAS_COLS = 6;
const ATLAS_ROWS = 4;  // was 6

const ANIM_CONFIG = {
  sleeping: { row: 0, frames: 6, fps: 3,  loop: true  },
  waking:   { row: 1, frames: 6, fps: 8,  loop: false },
  typing:   { row: 2, frames: 6, fps: 8,  loop: false },
  alarmed:  { row: 3, frames: 6, fps: 8,  loop: false },
};
```

**Step 2: Update the atlas texture load path**

Find:
```js
const atlas = loader.load('./assets/peon-atlas.png', ...
```

Replace with:
```js
const atlas = loader.load('./assets/laptop-guy-atlas.png', ...
```

**Step 3: Update `ANIM_FLASH` map**

The flash colors now map to the new animation names:

```js
const ANIM_FLASH = {
  waking:  () => triggerFlash(0.4, 0.8, 1.0, 0.3, 2.0),  // blue glow — session starting
  typing:  () => triggerFlash(1.0, 0.8, 0.0, 0.3, 2.0),  // soft gold — working
  alarmed: () => triggerFlash(1.0, 0.1, 0.1, 0.5, 2.5),  // red — needs attention
};
```

**Step 4: Update `playAnim('idle')` references to `playAnim('sleeping')`**

Search for all `playAnim('idle')` calls in `renderer/app.js` and replace with `playAnim('sleeping')`. Also update `playAnim('idle')` in the initial call at the bottom.

**Step 5: Update EVENT_TO_ANIM in `main.js`**

Replace the existing `EVENT_TO_ANIM` object:

```js
const EVENT_TO_ANIM = {
  SessionStart:       'waking',
  Stop:               'typing',
  UserPromptSubmit:   'typing',
  PermissionRequest:  'alarmed',
  PostToolUseFailure: 'alarmed',
  PreCompact:         'alarmed',
};
```

**Step 6: Commit**

```bash
cd /Users/garysheng/Documents/github-repos/peonping-repos/peon-ping-avatar && git add renderer/app.js main.js && git commit -m "feat: switch to laptop-guy atlas with 4-row animation config"
```

---

## Task 4: Add idle timer (fall asleep after 30s)

**Files:**
- Modify: `renderer/app.js`

The character should return to sleeping after 30 seconds with no events. This replaces the simple "return to idle" behavior.

**Step 1: Add idle timer state near the top of `renderer/app.js`** (with other state variables):

```js
let idleTimer = null;
const IDLE_TIMEOUT_MS = 30000;  // 30 seconds

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    playAnim('sleeping');
  }, IDLE_TIMEOUT_MS);
}
```

**Step 2: Call `resetIdleTimer()` inside `playAnim`**

Add it after the flash trigger:

```js
function playAnim(animName) {
  pendingIdle = false;
  if (!ANIM_CONFIG[animName]) return;
  currentAnim = animName;
  currentFrame = 0;
  frameTimer = 0;
  setFrame(animName, 0);
  if (ANIM_FLASH[animName]) {
    ANIM_FLASH[animName]();
  }
  // Only reset idle timer for non-sleeping animations
  if (animName !== 'sleeping') {
    resetIdleTimer();
  }
}
```

**Step 3: Start the idle timer on load**

At the bottom of `renderer/app.js`, after `playAnim('sleeping')`, add:

```js
// Don't start idle timer on initial sleeping — already sleeping
// Timer will start when first event fires via playAnim → resetIdleTimer
```

(No extra code needed — `resetIdleTimer()` is only called for non-sleeping animations.)

**Step 4: Commit**

```bash
cd /Users/garysheng/Documents/github-repos/peonping-repos/peon-ping-avatar && git add renderer/app.js && git commit -m "feat: add 30s idle timer to return character to sleeping"
```

---

## Task 5: Expand window and adjust camera

**Files:**
- Modify: `main.js`
- Modify: `renderer/app.js`

**Step 1: Update window height in `main.js`**

Find:
```js
win = new BrowserWindow({
  width: 200,
  height: 200,
  ...
  y: height - 220,
```

Change to:
```js
win = new BrowserWindow({
  width: 200,
  height: 230,
  ...
  y: height - 250,
```

**Step 2: Update renderer size and camera in `renderer/app.js`**

Find:
```js
renderer.setSize(200, 200);
```
Change to:
```js
renderer.setSize(200, 230);
```

Find:
```js
const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 10);
```
Change to:
```js
// 200x230 viewport → world units: width=200, height=230
// left=-100, right=100, top=115, bottom=-115
const camera = new THREE.OrthographicCamera(-100, 100, 115, -115, 0.1, 10);
```

Find:
```js
const flashGeo = new THREE.PlaneGeometry(200, 200);
```
Change to:
```js
const flashGeo = new THREE.PlaneGeometry(200, 230);
```

Update `renderer/index.html` body style:
```html
html, body { width: 200px; height: 230px; overflow: hidden; background: transparent; }
```

**Step 3: Shift sprite mesh down slightly** to leave room for dots at top

Find:
```js
const sprite = new THREE.Mesh(geometry, material);
scene.add(sprite);
```

Add after:
```js
sprite.position.y = -15;  // shift down 15 units to make room for dots at top
```

**Step 4: Commit**

```bash
cd /Users/garysheng/Documents/github-repos/peonping-repos/peon-ping-avatar && git add main.js renderer/app.js renderer/index.html && git commit -m "feat: expand window to 200x230 for session dot row"
```

---

## Task 6: Add session dots

**Files:**
- Modify: `renderer/app.js`
- Modify: `main.js` (pass session data to renderer via IPC)

### Part A: Track sessions in main process

**Step 1: Add session tracking to `main.js`**

After the `lastTimestamp` variable, add:

```js
// In-memory session tracker: { [sessionId]: lastEventTime }
const sessionActivity = new Map();
const SESSION_PRUNE_MS = 4 * 60 * 60 * 1000;  // 4 hours

function updateSessionActivity(sessionId) {
  sessionActivity.set(sessionId, Date.now());
  // Prune stale sessions
  const cutoff = Date.now() - SESSION_PRUNE_MS;
  for (const [id, t] of sessionActivity) {
    if (t < cutoff) sessionActivity.delete(id);
  }
}
```

**Step 2: Update `startPolling` in `main.js` to call `updateSessionActivity` and also send session data**

Replace the interval callback:

```js
setInterval(() => {
  const state = readStateFile();
  if (!state || !state.last_active) return;

  const { timestamp, event, session_id } = state.last_active;
  if (timestamp === lastTimestamp) return;
  lastTimestamp = timestamp;

  // Track session activity
  if (session_id) updateSessionActivity(session_id);

  // Always send updated session dots (even if no animation fires)
  if (win && !win.isDestroyed()) {
    const now = Date.now();
    const ACTIVE_MS = 30000;
    const sessions = [...sessionActivity.entries()].map(([id, t]) => ({
      id,
      active: (now - t) < ACTIVE_MS,
    }));
    win.webContents.send('session-update', sessions.slice(0, 5));
  }

  const anim = EVENT_TO_ANIM[event];
  if (anim && win && !win.isDestroyed()) {
    win.webContents.send('peon-event', { anim, event });
  }
}, 200);
```

**Step 3: Expose `onSessionUpdate` in `preload.js`**

Add to the `contextBridge.exposeInMainWorld` call:

```js
contextBridge.exposeInMainWorld('peonBridge', {
  onEvent: (callback) => ipcRenderer.on('peon-event', (_e, data) => callback(data)),
  onSessionUpdate: (callback) => ipcRenderer.on('session-update', (_e, data) => callback(data)),
});
```

### Part B: Render dots in renderer

**Step 4: Add dot meshes to `renderer/app.js`**

After the flash setup and before the ANIM_FLASH map, add:

```js
// --- Session dots ---
const MAX_DOTS = 5;
const DOT_SIZE = 10;       // world units
const DOT_GAP = 4;         // world units between dots
const DOT_Y = 105;         // near top of 230-unit viewport (top is +115)

const dotMeshes = [];
const DOT_COLOR_ACTIVE = new THREE.Color(0x44ff44);   // green
const DOT_COLOR_IDLE   = new THREE.Color(0x444444);   // dark grey

for (let i = 0; i < MAX_DOTS; i++) {
  const geo = new THREE.PlaneGeometry(DOT_SIZE, DOT_SIZE);
  const mat = new THREE.MeshBasicMaterial({ color: DOT_COLOR_IDLE, transparent: true, opacity: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = 0.3;
  scene.add(mesh);
  dotMeshes.push(mesh);
}

function updateDots(sessions) {
  const count = Math.min(sessions.length, MAX_DOTS);
  const totalWidth = count * DOT_SIZE + (count - 1) * DOT_GAP;
  const startX = -totalWidth / 2 + DOT_SIZE / 2;

  for (let i = 0; i < MAX_DOTS; i++) {
    const mesh = dotMeshes[i];
    if (i < count) {
      const session = sessions[i];
      mesh.position.x = startX + i * (DOT_SIZE + DOT_GAP);
      mesh.position.y = DOT_Y;
      mesh.material.color = session.active ? DOT_COLOR_ACTIVE : DOT_COLOR_IDLE;
      mesh.material.opacity = 1;
    } else {
      mesh.material.opacity = 0;  // hide unused dots
    }
    mesh.material.needsUpdate = true;
  }
}
```

**Step 5: Wire up the IPC listener in `renderer/app.js`**

After the existing `window.peonBridge.onEvent(...)` call, add:

```js
window.peonBridge.onSessionUpdate((sessions) => {
  updateDots(sessions);
});
```

**Step 6: Commit**

```bash
cd /Users/garysheng/Documents/github-repos/peonping-repos/peon-ping-avatar && git add renderer/app.js main.js preload.js && git commit -m "feat: add per-session activity tracking and status dot row"
```

---

## Task 7: Test end-to-end

**Step 1: Start the app**

```bash
cd /Users/garysheng/Documents/github-repos/peonping-repos/peon-ping-avatar && npm run dev
```

Expected: 200×230px widget in bottom-right. Character is sleeping (row 0 animation). No dots visible yet (no sessions tracked).

**Step 2: Simulate a SessionStart**

```bash
python3 -c "
import json, time, os
f = os.path.expanduser('~/.claude/hooks/peon-ping/.state.json')
state = json.load(open(f))
state['last_active'] = {'session_id': 'test-s1', 'pack': 'peon', 'timestamp': time.time(), 'event': 'SessionStart'}
json.dump(state, open(f, 'w'))
print('fired SessionStart')
"
```

Expected: Character plays waking animation, then returns to sleeping. One green dot appears above.

**Step 3: Simulate a working session**

```bash
python3 -c "
import json, time, os
f = os.path.expanduser('~/.claude/hooks/peon-ping/.state.json')
state = json.load(open(f))
state['last_active'] = {'session_id': 'test-s1', 'pack': 'peon', 'timestamp': time.time(), 'event': 'Stop'}
json.dump(state, open(f, 'w'))
print('fired Stop')
"
```

Expected: Character plays typing animation, gold flash fires. Dot stays green.

**Step 4: Simulate multiple sessions**

```bash
python3 -c "
import json, time, os
f = os.path.expanduser('~/.claude/hooks/peon-ping/.state.json')
for sid in ['s1', 's2', 's3']:
    state = json.load(open(f))
    state['last_active'] = {'session_id': sid, 'pack': 'peon', 'timestamp': time.time(), 'event': 'SessionStart'}
    json.dump(state, open(f, 'w'))
    time.sleep(0.5)
print('fired 3 sessions')
"
```

Expected: 3 green dots appear. After 30s they turn grey. After 30s more with no events, character falls asleep.

**Step 5: Commit final state**

```bash
cd /Users/garysheng/Documents/github-repos/peonping-repos/peon-ping-avatar && git add -A && git commit -m "chore: verify laptop-guy + session dots working end-to-end"
```

---

## Summary of Changes

| File | What changes |
|---|---|
| `scripts/strip-atlas-bg.js` | New — background removal script |
| `renderer/assets/laptop-guy-atlas.png` | Overwritten with RGBA version |
| `renderer/app.js` | New ANIM_CONFIG, event mapping, idle timer, dots, bug fixes |
| `renderer/index.html` | CSP header, height 230 |
| `main.js` | Window 230px, session tracking, session-update IPC |
| `preload.js` | Expose `onSessionUpdate` |
| `package.json` | canvas moved to devDependencies |

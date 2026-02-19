# peon-pet

A macOS desktop pet for [Peon-Ping](https://peonping.com) — an orc that reacts to your Claude Code events with sprite animations. Built on Electron + Three.js.

<video src="docs/demo.mp4" autoplay loop muted playsinline width="400"></video>

Sits in the bottom-left corner of your screen, floats over all windows, and ignores mouse clicks (hover for tooltips).

## Requirements

- macOS (Linux/Windows untested)
- Node.js 18+
- [peon-ping](https://peonping.com) installed and running

## Quick start

```bash
git clone <repo> peon-pet
cd peon-pet
npm install
npm start
```

Check your dock for the Peon-Ping logo — right-click it for controls.

## Install permanently (auto-start at login)

```bash
./install.sh
```

Installs a macOS LaunchAgent that starts peon-pet at login and restarts it if it quits. Logs go to `/tmp/peon-pet.log`.

To remove:

```bash
./uninstall.sh
```

## Dock controls

Right-click the dock icon:

- **Hide Pet** / **Show Pet** — toggle visibility without quitting
- **Quit** — exit completely

## Animations

| Claude Code event | Animation |
|---|---|
| Session start / resume | Waking up (plays once) |
| Prompt submit | Typing |
| Task complete (Stop) | Celebrate |
| Permission request / context compact | Alarmed |
| Tool failure | Annoyed |

The orc stays in typing mode while any session is actively working (event within last 30 s). Returns to sleeping after 30 s of inactivity.

## Session dots

Up to 10 glowing orbs appear above the orc — one per tracked Claude Code session:

- **Bright pulsing green** — active (event within last 30 s)
- **Dim green** — idle (last event 30 s–2 min ago)

Sessions are removed when Claude Code fires `SessionEnd`, or automatically after 10 min of inactivity.

Hover over a dot to see the project folder and status. Hover anywhere on the widget to see all active project names.

## Development

```bash
npm run dev    # starts with DevTools detached
npm test       # runs Jest test suite (63 tests)
```

Simulate an event by writing to the peon-ping state file:

```bash
python3 -c "
import json, time, os, uuid
f = os.path.expanduser('~/.claude/hooks/peon-ping/.state.json')
try: state = json.load(open(f))
except: state = {}
state['last_active'] = {
  'session_id': str(uuid.uuid4()),
  'timestamp': time.time(),
  'event': 'PermissionRequest'
}
json.dump(state, open(f, 'w'))
"
```

Valid events: `SessionStart`, `SessionEnd`, `Stop`, `UserPromptSubmit`, `PermissionRequest`, `PostToolUseFailure`, `PreCompact`

## Sprite atlas

The orc sprite sheet is a 6×6 pixel art atlas (`renderer/assets/orc-sprite-atlas.png`, 3072×3072). Row layout:

| Row | Animation |
|---|---|
| 0 | Sleeping |
| 1 | Waking |
| 2 | Typing |
| 3 | Alarmed |
| 4 | Celebrate |
| 5 | Annoyed |

See `docs/sprite-atlas-prompt.md` for the generation prompt used with image models.

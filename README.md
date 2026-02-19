# peon-pet

A macOS desktop pet for [Peon-Ping](https://peonping.com) — an orc that reacts to your Peon-Ping events with sprite animations. Built on Electron + Three.js.

![orc sleeping in bottom-right corner of screen]

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

The orc appears in the bottom-right corner of your screen, floats over all windows, and ignores mouse clicks. Check your dock for the orc icon — right-click it for controls.

Requires Peon-Ping to be installed and running — peon-pet reads from the Peon-Ping state file to know what's happening.

## Install permanently (auto-start at login)

```bash
./install.sh
```

This installs a macOS LaunchAgent that starts peon-pet at login and restarts it automatically if it quits. Logs go to `/tmp/peon-pet.log`.

To remove:

```bash
./uninstall.sh
```

## Dock controls

Right-click the orc dock icon:

- **Hide Pet** / **Show Pet** — toggle the widget without quitting
- **Quit** — exit completely

## Animations

| Peon-Ping event | Animation |
|---|---|
| Session start | Waking up |
| Prompt submit / task complete | Typing |
| Permission request / tool failure / context limit | Alarmed |

The orc stays in typing mode while any Peon-Ping session is actively working (event within last 30 s). Returns to sleeping after 30 s of inactivity.

## Session dots

Up to 5 glowing orbs appear above the orc — one per tracked Peon-Ping session:

- **Bright pulsing green** — session active (event in last 30 s)
- **Dim green** — session open but idle (last event 30 s–2 min ago)
- **Hidden** — session gone cold

## Development

```bash
npm run dev    # starts with DevTools detached
npm test       # runs Jest test suite (59 tests)
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

Valid events: `SessionStart`, `Stop`, `UserPromptSubmit`, `PermissionRequest`, `PostToolUseFailure`, `PreCompact`

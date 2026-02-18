# peon-ping-avatar

Always-on-top Peon character desktop widget that reacts to peon-ping events with sprite animations and WebGL effects.

## Requirements

- macOS (Linux/Windows untested)
- Node.js 18+
- peon-ping installed: https://peonping.com

## Install

```bash
git clone <repo> peon-ping-avatar
cd peon-ping-avatar
npm install
node scripts/gen-placeholder-atlas.js
```

## Run

```bash
npm start
```

The Peon appears in the bottom-right corner of your screen. It floats over all windows and ignores mouse clicks.

## Real sprite art

See `docs/sprite-art-guide.md` for creating the real Peon pixel art atlas.
Replace `renderer/assets/peon-atlas.png` — no code changes needed.

## Auto-start on login (macOS)

```bash
bash scripts/install-autostart.sh
```

## Events

| peon-ping event | Animation | Effect |
|---|---|---|
| Task complete (Stop) | Celebrate — jump | Gold flash + confetti burst |
| Permission needed (PermissionRequest) | Alarmed — arms up | Red flash |
| Tool error (PostToolUseFailure) | Facepalm — slump | Dark red flash |
| Session start (SessionStart) | Wave | Blue glow |
| Repeated prompts (UserPromptSubmit spam) | Annoyed — arms crossed | Orange flash + screen shake |
| Context limit (PreCompact) | Alarmed — arms up | Red flash |

## Development

```bash
npm run dev
```

Opens with DevTools detached. Simulate events by writing to the state file:

```bash
python3 -c "
import json, time, os
f = os.path.expanduser('~/.claude/hooks/peon-ping/.state.json')
state = json.load(open(f))
state['last_active'] = {'session_id': 'test', 'pack': 'peon', 'timestamp': time.time(), 'event': 'Stop'}
json.dump(state, open(f, 'w'))
"
```

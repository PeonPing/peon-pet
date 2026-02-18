# Laptop Guy + Session Dots — Design

**Date:** 2026-02-18
**Status:** Approved

## Summary

Two additions to peon-ping-avatar:
1. Replace placeholder peon sprite with a laptop-guy pixel art character that sleeps when idle and reacts to peon-ping events
2. Add a row of session status dots above the avatar showing active vs idle Claude Code sessions

---

## Sprite: Laptop Guy

**Atlas file:** `renderer/assets/laptop-guy-atlas.png`
**Source:** AI-generated (Nano Banana Pro), 1264×848px, 6 cols × 4 rows

**Pre-processing required:** The PNG lacks an alpha channel (checkerboard is baked in as pixels). A Python/PIL script strips the checkerboard background and saves a new RGBA PNG.

### Animation Row Mapping

| Row | Animation | Frames | FPS | Loop | Trigger |
|-----|-----------|--------|-----|------|---------|
| 0 | sleeping | 6 | 3 | true | idle (default, after 30s no event) |
| 1 | waking | 6 | 8 | false | `SessionStart` |
| 2 | typing | 6 | 8 | false | `Stop`, `UserPromptSubmit` |
| 3 | alarmed | 6 | 8 | false | `PermissionRequest`, `PostToolUseFailure`, `PreCompact` |

### Event → Animation mapping (updated)

| Raw hook event | Animation |
|---|---|
| `SessionStart` | waking |
| `Stop` | typing |
| `UserPromptSubmit` | typing |
| `PermissionRequest` | alarmed |
| `PostToolUseFailure` | alarmed |
| `PreCompact` | alarmed |
| idle timeout (30s) | sleeping |

### Idle Timeout

An `idleTimer` resets on every event. If 30 seconds pass with no event, `playAnim('sleeping')` is called. This makes the character fall asleep between tasks.

---

## Session Dots

### Data Source

`~/.claude/hooks/peon-ping/.state.json` — already being polled every 200ms. No changes to peon.sh.

### In-Memory Session Tracking

The renderer maintains a `Map<session_id, { lastEventTime: number }>`. On each poll where `last_active.timestamp` changes, update the map entry for that `session_id`. Prune sessions not seen in 4 hours.

A session is **active** (green dot) if its `lastEventTime` is within 30 seconds of now.
A session is **idle** (grey dot) otherwise.

Show up to 5 dots. Sort by most-recently-active first.

### Rendering

A row of `PlaneGeometry` meshes (10×10 world units each, 4 unit gap) centered horizontally, positioned at the top of the scene. Green = `#44ff44`, Grey = `#666666`. Uses `MeshBasicMaterial`, no shader needed.

### Window

Expand from 200×200 to **200×230px**. Dot row occupies top 30px. Avatar occupies remaining 200px.

Reposition window: `y: screenHeight - 250` (was `screenHeight - 220`).

---

## Files Changed

| File | Change |
|---|---|
| `scripts/strip-atlas-bg.js` | New — Node.js/canvas script to remove checkerboard from laptop-guy-atlas.png and write RGBA PNG |
| `renderer/assets/laptop-guy-atlas.png` | Replaced with RGBA version after strip |
| `renderer/app.js` | New ANIM_CONFIG (4 rows), updated EVENT_TO_ANIM, idle timer, session dots rendering |
| `main.js` | Window height 200→230, y position updated |

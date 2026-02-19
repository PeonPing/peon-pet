# Contributing to peon-pet

## Submitting a custom character

Characters are sprite-based. Each character is a folder of PNG assets following the spec below. All submissions are manually reviewed and approved before merging.

### File structure

```
characters/
  your-character-name/
    character.json       ← required: metadata
    sprite-atlas.png     ← required: animation frames
    borders.png          ← optional: decorative frame overlay
    bg.png               ← optional: background texture
    dock-icon.png        ← optional: macOS dock icon
```

---

### `character.json`

```json
{
  "name": "Display Name",
  "slug": "your-character-name",
  "author": "Your Name",
  "website": "https://optional-link.com",
  "version": "1.0.0",
  "description": "Short description of the character."
}
```

---

### `sprite-atlas.png` — the main requirement

A single PNG sprite sheet with **6 columns × 6 rows** of animation frames.

| Spec | Value |
|---|---|
| Format | PNG, RGBA (transparent background) |
| Grid | 6 cols × 6 rows |
| Frame size | 512 × 512 px (atlas = 3072 × 3072) |
| Frame shape | Square — width must equal height |
| Style | Pixel art or illustrated; must be clearly readable at 200×200 px display size |

**Row layout (fixed — do not reorder):**

| Row | Animation | Notes |
|---|---|---|
| 0 | Sleeping | Loops. Character at rest — all 6 frames should form a seamless idle loop. |
| 1 | Waking | Plays once. Transition from asleep to alert. |
| 2 | Typing | Loops while a session is active. Character working at keyboard/desk. |
| 3 | Alarmed | Plays 3× then returns. Reaction to permission requests / context limit. |
| 4 | Celebrate | Plays 3× then returns. Reaction to task completion. |
| 5 | Annoyed | Plays 3× then returns. Reaction to tool failures. |

**Guidelines:**
- The character should be **seated at a desk or workstation** in typing/working frames. Standing-only characters will be rejected.
- All 6 frames per row must be present and non-blank.
- Sleeping row should loop smoothly (frame 6 → frame 1 should not jump).
- Avoid copyrighted character likenesses without permission from the rights holder.

---

### `borders.png` (optional)

A 200 × 200 px PNG overlay drawn on top of the sprite. Used for decorative frames, UI chrome, etc. Must have a transparent background — only the border elements should be opaque.

---

### `bg.png` (optional)

A 200 × 200 px PNG background texture drawn behind the sprite. Replaces the default stone-wall background.

---

### `dock-icon.png` (optional)

A 512 × 512 px PNG shown in the macOS dock when this character is active. Should be recognizable at small sizes (32–64 px). Defaults to the Peon-Ping logo if omitted.

---

## How to submit

1. Fork this repo
2. Add your character folder under `characters/your-character-name/`
3. Open a PR — include at least one screenshot or GIF of the character in action
4. Wait for review — Gary manually approves all characters before merging

PRs that don't meet the spec (wrong grid, non-square frames, missing rows, standing-only character, copyrighted likenesses) will be asked to revise before merging.

---

## Installing a custom character locally

To use a character locally before it's merged:

1. Copy your character folder to:
   ```
   ~/Library/Application Support/Peon Pet/characters/your-character-name/
   ```

2. Create or edit `~/Library/Application Support/Peon Pet/peon-pet-config.json`:
   ```json
   { "character": "your-character-name" }
   ```

3. Restart peon-pet.

To switch back to the default orc:
```json
{ "character": "orc" }
```
Or just delete `peon-pet-config.json`.

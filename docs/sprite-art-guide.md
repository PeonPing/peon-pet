# Peon Sprite Art Guide

## Atlas Spec

- **Dimensions:** 384×384px (can scale up to 768×768 for retina — keep power-of-2)
- **Frame size:** 64×64px (or 128×128 for retina)
- **Layout:** 6 columns × 6 rows
- **Format:** PNG with transparency

## Row Mapping

| Row | Animation | Frames | Notes |
|-----|-----------|--------|-------|
| 0 | idle | 6 | Gentle breathing bob. Loops. |
| 1 | celebrate | 6 | Jump with arms raised. Plays once. |
| 2 | alarmed | 6 | Wave arms overhead. Plays once. |
| 3 | facepalm | 5-6 | Slump/head drop. Plays once. |
| 4 | wave | 6 | Friendly wave. Plays once. |
| 5 | annoyed | 6 | Arms crossed, head shake. Plays once. |

## AI Generation (Recommended for v1)

Use Midjourney or DALL-E with this prompt style:
> "Warcraft 2 peon character, pixel art, 64x64, sprite sheet, 6 frames of idle animation, transparent background, retro game art style, brown skin, loincloth, hunchback posture"

Generate each row separately, then composite into the atlas using Aseprite, Photoshop, or Figma.

## Aseprite Workflow

1. New file: 384×384px
2. Create 6 layers named: idle, celebrate, alarmed, facepalm, wave, annoyed
3. Draw each animation in its row
4. Export as PNG sprite sheet: File → Export Sprite Sheet → rows=6, cols=6

## Swapping Art

Replace `renderer/assets/peon-atlas.png` with real art.
No code changes needed as long as dimensions match the spec above.
If you change frame count for any row, update `ANIM_CONFIG` in `renderer/app.js`.

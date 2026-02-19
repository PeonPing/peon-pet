# Sprite Atlas Generation Prompt

Use with OpenAI DALL-E 3, GPT-4o image generation, or any image model.
Pass the mascot image as a reference image alongside this prompt when possible.

**Mascot reference:** `../../../peonping_x_bot_repos/2026-02-13-16-10-00-peon-multi-ide-celebration.png`

---

## Prompt

```
Pixel art sprite sheet. 6 columns × 6 rows. Each cell is exactly 512×512 pixels.
Total image size: 3072×3072 pixels. No borders, gaps, or labels between cells.

CHARACTER: Muscular green-skinned Warcraft-style orc. Spiked red-brown leather
pauldrons with metal studs on shoulders. Brown leather belt and wrist guards.
Pointed ears. Prominent fangs. Always SEATED behind a dark wooden desk.

FIXED SCENE (identical in every single frame — never changes):
- Dark stone dungeon wall background
- Dark wooden desk in a MIRRORED isometric view: desk recedes toward upper-RIGHT,
  the orc sits on the FAR side (upper area), the near edge of the desk is at
  BOTTOM-RIGHT of the frame. The laptop is on the desk with the screen opening
  toward the LOWER-LEFT. The viewer sees the FRONT of the laptop screen on the left.
- The orc faces toward the LOWER-LEFT (not lower-right)
- Warm torchlight from the right side
- Camera position NEVER moves between rows or frames

ROW 1 — SLEEPING (frames 1-6): Orc dozing at desk.
Frame 1: upright but eyes drooping. Frame 3: eyes closed, head nodding.
Frame 5-6: head fully slumped onto arms on desk, mouth slightly open.
Small "Z", "ZZ", "ZZZ" bubbles floating up from the orc in frames 3-6,
getting larger each frame.

ROW 2 — WAKING (frames 1-6): Orc startled awake.
Frame 1: head down asleep, ZZZ bubble. Frame 3: eyes snapping open, head
jerking up. Frame 6: fully upright, alert, blinking.

ROW 3 — TYPING (frames 1-6): Orc typing on laptop keyboard.
Leaning forward slightly, fingers moving, subtle head movement. Loop-able.

ROW 4 — ALARMED (frames 1-6): Orc shocked.
Frame 1: normal. Frame 2: eyes go wide. Frame 4: lurching backward in chair,
arms up. Frame 6: arms raised, mouth open, alarmed expression.

ROW 5 — CELEBRATE (frames 1-6): Orc celebrating.
Frame 1: normal seated. Frame 3: fist pump, big grin. Frame 5-6: both arms
raised overhead, huge fanged grin, leaning back in triumph.

ROW 6 — ANNOYED (frames 1-6): Orc frustrated.
Frame 1: normal. Frame 2-3: pinching brow, eyes closed, grimacing.
Frame 4-6: full face-palm with one hand, head shaking, slumped in chair.

CRITICAL RULES:
- Desk and laptop are at the EXACT SAME angle in ALL 36 frames
- Camera never moves
- Pixel art style with clean outlines
- Consistent warm color palette throughout
- No text, labels, or UI chrome on the image — only the ZZZ sleep bubbles in row 1
```

---

## Notes / Iteration Log

- **2026-02-18**: Initial prompt drafted. Key insight — must be explicit about 3072×3072 total
  and 512×512 per cell upfront. "CRITICAL RULES" section needs to be dead simple.
- **2026-02-18**: Added ZZZ sleep bubbles to ROW 1 (floating, growing Z, ZZ, ZZZ in frames 3-6).
- Nano Banana Pro (Gemini 3 Pro) tends to output wrong column counts (8 instead of 6).
  OpenAI may handle the exact grid dimensions better.
- Always pass mascot reference image for character consistency.

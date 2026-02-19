'use strict';

const ATLAS_COLS = 6;
const ATLAS_ROWS = 6;

const ANIM_CONFIG = {
  sleeping:  { row: 0, frames: 6, fps: 3,  loop: true  },
  waking:    { row: 1, frames: 6, fps: 8,  loop: false },
  typing:    { row: 2, frames: 6, fps: 8,  loop: false },
  alarmed:   { row: 3, frames: 6, fps: 8,  loop: false },
  celebrate: { row: 4, frames: 6, fps: 8,  loop: false },
  annoyed:   { row: 5, frames: 6, fps: 8,  loop: false },
};

/**
 * Compute UV coordinates for a given animation frame.
 * Matches the Three.js convention: v=0 is bottom, v=1 is top.
 *
 * Returns { u0, u1, v0, v1 } where:
 *   TL = (u0, v1), TR = (u1, v1), BL = (u0, v0), BR = (u1, v0)
 */
function computeUVs(animName, frame) {
  const { row } = ANIM_CONFIG[animName];
  const u0 = frame / ATLAS_COLS;
  const u1 = (frame + 1) / ATLAS_COLS;
  const v0 = (ATLAS_ROWS - 1 - row) / ATLAS_ROWS;  // bottom of this row
  const v1 = (ATLAS_ROWS - row) / ATLAS_ROWS;       // top of this row
  return { u0, u1, v0, v1 };
}

module.exports = { ANIM_CONFIG, computeUVs, ATLAS_COLS, ATLAS_ROWS };

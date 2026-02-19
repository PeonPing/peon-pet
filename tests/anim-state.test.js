'use strict';

const {
  ANIM_CONFIG,
  computeUVs,
  ATLAS_COLS,
  ATLAS_ROWS,
} = require('../lib/anim-state');

// ─── ANIM_CONFIG ──────────────────────────────────────────────────────────────

describe('ANIM_CONFIG', () => {
  test('sleeping is defined', () => {
    expect(ANIM_CONFIG.sleeping).toBeDefined();
  });

  test('waking is defined', () => {
    expect(ANIM_CONFIG.waking).toBeDefined();
  });

  test('typing is defined', () => {
    expect(ANIM_CONFIG.typing).toBeDefined();
  });

  test('alarmed is defined', () => {
    expect(ANIM_CONFIG.alarmed).toBeDefined();
  });

  test('sleeping has 6 frames', () => {
    expect(ANIM_CONFIG.sleeping.frames).toBe(6);
  });

  test('sleeping loops', () => {
    expect(ANIM_CONFIG.sleeping.loop).toBe(true);
  });

  test('waking does not loop', () => {
    expect(ANIM_CONFIG.waking.loop).toBe(false);
  });

  test('typing does not loop', () => {
    expect(ANIM_CONFIG.typing.loop).toBe(false);
  });

  test('alarmed does not loop', () => {
    expect(ANIM_CONFIG.alarmed.loop).toBe(false);
  });

  test('each anim has row, frames, fps, loop', () => {
    for (const [name, cfg] of Object.entries(ANIM_CONFIG)) {
      expect(typeof cfg.row).toBe('number',   `${name}.row must be a number`);
      expect(typeof cfg.frames).toBe('number', `${name}.frames must be a number`);
      expect(typeof cfg.fps).toBe('number',   `${name}.fps must be a number`);
      expect(typeof cfg.loop).toBe('boolean', `${name}.loop must be a boolean`);
    }
  });

  test('row values are within atlas bounds', () => {
    for (const [name, cfg] of Object.entries(ANIM_CONFIG)) {
      expect(cfg.row).toBeGreaterThanOrEqual(0);
      expect(cfg.row).toBeLessThan(ATLAS_ROWS);
    }
  });

  test('frame counts do not exceed atlas column count', () => {
    for (const [name, cfg] of Object.entries(ANIM_CONFIG)) {
      expect(cfg.frames).toBeLessThanOrEqual(ATLAS_COLS);
    }
  });
});

// ─── computeUVs ───────────────────────────────────────────────────────────────

describe('computeUVs', () => {
  test('returns object with u0, u1, v0, v1', () => {
    const uv = computeUVs('sleeping', 0);
    expect(uv).toHaveProperty('u0');
    expect(uv).toHaveProperty('u1');
    expect(uv).toHaveProperty('v0');
    expect(uv).toHaveProperty('v1');
  });

  test('first frame of sleeping: u0=0, u1=1/6', () => {
    const uv = computeUVs('sleeping', 0);
    expect(uv.u0).toBeCloseTo(0);
    expect(uv.u1).toBeCloseTo(1 / ATLAS_COLS);
  });

  test('second frame of sleeping: u0=1/6, u1=2/6', () => {
    const uv = computeUVs('sleeping', 1);
    expect(uv.u0).toBeCloseTo(1 / ATLAS_COLS);
    expect(uv.u1).toBeCloseTo(2 / ATLAS_COLS);
  });

  test('last frame of sleeping: u0=5/6, u1=1', () => {
    const uv = computeUVs('sleeping', 5);
    expect(uv.u0).toBeCloseTo(5 / ATLAS_COLS);
    expect(uv.u1).toBeCloseTo(6 / ATLAS_COLS);
  });

  test('sleeping row=0: v covers top of atlas (Three.js v goes bottom→top)', () => {
    // row 0 → v0=(rows-1-0)/rows, v1=(rows-0)/rows
    const uv = computeUVs('sleeping', 0);
    const expectedV0 = (ATLAS_ROWS - 1) / ATLAS_ROWS;
    const expectedV1 = ATLAS_ROWS / ATLAS_ROWS;
    expect(uv.v0).toBeCloseTo(expectedV0);
    expect(uv.v1).toBeCloseTo(expectedV1);
  });

  test('waking row=1: v range is one row below sleeping', () => {
    const uv = computeUVs('waking', 0);
    const expectedV0 = (ATLAS_ROWS - 2) / ATLAS_ROWS;
    const expectedV1 = (ATLAS_ROWS - 1) / ATLAS_ROWS;
    expect(uv.v0).toBeCloseTo(expectedV0);
    expect(uv.v1).toBeCloseTo(expectedV1);
  });

  test('u0 < u1 for any valid frame', () => {
    for (const [name, cfg] of Object.entries(ANIM_CONFIG)) {
      for (let f = 0; f < cfg.frames; f++) {
        const uv = computeUVs(name, f);
        expect(uv.u0).toBeLessThan(uv.u1);
      }
    }
  });

  test('v0 < v1 for any valid anim', () => {
    for (const name of Object.keys(ANIM_CONFIG)) {
      const uv = computeUVs(name, 0);
      expect(uv.v0).toBeLessThan(uv.v1);
    }
  });

  test('UV values are in [0, 1]', () => {
    for (const [name, cfg] of Object.entries(ANIM_CONFIG)) {
      for (let f = 0; f < cfg.frames; f++) {
        const { u0, u1, v0, v1 } = computeUVs(name, f);
        expect(u0).toBeGreaterThanOrEqual(0);
        expect(u1).toBeLessThanOrEqual(1);
        expect(v0).toBeGreaterThanOrEqual(0);
        expect(v1).toBeLessThanOrEqual(1);
      }
    }
  });
});

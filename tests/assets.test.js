'use strict';
const fs   = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '../renderer/assets');

describe('required asset files', () => {
  test('orc-sprite-atlas.png exists', () => {
    expect(fs.existsSync(path.join(ASSETS, 'orc-sprite-atlas.png'))).toBe(true);
  });

  test('orc-dock-icon.png exists', () => {
    expect(fs.existsSync(path.join(ASSETS, 'orc-dock-icon.png'))).toBe(true);
  });

  test('orc-dock-icon.png is a valid PNG (starts with PNG magic bytes)', () => {
    const buf = fs.readFileSync(path.join(ASSETS, 'orc-dock-icon.png'));
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4E);
    expect(buf[3]).toBe(0x47);
  });

  test('orc-dock-icon.png is at least 10 KB', () => {
    const { size } = fs.statSync(path.join(ASSETS, 'orc-dock-icon.png'));
    expect(size).toBeGreaterThan(10_000);
  });

  test('bg-pixel.png exists', () => {
    expect(fs.existsSync(path.join(ASSETS, 'bg-pixel.png'))).toBe(true);
  });

  test('orc-borders.png exists', () => {
    expect(fs.existsSync(path.join(ASSETS, 'orc-borders.png'))).toBe(true);
  });
});

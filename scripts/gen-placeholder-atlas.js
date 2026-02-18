// Generates a placeholder peon-atlas.png for development.
// 6 rows (animations) × 6 frames × 64×64px per frame = 384×384px total.
// Replace renderer/assets/peon-atlas.png with real pixel art when ready.

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const FRAME_SIZE = 64;
const COLS = 6;
const ROWS = 6;

const ROW_COLORS = [
  '#4a7c4e', // idle      - green
  '#f0c040', // celebrate - gold
  '#e05050', // alarmed   - red
  '#8855cc', // facepalm  - purple
  '#40a0e0', // wave      - blue
  '#e08030', // annoyed   - orange
];

const ROW_LABELS = [
  'idle', 'celebrate', 'alarmed', 'facepalm', 'wave', 'annoyed'
];

const canvas = createCanvas(FRAME_SIZE * COLS, FRAME_SIZE * ROWS);
const ctx = canvas.getContext('2d');

for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const x = col * FRAME_SIZE;
    const y = row * FRAME_SIZE;

    // Background
    ctx.fillStyle = ROW_COLORS[row];
    ctx.fillRect(x + 2, y + 2, FRAME_SIZE - 4, FRAME_SIZE - 4);

    // Frame number indicator (brightness varies per frame to show animation)
    const brightness = 0.5 + (col / COLS) * 0.5;
    ctx.globalAlpha = brightness;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 8, y + 8, FRAME_SIZE - 16, FRAME_SIZE - 16);
    ctx.globalAlpha = 1;

    // Draw a simple peon silhouette (head + body rectangle)
    ctx.fillStyle = '#2a1810';
    // Head
    ctx.fillRect(x + 22, y + 10, 20, 16);
    // Body
    ctx.fillRect(x + 18, y + 26, 28, 20);
    // Legs (shift per frame for walk cycle illusion)
    const legShift = (col % 2 === 0) ? 0 : 4;
    ctx.fillRect(x + 20, y + 46, 8, 12 - legShift);
    ctx.fillRect(x + 36, y + 46, 8, 12 + legShift);

    // Label
    ctx.fillStyle = '#000000';
    ctx.font = '8px monospace';
    ctx.fillText(ROW_LABELS[row][0] + col, x + 4, y + FRAME_SIZE - 4);
  }
}

const outPath = path.join(__dirname, '../renderer/assets/peon-atlas.png');
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync(outPath, buffer);
console.log(`Generated ${outPath} (${FRAME_SIZE * COLS}x${FRAME_SIZE * ROWS}px)`);

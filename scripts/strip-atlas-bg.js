// Strips the AI-generated checkerboard background from laptop-guy-atlas.png
// and writes a new RGBA PNG with true transparency.

const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const INPUT  = path.join(__dirname, '../renderer/assets/laptop-guy-atlas.png');
const OUTPUT = INPUT;

const TOLERANCE = 30;

async function main() {
  const img = await loadImage(INPUT);
  const { width, height } = img;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, width, height);
  const px = data.data;

  // Sample top-left 30x30 region for most common colors (background)
  const colorCounts = new Map();
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 30; x++) {
      const i = (y * width + x) * 4;
      const key = `${Math.round(px[i]/10)*10},${Math.round(px[i+1]/10)*10},${Math.round(px[i+2]/10)*10}`;
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }
  }

  const sorted = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]);
  const bgColors = sorted.slice(0, 2).map(([key]) => key.split(',').map(Number));
  console.log('Detected background colors:', bgColors);

  function isBackground(r, g, b) {
    return bgColors.some(([br, bg, bb]) =>
      Math.abs(r - br) < TOLERANCE &&
      Math.abs(g - bg) < TOLERANCE &&
      Math.abs(b - bb) < TOLERANCE
    );
  }

  let replaced = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (isBackground(px[i], px[i+1], px[i+2])) {
      px[i+3] = 0;
      replaced++;
    }
  }

  ctx.putImageData(data, 0, 0);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(OUTPUT, buffer);

  const total = width * height;
  console.log(`Replaced ${replaced}/${total} pixels (${Math.round(replaced/total*100)}%)`);
  console.log(`Saved RGBA PNG: ${OUTPUT} (${width}x${height})`);
}

main().catch(console.error);

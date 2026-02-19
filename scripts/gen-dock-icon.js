// Generates orc-dock-icon.png from frame 0, row 0 of orc-sprite-atlas.png.
// Atlas: 6 columns × 6 rows. Crops the top-left cell (sleeping orc) and scales to 256×256px.

const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const ATLAS_COLS = 6;
const ATLAS_ROWS = 6;
const OUT_SIZE = 256;

const atlasPath = path.join(__dirname, '../renderer/assets/orc-sprite-atlas.png');
const outPath = path.join(__dirname, '../renderer/assets/orc-dock-icon.png');

(async () => {
  const img = await loadImage(atlasPath);

  const cellW = img.width / ATLAS_COLS;
  const cellH = img.height / ATLAS_ROWS;

  // Frame 0, row 0 — source x=0, y=0
  const srcX = 0;
  const srcY = 0;

  const canvas = createCanvas(OUT_SIZE, OUT_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(img, srcX, srcY, cellW, cellH, 0, 0, OUT_SIZE, OUT_SIZE);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outPath, buffer);
  console.log(`Wrote ${outPath}`);
})();

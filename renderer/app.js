import * as THREE from '../node_modules/three/build/three.module.js';

// --- Config ---
const ATLAS_COLS = 6;
const ATLAS_ROWS = 6;

const ANIM_CONFIG = {
  idle:      { row: 0, frames: 6, fps: 4,  loop: true  },
  celebrate: { row: 1, frames: 6, fps: 8,  loop: false },
  alarmed:   { row: 2, frames: 6, fps: 8,  loop: false },
  facepalm:  { row: 3, frames: 5, fps: 6,  loop: false },
  wave:      { row: 4, frames: 6, fps: 6,  loop: false },
  annoyed:   { row: 5, frames: 6, fps: 6,  loop: false },
};

// --- Scene setup ---
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: false,
});
renderer.setSize(200, 200);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();

const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 10);
camera.position.z = 1;

// --- Sprite mesh ---
const loader = new THREE.TextureLoader();
const atlas = loader.load('./assets/peon-atlas.png', () => {
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.NearestFilter;
  atlas.generateMipmaps = false;
});

atlas.repeat.set(1 / ATLAS_COLS, 1 / ATLAS_ROWS);

const geometry = new THREE.PlaneGeometry(160, 160);
const material = new THREE.MeshBasicMaterial({
  map: atlas,
  transparent: true,
  alphaTest: 0.01,
});
const sprite = new THREE.Mesh(geometry, material);
scene.add(sprite);

// --- Flash overlay ---
async function loadShader(url) {
  const r = await fetch(url);
  return r.text();
}

let flashMesh = null;
let flashIntensity = 0;
const flashColor = new THREE.Color(1, 1, 0);
let flashDecay = 2.0;

async function setupFlash() {
  const vert = await loadShader('./shaders/flash.vert');
  const frag = await loadShader('./shaders/flash.frag');

  const flashMat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      flashColor: { value: flashColor },
      flashIntensity: { value: 0.0 },
    },
    transparent: true,
    depthTest: false,
  });

  const flashGeo = new THREE.PlaneGeometry(200, 200);
  flashMesh = new THREE.Mesh(flashGeo, flashMat);
  flashMesh.position.z = 0.5;
  scene.add(flashMesh);
}

setupFlash();

function triggerFlash(r, g, b, intensity = 0.6, decay = 3.0) {
  if (!flashMesh) return;
  flashColor.setRGB(r, g, b);
  flashMesh.material.uniforms.flashColor.value = flashColor;
  flashIntensity = intensity;
  flashDecay = decay;
}

const ANIM_FLASH = {
  celebrate: () => triggerFlash(1.0, 0.8, 0.0, 0.5, 2.5),
  alarmed:   () => triggerFlash(1.0, 0.1, 0.1, 0.4, 3.0),
  facepalm:  () => triggerFlash(0.8, 0.0, 0.0, 0.5, 2.0),
  wave:      () => triggerFlash(0.4, 0.8, 1.0, 0.3, 2.0),
  annoyed:   () => triggerFlash(1.0, 0.4, 0.0, 0.4, 3.0),
};

// --- Animation state machine ---
let currentAnim = 'idle';
let currentFrame = 0;
let frameTimer = 0;

function setFrame(animName, frame) {
  const { row } = ANIM_CONFIG[animName];
  atlas.offset.set(
    frame / ATLAS_COLS,
    (ATLAS_ROWS - 1 - row) / ATLAS_ROWS
  );
}

function playAnim(animName) {
  if (!ANIM_CONFIG[animName]) return;
  currentAnim = animName;
  currentFrame = 0;
  frameTimer = 0;
  setFrame(animName, 0);
  if (ANIM_FLASH[animName]) {
    ANIM_FLASH[animName]();
  }
}

playAnim('idle');

// --- IPC events ---
window.peonBridge.onEvent(({ anim }) => {
  playAnim(anim);
});

// --- Render loop ---
let lastTime = 0;
function animate(time) {
  requestAnimationFrame(animate);
  const delta = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;

  // Decay flash
  if (flashMesh && flashIntensity > 0) {
    flashIntensity = Math.max(0, flashIntensity - delta * flashDecay);
    flashMesh.material.uniforms.flashIntensity.value = flashIntensity;
  }

  // Advance animation frame
  const cfg = ANIM_CONFIG[currentAnim];
  frameTimer += delta;
  if (frameTimer >= 1 / cfg.fps) {
    frameTimer = 0;
    currentFrame++;
    if (currentFrame >= cfg.frames) {
      if (cfg.loop) {
        currentFrame = 0;
      } else {
        currentFrame = cfg.frames - 1;
        setTimeout(() => playAnim('idle'), 300);
      }
    }
    setFrame(currentAnim, currentFrame);
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

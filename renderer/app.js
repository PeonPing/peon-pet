import * as THREE from '../node_modules/three/build/three.module.js';

// --- Config ---
const ATLAS_COLS = 6;
const ATLAS_ROWS = 4;

const ANIM_CONFIG = {
  sleeping: { row: 0, frames: 6, fps: 3,  loop: true  },
  waking:   { row: 1, frames: 6, fps: 8,  loop: false },
  typing:   { row: 2, frames: 6, fps: 8,  loop: false },
  alarmed:  { row: 3, frames: 6, fps: 8,  loop: false },
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
const atlas = loader.load('./assets/laptop-guy-atlas.png', () => {
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

// --- Particle burst ---
const PARTICLE_COUNT = 30;
const particlePositions = new Float32Array(PARTICLE_COUNT * 3);
const particleColors = new Float32Array(PARTICLE_COUNT * 3);
const particleVelocities = new Array(PARTICLE_COUNT);

const particleGeo = new THREE.BufferGeometry();
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

const particleMat = new THREE.PointsMaterial({
  size: 6,
  vertexColors: true,
  transparent: true,
  opacity: 1.0,
  depthTest: false,
  sizeAttenuation: false,
});

const particles = new THREE.Points(particleGeo, particleMat);
particles.visible = false;
particles.position.z = 0.8;
scene.add(particles);

let particleLifetime = 0;
const PARTICLE_DURATION = 1.2;

function burstParticles() {
  particleLifetime = PARTICLE_DURATION;
  particles.visible = true;
  particleMat.opacity = 1.0;

  const goldColors = [
    [1.0, 0.85, 0.0],
    [1.0, 1.0,  0.4],
    [0.9, 0.6,  0.1],
  ];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particlePositions[i * 3]     = (Math.random() - 0.5) * 40;
    particlePositions[i * 3 + 1] = -40 + (Math.random() - 0.5) * 20;
    particlePositions[i * 3 + 2] = 0;

    const angle = (Math.random() * Math.PI) - Math.PI / 2;
    const speed = 40 + Math.random() * 80;
    particleVelocities[i] = {
      x: Math.cos(angle) * speed,
      vy: Math.abs(Math.sin(angle)) * speed + 20,
      gravity: -60 - Math.random() * 40,
    };

    const c = goldColors[Math.floor(Math.random() * goldColors.length)];
    particleColors[i * 3]     = c[0];
    particleColors[i * 3 + 1] = c[1];
    particleColors[i * 3 + 2] = c[2];
  }

  particleGeo.attributes.position.needsUpdate = true;
  particleGeo.attributes.color.needsUpdate = true;
}

// --- Screen shake ---
let shakeIntensity = 0;
const SHAKE_DECAY = 8.0;

function triggerShake(intensity = 12) {
  shakeIntensity = intensity;
}

// --- ANIM_FLASH map ---
const ANIM_FLASH = {
  waking:  () => triggerFlash(0.4, 0.8, 1.0, 0.3, 2.0),
  typing:  () => triggerFlash(1.0, 0.8, 0.0, 0.3, 2.0),
  alarmed: () => triggerFlash(1.0, 0.1, 0.1, 0.5, 2.5),
};

// --- Animation state machine ---
let currentAnim = 'idle';
let currentFrame = 0;
let frameTimer = 0;
let pendingIdle = false;
let idleTimer = null;
const IDLE_TIMEOUT_MS = 30000;

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    playAnim('sleeping');
  }, IDLE_TIMEOUT_MS);
}

function setFrame(animName, frame) {
  const { row } = ANIM_CONFIG[animName];
  atlas.offset.set(
    frame / ATLAS_COLS,
    (ATLAS_ROWS - 1 - row) / ATLAS_ROWS
  );
}

function playAnim(animName) {
  pendingIdle = false;
  if (!ANIM_CONFIG[animName]) return;
  currentAnim = animName;
  currentFrame = 0;
  frameTimer = 0;
  setFrame(animName, 0);
  if (ANIM_FLASH[animName]) {
    ANIM_FLASH[animName]();
  }
  if (animName !== 'sleeping') {
    resetIdleTimer();
  }
}

playAnim('sleeping');

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

  // Update particles
  if (particleLifetime > 0) {
    particleLifetime -= delta;
    particleMat.opacity = Math.max(0, particleLifetime / PARTICLE_DURATION);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const v = particleVelocities[i];
      if (!v) continue;
      particlePositions[i * 3]     += v.x * delta;
      particlePositions[i * 3 + 1] += v.vy * delta;
      v.vy += v.gravity * delta;
    }
    particleGeo.attributes.position.needsUpdate = true;

    if (particleLifetime <= 0) {
      particles.visible = false;
    }
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
        if (!pendingIdle) {
          pendingIdle = true;
          setTimeout(() => {
            pendingIdle = false;
            playAnim('sleeping');
          }, 300);
        }
      }
    }
    setFrame(currentAnim, currentFrame);
  }

  // Screen shake
  if (shakeIntensity > 0) {
    shakeIntensity = Math.max(0, shakeIntensity - SHAKE_DECAY * delta);
    sprite.position.x = (Math.random() - 0.5) * shakeIntensity;
    sprite.position.y = (Math.random() - 0.5) * shakeIntensity;
  } else {
    sprite.position.x = 0;
    sprite.position.y = 0;
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

import * as THREE from '../node_modules/three/build/three.module.js';

// --- Config ---
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

// --- Background ---
const bgTex = new THREE.TextureLoader().load('./assets/bg-pixel.png');
const bgMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(180, 180),
  new THREE.MeshBasicMaterial({ map: bgTex, color: 0x888888 })
);
bgMesh.position.z = -0.5;
scene.add(bgMesh);

// --- Sprite mesh ---
const loader = new THREE.TextureLoader();
const atlas = loader.load('./assets/orc-sprite-atlas.png', () => {
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.NearestFilter;
  atlas.generateMipmaps = false;
  atlas.needsUpdate = true;
});

// Square sprite — fills most of the 200×200 window
const geometry = new THREE.PlaneGeometry(180, 180);
const material = new THREE.MeshBasicMaterial({
  map: atlas,
  transparent: true,
  alphaTest: 0.01,
});
const sprite = new THREE.Mesh(geometry, material);
scene.add(sprite);
sprite.position.y = 0;

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

// --- Border overlay ---
const borderTex = loader.load('./assets/orc-borders.png', () => {
  borderTex.magFilter = THREE.NearestFilter;
  borderTex.minFilter = THREE.NearestFilter;
  borderTex.needsUpdate = true;
});
const borderMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshBasicMaterial({ map: borderTex, transparent: true, depthTest: false })
);
borderMesh.position.z = 0.4;
scene.add(borderMesh);

// --- Session dots (glowing orbs) ---
const MAX_DOTS = 5;
const DOT_SIZE = 12;
const DOT_GAP  = 6;
const DOT_Y    = 88;

const DOT_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const DOT_FRAG = `
  uniform vec3  dotColor;
  uniform float pulse;   // 0..1 animated for active, 0 for idle
  uniform float visible; // 0 or 1
  varying vec2 vUv;
  void main() {
    if (visible < 0.5) discard;
    vec2  c    = vUv - 0.5;
    float dist = length(c);
    // Soft core
    float core = 1.0 - smoothstep(0.20, 0.32, dist);
    // Outer glow ring — only for active
    float glow = (1.0 - smoothstep(0.32, 0.50, dist)) * pulse * 0.6;
    float alpha = core + glow;
    if (alpha < 0.01) discard;
    vec3 col = dotColor + dotColor * pulse * 0.5;
    gl_FragColor = vec4(col, alpha);
  }
`;

const dotMeshes = [];
const dotStates = [];  // { active: bool }

for (let i = 0; i < MAX_DOTS; i++) {
  const mat = new THREE.ShaderMaterial({
    vertexShader:   DOT_VERT,
    fragmentShader: DOT_FRAG,
    uniforms: {
      dotColor: { value: new THREE.Color(0x666666) },
      pulse:    { value: 0.0 },
      visible:  { value: 0.0 },
    },
    transparent: true,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(DOT_SIZE, DOT_SIZE), mat);
  mesh.position.z = 0.6;
  scene.add(mesh);
  dotMeshes.push(mesh);
  dotStates.push({ active: false });
}

function updateDots(sessions) {
  const count = Math.min(sessions.length, MAX_DOTS);
  const totalWidth = count * DOT_SIZE + Math.max(0, count - 1) * DOT_GAP;
  const startX = -totalWidth / 2 + DOT_SIZE / 2;

  for (let i = 0; i < MAX_DOTS; i++) {
    const mesh = dotMeshes[i];
    const u    = mesh.material.uniforms;
    if (i < count) {
      const { hot, warm } = sessions[i];
      dotStates[i].active = hot;
      mesh.position.x = startX + i * (DOT_SIZE + DOT_GAP);
      mesh.position.y = DOT_Y;
      // hot = bright green pulsing, warm = dim green static, else grey
      u.dotColor.value.set(hot ? 0x44ff44 : warm ? 0x1a4d1a : 0x333333);
      u.visible.value = 1.0;
    } else {
      dotStates[i].active = false;
      u.visible.value = 0.0;
    }
  }
}

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
let remainingLoops = 0;  // extra replays for non-sleeping anims
const REACTION_LOOPS = 3;  // play reaction animations 3x before sleeping
let idleTimer = null;
const IDLE_TIMEOUT_MS = 30000;

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!anySessionActive) playAnim('sleeping');
  }, IDLE_TIMEOUT_MS);
}

function setFrame(animName, frame) {
  const { row } = ANIM_CONFIG[animName];
  // UV coords: u left→right, v bottom=0/top=1 (Three.js convention)
  const u0 = frame / ATLAS_COLS;
  const u1 = (frame + 1) / ATLAS_COLS;
  const v0 = (ATLAS_ROWS - 1 - row) / ATLAS_ROWS;  // bottom of this row
  const v1 = (ATLAS_ROWS - row) / ATLAS_ROWS;       // top of this row
  // PlaneGeometry vertex UV order: [0]=TL, [1]=TR, [2]=BL, [3]=BR
  const uv = geometry.attributes.uv;
  uv.setXY(0, u0, v1); // TL
  uv.setXY(1, u1, v1); // TR
  uv.setXY(2, u0, v0); // BL
  uv.setXY(3, u1, v0); // BR
  uv.needsUpdate = true;
}

function playAnim(animName) {
  pendingIdle = false;
  if (!ANIM_CONFIG[animName]) return;
  currentAnim = animName;
  currentFrame = 0;
  frameTimer = 0;
  remainingLoops = (animName !== 'sleeping') ? REACTION_LOOPS - 1 : 0;
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
let anySessionActive = false;

window.peonBridge.onEvent(({ anim }) => {
  playAnim(anim);
});

window.peonBridge.onSessionUpdate(({ sessions }) => {
  updateDots(sessions);
  const wasActive = anySessionActive;
  anySessionActive = sessions.some(s => s.hot);
  // If a session just became hot and orc is sleeping, wake him to typing
  if (anySessionActive && !wasActive && currentAnim === 'sleeping') {
    playAnim('typing');
  }
});

// --- Render loop ---
let lastTime = 0;
function animate(time) {
  requestAnimationFrame(animate);
  const delta = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;

  // Animate dot pulse
  for (let i = 0; i < MAX_DOTS; i++) {
    if (dotStates[i].active) {
      dotMeshes[i].material.uniforms.pulse.value = (Math.sin(time * 0.003 + i) + 1) / 2;
    } else {
      dotMeshes[i].material.uniforms.pulse.value = 0.0;
    }
  }

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
        if (remainingLoops > 0) {
          remainingLoops--;
          currentFrame = 0;
        } else {
          currentFrame = cfg.frames - 1;
          if (!pendingIdle) {
            pendingIdle = true;
            setTimeout(() => {
              pendingIdle = false;
              // Keep typing if any session is still hot
              if (anySessionActive) {
                playAnim('typing');
              } else {
                playAnim('sleeping');
              }
            }, 300);
          }
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

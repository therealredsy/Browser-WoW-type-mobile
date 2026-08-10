/**
 * Azeroth Lite — Lightweight WoW-style 3D Browser RPG
 * Runs fully client-side in mobile browsers (Android Chrome / Safari)
 * Uses Three.js + optional GLTFLoader for real character models
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ===================== CONFIG =====================
const CONFIG = {
  worldSize: 120,
  playerSpeed: 8,
  playerSprintMult: 1.55,
  jumpForce: 9,
  gravity: 22,
  cameraDistance: 7,
  cameraHeight: 3.2,
  cameraLerp: 0.12,
  attackRange: 2.8,
  attackCooldown: 0.55,
  enemySpawnCount: 14,
  respawnTime: 4,
};

// ===================== STATE =====================
const state = {
  player: null,
  enemies: [],
  projectiles: [],
  particles: [],
  keys: {},
  mouse: { x: 0, y: 0, locked: false },
  cameraYaw: 0,
  cameraPitch: 0.35,
  target: null,
  gold: 0,
  kills: 0,
  isPaused: false,
  isDead: false,
  clock: new THREE.Clock(),
  delta: 0,
  joystick: { active: false, x: 0, y: 0 },
  touchLook: { active: false, startX: 0, startY: 0, yaw: 0, pitch: 0 },
};

// ===================== SCENE =====================
let scene, camera, renderer, clock;
let ground, ambient, sun;
let playerMesh, playerMixer = null;
let minimapCtx;

const loader = new GLTFLoader();

// ===================== INIT =====================
async function init() {
  const progress = document.getElementById('progress-fill');
  const loadingText = document.getElementById('loading-text');

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  progress.style.width = '15%';
  loadingText.textContent = 'Creating world...';

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b8d8);
  scene.fog = new THREE.Fog(0x87b8d8, 40, 110);

  // Camera
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 8, 12);

  // Lights
  ambient = new THREE.AmbientLight(0xb0c4de, 0.55);
  scene.add(ambient);

  sun = new THREE.DirectionalLight(0xfff4e0, 1.15);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  sun.shadow.bias = -0.001;
  scene.add(sun);

  // Hemisphere for nicer ambient
  const hemi = new THREE.HemisphereLight(0x87b8d8, 0x3a5a2a, 0.35);
  scene.add(hemi);

  progress.style.width = '30%';
  loadingText.textContent = 'Building terrain...';

  createTerrain();
  createDecor();

  progress.style.width = '50%';
  loadingText.textContent = 'Summoning hero...';

  await createPlayer();

  progress.style.width = '70%';
  loadingText.textContent = 'Spawning monsters...';

  spawnEnemies();

  progress.style.width = '85%';
  loadingText.textContent = 'Binding controls...';

  setupInput();
  setupUI();
  setupMinimap();

  progress.style.width = '100%';
  loadingText.textContent = 'Enter the realm!';

  await sleep(400);
  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');

  // Start loop
  animate();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ===================== TERRAIN & DECOR =====================
function createTerrain() {
  // Ground plane with subtle color variation via vertex colors
  const size = CONFIG.worldSize;
  const geo = new THREE.PlaneGeometry(size, size, 48, 48);
  const pos = geo.attributes.position;
  const colors = [];
  const color = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // gentle height noise
    const h = Math.sin(x * 0.08) * Math.cos(y * 0.07) * 0.6 +
              Math.sin(x * 0.15 + 1.3) * 0.25;
    pos.setZ(i, h);

    // grass color variation
    const t = (Math.sin(x * 0.1) + Math.cos(y * 0.12) + 2) / 4;
    color.setHSL(0.28 + t * 0.05, 0.45 + t * 0.15, 0.32 + t * 0.08);
    colors.push(color.r, color.g, color.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.05,
  });
  ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Invisible collision plane at y=0 (approx)
  // We sample height later
}

function getGroundHeight(x, z) {
  // Match the terrain formula
  return Math.sin(x * 0.08) * Math.cos(z * 0.07) * 0.6 +
         Math.sin(x * 0.15 + 1.3) * 0.25;
}

function createDecor() {
  // Trees (low poly stylized)
  const treeCount = 55;
  for (let i = 0; i < treeCount; i++) {
    const x = (Math.random() - 0.5) * (CONFIG.worldSize - 10);
    const z = (Math.random() - 0.5) * (CONFIG.worldSize - 10);
    if (Math.abs(x) < 8 && Math.abs(z) < 8) continue; // keep spawn clear
    createTree(x, z);
  }

  // Rocks
  for (let i = 0; i < 25; i++) {
    const x = (Math.random() - 0.5) * (CONFIG.worldSize - 8);
    const z = (Math.random() - 0.5) * (CONFIG.worldSize - 8);
    createRock(x, z);
  }

  // Simple ruins / pillars near center
  createRuins();
}

function createTree(x, z) {
  const group = new THREE.Group();
  const y = getGroundHeight(x, z);

  // Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1.6, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.8;
  trunk.castShadow = true;
  group.add(trunk);

  // Foliage layers
  const leafMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.28 + Math.random() * 0.06, 0.55, 0.28 + Math.random() * 0.08),
    roughness: 0.85,
  });
  for (let i = 0; i < 3; i++) {
    const s = 1.4 - i * 0.3;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(s, 1.3, 7),
      leafMat
    );
    cone.position.y = 1.6 + i * 0.7;
    cone.castShadow = true;
    group.add(cone);
  }

  group.position.set(x, y, z);
  group.scale.setScalar(0.85 + Math.random() * 0.4);
  group.rotation.y = Math.random() * Math.PI * 2;
  scene.add(group);
}

function createRock(x, z) {
  const y = getGroundHeight(x, z);
  const geo = new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x6a6870,
    roughness: 0.95,
    flatShading: true,
  });
  const rock = new THREE.Mesh(geo, mat);
  rock.position.set(x, y + 0.25, z);
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  rock.scale.set(
    0.8 + Math.random() * 0.6,
    0.5 + Math.random() * 0.5,
    0.8 + Math.random() * 0.6
  );
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
}

function createRuins() {
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.85, flatShading: true });
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const r = 14 + (i % 2) * 3;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const y = getGroundHeight(x, z);
    const h = 2.5 + Math.random() * 2;
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.45, h, 6),
      pillarMat
    );
    pillar.position.set(x, y + h / 2, z);
    pillar.castShadow = true;
    scene.add(pillar);

    // broken top
    if (Math.random() > 0.4) {
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.25, 1.1),
        pillarMat
      );
      top.position.set(x, y + h + 0.1, z);
      top.rotation.y = Math.random();
      scene.add(top);
    }
  }
}

// ===================== PLAYER =====================
async function createPlayer() {
  // Try to load a real GLTF model first (Soldier from Three.js examples — CORS friendly)
  // Fallback to stylized procedural knight if load fails
  const modelUrl = 'https://threejs.org/examples/models/gltf/Soldier.glb';

  try {
    const gltf = await new Promise((resolve, reject) => {
      loader.load(modelUrl, resolve, undefined, reject);
    });
    playerMesh = gltf.scene;
    playerMesh.scale.set(1.15, 1.15, 1.15);
    playerMesh.traverse(c => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    if (gltf.animations && gltf.animations.length) {
      playerMixer = new THREE.AnimationMixer(playerMesh);
      // Prefer Idle / Walk / Run if present
      const clips = gltf.animations;
      state.playerAnims = {};
      clips.forEach(clip => {
        const name = clip.name.toLowerCase();
        if (name.includes('idle')) state.playerAnims.idle = playerMixer.clipAction(clip);
        else if (name.includes('walk')) state.playerAnims.walk = playerMixer.clipAction(clip);
        else if (name.includes('run')) state.playerAnims.run = playerMixer.clipAction(clip);
      });
      // fallback first clip
      if (!state.playerAnims.idle && clips[0]) {
        state.playerAnims.idle = playerMixer.clipAction(clips[0]);
      }
      if (state.playerAnims.idle) state.playerAnims.idle.play();
    }
    log('Loaded Soldier model');
  } catch (e) {
    console.warn('GLTF load failed, using procedural knight', e);
    playerMesh = createProceduralKnight(0x2a5a9a, 0xc0c8d0);
  }

  playerMesh.position.set(0, 0, 0);
  scene.add(playerMesh);

  state.player = {
    mesh: playerMesh,
    mixer: playerMixer,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    xp: 0,
    xpToLevel: 100,
    level: 1,
    speed: CONFIG.playerSpeed,
    velY: 0,
    onGround: true,
    attackCd: 0,
    skillCds: [0, 0, 0, 0, 0],
    facing: 0,
    isMoving: false,
    isSprinting: false,
  };
}

function createProceduralKnight(armorColor, metalColor) {
  const g = new THREE.Group();

  // Body
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.7, 4, 8),
    new THREE.MeshStandardMaterial({ color: armorColor, roughness: 0.55, metalness: 0.35 })
  );
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);

  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xe8c8a0, roughness: 0.7 })
  );
  head.position.y = 1.75;
  head.castShadow = true;
  g.add(head);

  // Helmet
  const helm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.3, 0.35, 8),
    new THREE.MeshStandardMaterial({ color: metalColor, roughness: 0.4, metalness: 0.7 })
  );
  helm.position.y = 1.85;
  helm.castShadow = true;
  g.add(helm);

  // Visor
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.12, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.3 })
  );
  visor.position.set(0, 1.82, 0.22);
  g.add(visor);

  // Shoulders
  const shoulderMat = new THREE.MeshStandardMaterial({ color: metalColor, roughness: 0.4, metalness: 0.65 });
  [-0.5, 0.5].forEach(sx => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), shoulderMat);
    s.position.set(sx, 1.4, 0);
    s.scale.set(1, 0.7, 1);
    s.castShadow = true;
    g.add(s);
  });

  // Arms
  const armMat = new THREE.MeshStandardMaterial({ color: armorColor, roughness: 0.6 });
  [-0.55, 0.55].forEach(sx => {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.4, 3, 6), armMat);
    arm.position.set(sx, 1.0, 0);
    arm.castShadow = true;
    g.add(arm);
  });

  // Legs
  [-0.2, 0.2].forEach(sx => {
    const leg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.13, 0.5, 3, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a2a38, roughness: 0.7 })
    );
    leg.position.set(sx, 0.4, 0);
    leg.castShadow = true;
    g.add(leg);
  });

  // Sword (right side)
  const swordGroup = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.9, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xd0d8e0, metalness: 0.85, roughness: 0.25 })
  );
  blade.position.y = 0.45;
  swordGroup.add(blade);
  const hilt = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x8b6914, metalness: 0.5 })
  );
  swordGroup.add(hilt);
  swordGroup.position.set(0.55, 0.9, 0.15);
  swordGroup.rotation.z = -0.3;
  g.add(swordGroup);

  // Cape
  const cape = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 1.0),
    new THREE.MeshStandardMaterial({ color: 0x6a1a1a, side: THREE.DoubleSide, roughness: 0.9 })
  );
  cape.position.set(0, 1.2, -0.3);
  cape.rotation.x = 0.15;
  g.add(cape);

  return g;
}

// ===================== ENEMIES =====================
function spawnEnemies() {
  const types = [
    { name: 'Goblin', color: 0x3a8a3a, hp: 40, speed: 4.5, dmg: 8, xp: 25, gold: 5, scale: 0.85 },
    { name: 'Wolf', color: 0x5a5a6a, hp: 55, speed: 6.5, dmg: 12, xp: 35, gold: 8, scale: 0.9 },
    { name: 'Skeleton', color: 0xc8c0b0, hp: 70, speed: 4, dmg: 15, xp: 45, gold: 12, scale: 1.0 },
    { name: 'Orc', color: 0x4a6a2a, hp: 110, speed: 3.8, dmg: 22, xp: 70, gold: 20, scale: 1.2 },
  ];

  for (let i = 0; i < CONFIG.enemySpawnCount; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    const angle = Math.random() * Math.PI * 2;
    const r = 18 + Math.random() * 40;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    spawnEnemy(type, x, z);
  }
}

function spawnEnemy(type, x, z) {
  const mesh = createProceduralEnemy(type);
  const y = getGroundHeight(x, z);
  mesh.position.set(x, y, z);
  mesh.scale.setScalar(type.scale);
  scene.add(mesh);

  state.enemies.push({
    mesh,
    type,
    hp: type.hp,
    maxHp: type.hp,
    speed: type.speed,
    dmg: type.dmg,
    xp: type.xp,
    gold: type.gold,
    attackCd: 0,
    state: 'idle', // idle | chase | attack
    alive: true,
  });
}

function createProceduralEnemy(type) {
  const g = new THREE.Group();
  const bodyCol = type.color;

  if (type.name === 'Wolf') {
    // Simple wolf shape
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 0.6, 4, 6),
      new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.8 })
    );
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.5;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 6, 5),
      new THREE.MeshStandardMaterial({ color: bodyCol })
    );
    head.position.set(0.5, 0.55, 0);
    head.castShadow = true;
    g.add(head);
    // legs
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.4, 4),
        new THREE.MeshStandardMaterial({ color: 0x3a3a40 })
      );
      leg.position.set((i % 2) * 0.4 - 0.2, 0.2, (i < 2 ? 0.2 : -0.2));
      g.add(leg);
    }
  } else {
    // Humanoid
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, 0.55, 4, 6),
      new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.7, metalness: 0.1 })
    );
    body.position.y = 0.95;
    body.castShadow = true;
    g.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 7, 5),
      new THREE.MeshStandardMaterial({
        color: type.name === 'Skeleton' ? 0xe8e0d0 : 0xc8a070,
        roughness: 0.75,
      })
    );
    head.position.y = 1.55;
    head.castShadow = true;
    g.add(head);

    // Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: type.name === 'Skeleton' ? 0xff2020 : 0x1a1a1a });
    [-0.1, 0.1].forEach(ex => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 3), eyeMat);
      eye.position.set(ex, 1.58, 0.2);
      g.add(eye);
    });

    // Weapon
    const weapon = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.7, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x888890, metalness: 0.6 })
    );
    weapon.position.set(0.45, 0.9, 0.1);
    weapon.rotation.z = -0.4;
    g.add(weapon);
  }

  return g;
}

// ===================== INPUT =====================
function setupInput() {
  // Keyboard
  window.addEventListener('keydown', e => {
    state.keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'Escape') togglePause();
    // Skills
    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.replace('Digit', '')) - 1;
      if (n >= 0 && n < 5) useSkill(n);
    }
  });
  window.addEventListener('keyup', e => { state.keys[e.code] = false; });

  // Mouse look (pointer lock for desktop)
  renderer.domElement.addEventListener('click', () => {
    if (!state.isPaused && !state.isDead) {
      renderer.domElement.requestPointerLock?.();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    state.mouse.locked = document.pointerLockElement === renderer.domElement;
  });
  document.addEventListener('mousemove', e => {
    if (state.mouse.locked) {
      state.cameraYaw -= e.movementX * 0.0025;
      state.cameraPitch -= e.movementY * 0.002;
      state.cameraPitch = Math.max(-0.4, Math.min(0.85, state.cameraPitch));
    }
  });

  // Attack on click
  renderer.domElement.addEventListener('mousedown', e => {
    if (e.button === 0 && state.mouse.locked) tryAttack();
  });

  // Mobile joystick
  const zone = document.getElementById('joystick-zone');
  const knob = document.getElementById('joystick-knob');
  const base = document.getElementById('joystick-base');

  const joyStart = (e) => {
    e.preventDefault();
    state.joystick.active = true;
    const t = e.touches ? e.touches[0] : e;
    updateJoystick(t.clientX, t.clientY);
  };
  const joyMove = (e) => {
    if (!state.joystick.active) return;
    e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
    updateJoystick(t.clientX, t.clientY);
  };
  const joyEnd = () => {
    state.joystick.active = false;
    state.joystick.x = 0;
    state.joystick.y = 0;
    knob.style.transform = 'translate(-50%, -50%)';
  };

  function updateJoystick(cx, cy) {
    const rect = base.getBoundingClientRect();
    const cx0 = rect.left + rect.width / 2;
    const cy0 = rect.top + rect.height / 2;
    let dx = cx - cx0;
    let dy = cy - cy0;
    const max = 40;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    state.joystick.x = dx / max;
    state.joystick.y = -dy / max; // forward is negative screen Y
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  zone.addEventListener('touchstart', joyStart, { passive: false });
  zone.addEventListener('touchmove', joyMove, { passive: false });
  zone.addEventListener('touchend', joyEnd);
  zone.addEventListener('touchcancel', joyEnd);

  // Touch look (right side of screen)
  let lookId = null;
  renderer.domElement.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      if (t.clientX > window.innerWidth * 0.45) {
        lookId = t.identifier;
        state.touchLook.active = true;
        state.touchLook.startX = t.clientX;
        state.touchLook.startY = t.clientY;
        state.touchLook.yaw = state.cameraYaw;
        state.touchLook.pitch = state.cameraPitch;
        break;
      }
    }
  }, { passive: true });

  renderer.domElement.addEventListener('touchmove', e => {
    if (!state.touchLook.active) return;
    for (const t of e.changedTouches) {
      if (t.identifier === lookId) {
        const dx = t.clientX - state.touchLook.startX;
        const dy = t.clientY - state.touchLook.startY;
        state.cameraYaw = state.touchLook.yaw - dx * 0.004;
        state.cameraPitch = Math.max(-0.4, Math.min(0.85, state.touchLook.pitch - dy * 0.003));
        break;
      }
    }
  }, { passive: true });

  renderer.domElement.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === lookId) {
        state.touchLook.active = false;
        lookId = null;
      }
    }
  });

  // Action buttons
  document.getElementById('btn-jump').addEventListener('touchstart', e => {
    e.preventDefault();
    jump();
  }, { passive: false });
  document.getElementById('btn-attack').addEventListener('touchstart', e => {
    e.preventDefault();
    tryAttack();
  }, { passive: false });
  document.getElementById('btn-skill').addEventListener('touchstart', e => {
    e.preventDefault();
    useSkill(1); // fireball
  }, { passive: false });

  // Skill slots
  document.querySelectorAll('.skill-slot').forEach(el => {
    el.addEventListener('click', () => {
      const n = parseInt(el.dataset.key) - 1;
      useSkill(n);
    });
  });

  window.addEventListener('resize', onResize);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ===================== COMBAT & SKILLS =====================
function tryAttack() {
  const p = state.player;
  if (p.attackCd > 0 || state.isDead) return;
  p.attackCd = CONFIG.attackCooldown;

  // Find closest enemy in front / range
  let best = null;
  let bestDist = CONFIG.attackRange;
  const px = p.mesh.position.x;
  const pz = p.mesh.position.z;

  for (const e of state.enemies) {
    if (!e.alive) continue;
    const d = p.mesh.position.distanceTo(e.mesh.position);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }

  if (best) {
    setTarget(best);
    const dmg = 12 + Math.floor(Math.random() * 8) + p.level * 2;
    damageEnemy(best, dmg);
    spawnHitEffect(best.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
    // Face target
    const dx = best.mesh.position.x - px;
    const dz = best.mesh.position.z - pz;
    p.facing = Math.atan2(dx, dz);
    p.mesh.rotation.y = p.facing;
  } else {
    // Swing in air
    spawnSwingEffect();
  }
}

function useSkill(index) {
  const p = state.player;
  if (state.isDead || p.skillCds[index] > 0) return;

  const skills = [
    { name: 'Strike', cost: 0, cd: 0.6, fn: () => tryAttack() },
    { name: 'Fireball', cost: 12, cd: 3.5, fn: castFireball },
    { name: 'Heal', cost: 18, cd: 8, fn: castHeal },
    { name: 'Lightning', cost: 20, cd: 6, fn: castLightning },
    { name: 'Shield', cost: 15, cd: 12, fn: castShield },
  ];

  const s = skills[index];
  if (p.mp < s.cost) {
    log('Not enough mana!', '#ff8080');
    return;
  }
  p.mp -= s.cost;
  p.skillCds[index] = s.cd;
  s.fn();
  updateHUD();
  // visual cooldown
  const slot = document.getElementById(`skill-${index + 1}`);
  if (slot) {
    const cdEl = slot.querySelector('.cd');
    cdEl.style.display = 'block';
    setTimeout(() => { cdEl.style.display = 'none'; }, s.cd * 1000);
  }
}

function castFireball() {
  const p = state.player;
  const origin = p.mesh.position.clone().add(new THREE.Vector3(0, 1.3, 0));
  const dir = new THREE.Vector3(
    Math.sin(state.cameraYaw),
    0,
    Math.cos(state.cameraYaw)
  ).normalize();

  // If we have a target, aim at it
  if (state.target && state.target.alive) {
    dir.copy(state.target.mesh.position).sub(origin).normalize();
  }

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff6020 })
  );
  ball.position.copy(origin);
  scene.add(ball);

  state.projectiles.push({
    mesh: ball,
    vel: dir.multiplyScalar(18),
    life: 1.8,
    dmg: 28 + p.level * 4,
    owner: 'player',
  });
  log('Fireball!', '#ff9040');
}

function castHeal() {
  const p = state.player;
  const heal = 30 + p.level * 5;
  p.hp = Math.min(p.maxHp, p.hp + heal);
  spawnHealEffect(p.mesh.position);
  log(`Healed +${heal}`, '#60ff80');
  updateHUD();
}

function castLightning() {
  // Hit nearest 3 enemies in range
  const p = state.player;
  const sorted = state.enemies
    .filter(e => e.alive && p.mesh.position.distanceTo(e.mesh.position) < 12)
    .sort((a, b) => a.mesh.position.distanceTo(p.mesh.position) - b.mesh.position.distanceTo(p.mesh.position))
    .slice(0, 3);

  for (const e of sorted) {
    damageEnemy(e, 35 + p.level * 5);
    spawnLightningEffect(p.mesh.position, e.mesh.position);
  }
  if (sorted.length) log(`Lightning hits ${sorted.length}!`, '#a0c0ff');
}

function castShield() {
  // Temporary damage reduction via a flag
  state.player.shieldUntil = performance.now() + 5000;
  spawnShieldEffect(state.player.mesh.position);
  log('Shield up!', '#80c0ff');
}

function damageEnemy(e, dmg) {
  if (!e.alive) return;
  e.hp -= dmg;
  log(`${e.type.name} takes ${dmg}`, '#ffb060');
  // flash
  e.mesh.traverse(c => {
    if (c.isMesh && c.material) {
      const orig = c.material.emissive?.getHex?.() ?? 0;
      c.material.emissive = new THREE.Color(0xff2020);
      setTimeout(() => {
        if (c.material.emissive) c.material.emissive.setHex(0);
      }, 80);
    }
  });

  if (e.hp <= 0) {
    killEnemy(e);
  } else {
    setTarget(e);
  }
  updateHUD();
}

function killEnemy(e) {
  e.alive = false;
  e.hp = 0;
  state.kills++;
  state.gold += e.gold + Math.floor(Math.random() * 5);
  gainXp(e.xp);

  // Death animation: sink + fade
  const startY = e.mesh.position.y;
  const start = performance.now();
  const anim = () => {
    const t = (performance.now() - start) / 600;
    if (t >= 1) {
      scene.remove(e.mesh);
      return;
    }
    e.mesh.position.y = startY - t * 1.5;
    e.mesh.scale.multiplyScalar(0.97);
    requestAnimationFrame(anim);
  };
  anim();

  log(`${e.type.name} slain! +${e.xp} XP`, '#c0ff80');
  if (state.target === e) clearTarget();
  updateHUD();

  // Respawn later
  setTimeout(() => {
    if (!e.alive) {
      const angle = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 35;
      const x = state.player.mesh.position.x + Math.cos(angle) * r;
      const z = state.player.mesh.position.z + Math.sin(angle) * r;
      e.mesh.position.set(x, getGroundHeight(x, z), z);
      e.mesh.scale.setScalar(e.type.scale);
      e.hp = e.maxHp;
      e.alive = true;
      e.state = 'idle';
      scene.add(e.mesh);
    }
  }, 12000 + Math.random() * 8000);
}

function gainXp(amount) {
  const p = state.player;
  p.xp += amount;
  while (p.xp >= p.xpToLevel) {
    p.xp -= p.xpToLevel;
    p.level++;
    p.xpToLevel = Math.floor(p.xpToLevel * 1.35);
    p.maxHp += 15;
    p.hp = p.maxHp;
    p.maxMp += 8;
    p.mp = p.maxMp;
    log(`LEVEL UP! You are now level ${p.level}`, '#ffd700');
    spawnLevelUpEffect(p.mesh.position);
  }
  updateHUD();
}

function setTarget(e) {
  state.target = e;
  document.getElementById('target-frame').classList.remove('hidden');
  document.getElementById('target-name').textContent = e.type.name;
  document.getElementById('target-portrait').textContent =
    e.type.name === 'Wolf' ? '🐺' : e.type.name === 'Skeleton' ? '💀' : e.type.name === 'Orc' ? '👹' : '👺';
  updateHUD();
}

function clearTarget() {
  state.target = null;
  document.getElementById('target-frame').classList.add('hidden');
}

// ===================== EFFECTS =====================
function spawnHitEffect(pos) {
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 4, 3),
      new THREE.MeshBasicMaterial({ color: 0xff4020 })
    );
    p.position.copy(pos);
    scene.add(p);
    state.particles.push({
      mesh: p,
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 3,
        (Math.random() - 0.5) * 4
      ),
      life: 0.4 + Math.random() * 0.3,
    });
  }
}

function spawnSwingEffect() {
  // simple arc indicator
}

function spawnHealEffect(pos) {
  for (let i = 0; i < 12; i++) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 4, 3),
      new THREE.MeshBasicMaterial({ color: 0x40ff80 })
    );
    p.position.copy(pos).add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.8,
      Math.random() * 0.5,
      (Math.random() - 0.5) * 0.8
    ));
    scene.add(p);
    state.particles.push({
      mesh: p,
      vel: new THREE.Vector3(0, 1.5 + Math.random(), 0),
      life: 0.7,
    });
  }
}

function spawnLightningEffect(from, to) {
  const points = [];
  const segs = 6;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = new THREE.Vector3().lerpVectors(from, to, t);
    p.y += 1.2;
    if (i > 0 && i < segs) {
      p.x += (Math.random() - 0.5) * 1.2;
      p.y += (Math.random() - 0.5) * 0.8;
      p.z += (Math.random() - 0.5) * 1.2;
    }
    points.push(p);
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color: 0xa0c8ff, linewidth: 2 })
  );
  scene.add(line);
  setTimeout(() => scene.remove(line), 200);
}

function spawnShieldEffect(pos) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.2, 0.08, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0x60a0ff, transparent: true, opacity: 0.7 })
  );
  ring.position.copy(pos);
  ring.position.y += 1;
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);
  state.particles.push({ mesh: ring, vel: new THREE.Vector3(0, 0.3, 0), life: 1.2, isShield: true });
}

function spawnLevelUpEffect(pos) {
  for (let i = 0; i < 20; i++) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 4, 3),
      new THREE.MeshBasicMaterial({ color: 0xffd700 })
    );
    p.position.copy(pos);
    scene.add(p);
    const angle = (i / 20) * Math.PI * 2;
    state.particles.push({
      mesh: p,
      vel: new THREE.Vector3(Math.cos(angle) * 3, 2 + Math.random() * 2, Math.sin(angle) * 3),
      life: 1.0,
    });
  }
}

// ===================== UI =====================
function setupUI() {
  document.getElementById('btn-menu').addEventListener('click', togglePause);
  document.getElementById('btn-resume').addEventListener('click', togglePause);
  document.getElementById('btn-restart').addEventListener('click', () => location.reload());
}

function togglePause() {
  state.isPaused = !state.isPaused;
  document.getElementById('menu-overlay').classList.toggle('hidden', !state.isPaused);
  if (state.isPaused && document.pointerLockElement) document.exitPointerLock();
}

function updateHUD() {
  const p = state.player;
  document.getElementById('hp-fill').style.width = `${(p.hp / p.maxHp) * 100}%`;
  document.getElementById('hp-text').textContent = `${Math.ceil(p.hp)}/${p.maxHp}`;
  document.getElementById('mp-fill').style.width = `${(p.mp / p.maxMp) * 100}%`;
  document.getElementById('mp-text').textContent = `${Math.ceil(p.mp)}/${p.maxMp}`;
  document.getElementById('xp-fill').style.width = `${(p.xp / p.xpToLevel) * 100}%`;
  document.getElementById('xp-text').textContent = `${p.xp}/${p.xpToLevel}`;
  document.getElementById('level-badge').textContent = p.level;
  document.getElementById('gold').textContent = `🪙 ${state.gold}`;
  document.getElementById('kills').textContent = `☠ ${state.kills}`;

  if (state.target && state.target.alive) {
    const t = state.target;
    document.getElementById('target-hp-fill').style.width = `${(t.hp / t.maxHp) * 100}%`;
    document.getElementById('target-hp-text').textContent = `${Math.ceil(t.hp)}/${t.maxHp}`;
  }
}

function log(msg, color = '#e0d8c8') {
  const el = document.createElement('div');
  el.className = 'log-line';
  el.style.color = color;
  el.textContent = msg;
  const box = document.getElementById('combat-log');
  box.prepend(el);
  if (box.children.length > 8) box.lastChild.remove();
}

function setupMinimap() {
  const canvas = document.getElementById('minimap-canvas');
  minimapCtx = canvas.getContext('2d');
}

function drawMinimap() {
  if (!minimapCtx) return;
  const ctx = minimapCtx;
  const w = 120, h = 120;
  ctx.fillStyle = '#1a2a1a';
  ctx.fillRect(0, 0, w, h);

  const scale = 1.1;
  const px = state.player.mesh.position.x;
  const pz = state.player.mesh.position.z;

  // Enemies
  ctx.fillStyle = '#e04040';
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const dx = (e.mesh.position.x - px) * scale + w / 2;
    const dy = (e.mesh.position.z - pz) * scale + h / 2;
    if (dx > 2 && dx < w - 2 && dy > 2 && dy < h - 2) {
      ctx.beginPath();
      ctx.arc(dx, dy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Player
  ctx.fillStyle = '#40c0ff';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 4, 0, Math.PI * 2);
  ctx.fill();

  // Facing indicator
  ctx.strokeStyle = '#80e0ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2, h / 2);
  ctx.lineTo(
    w / 2 + Math.sin(state.cameraYaw) * 10,
    h / 2 + Math.cos(state.cameraYaw) * 10
  );
  ctx.stroke();
}

// ===================== MOVEMENT & PHYSICS =====================
function jump() {
  const p = state.player;
  if (p.onGround && !state.isDead) {
    p.velY = CONFIG.jumpForce;
    p.onGround = false;
  }
}

function updatePlayer(dt) {
  const p = state.player;
  if (state.isDead) return;

  // Cooldowns
  p.attackCd = Math.max(0, p.attackCd - dt);
  for (let i = 0; i < 5; i++) p.skillCds[i] = Math.max(0, p.skillCds[i] - dt);

  // Input direction
  let inputX = 0, inputZ = 0;
  if (state.keys['KeyW'] || state.keys['ArrowUp']) inputZ -= 1;
  if (state.keys['KeyS'] || state.keys['ArrowDown']) inputZ += 1;
  if (state.keys['KeyA'] || state.keys['ArrowLeft']) inputX -= 1;
  if (state.keys['KeyD'] || state.keys['ArrowRight']) inputX += 1;

  // Joystick overrides
  if (state.joystick.active) {
    inputX = state.joystick.x;
    inputZ = -state.joystick.y;
  }

  const len = Math.hypot(inputX, inputZ);
  if (len > 1) { inputX /= len; inputZ /= len; }

  p.isMoving = len > 0.1;
  p.isSprinting = state.keys['ShiftLeft'] || state.keys['ShiftRight'];

  // Move relative to camera yaw
  const speed = p.speed * (p.isSprinting ? CONFIG.playerSprintMult : 1);
  if (p.isMoving) {
    const sin = Math.sin(state.cameraYaw);
    const cos = Math.cos(state.cameraYaw);
    const mx = (inputX * cos + inputZ * sin) * speed * dt;
    const mz = (inputZ * cos - inputX * sin) * speed * dt;
    p.mesh.position.x += mx;
    p.mesh.position.z += mz;

    // Face movement direction
    p.facing = Math.atan2(mx, mz);
    p.mesh.rotation.y = p.facing;

    // World bounds
    const half = CONFIG.worldSize / 2 - 2;
    p.mesh.position.x = Math.max(-half, Math.min(half, p.mesh.position.x));
    p.mesh.position.z = Math.max(-half, Math.min(half, p.mesh.position.z));
  }

  // Gravity & ground
  p.velY -= CONFIG.gravity * dt;
  p.mesh.position.y += p.velY * dt;
  const groundY = getGroundHeight(p.mesh.position.x, p.mesh.position.z);
  if (p.mesh.position.y <= groundY) {
    p.mesh.position.y = groundY;
    p.velY = 0;
    p.onGround = true;
  } else {
    p.onGround = false;
  }

  // Jump key
  if (state.keys['Space']) jump();

  // Mana regen
  p.mp = Math.min(p.maxMp, p.mp + 3 * dt);

  // Animation switch
  if (p.mixer && state.playerAnims) {
    const moving = p.isMoving;
    if (moving && state.playerAnims.walk) {
      if (state.playerAnims.idle) state.playerAnims.idle.stop();
      if (!state.playerAnims.walk.isRunning()) state.playerAnims.walk.play();
    } else if (state.playerAnims.idle) {
      if (state.playerAnims.walk) state.playerAnims.walk.stop();
      if (!state.playerAnims.idle.isRunning()) state.playerAnims.idle.play();
    }
    p.mixer.update(dt);
  }
}

function updateEnemies(dt) {
  const p = state.player;
  const ppos = p.mesh.position;

  for (const e of state.enemies) {
    if (!e.alive) continue;

    const dist = e.mesh.position.distanceTo(ppos);
    e.attackCd = Math.max(0, e.attackCd - dt);

    if (dist < 14) {
      e.state = dist < 1.8 ? 'attack' : 'chase';
    } else {
      e.state = 'idle';
    }

    if (e.state === 'chase') {
      const dir = new THREE.Vector3().subVectors(ppos, e.mesh.position).normalize();
      e.mesh.position.x += dir.x * e.speed * dt;
      e.mesh.position.z += dir.z * e.speed * dt;
      e.mesh.position.y = getGroundHeight(e.mesh.position.x, e.mesh.position.z);
      e.mesh.lookAt(ppos.x, e.mesh.position.y, ppos.z);
    }

    if (e.state === 'attack' && e.attackCd <= 0) {
      e.attackCd = 1.2;
      let dmg = e.dmg;
      if (p.shieldUntil && performance.now() < p.shieldUntil) dmg = Math.floor(dmg * 0.4);
      p.hp -= dmg;
      log(`${e.type.name} hits you for ${dmg}`, '#ff6060');
      updateHUD();
      if (p.hp <= 0) onPlayerDeath();
    }
  }
}

function updateProjectiles(dt) {
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i];
    pr.mesh.position.addScaledVector(pr.vel, dt);
    pr.life -= dt;

    // Check enemy hits
    if (pr.owner === 'player') {
      for (const e of state.enemies) {
        if (!e.alive) continue;
        if (pr.mesh.position.distanceTo(e.mesh.position.clone().add(new THREE.Vector3(0, 1, 0))) < 1.2) {
          damageEnemy(e, pr.dmg);
          spawnHitEffect(pr.mesh.position.clone());
          pr.life = 0;
          break;
        }
      }
    }

    if (pr.life <= 0) {
      scene.remove(pr.mesh);
      state.projectiles.splice(i, 1);
    }
  }
}

function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.mesh.position.addScaledVector(p.vel, dt);
    p.vel.y -= 6 * dt;
    p.life -= dt;
    if (p.mesh.material) {
      p.mesh.material.opacity = Math.max(0, p.life * 2);
      p.mesh.material.transparent = true;
    }
    if (p.life <= 0) {
      scene.remove(p.mesh);
      state.particles.splice(i, 1);
    }
  }
}

function updateCamera(dt) {
  const p = state.player.mesh.position;
  const dist = CONFIG.cameraDistance;
  const height = CONFIG.cameraHeight;

  const targetX = p.x - Math.sin(state.cameraYaw) * dist * Math.cos(state.cameraPitch);
  const targetY = p.y + height + Math.sin(state.cameraPitch) * dist;
  const targetZ = p.z - Math.cos(state.cameraYaw) * dist * Math.cos(state.cameraPitch);

  camera.position.x += (targetX - camera.position.x) * CONFIG.cameraLerp;
  camera.position.y += (targetY - camera.position.y) * CONFIG.cameraLerp;
  camera.position.z += (targetZ - camera.position.z) * CONFIG.cameraLerp;

  camera.lookAt(p.x, p.y + 1.4, p.z);
}

function onPlayerDeath() {
  if (state.isDead) return;
  state.isDead = true;
  state.player.hp = 0;
  updateHUD();
  document.getElementById('death-screen').classList.remove('hidden');
  let t = CONFIG.respawnTime;
  document.getElementById('respawn-timer').textContent = t;

  const iv = setInterval(() => {
    t--;
    document.getElementById('respawn-timer').textContent = t;
    if (t <= 0) {
      clearInterval(iv);
      respawnPlayer();
    }
  }, 1000);
}

function respawnPlayer() {
  const p = state.player;
  p.hp = p.maxHp;
  p.mp = p.maxMp;
  p.mesh.position.set(0, 0, 0);
  p.velY = 0;
  state.isDead = false;
  clearTarget();
  document.getElementById('death-screen').classList.add('hidden');
  updateHUD();
  log('You have been revived at the shrine.', '#80c0ff');
}

// ===================== MAIN LOOP =====================
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(state.clock.getDelta(), 0.05);

  if (!state.isPaused) {
    updatePlayer(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateParticles(dt);
    updateCamera(dt);
    drawMinimap();
  }

  renderer.render(scene, camera);
}

// Boot
init().catch(err => {
  console.error(err);
  document.getElementById('loading-text').textContent = 'Error loading: ' + err.message;
});

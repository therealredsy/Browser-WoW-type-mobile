/**
 * Diablo Lite — True Diablo-style 3D Browser ARPG
 * Isometric camera, click-to-move pathfinding, loot system, inventory, stat progression
 * Runs fully client-side in mobile & desktop browsers
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ===================== CONSTANTS =====================
const RARITY = {
  COMMON: { name: 'Common', color: 0xcccccc, rng: 0.6 },
  MAGIC: { name: 'Magic', color: 0x6495ed, rng: 0.25 },
  RARE: { name: 'Rare', color: 0xffdd00, rng: 0.12 },
  LEGENDARY: { name: 'Legendary', color: 0xff6600, rng: 0.03 },
};

const STATS = {
  STRENGTH: 'strength',
  DEXTERITY: 'dexterity',
  INTELLIGENCE: 'intelligence',
  VITALITY: 'vitality',
};

const ITEM_TYPES = {
  WEAPON: 'weapon',
  ARMOR: 'armor',
  ACCESSORY: 'accessory',
  POTION: 'potion',
};

const ACTS = [
  { name: 'The Bloodied Fields', boss: 'The Butcher', color: 0x3d1a1a },
  { name: 'The Crypt of Souls', boss: 'Andariel', color: 0x2a1a3d },
  { name: 'The Infernal Citadel', boss: 'Diablo', color: 0x3d1a00 },
];

// ===================== CONFIG =====================
const CONFIG = {
  worldSize: 150,
  isometric: true, // Isometric camera
  isometricDist: 25,
  isometricHeight: 20,
  playerSpeed: 12,
  attackRange: 3.5,
  attackCooldown: 0.6,
  enemySpawnCount: 20,
  acts: 3,
  currentAct: 0,
};

// ===================== STATE =====================
const state = {
  player: null,
  enemies: [],
  lootDrops: [],
  projectiles: [],
  particles: [],
  pathfindingGrid: null,
  mouseTarget: null,
  selectedItem: null,
  inventory: [],
  equipment: {
    [ITEM_TYPES.WEAPON]: null,
    [ITEM_TYPES.ARMOR]: null,
    [ITEM_TYPES.ACCESSORY]: null,
  },
  keys: {},
  isPaused: false,
  isDead: false,
  isMoving: false,
  currentPath: [],
  gold: 0,
  kills: 0,
  clock: new THREE.Clock(),
  currentAct: 0,
};

// ===================== SCENE =====================
let scene, camera, renderer;
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
  loadingText.textContent = 'Creating dark realm...';

  // Scene - darker Diablo aesthetic
  scene = new THREE.Scene();
  const actColor = ACTS[state.currentAct].color;
  scene.background = new THREE.Color(0x1a0f0a);
  scene.fog = new THREE.Fog(0x1a0f0a, 50, 140);

  // Camera - Isometric setup
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.OrthographicCamera(
    -CONFIG.isometricDist * aspect,
    CONFIG.isometricDist * aspect,
    CONFIG.isometricDist,
    -CONFIG.isometricDist,
    0.1,
    300
  );
  updateIsometricCamera();

  // Lights - moody
  ambient = new THREE.AmbientLight(0x4a4a4a, 0.6);
  scene.add(ambient);

  sun = new THREE.DirectionalLight(0xff9944, 0.9);
  sun.position.set(40, 60, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 150;
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  sun.shadow.bias = -0.001;
  scene.add(sun);

  progress.style.width = '30%';
  loadingText.textContent = 'Building dungeon...';

  createTerrain();
  createDecor();

  progress.style.width = '50%';
  loadingText.textContent = 'Summoning hero...';

  await createPlayer();

  progress.style.width = '70%';
  loadingText.textContent = 'Spawning horrors...';

  spawnEnemies();

  progress.style.width = '85%';
  loadingText.textContent = 'Binding controls...';

  setupInput();
  setupUI();
  setupMinimap();

  progress.style.width = '100%';
  loadingText.textContent = 'Welcome to the nightmare...';

  await sleep(600);
  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');

  animate();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function updateIsometricCamera() {
  const p = state.player?.mesh.position || new THREE.Vector3(0, 0, 0);
  const isometricAngle = Math.PI / 4; // 45 degrees
  const dist = CONFIG.isometricDist;
  const height = CONFIG.isometricHeight;

  camera.position.set(
    p.x + dist * Math.cos(isometricAngle),
    p.y + height,
    p.z + dist * Math.sin(isometricAngle)
  );
  camera.lookAt(p.x, p.y + 1, p.z);
}

// ===================== TERRAIN =====================
function createTerrain() {
  const size = CONFIG.worldSize;
  const geo = new THREE.PlaneGeometry(size, size, 40, 40);
  const pos = geo.attributes.position;
  const colors = [];
  const color = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // Subtle variation
    const h = Math.sin(x * 0.06) * Math.cos(y * 0.05) * 0.8 +
              Math.sin(x * 0.12 + 1.1) * 0.3;
    pos.setZ(i, h);

    // Dark stone/blood theme
    const t = (Math.sin(x * 0.08) + Math.cos(y * 0.1) + 2) / 4;
    const hue = 0.95 + t * 0.05; // Dark reddish
    const sat = 0.3 + t * 0.2;
    const light = 0.15 + t * 0.1;
    color.setHSL(hue, sat, light);
    colors.push(color.r, color.g, color.b);
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.02,
  });
  ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

function getGroundHeight(x, z) {
  return Math.sin(x * 0.06) * Math.cos(z * 0.05) * 0.8 +
         Math.sin(x * 0.12 + 1.1) * 0.3;
}

function createDecor() {
  // Spikes, bones, dark statues instead of trees
  const spikeCount = 40;
  for (let i = 0; i < spikeCount; i++) {
    const x = (Math.random() - 0.5) * (CONFIG.worldSize - 10);
    const z = (Math.random() - 0.5) * (CONFIG.worldSize - 10);
    if (Math.abs(x) < 12 && Math.abs(z) < 12) continue;
    createSpike(x, z);
  }

  const boneCount = 30;
  for (let i = 0; i < boneCount; i++) {
    const x = (Math.random() - 0.5) * (CONFIG.worldSize - 8);
    const z = (Math.random() - 0.5) * (CONFIG.worldSize - 8);
    createBone(x, z);
  }

  createAltars();
}

function createSpike(x, z) {
  const y = getGroundHeight(x, z);
  const height = 1 + Math.random() * 2;
  const spike = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, height, 5),
    new THREE.MeshStandardMaterial({ color: 0x8b1a1a, roughness: 0.7 })
  );
  spike.position.set(x, y + height / 2, z);
  spike.castShadow = true;
  scene.add(spike);
}

function createBone(x, z) {
  const y = getGroundHeight(x, z);
  const geo = new THREE.BoxGeometry(0.3, 0.8, 0.15);
  const mat = new THREE.MeshStandardMaterial({ color: 0xc8b8a8, roughness: 0.8, flatShading: true });
  const bone = new THREE.Mesh(geo, mat);
  bone.position.set(x, y + 0.4, z);
  bone.rotation.z = Math.random() * Math.PI * 2;
  bone.castShadow = true;
  scene.add(bone);
}

function createAltars() {
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const r = 20 + i * 15;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const y = getGroundHeight(x, z);

    const altar = new THREE.Mesh(
      new THREE.BoxGeometry(2, 1.2, 2),
      new THREE.MeshStandardMaterial({ color: 0x4a2a2a, roughness: 0.9 })
    );
    altar.position.set(x, y + 0.6, z);
    altar.castShadow = true;
    scene.add(altar);

    // Skull on top
    const skull = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xe8d8b8 })
    );
    skull.position.set(x, y + 1.5, z);
    scene.add(skull);
  }
}

// ===================== PLAYER =====================
async function createPlayer() {
  try {
    const gltf = await new Promise((resolve, reject) => {
      loader.load('https://threejs.org/examples/models/gltf/Soldier.glb', resolve, undefined, reject);
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
      const clips = gltf.animations;
      state.playerAnims = {};
      clips.forEach(clip => {
        const name = clip.name.toLowerCase();
        if (name.includes('idle')) state.playerAnims.idle = playerMixer.clipAction(clip);
        else if (name.includes('walk') || name.includes('run')) 
          state.playerAnims.walk = playerMixer.clipAction(clip);
      });
      if (!state.playerAnims.idle && clips[0]) 
        state.playerAnims.idle = playerMixer.clipAction(clips[0]);
      if (state.playerAnims.idle) state.playerAnims.idle.play();
    }
  } catch (e) {
    playerMesh = createProceduralHero();
  }

  playerMesh.position.set(0, 0.2, 0);
  scene.add(playerMesh);

  // Initialize player with stat system
  state.player = {
    mesh: playerMesh,
    mixer: playerMixer,
    baseStats: {
      [STATS.STRENGTH]: 10,
      [STATS.DEXTERITY]: 8,
      [STATS.INTELLIGENCE]: 6,
      [STATS.VITALITY]: 10,
    },
    level: 1,
    xp: 0,
    xpToLevel: 100,
    experience: 0,
    hp: 100,
    maxHp: 100,
    mp: 30,
    maxMp: 30,
    attackPower: 15,
    defense: 5,
    attackCd: 0,
    facing: 0,
    targetEnemy: null,
  };
}

function createProceduralHero() {
  const g = new THREE.Group();

  // Body - red theme
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.7, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xb02020, roughness: 0.6, metalness: 0.2 })
  );
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);

  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xd8a880, roughness: 0.7 })
  );
  head.position.y = 1.75;
  head.castShadow = true;
  g.add(head);

  // Dark armor pieces
  [-0.5, 0.5].forEach(sx => {
    const arm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.12, 0.42, 4, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.8, metalness: 0.3 })
    );
    arm.position.set(sx, 1.0, 0);
    arm.castShadow = true;
    g.add(arm);
  });

  [-0.15, 0.15].forEach(sx => {
    const leg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.14, 0.52, 4, 6),
      new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.9 })
    );
    leg.position.set(sx, 0.35, 0);
    leg.castShadow = true;
    g.add(leg);
  });

  // Weapon - sword
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1, 0.15),
    new THREE.MeshStandardMaterial({ color: 0xa8a8a8, metalness: 0.8, roughness: 0.2 })
  );
  blade.position.set(0.6, 1.0, 0.1);
  g.add(blade);

  return g;
}

// ===================== ENEMIES =====================
function spawnEnemies() {
  const types = [
    { 
      name: 'Zombie', color: 0x4a8a3a, hp: 40, xp: 25, gold: 10, speed: 3.5, dmg: 8, 
      level: 1, lootChance: 0.4, rarity: RARITY.COMMON 
    },
    { 
      name: 'Fallen Angel', color: 0x8a4a4a, hp: 60, xp: 40, gold: 20, speed: 4.5, dmg: 12, 
      level: 2, lootChance: 0.5, rarity: RARITY.MAGIC 
    },
    { 
      name: 'Wraith', color: 0x6a5aaa, hp: 80, xp: 50, gold: 30, speed: 5, dmg: 14, 
      level: 3, lootChance: 0.6, rarity: RARITY.RARE 
    },
    { 
      name: 'Demon', color: 0xaa3a3a, hp: 120, xp: 80, gold: 50, speed: 4, dmg: 20, 
      level: 4, lootChance: 0.7, rarity: RARITY.LEGENDARY 
    },
  ];

  for (let i = 0; i < CONFIG.enemySpawnCount; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    const angle = Math.random() * Math.PI * 2;
    const r = 25 + Math.random() * 45;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    spawnEnemy(type, x, z);
  }
}

function spawnEnemy(type, x, z) {
  const mesh = createProceduralEnemy(type);
  const y = getGroundHeight(x, z);
  mesh.position.set(x, y, z);
  mesh.scale.setScalar(0.8 + type.level * 0.15);
  scene.add(mesh);

  state.enemies.push({
    mesh,
    type,
    level: type.level,
    hp: type.hp,
    maxHp: type.hp,
    speed: type.speed,
    dmg: type.dmg,
    xp: type.xp,
    gold: type.gold,
    lootChance: type.lootChance,
    rarity: type.rarity,
    attackCd: 0,
    state: 'idle',
    alive: true,
  });
}

function createProceduralEnemy(type) {
  const g = new THREE.Group();
  const bodyCol = type.color;

  // Humanoid demon
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.55, 4, 6),
    new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.7 })
  );
  body.position.y = 0.95;
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 7, 5),
    new THREE.MeshStandardMaterial({ color: bodyCol })
  );
  head.position.y = 1.55;
  head.castShadow = true;
  g.add(head);

  // Glowing eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
  [-0.1, 0.1].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 3), eyeMat);
    eye.position.set(ex, 1.58, 0.22);
    g.add(eye);
  });

  // Weapon
  const weapon = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.8, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5 })
  );
  weapon.position.set(0.45, 0.95, 0.1);
  weapon.rotation.z = -0.4;
  g.add(weapon);

  return g;
}

// ===================== LOOT & INVENTORY =====================
function generateLoot(rarity, level) {
  const itemTypes = [ITEM_TYPES.WEAPON, ITEM_TYPES.ARMOR, ITEM_TYPES.ACCESSORY];
  const type = itemTypes[Math.floor(Math.random() * itemTypes.length)];

  const baseStats = {
    [ITEM_TYPES.WEAPON]: { 
      [STATS.STRENGTH]: 2 + level, 
      attackPower: 5 + level * 3 
    },
    [ITEM_TYPES.ARMOR]: { 
      [STATS.VITALITY]: 2 + level, 
      defense: 3 + level * 2 
    },
    [ITEM_TYPES.ACCESSORY]: { 
      [STATS.INTELLIGENCE]: 2 + level, 
      mp: 10 + level * 5 
    },
  };

  const itemNames = {
    [ITEM_TYPES.WEAPON]: ['Sword', 'Axe', 'Mace', 'Spear', 'Dagger'],
    [ITEM_TYPES.ARMOR]: ['Plate', 'Mail', 'Leather', 'Robe', 'Scale'],
    [ITEM_TYPES.ACCESSORY]: ['Ring', 'Amulet', 'Talisman', 'Charm', 'Token'],
  };

  const names = itemNames[type];
  const baseName = names[Math.floor(Math.random() * names.length)];
  const name = `${rarity.name} ${baseName}`;

  const statMultiplier = {
    [RARITY.COMMON]: 1,
    [RARITY.MAGIC]: 1.3,
    [RARITY.RARE]: 1.7,
    [RARITY.LEGENDARY]: 2.2,
  };

  const stats = baseStats[type];
  const modifiedStats = {};
  Object.keys(stats).forEach(k => {
    modifiedStats[k] = Math.floor(stats[k] * statMultiplier[rarity]);
  });

  return {
    id: Math.random(),
    name,
    type,
    rarity,
    stats: modifiedStats,
    level,
    value: Math.floor((10 + level * 5) * statMultiplier[rarity]),
  };
}

function dropLoot(enemy, position) {
  if (Math.random() > enemy.lootChance) return;

  const rarityRoll = Math.random();
  let rarity = RARITY.COMMON;
  if (rarityRoll > RARITY.MAGIC.rng) rarity = RARITY.MAGIC;
  if (rarityRoll > RARITY.RARE.rng) rarity = RARITY.RARE;
  if (rarityRoll > RARITY.LEGENDARY.rng) rarity = RARITY.LEGENDARY;

  const item = generateLoot(rarity, enemy.level);

  // Create visible loot drop
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 6, 5),
    new THREE.MeshBasicMaterial({ color: rarity.color })
  );
  mesh.position.copy(position).add(new THREE.Vector3(0, 0.5, 0));
  scene.add(mesh);

  state.lootDrops.push({
    mesh,
    item,
    lifetime: 30,
    bobOffset: 0,
  });

  log(`${item.name} dropped!`, rarity.color);
}

function pickupLoot(lootDrop) {
  state.inventory.push(lootDrop.item);
  scene.remove(lootDrop.mesh);
  log(`Picked up ${lootDrop.item.name}`, lootDrop.item.rarity.color);
  updateInventoryUI();
}

function equipItem(item) {
  if (![ITEM_TYPES.WEAPON, ITEM_TYPES.ARMOR, ITEM_TYPES.ACCESSORY].includes(item.type)) 
    return;

  // Unequip old item if exists
  if (state.equipment[item.type]) {
    state.inventory.push(state.equipment[item.type]);
  }

  // Remove from inventory
  state.inventory = state.inventory.filter(i => i.id !== item.id);

  // Equip new item
  state.equipment[item.type] = item;

  // Apply stats
  applyStats();
  updateInventoryUI();
  updateCharacterUI();
  log(`Equipped ${item.name}`, item.rarity.color);
}

function applyStats() {
  const p = state.player;
  
  // Reset to base
  p.hp = p.maxHp = 100;
  p.mp = p.maxMp = 30;
  p.attackPower = 15;
  p.defense = 5;
  
  Object.keys(p.baseStats).forEach(stat => {
    p[stat] = p.baseStats[stat];
  });

  // Apply equipped items
  Object.values(state.equipment).forEach(item => {
    if (!item) return;
    Object.entries(item.stats).forEach(([stat, val]) => {
      if (p[stat] !== undefined) p[stat] += val;
    });
  });

  // Calculate derived stats
  p.maxHp = 100 + p.vitality * 8;
  p.hp = Math.min(p.hp, p.maxHp);
  p.maxMp = 30 + p.intelligence * 4;
  p.mp = Math.min(p.mp, p.maxMp);
}

// ===================== INPUT =====================
function setupInput() {
  // Click to move (Diablo style)
  renderer.domElement.addEventListener('click', e => {
    if (state.isPaused || state.isDead) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * 2 - 1;
    const y = -(e.clientY - rect.top) / rect.height * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    state.mouseTarget = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, state.mouseTarget);

    // Check for loot pickup
    for (let i = state.lootDrops.length - 1; i >= 0; i--) {
      const drop = state.lootDrops[i];
      if (drop.mesh.position.distanceTo(state.mouseTarget) < 1.5) {
        pickupLoot(drop);
        state.lootDrops.splice(i, 1);
        break;
      }
    }
  });

  // Right-click attack
  renderer.domElement.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (!state.isDead) tryAttack();
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', e => {
    state.keys[e.code] = true;
    if (e.code === 'Escape') togglePause();
    if (e.code === 'KeyI') toggleInventory();
  });
  window.addEventListener('keyup', e => { state.keys[e.code] = false; });

  window.addEventListener('resize', onResize);
}

function onResize() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = -CONFIG.isometricDist * aspect;
  camera.right = CONFIG.isometricDist * aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ===================== COMBAT =====================
function tryAttack() {
  const p = state.player;
  if (p.attackCd > 0 || state.isDead) return;
  p.attackCd = CONFIG.attackCooldown;

  let best = null;
  let bestDist = CONFIG.attackRange;

  for (const e of state.enemies) {
    if (!e.alive) continue;
    const d = p.mesh.position.distanceTo(e.mesh.position);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }

  if (best) {
    const dmg = p.attackPower + Math.floor(Math.random() * 5);
    damageEnemy(best, dmg);
    spawnHitEffect(best.mesh.position);
    const dx = best.mesh.position.x - p.mesh.position.x;
    const dz = best.mesh.position.z - p.mesh.position.z;
    p.facing = Math.atan2(dx, dz);
    p.mesh.rotation.y = p.facing;
  }
}

function damageEnemy(e, dmg) {
  if (!e.alive) return;
  e.hp -= Math.max(1, dmg - e.type.dmg / 4);
  
  // Flash
  e.mesh.traverse(c => {
    if (c.isMesh && c.material) {
      c.material.emissive = new THREE.Color(0xff3333);
      setTimeout(() => c.material.emissive?.setHex(0), 100);
    }
  });

  if (e.hp <= 0) {
    killEnemy(e);
  }
  updateHUD();
}

function killEnemy(e) {
  e.alive = false;
  state.kills++;
  state.gold += e.gold;
  state.player.xp += e.xp;

  dropLoot(e, e.mesh.position.clone());

  // Death animation
  const startY = e.mesh.position.y;
  const start = performance.now();
  const anim = () => {
    const t = (performance.now() - start) / 800;
    if (t >= 1) {
      scene.remove(e.mesh);
      return;
    }
    e.mesh.position.y = startY - t * 2;
    e.mesh.scale.multiplyScalar(0.96);
    requestAnimationFrame(anim);
  };
  anim();

  log(`${e.type.name} slain! +${e.xp} XP`, '#c0ff80');
  
  // Respawn
  setTimeout(() => {
    if (!e.alive) {
      const angle = Math.random() * Math.PI * 2;
      const r = 25 + Math.random() * 40;
      const x = state.player.mesh.position.x + Math.cos(angle) * r;
      const z = state.player.mesh.position.z + Math.sin(angle) * r;
      e.mesh.position.set(x, getGroundHeight(x, z), z);
      e.mesh.scale.setScalar(0.8 + e.level * 0.15);
      e.hp = e.maxHp;
      e.alive = true;
      e.state = 'idle';
      scene.add(e.mesh);
    }
  }, 15000 + Math.random() * 10000);

  checkLevelUp();
  updateHUD();
}

function checkLevelUp() {
  const p = state.player;
  while (p.xp >= p.xpToLevel) {
    p.xp -= p.xpToLevel;
    p.level++;
    p.xpToLevel = Math.floor(p.xpToLevel * 1.3);
    p.baseStats[STATS.STRENGTH] += 2;
    p.baseStats[STATS.VITALITY] += 3;
    applyStats();
    log(`LEVEL UP! Level ${p.level}`, '#ffd700');
    spawnLevelUpEffect(p.mesh.position);
  }
}

// ===================== EFFECTS =====================
function spawnHitEffect(pos) {
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 4, 3),
      new THREE.MeshBasicMaterial({ color: 0xff6644 })
    );
    p.position.copy(pos).add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.5,
      Math.random() * 0.3,
      (Math.random() - 0.5) * 0.5
    ));
    scene.add(p);
    state.particles.push({
      mesh: p,
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 2,
        (Math.random() - 0.5) * 3
      ),
      life: 0.5,
    });
  }
}

function spawnLevelUpEffect(pos) {
  for (let i = 0; i < 15; i++) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 4, 3),
      new THREE.MeshBasicMaterial({ color: 0xffdd00 })
    );
    p.position.copy(pos);
    scene.add(p);
    const angle = (i / 15) * Math.PI * 2;
    state.particles.push({
      mesh: p,
      vel: new THREE.Vector3(Math.cos(angle) * 4, 2 + Math.random() * 2, Math.sin(angle) * 4),
      life: 1.2,
    });
  }
}

// ===================== UI =====================
function setupUI() {
  document.getElementById('btn-menu').addEventListener('click', togglePause);
  document.getElementById('btn-resume').addEventListener('click', togglePause);
  document.getElementById('btn-restart').addEventListener('click', () => location.reload());
  document.getElementById('inventory-close').addEventListener('click', toggleInventory);
  
  // Inventory slots
  for (let i = 0; i < 12; i++) {
    const slot = document.createElement('div');
    slot.className = 'inventory-slot';
    slot.id = `inv-slot-${i}`;
    document.getElementById('inventory-items').appendChild(slot);
  }
}

function togglePause() {
  state.isPaused = !state.isPaused;
  document.getElementById('menu-overlay').classList.toggle('hidden', !state.isPaused);
}

function toggleInventory() {
  document.getElementById('inventory-panel').classList.toggle('hidden');
}

function updateInventoryUI() {
  const container = document.getElementById('inventory-items');
  container.innerHTML = '';

  state.inventory.forEach((item, i) => {
    const slot = document.createElement('div');
    slot.className = 'inventory-slot';
    slot.style.backgroundColor = `#${item.rarity.color.toString(16).padStart(6, '0')}`;
    slot.textContent = item.name.substring(0, 3);
    slot.addEventListener('click', () => equipItem(item));
    container.appendChild(slot);
  });
}

function updateCharacterUI() {
  const p = state.player;
  document.getElementById('char-level').textContent = p.level;
  document.getElementById('char-exp').textContent = `${p.xp}/${p.xpToLevel}`;
  document.getElementById('char-str').textContent = p.strength || p.baseStats[STATS.STRENGTH];
  document.getElementById('char-dex').textContent = p.dexterity || p.baseStats[STATS.DEXTERITY];
  document.getElementById('char-int').textContent = p.intelligence || p.baseStats[STATS.INTELLIGENCE];
  document.getElementById('char-vit').textContent = p.vitality || p.baseStats[STATS.VITALITY];
}

function updateHUD() {
  const p = state.player;
  document.getElementById('hp-fill').style.width = `${(p.hp / p.maxHp) * 100}%`;
  document.getElementById('hp-text').textContent = `${Math.ceil(p.hp)}/${p.maxHp}`;
  document.getElementById('mp-fill').style.width = `${(p.mp / p.maxMp) * 100}%`;
  document.getElementById('mp-text').textContent = `${Math.ceil(p.mp)}/${p.maxMp}`;
  document.getElementById('xp-fill').style.width = `${(p.xp / p.xpToLevel) * 100}%`;
  document.getElementById('level-badge').textContent = p.level;
  document.getElementById('gold').textContent = `💰 ${state.gold}`;
  document.getElementById('kills').textContent = `☠ ${state.kills}`;
}

function log(msg, color = '#e0d8c8') {
  const el = document.createElement('div');
  el.className = 'log-line';
  el.style.color = typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color;
  el.textContent = msg;
  const box = document.getElementById('combat-log');
  box.prepend(el);
  if (box.children.length > 6) box.lastChild.remove();
}

function setupMinimap() {
  const canvas = document.getElementById('minimap-canvas');
  minimapCtx = canvas.getContext('2d');
}

function drawMinimap() {
  if (!minimapCtx) return;
  const ctx = minimapCtx;
  const w = 120, h = 120;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, w, h);

  const scale = 0.8;
  const px = state.player.mesh.position.x;
  const pz = state.player.mesh.position.z;

  // Enemies
  ctx.fillStyle = '#aa3333';
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const dx = (e.mesh.position.x - px) * scale + w / 2;
    const dy = (e.mesh.position.z - pz) * scale + h / 2;
    if (dx > 2 && dx < w - 2 && dy > 2 && dy < h - 2) {
      ctx.beginPath();
      ctx.arc(dx, dy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Loot
  ctx.fillStyle = '#ffdd00';
  for (const drop of state.lootDrops) {
    const dx = (drop.mesh.position.x - px) * scale + w / 2;
    const dy = (drop.mesh.position.z - pz) * scale + h / 2;
    if (dx > 2 && dx < w - 2 && dy > 2 && dy < h - 2) {
      ctx.beginPath();
      ctx.arc(dx, dy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Player
  ctx.fillStyle = '#3366ff';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 4, 0, Math.PI * 2);
  ctx.fill();
}

// ===================== UPDATE LOOPS =====================
function updatePlayer(dt) {
  const p = state.player;
  if (state.isDead) return;

  p.attackCd = Math.max(0, p.attackCd - dt);

  // Move towards target
  if (state.mouseTarget) {
    const targetDist = p.mesh.position.distanceTo(state.mouseTarget);
    if (targetDist > 0.5) {
      const dir = new THREE.Vector3().subVectors(state.mouseTarget, p.mesh.position).normalize();
      p.mesh.position.addScaledVector(dir, CONFIG.playerSpeed * dt);
      p.facing = Math.atan2(dir.x, dir.z);
      p.mesh.rotation.y = p.facing;
      state.isMoving = true;
    } else {
      state.mouseTarget = null;
      state.isMoving = false;
    }
  }

  // Mana regen
  p.mp = Math.min(p.maxMp, p.mp + 5 * dt);

  // Animations
  if (p.mixer && state.playerAnims) {
    if (state.isMoving && state.playerAnims.walk) {
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
  const ppos = state.player.mesh.position;

  for (const e of state.enemies) {
    if (!e.alive) continue;

    const dist = e.mesh.position.distanceTo(ppos);
    e.attackCd = Math.max(0, e.attackCd - dt);

    if (dist < 15) {
      e.state = dist < 2 ? 'attack' : 'chase';
    } else {
      e.state = 'idle';
    }

    if (e.state === 'chase') {
      const dir = new THREE.Vector3().subVectors(ppos, e.mesh.position).normalize();
      e.mesh.position.addScaledVector(dir, e.speed * dt);
      e.mesh.lookAt(ppos.x, e.mesh.position.y, ppos.z);
    }

    if (e.state === 'attack' && e.attackCd <= 0) {
      e.attackCd = 1.5;
      const dmg = e.dmg + Math.floor(Math.random() * 4);
      const finalDmg = Math.max(1, dmg - state.player.defense);
      state.player.hp -= finalDmg;
      log(`${e.type.name} hits for ${finalDmg}`, '#ff6666');
      if (state.player.hp <= 0) onPlayerDeath();
      updateHUD();
    }
  }
}

function updateLoot(dt) {
  for (let i = state.lootDrops.length - 1; i >= 0; i--) {
    const drop = state.lootDrops[i];
    drop.lifetime -= dt;
    drop.bobOffset += dt * 3;
    drop.mesh.position.y += Math.sin(drop.bobOffset) * 0.5 * dt;

    if (drop.lifetime <= 0) {
      scene.remove(drop.mesh);
      state.lootDrops.splice(i, 1);
    }
  }
}

function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.mesh.position.addScaledVector(p.vel, dt);
    p.vel.y -= 8 * dt;
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
  updateIsometricCamera();
}

function onPlayerDeath() {
  if (state.isDead) return;
  state.isDead = true;
  state.player.hp = 0;
  updateHUD();
  document.getElementById('death-screen').classList.remove('hidden');
  let t = 5;
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
  p.mesh.position.set(0, 0.2, 0);
  state.isDead = false;
  document.getElementById('death-screen').classList.add('hidden');
  updateHUD();
  log('Revived at the shrine', '#80c0ff');
}

// ===================== MAIN LOOP =====================
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(state.clock.getDelta(), 0.05);

  if (!state.isPaused) {
    updatePlayer(dt);
    updateEnemies(dt);
    updateLoot(dt);
    updateParticles(dt);
    updateCamera(dt);
    drawMinimap();
  }

  renderer.render(scene, camera);
}

// Boot
init().catch(err => {
  console.error(err);
  document.getElementById('loading-text').textContent = 'Error: ' + err.message;
});

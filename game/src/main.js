// SOLMAR CITY — a sunny open-world crime game built from scratch.
// You are Danny Reyes, new in a bright coastal city with no car and no cash.
// Steal a car, run jobs for your cousin Rosa, dodge the Solmar police, and
// pull off the big score at the Sunset Bank. Everything here — the city, the
// story, the characters, the sounds — is original work made for this entry.
import * as THREE from 'three';
import { CITY, STEP } from './config.js';
import { mulberry32, clamp, dist2D } from './rng.js';
import { buildCity } from './city.js';
import { AudioEngine } from './audio.js';
import { createPlayer, updatePlayerOnFoot, updateCamera } from './player.js';
import { createCar, driveCar, enterCar, exitCar, nearestCar, spawnParkedCars } from './vehicles.js';
import { spawnTraffic, updateTraffic } from './traffic.js';
import { spawnPedestrians, updatePedestrians, scarePedestriansNear } from './pedestrians.js';
import { updatePolice, addCrime, wantedStars } from './police.js';
import { createMissions, updateMissions, onEnemyKilledInMission } from './missions.js';
import { shoot, melee, reload, updateEnemies, updateParticles, initParticles, spawnParticles, damagePlayer } from './combat.js';
import { Hud } from './hud.js';
import { saveGame, loadGame, applySave, clearSave } from './save.js';
import { stageShot, autopilotInput } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 1) || 1;
const shotName = params.get('shot');

const G = {
  rng: mulberry32(seed),
  scene: null,
  camera: null,
  renderer: null,
  city: null,
  player: null,
  cars: [],
  peds: [],
  police: [],
  enemies: [],
  missions: null,
  hud: null,
  audio: new AudioEngine(),
  input: { forward: false, back: false, left: false, right: false, run: false, jump: false, handbrake: false },
  keys: {},
  screen: 'title', // 'title' | 'play' | 'pause'
  time: 0,
  clockHours: 9,
  heat: 0,
  lastCrimeAt: -100,
  bustTimer: 0,
  crashCooldown: 0,
  shake: 0,
  cameraYaw: Math.PI,
  cameraPitch: 0.25,
  pointerLocked: false,
  autopilot: false,
  autopilotStuck: 0,
  shotMode: false,
  shotsFiredRecently: 0,
  nearestCarHint: null,
  lastDamageAt: -100,
  saveTimer: 0,
};

// ---- Callbacks the subsystems use (wired here so modules stay decoupled) ----
G.addCrime = (heat, label) => addCrime(G, heat, label);
G.onCrash = (strength, x, z) => {
  if (G.crashCooldown > 0) return; // one crash event per half second, not per frame
  G.crashCooldown = 0.5;
  G.shake = Math.max(G.shake, 0.3 * strength + 0.2);
  G.audio.crash(strength);
  spawnParticles(x, 1, z, 0xffaa00, 12, 2.5);
  spawnParticles(x, 0.6, z, 0x888888, 8, 2);
  scarePedestriansNear(G, x, z, 18);
  if (G.player.car) G.player.car.health -= 8 * strength;
};
G.spawnParticles = (x, y, z, color, count, spread) => spawnParticles(x, y, z, color, count, spread);
G.spawnFleeingPed = (x, z) => scarePedestriansNear(G, x, z, 10);
G.onEnemyKilled = () => onEnemyKilledInMission(G);

// ---- Renderer / scene ----
function initRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('game').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87c5eb);
  scene.fog = new THREE.Fog(0x9fd0ee, 180, 420);
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 900);
  camera.position.set(0, 40, 120);

  const sun = new THREE.DirectionalLight(0xfff2d0, 2.2);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 500;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd9ff, 0.7));
  G.renderer = renderer;
  G.scene = scene;
  G.camera = camera;
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

function initWorld() {
  G.city = buildCity(G.scene, G.rng);
  initParticles(G.scene);
  G.player = createPlayer(G);
  spawnParkedCars(G);
  spawnTraffic(G);
  spawnPedestrians(G);
  G.hud = new Hud(G);
  createMissions(G);
}

// ---- Screens (title / pause overlays) ----
G.showTitle = () => {
  document.getElementById('title').style.display = 'flex';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('pause').style.display = 'none';
};
G.hideTitle = () => {
  document.getElementById('title').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
};
G.showPause = () => {
  document.getElementById('pause').style.display = 'flex';
};
G.hidePause = () => {
  document.getElementById('pause').style.display = 'none';
};

function lockPointer() {
  try {
    const p = document.getElementById('game').querySelector('canvas').requestPointerLock?.();
    if (p && p.catch) p.catch(() => { /* pointer lock unavailable (headless) — the game still plays */ });
  } catch (e) { /* pointer lock unavailable — the game still plays */ }
}

function startGame(fresh) {
  G.audio.init();
  if (fresh) {
    clearSave();
    location.reload();
    return;
  }
  G.hideTitle();
  G.screen = 'play';
  lockPointer();
}

// ---- Input ----
function bindInput() {
  const keyMap = {
    KeyW: 'forward', ArrowUp: 'forward',
    KeyS: 'back', ArrowDown: 'back',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'run', ShiftRight: 'run',
    Space: 'jump',
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (G.screen === 'play') {
        G.screen = 'pause';
        G.showPause();
        document.exitPointerLock?.();
      } else if (G.screen === 'pause') {
        G.screen = 'play';
        G.hidePause();
      }
      return;
    }
    if (keyMap[e.code]) {
      G.keys[e.code] = true;
      if (e.code === 'Space') e.preventDefault();
    }
    if (e.code === 'KeyE' && G.screen === 'play') tryEnterExitCar();
    if (e.code === 'KeyF' && G.screen === 'play') melee(G);
    if (e.code === 'KeyR' && G.screen === 'play') reload(G);
    if (e.code === 'KeyM') toggleMute();
  });
  addEventListener('keyup', (e) => {
    if (keyMap[e.code]) G.keys[e.code] = false;
  });
  document.addEventListener('pointerlockchange', () => {
    G.pointerLocked = document.pointerLockElement != null;
  });
  addEventListener('mousemove', (e) => {
    if (!G.pointerLocked) return;
    G.cameraYaw -= e.movementX * 0.0028;
    G.cameraPitch = clamp(G.cameraPitch + e.movementY * 0.0022, -0.15, 0.55);
  });
  addEventListener('mousedown', (e) => {
    if (G.screen !== 'play') return;
    if (e.button === 0) {
      if (G.player.onFoot) shoot(G);
      else if (!G.pointerLocked) lockPointer();
    }
  });
  document.getElementById('start-btn').addEventListener('click', () => startGame(false));
  document.getElementById('continue-btn').addEventListener('click', () => startGame(false));
  document.getElementById('resume-btn').addEventListener('click', () => {
    G.screen = 'play';
    G.hidePause();
  });
  document.getElementById('restart-btn').addEventListener('click', () => startGame(true));
  document.getElementById('mute-btn').addEventListener('click', toggleMute);
  document.getElementById('quit-btn').addEventListener('click', () => {
    saveGame(G);
    G.screen = 'title';
    G.hidePause();
    G.showTitle();
    document.exitPointerLock?.();
  });
  // Enter on the title screen also starts the game.
  addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && G.screen === 'title') startGame(false);
  });
}

function toggleMute() {
  G.audio.setMuted(!G.audio.muted);
  document.getElementById('mute-btn').textContent = G.audio.muted ? 'Unmute (M)' : 'Mute (M)';
}

function tryEnterExitCar() {
  const p = G.player;
  if (!p.onFoot) {
    exitCar(G);
    return;
  }
  const car = nearestCar(G, 4);
  if (car) enterCar(G, car);
}

function readInput() {
  const k = G.keys;
  return {
    forward: !!(k.KeyW || k.ArrowUp),
    back: !!(k.KeyS || k.ArrowDown),
    left: !!(k.KeyA || k.ArrowLeft),
    right: !!(k.KeyD || k.ArrowRight),
    run: !!(k.ShiftLeft || k.ShiftRight),
    jump: !!k.Space,
    handbrake: !!k.Space,
  };
}

/** Player car vs other cars: the other car yields — it is pushed aside and
 * slowed, so a cruiser ramming from the side cannot shove the player off
 * the road and wedge the car between buildings. */
function collidePlayerCar(dt) {
  const p = G.player;
  if (p.onFoot || !p.car) return;
  const car = p.car;
  for (const other of G.cars) {
    if (other === car || !other.mesh.visible) continue;
    const d = dist2D(car.x, car.z, other.x, other.z);
    if (d < 3.4 && d > 0.01) {
      const push = 3.4 - d;
      const nx = (other.x - car.x) / d;
      const nz = (other.z - car.z) / d;
      other.x += nx * push;
      other.z += nz * push;
      other.mesh.position.set(other.x, 0, other.z);
      const impact = Math.abs(car.speed);
      if (impact > 5 && G.crashCooldown <= 0) {
        G.onCrash(impact / 30, car.x, car.z);
        car.speed *= 0.85;
        if (other.driver === 'traffic' || other.driver === 'police') other.speed *= 0.4;
        if (other.driver === 'traffic') scarePedestriansNear(G, car.x, car.z, 12);
      } else if (impact <= 5) {
        car.speed *= 0.95;
      }
    }
  }
}

// ---- One fixed world step ----
G.stepWorld = function stepWorld(dt, staging = false) {
  G.time += dt;
  G.clockHours += dt / 120; // one game hour per two real minutes
  if (G.crashCooldown > 0) G.crashCooldown -= dt;
  if (G.shotsFiredRecently > 0) G.shotsFiredRecently -= dt;
  const input = G.autopilot ? autopilotInput(G) : readInput();
  const p = G.player;

  if (G.screen === 'play' || staging) {
    if (p.onFoot) {
      updatePlayerOnFoot(G, input, dt);
    } else {
      driveCar(G, p.car, input, dt);
      collidePlayerCar(dt);
      p.pos.set(p.car.x, 0, p.car.z);
    }
    // "Press E" hint.
    G.nearestCarHint = p.onFoot ? nearestCar(G, 4) : null;

    updateTraffic(G, dt);
    updatePedestrians(G, dt);
    updatePolice(G, dt);
    updateEnemies(G, dt);
    updateMissions(G, dt);
    updateParticles(dt);

    // Speeding past a cop is a crime too.
    if (!p.onFoot && Math.abs(p.car.speed) > 24) {
      const nearestCop = G.police.length ? Math.min(...G.police.map((c) => dist2D(c.x, c.z, p.car.x, p.car.z))) : Infinity;
      if (nearestCop < 45) G.heat = clamp(G.heat + 2 * dt, 0, 100);
    }
    // Slow health regen out of danger.
    if (p.health < 100 && G.time - G.lastDamageAt > 8) p.health = Math.min(100, p.health + 1.5 * dt);

    // Engine sound follows the car.
    G.audio.setEngine(p.onFoot ? 0 : Math.abs(p.car.speed) / 30, !p.onFoot);
    // Water shimmer.
    if (G.city.water) G.city.water.position.y = 0.05 + Math.sin(G.time * 0.7) * 0.05;
    // Beacon pulse.
    if (G.missions.beacon.visible) {
      const s = 1 + Math.sin(G.time * 4) * 0.15;
      G.missions.beacon.scale.set(s, 1, s);
    }
    // Autosave.
    G.saveTimer += dt;
    if (G.saveTimer > 15) {
      G.saveTimer = 0;
      saveGame(G);
    }
  }

  // Camera always updates (title orbits the city).
  if (G.screen === 'title') {
    G.cameraYaw += dt * 0.05;
    const cx = Math.sin(G.cameraYaw) * 130;
    const cz = Math.cos(G.cameraYaw) * 130;
    G.camera.position.set(cx, 55, cz);
    G.camera.lookAt(0, 0, 0);
  } else {
    updateCamera(G, dt);
  }
  G.hud.update();
};

// ---- Boot ----
initRenderer();
initWorld();
bindInput();

const saved = loadGame(G);
if (saved && !shotName) {
  applySave(G, saved);
  document.getElementById('continue-btn').style.display = 'inline-block';
  document.getElementById('continue-btn').textContent = `Continue — $${Math.floor(G.player.money)} · Job ${Math.min(saved.missionIndex + 1, 5)}/5`;
}

if (shotName) {
  stageShot(G, shotName);
} else {
  G.showTitle();
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // Fixed-step the world for stable physics.
  let acc = dt;
  while (acc >= STEP) {
    G.stepWorld(STEP);
    acc -= STEP;
  }
  G.renderer.render(G.scene, G.camera);
}
requestAnimationFrame(loop);

// Expose a tiny debug handle for the automated play-test.
window.__solmar = G;

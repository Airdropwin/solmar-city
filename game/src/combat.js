// Combat: the pistol (ammo, reload, muzzle flash), the melee swing, enemy
// gunmen for the Rival Turf mission, and the particle system used for
// impacts, smoke and sparks.
import * as THREE from 'three';
import { COMBAT } from './config.js';
import { dist2D, range } from './rng.js';

// ---- Particles (one pooled Points cloud per burst is overkill; small meshes) ----
const particlePool = [];
let particleScene = null;

export function initParticles(scene) {
  particleScene = scene;
}

export function spawnParticles(x, y, z, color, count = 10, spread = 2) {
  if (!particleScene) return;
  for (let i = 0; i < count; i += 1) {
    let mesh = particlePool.find((m) => !m.visible);
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.16, 0.16),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      particleScene.add(mesh);
      particlePool.push(mesh);
    }
    mesh.material.color.setHex(color);
    mesh.visible = true;
    mesh.position.set(x + range(Math.random, -0.3, 0.3), y, z + range(Math.random, -0.3, 0.3));
    mesh.userData.vx = range(Math.random, -spread, spread);
    mesh.userData.vy = range(Math.random, 0.5, spread + 1);
    mesh.userData.vz = range(Math.random, -spread, spread);
    mesh.userData.life = range(Math.random, 0.3, 0.7);
  }
}

export function updateParticles(dt) {
  for (const m of particlePool) {
    if (!m.visible) continue;
    m.userData.life -= dt;
    if (m.userData.life <= 0) {
      m.visible = false;
      continue;
    }
    m.position.x += m.userData.vx * dt;
    m.position.y += m.userData.vy * dt;
    m.position.z += m.userData.vz * dt;
    m.userData.vy -= 6 * dt;
  }
}

// ---- Enemies (Rival Turf gunmen) ----
function makeEnemyMesh() {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: 0x8e2f2f });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d5f });
  const pants = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.4), shirt);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.82;
  group.add(head);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  band.position.y = 1.95;
  group.add(band);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.75, 0.3), pants);
  legL.position.set(-0.18, 0.38, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.18;
  group.add(legR);
  return group;
}

export function spawnEnemy(G, x, z) {
  const mesh = makeEnemyMesh();
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  const enemy = {
    mesh,
    x,
    z,
    health: COMBAT.enemyHealth,
    shootTimer: range(G.rng, 0.5, 1.5),
    alive: true,
  };
  G.enemies.push(enemy);
  return enemy;
}

export function updateEnemies(G, dt) {
  const p = G.player;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const d = dist2D(e.x, e.z, p.pos.x, p.pos.z);
    // Walk toward the player until in range, then stand and shoot.
    if (d > 14) {
      const h = Math.atan2(p.pos.x - e.x, p.pos.z - e.z);
      e.x += Math.sin(h) * 3.2 * dt;
      e.z += Math.cos(h) * 3.2 * dt;
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = h;
    } else {
      e.mesh.rotation.y = Math.atan2(p.pos.x - e.x, p.pos.z - e.z);
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        e.shootTimer = COMBAT.enemyShootInterval * range(G.rng, 0.8, 1.3);
        if (d < COMBAT.enemyShootRange) {
          // Inaccurate: they miss about half the time.
          if (G.rng() < 0.5) {
            damagePlayer(G, COMBAT.enemyDamage);
            spawnParticles(p.pos.x, 1.4, p.pos.z, 0xff3333, 5, 1);
          } else {
            spawnParticles(p.pos.x + range(G.rng, -1, 1), 1, p.pos.z + range(G.rng, -1, 1), 0xffcc00, 4, 1);
          }
          G.audio.enemyShot();
          spawnParticles(e.x, 1.4, e.z, 0xffcc00, 4, 1);
        }
      }
    }
  }
}

export function damagePlayer(G, amount) {
  const p = G.player;
  p.health = Math.max(0, p.health - amount);
  p.hurtFlash = 0.5;
  G.hud.flashDamage();
  if (p.health <= 0) {
    // Wasted: respawn at the safehouse with half your cash gone.
    const lost = Math.floor(p.money / 2);
    p.money -= lost;
    p.health = 100;
    G.heat = 0;
    if (p.car) {
      p.car.driver = null;
      p.car = null;
      p.onFoot = true;
      p.mesh.visible = true;
    }
    p.pos.set(G.city.safehouse.x + 10, 0, G.city.safehouse.z + 6);
    p.mesh.position.copy(p.pos);
    G.hud.showToast(`WASTED! You lost $${lost} and woke up at home.`);
    G.audio.busted();
  }
}

/** Fire the pistol from the camera through the crosshair. Returns true on a hit. */
export function shoot(G) {
  const p = G.player;
  if (!p.onFoot) return false;
  if (p.mag <= 0) {
    G.hud.showToast('Click! Reload with R.');
    return false;
  }
  p.mag -= 1;
  G.audio.gunshot();
  G.shotsFiredRecently = 1.5;
  // Muzzle flash at the gun.
  const muzzle = new THREE.Vector3(p.pos.x, p.pos.y + 1.3, p.pos.z);
  spawnParticles(muzzle.x, muzzle.y, muzzle.z, 0xffdd55, 6, 1);
  G.shake = Math.max(G.shake, 0.12);
  // Raycast against enemies and cars.
  const dir = new THREE.Vector3();
  G.camera.getWorldDirection(dir);
  const origin = G.camera.position.clone();
  let bestD = 60;
  let hitEnemy = null;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    // Sphere test against the enemy's torso.
    const to = new THREE.Vector3(e.x - origin.x, 1.3 - origin.y, e.z - origin.z);
    const along = to.dot(dir);
    if (along < 0 || along > bestD) continue;
    const closest = origin.clone().add(dir.clone().multiplyScalar(along));
    if (closest.distanceTo(new THREE.Vector3(e.x, 1.3, e.z)) < 1.1) {
      bestD = along;
      hitEnemy = e;
    }
  }
  if (hitEnemy) {
    hitEnemy.health -= COMBAT.pistolDamage;
    spawnParticles(hitEnemy.x, 1.4, hitEnemy.z, 0xcc2222, 10, 2);
    if (hitEnemy.health <= 0) {
      hitEnemy.alive = false;
      hitEnemy.mesh.visible = false;
      G.scene.remove(hitEnemy.mesh);
      G.enemies = G.enemies.filter((e) => e !== hitEnemy);
      G.onEnemyKilled(hitEnemy);
    }
    return true;
  }
  // Missed: spark where the ray hits the ground.
  const t = origin.y > 0.01 ? origin.y / Math.max(0.05, -dir.y) : 0;
  if (t > 0 && t < 60) {
    spawnParticles(origin.x + dir.x * t, 0.2, origin.z + dir.z * t, 0xffcc66, 5, 1.5);
  }
  return false;
}

/** Melee swing: hits the nearest enemy or pedestrian in front of the player. */
export function melee(G) {
  const p = G.player;
  if (!p.onFoot) return;
  G.audio.punch();
  const fx = Math.sin(p.yaw);
  const fz = Math.cos(p.yaw);
  for (const e of [...G.enemies]) {
    if (!e.alive) continue;
    const d = dist2D(p.pos.x, p.pos.z, e.x, e.z);
    const facing = ((e.x - p.pos.x) * fx + (e.z - p.pos.z) * fz) / Math.max(0.01, d);
    if (d < COMBAT.meleeRange && facing > 0.3) {
      e.health -= COMBAT.meleeDamage;
      spawnParticles(e.x, 1.3, e.z, 0xff5533, 8, 2);
      if (e.health <= 0) {
        e.alive = false;
        e.mesh.visible = false;
        G.scene.remove(e.mesh);
        G.enemies = G.enemies.filter((en) => en !== e);
        G.onEnemyKilled(e);
      }
      G.addCrime(4, 'assault');
      return;
    }
  }
  // Shoving a pedestrian counts as assault too.
  for (const ped of G.peds) {
    if (!ped.alive) continue;
    const d = dist2D(p.pos.x, p.pos.z, ped.x, ped.z);
    if (d < COMBAT.meleeRange) {
      ped.scared = 4;
      ped.heading = Math.atan2(ped.x - p.pos.x, ped.z - p.pos.z);
      G.addCrime(6, 'assaulted a pedestrian');
      G.hud.showToast('Assault! The cops noticed.');
      return;
    }
  }
}

export function reload(G) {
  const p = G.player;
  if (!p.onFoot || p.mag >= 12) return;
  const need = 12 - p.mag;
  const taken = Math.min(need, p.ammo);
  if (taken <= 0) {
    G.hud.showToast('Out of ammo! Find ammo at the safehouse.');
    return;
  }
  p.ammo -= taken;
  p.mag += taken;
  G.hud.showToast(`Reloaded. ${p.mag}/12 in the mag, ${p.ammo} spare.`);
}

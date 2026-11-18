// The Solmar Police Department: the wanted system (heat -> stars), police
// cruisers that chase and ram, and getting busted.
import { CITY, WANTED } from './config.js';
import { angleDiff, clamp, dist2D } from './rng.js';
import { nearestRoad, resolveBuildingCollisions } from './city.js';
import { createCar } from './vehicles.js';

export function wantedStars(G) {
  return Math.min(WANTED.maxStars, Math.floor(G.heat / WANTED.heatPerStar));
}

/** A crime: add heat, remember when it happened, and tell the player. */
export function addCrime(G, heat, label) {
  G.heat = clamp(G.heat + heat, 0, 100);
  G.lastCrimeAt = G.time;
  G.hud.flashWanted();
}

/** How many cruisers the current wanted level should have on the road. */
function desiredCruisers(G) {
  const stars = wantedStars(G);
  return stars === 0 ? 0 : Math.min(1 + stars, 4);
}

function spawnCruiser(G) {
  const p = G.player;
  const px = p.onFoot ? p.pos.x : p.car.x;
  const pz = p.onFoot ? p.pos.z : p.car.z;
  // Spawn on a road 60-90 m away, roughly behind the player's view.
  const angle = Math.random() * Math.PI * 2;
  let x = clamp(px + Math.sin(angle) * 75, -CITY.halfExtent, CITY.halfExtent);
  let z = clamp(pz + Math.cos(angle) * 75, -CITY.halfExtent, CITY.halfExtent);
  // Snap onto the nearest road so the cruiser starts on asphalt.
  const roadX = CITY.roads.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
  const roadZ = CITY.roads.reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a));
  if (Math.abs(x - roadX) < Math.abs(z - roadZ)) x = roadX + 3;
  else z = roadZ + 3;
  return placeCruiser(G, x, z, Math.atan2(px - x, pz - z), 12);
}

/** Put a cruiser at an exact spot (used by the chase screenshot staging). */
export function placeCruiser(G, x, z, heading, speed = 12) {
  const car = createCar(G, x, z, heading, { isPolice: true, driver: 'police' });
  car.speed = speed;
  car.cruiseSpeed = 16;
  G.police.push(car);
  return car;
}

function removeCruiser(G, car) {
  car.driver = null;
  car.mesh.visible = false;
  G.scene.remove(car.mesh);
  G.cars = G.cars.filter((c) => c !== car);
  G.police = G.police.filter((c) => c !== car);
}

/** Grid chase: cruisers follow the roads instead of cutting through blocks.
 * Close up they ram straight at the player; further away they drive along
 * their current road to the intersection with the player's road, then turn. */
function chaseWaypoint(car, px, pz) {
  const d = dist2D(car.x, car.z, px, pz);
  if (d < 18) return { x: px, z: pz };
  const roadX = nearestRoad(car.x);
  const roadZ = nearestRoad(car.z);
  const onVerticalRoad = Math.abs(car.x - roadX) <= Math.abs(car.z - roadZ);
  if (onVerticalRoad) {
    if (Math.abs(px - roadX) < 9) return { x: px, z: pz }; // same road: straight at them
    return { x: roadX, z: nearestRoad(pz) };
  }
  if (Math.abs(pz - roadZ) < 9) return { x: px, z: pz };
  return { x: nearestRoad(px), z: roadZ };
}

/** Chase AI: steer toward the player, ram on contact, give up when far away. */
export function updatePolice(G, dt) {
  const p = G.player;
  const px = p.onFoot ? p.pos.x : p.car.x;
  const pz = p.onFoot ? p.pos.z : p.car.z;
  const playerSpeed = p.onFoot ? 0 : Math.abs(p.car.speed);
  const stars = wantedStars(G);

  // Heat decays only when the cops have lost sight of you for a while.
  const nearestCop = G.police.length
    ? Math.min(...G.police.map((c) => dist2D(c.x, c.z, px, pz)))
    : Infinity;
  if (stars > 0 && G.time - G.lastCrimeAt > WANTED.decayDelay && nearestCop > 55) {
    G.heat = Math.max(0, G.heat - WANTED.decayPerSecond * dt);
  }

  // Keep the right number of cruisers around.
  while (G.police.length < desiredCruisers(G)) spawnCruiser(G);
  while (G.police.length > desiredCruisers(G)) removeCruiser(G, G.police[G.police.length - 1]);

  // Siren while any cruiser is close.
  G.audio.setSiren(G.police.length > 0 && nearestCop < 90);

  for (const car of [...G.police]) {
    const d = dist2D(car.x, car.z, px, pz);
    // Lost you: despawn when very far and wanted is low.
    if (d > 160 && stars <= 1) {
      removeCruiser(G, car);
      continue;
    }
    // Steer toward the next grid waypoint (or straight at the player up close).
    const wp = chaseWaypoint(car, px, pz);
    const targetHeading = Math.atan2(wp.x - car.x, wp.z - car.z);
    const diff = angleDiff(car.heading, targetHeading);
    car.heading += clamp(diff, -1.8 * dt, 1.8 * dt);
    // Police are fast, but not quite as fast as a flat-out player car. Ease
    // off when close so they bump the player instead of gluing onto the car.
    let targetSpeed = p.onFoot ? 13 : Math.min(26, playerSpeed + 4);
    if (!p.onFoot && d < 8) targetSpeed = Math.min(targetSpeed, playerSpeed * 0.9 + 2);
    car.speed += clamp(targetSpeed - car.speed, -14 * dt, 10 * dt);
    car.ramCooldown = Math.max(0, (car.ramCooldown || 0) - dt);
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    // Cruisers respect buildings too — no driving through houses.
    const resolved = resolveBuildingCollisions(G.city, nx, nz, 1.6);
    if (resolved.hit) car.speed *= 0.7;
    car.x = clamp(resolved.x, -CITY.worldHalf, CITY.worldHalf);
    car.z = clamp(resolved.z, -CITY.worldHalf, CITY.waterZ - 10);
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    // Flash the light bar, red and blue alternating.
    const phase = Math.floor(G.time * 4) % 2 === 0;
    const bar = car.mesh.getObjectByName('lightbar');
    const bar2 = car.mesh.getObjectByName('lightbar2');
    if (bar) bar.material.color.setHex(phase ? 0xff2222 : 0x2244ff);
    if (bar2) bar2.material.color.setHex(phase ? 0x2244ff : 0xff2222);

    // Ram the player — but only once per cooldown, so a cruiser bumps and
    // falls back instead of pinning the player's car to a standstill.
    if (d < 3.4) {
      if (p.onFoot) {
        // Busted: a cruiser sits on you for a couple of seconds.
        G.bustTimer += dt;
        if (G.bustTimer > WANTED.bustTime) bustPlayer(G);
      } else if ((car.ramCooldown || 0) <= 0) {
        car.ramCooldown = 1.2;
        G.bustTimer = 0;
        p.car.speed *= 0.85;
        p.car.health -= 4;
        if (Math.abs(p.car.speed) > 4) {
          G.shake = Math.max(G.shake, 0.35);
          G.audio.crash(0.5);
          G.spawnParticles(car.x, 1, car.z, 0xffaa00, 8, 2);
        }
        car.speed *= 0.5;
        // Being rammed hard can wreck your car.
        if (p.car.health <= 0) {
          G.spawnParticles(p.car.x, 1, p.car.z, 0x555555, 20, 3);
          p.car.health = 40;
          p.car.speed = 0;
          G.hud.showToast('Your car is wrecked! Get out and run!');
        }
      }
    } else {
      G.bustTimer = Math.max(0, G.bustTimer - dt);
    }
  }
}

/** Busted: fined, wanted cleared, dropped back at the safehouse. */
export function bustPlayer(G) {
  const p = G.player;
  const fine = Math.min(p.money, WANTED.fine);
  p.money -= fine;
  p.health = Math.max(p.health, 50);
  G.heat = 0;
  G.bustTimer = 0;
  // Clear all cruisers.
  for (const car of [...G.police]) removeCruiser(G, car);
  if (p.car) {
    p.car.driver = null;
    p.car = null;
    p.onFoot = true;
    p.mesh.visible = true;
  }
  p.pos.set(G.city.safehouse.x + 10, 0, G.city.safehouse.z + 6);
  p.mesh.position.copy(p.pos);
  G.cameraYaw = Math.PI;
  G.audio.busted();
  G.hud.showToast(`BUSTED! The cops fined you $${fine} and dropped you at home.`);
  G.hud.flashDamage();
}

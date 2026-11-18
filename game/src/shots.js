// Screenshot staging: ?shot=<name>&seed=1 puts the real game into a fixed,
// lived-in scene so each screenshot shows the actual systems working.
// The world is seeded, the scene is played forward a fixed number of steps
// with an autopilot, and the first rendered frame is already the scene.
import { STEP } from './config.js';
import { enterCar, nearestCar } from './vehicles.js';
import { startMission } from './missions.js';
import { placeCruiser } from './police.js';
import { dist2D } from './rng.js';

/** Drive the car along a fixed loop of road waypoints, steering toward the
 * next one. Keeps the car inside the city for the whole screenshot. */
export function autopilotInput(G) {
  const car = G.player.car;
  if (!car) return { forward: false, back: false, left: false, right: false, run: false, jump: false, handbrake: false };
  const route = G.autopilotRoute || [[112, 56], [112, -56], [-112, -56], [-112, 112], [112, 112]];
  let wp = G.autopilotWp || 0;
  const [tx, tz] = route[wp];
  if (dist2D(car.x, car.z, tx, tz) < 18) {
    wp = (wp + 1) % route.length;
    G.autopilotWp = wp;
  }
  const [nx, nz] = route[wp];
  const targetHeading = Math.atan2(nx - car.x, nz - car.z);
  let diff = targetHeading - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  // If we are crawling, we are stuck against something: back up.
  const stuck = Math.abs(car.speed) < 1;
  if (stuck) G.autopilotStuck = (G.autopilotStuck || 0) + 1;
  else G.autopilotStuck = 0;
  const reversing = G.autopilotStuck > 90 && G.autopilotStuck < 180;
  if (G.autopilotStuck > 240) G.autopilotStuck = 0;
  return {
    forward: !reversing,
    back: reversing,
    left: diff < -0.08,
    right: diff > 0.08,
    run: false,
    jump: false,
    handbrake: false,
  };
}

function putPlayerInCar(G, x, z, heading) {
  const car = nearestCar(G, 500);
  // Teleport the nearest parked car next to the player if none is close.
  if (car) {
    car.x = x;
    car.z = z;
    car.heading = heading;
    car.mesh.position.set(x, 0, z);
    car.mesh.rotation.y = heading;
    car.parked = false;
    car.speed = 8;
    G.player.pos.set(x, 0, z);
    enterCar(G, car);
    // Stealing for a screenshot should not add wanted heat on top of the scene.
    G.heat = 0;
  }
  return car;
}

/** The mission-intro dialog overlaps the action in the driving shots; hide it. */
function hideDialog(G) {
  const dialog = document.getElementById('dialog');
  if (dialog) dialog.style.opacity = '0';
}

export function stageShot(G, name) {
  G.shotMode = true;
  G.screen = 'play';
  G.hideTitle();
  if (name === 'start') {
    G.screen = 'title';
    G.showTitle();
    for (let i = 0; i < 5 / STEP; i += 1) G.stepWorld(STEP, true);
    return;
  }
  if (name === 'drive') {
    putPlayerInCar(G, 0, 56, Math.PI / 2);
    G.heat = 20; // one star
    G.lastCrimeAt = G.time;
    G.autopilot = true;
    G.autopilotRoute = [[112, 56], [112, -56], [-112, -56], [-112, 112], [112, 112]];
    G.autopilotWp = 0;
    for (let i = 0; i < 6 / STEP; i += 1) G.stepWorld(STEP, true);
    hideDialog(G);
    return;
  }
  if (name === 'chase') {
    putPlayerInCar(G, -56, 0, Math.PI / 2);
    G.heat = 62; // three stars
    G.lastCrimeAt = G.time;
    G.autopilot = true;
    G.autopilotRoute = [[56, 0], [56, 112], [-112, 112], [-112, -112], [112, -112], [112, 0]];
    G.autopilotWp = 0;
    // Six seconds on the first straight leg, then pull two of the existing
    // cruisers right behind the player so the frame reads as a chase.
    for (let i = 0; i < 6 / STEP; i += 1) G.stepWorld(STEP, true);
    const car = G.player.car;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const spots = [[14, 0], [26, 1]];
    for (let i = 0; i < 2; i += 1) {
      const [back, side] = spots[i];
      const x = car.x - fx * back - fz * side;
      const z = car.z - fz * back + fx * side;
      if (G.police[i]) {
        const cop = G.police[i];
        cop.x = x;
        cop.z = z;
        cop.heading = car.heading;
        cop.speed = car.speed;
        cop.mesh.position.set(x, 0, z);
        cop.mesh.rotation.y = car.heading;
      } else {
        placeCruiser(G, x, z, car.heading, car.speed);
      }
    }
    hideDialog(G);
    return;
  }
  if (name === 'mission') {
    // Mission 2 (Package Run) on foot, standing at the plaza with the beacon.
    startMission(G, 1);
    G.player.pos.set(-20, 0, -20);
    G.player.mesh.position.copy(G.player.pos);
    G.cameraYaw = Math.PI * 0.75;
    G.cameraPitch = 0.25;
    for (let i = 0; i < 2 / STEP; i += 1) G.stepWorld(STEP, true);
    return;
  }
  // Unknown shot name: title.
  G.screen = 'title';
  G.showTitle();
}

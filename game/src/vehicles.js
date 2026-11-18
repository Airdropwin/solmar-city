// Cars: how they look, how the player drives them, and how they collide.
// One Car object serves parked cars, traffic cars and police cars; the
// `driver` field says who is in charge ('player', 'traffic', 'police', null).
import * as THREE from 'three';
import { CAR, CITY, PALETTE } from './config.js';
import { clamp, dist2D, pick } from './rng.js';
import { resolveBuildingCollisions } from './city.js';

let carId = 0;

export function makeCarMesh(color, isPolice = false) {
  const group = new THREE.Group();
  // Police cruisers are white with a blue cabin and a red/blue light bar,
  // so they read as police from any angle.
  const bodyColor = isPolice ? 0xf2f2f2 : color;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.65, 4.2),
    new THREE.MeshLambertMaterial({ color: bodyColor }),
  );
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.6, 2.0),
    new THREE.MeshLambertMaterial({ color: isPolice ? 0x2f5aa8 : 0x222a33 }),
  );
  cabin.position.set(0, 1.15, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  // Headlights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff8c0 });
  for (const lx of [-0.6, 0.6]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
    light.position.set(lx, 0.6, 2.12);
    group.add(light);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.22, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    bar.position.set(-0.32, 1.55, -0.2);
    bar.name = 'lightbar';
    group.add(bar);
    const bar2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.22, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }),
    );
    bar2.position.set(0.32, 1.55, -0.2);
    bar2.name = 'lightbar2';
    group.add(bar2);
  }
  group.userData.wheels = wheels;
  return group;
}

export function createCar(G, x, z, heading, opts = {}) {
  const color = opts.color ?? pick(G.rng, PALETTE.car);
  const isPolice = opts.isPolice ?? false;
  const mesh = makeCarMesh(isPolice ? PALETTE.police : color, isPolice);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  G.scene.add(mesh);
  const car = {
    id: carId += 1,
    mesh,
    x,
    z,
    heading,
    speed: 0,
    steer: 0,
    health: CAR.maxHealth,
    color,
    isPolice,
    isTaxi: opts.isTaxi ?? false,
    driver: opts.driver ?? null, // 'player' | 'traffic' | 'police' | null (parked)
    parked: opts.parked ?? false,
    smoke: 0,
    stuckTimer: 0,
  };
  G.cars.push(car);
  return car;
}

/** Arcade car physics: throttle, steering, handbrake, building collision. */
export function driveCar(G, car, input, dt) {
  const accelInput = input.forward ? 1 : input.back ? -1 : 0;
  const steerInput = input.left ? -1 : input.right ? 1 : 0;
  const handbrake = input.handbrake;

  // Steering eases toward the target angle, faster at low speed.
  const steerTarget = steerInput * CAR.steerMax * (car.speed >= 0 ? 1 : -1);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);

  if (accelInput > 0) {
    car.speed += CAR.accel * dt;
  } else if (accelInput < 0) {
    if (car.speed > 0.5) car.speed -= CAR.brake * dt; // brake first
    else car.speed -= CAR.accel * 0.6 * dt; // then reverse
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt); // drag
  }
  if (handbrake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 18 * dt);
    car.heading += car.steer * dt * 2.2 * Math.sign(car.speed); // slide the tail out
  }
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);

  // Bicycle-ish steering: heading follows the front wheels.
  const turnRate = (car.speed / 2.6) * Math.tan(car.steer);
  car.heading += turnRate * dt;

  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const resolved = resolveBuildingCollisions(G.city, nx, nz, CAR.radius);
  if (resolved.hit) {
    if (Math.abs(car.speed) > 6) {
      G.onCrash(Math.abs(car.speed) / CAR.maxSpeed, car.x, car.z);
      car.speed *= -0.25; // bounce back a little
    } else {
      car.speed *= 0.5;
    }
  }
  car.x = clamp(resolved.x, -CITY.worldHalf, CITY.worldHalf);
  car.z = clamp(resolved.z, -CITY.worldHalf, CITY.waterZ - 10); // stay out of the sea

  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // Spin the wheels.
  const wheels = car.mesh.userData.wheels;
  if (wheels) {
    for (const w of wheels) w.rotation.x += (car.speed * dt) / 0.38;
  }
  // Damage smoke.
  if (car.health < 40) {
    car.smoke += dt;
    if (car.smoke > 0.12) {
      car.smoke = 0;
      G.spawnParticles(car.x, 1.2, car.z, 0x777777, 6, 1.2);
    }
  }
  return car.speed;
}

/** The player gets into `car` (stealing it if it was parked or owned by AI). */
export function enterCar(G, car) {
  const p = G.player;
  if (car.driver === 'traffic') {
    // Jack the driver out: the car is now yours, the driver flees on foot.
    G.addCrime(10, 'stole a car');
    G.spawnFleeingPed(car.x + 2, car.z + 2);
  } else if (car.parked) {
    G.addCrime(8, 'stole a parked car');
    car.parked = false;
  }
  if (p.car) p.car.driver = null;
  car.driver = 'player';
  p.car = car;
  p.onFoot = false;
  p.mesh.visible = false;
  G.hud.showToast(car.isPolice ? 'You took a police cruiser!' : 'You got in the car. Drive!');
}

/** The player steps out next to the car. */
export function exitCar(G) {
  const p = G.player;
  if (!p.car) return;
  const car = p.car;
  car.driver = null;
  const sideX = car.x + Math.cos(car.heading) * 2.2;
  const sideZ = car.z - Math.sin(car.heading) * 2.2;
  const resolved = resolveBuildingCollisions(G.city, sideX, sideZ, 0.7);
  p.pos.set(resolved.x, 0, resolved.z);
  p.yaw = car.heading;
  p.car = null;
  p.onFoot = true;
  p.mesh.visible = true;
  p.mesh.position.copy(p.pos);
}

/** Nearest drivable car within `range` of the player. */
export function nearestCar(G, range = 4) {
  let best = null;
  let bestD = range;
  for (const car of G.cars) {
    if (car.driver === 'player') continue;
    const d = dist2D(G.player.pos.x, G.player.pos.z, car.x, car.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** Scatter parked cars along road edges, plus a few taxis. */
export function spawnParkedCars(G) {
  const rng = G.rng;
  const roads = CITY.roads;
  for (let i = 0; i < 22; i += 1) {
    const horizontal = rng() < 0.5;
    const road = roads[Math.floor(rng() * roads.length)];
    const along = (Math.floor(rng() * 7) - 3) * CITY.pitch + (rng() < 0.5 ? 14 : -14);
    const side = rng() < 0.5 ? 4.6 : -4.6;
    const x = horizontal ? along : road + side;
    const z = horizontal ? road + side : along;
    // Parked parallel to the road: along X on a horizontal road, along Z on
    // a vertical one (the car's long axis is its local Z).
    const heading = horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
    if (Math.abs(x) > CITY.halfExtent || Math.abs(z) > CITY.halfExtent) continue;
    const car = createCar(G, x, z, heading, { parked: true, isTaxi: rng() < 0.15 });
    if (car.isTaxi) {
      // Taxi roof sign.
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.22, 0.9),
        new THREE.MeshBasicMaterial({ color: PALETTE.taxi }),
      );
      sign.position.set(0, 1.55, -0.2);
      car.mesh.add(sign);
    }
  }
}

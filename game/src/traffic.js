// Traffic: AI cars that cruise the road grid, turn at intersections, and
// panic-brake when the player blocks the road. They are also the cars the
// player can steal.
//
// Heading convention (shared with driveCar): forward = (sin h, cos h), so
// h = PI/2 drives +X, h = 0 drives +Z. Right-hand traffic: on a road along
// X the +3 lane (south side) drives +X; on a road along Z the -3 lane
// (west side) drives +Z.
import { CITY } from './config.js';
import { angleDiff, clamp, dist2D, pick, range } from './rng.js';
import { createCar } from './vehicles.js';
import { nearestRoad } from './city.js';

const TRAFFIC_COUNT = 14;
const LANE = 3; // lane offset from the road centreline

/** Pick a random road-line point to spawn on, with a heading along the road. */
function randomRoadSpawn(G) {
  const rng = G.rng;
  const horizontal = rng() < 0.5;
  const road = pick(rng, CITY.roads);
  const along = (Math.floor(rng() * 7) - 3) * CITY.pitch + range(rng, -20, 20); // stay inside the road grid
  const lane = rng() < 0.5 ? LANE : -LANE;
  const x = horizontal ? along : road + lane;
  const z = horizontal ? road + lane : along;
  // Heading along the road; the lane side decides the direction.
  let heading;
  if (horizontal) heading = lane > 0 ? Math.PI / 2 : -Math.PI / 2; // east / west
  else heading = lane > 0 ? Math.PI : 0; // north / south
  return { x, z, heading };
}

export function spawnTraffic(G) {
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const s = randomRoadSpawn(G);
    if (dist2D(s.x, s.z, G.player.pos.x, G.player.pos.z) < 30) continue;
    const car = createCar(G, s.x, s.z, s.heading, { driver: 'traffic' });
    car.speed = range(G.rng, 6, 10);
    car.cruiseSpeed = car.speed;
  }
}

/**
 * A car is at an intersection when it is centred on a crossing road line
 * along its travel axis, while its cross-track position is near its own
 * road line (within the lane offset plus a small margin). A plain "within
 * 1.2 of a grid multiple" test never fires, because the lane itself sits
 * 3 metres off the centreline.
 */
function atIntersection(car) {
  const dx = Math.abs(car.x - nearestRoad(car.x));
  const dz = Math.abs(car.z - nearestRoad(car.z));
  const along = Math.abs(Math.sin(car.heading)) > 0.7 ? dx : dz;
  const across = Math.abs(Math.sin(car.heading)) > 0.7 ? dz : dx;
  return along < 2 && across < LANE + 1.5;
}

/** Steer a traffic car along the grid: keep to its lane, turn at intersections. */
export function updateTraffic(G, dt) {
  const p = G.player;
  for (const car of G.cars) {
    if (car.driver !== 'traffic') continue;
    // Panic brake when the player (on foot or in a car) is right ahead.
    const aheadX = car.x + Math.sin(car.heading) * 8;
    const aheadZ = car.z + Math.cos(car.heading) * 8;
    const playerDist = p.onFoot
      ? dist2D(aheadX, aheadZ, p.pos.x, p.pos.z)
      : dist2D(aheadX, aheadZ, p.car.x, p.car.z);
    const blocked = playerDist < 4;
    // Decide a turn when centred on an intersection (once per crossing).
    const onCrossing = atIntersection(car);
    if (onCrossing && !car.turnedAt) {
      car.turnedAt = true;
      const r = G.rng();
      const goingX = Math.abs(Math.sin(car.heading)) > 0.7;
      if (r < 0.3) {
        // Turn left or right onto the crossing road.
        car.heading += (G.rng() < 0.5 ? 1 : -1) * Math.PI / 2;
      } else if (r < 0.36) {
        car.heading += Math.PI; // U-turn, rare
      }
      // Snap onto the new road's lane: after the turn the cross-track axis
      // is the other one, so snap that coordinate, not the along-track one.
      if (goingX) {
        car.x = nearestRoad(car.x) + (Math.cos(car.heading) > 0 ? -LANE : LANE);
      } else {
        car.z = nearestRoad(car.z) + (Math.sin(car.heading) > 0 ? LANE : -LANE);
      }
    } else if (!onCrossing) {
      car.turnedAt = false;
    }
    // Keep to the lane: steer toward a heading that points slightly toward
    // the lane centreline while keeping the along-road direction.
    const alongX = Math.abs(Math.sin(car.heading)) > 0.7;
    if (alongX) {
      const laneZ = nearestRoad(car.z) + (Math.sin(car.heading) > 0 ? LANE : -LANE);
      const err = laneZ - car.z;
      const dirX = Math.sin(car.heading) > 0 ? 1 : -1;
      const target = Math.atan2(dirX, clamp(err * 0.12, -0.6, 0.6));
      car.heading += angleDiff(car.heading, target) * Math.min(1, dt * 4);
    } else {
      const laneX = nearestRoad(car.x) + (Math.cos(car.heading) > 0 ? -LANE : LANE);
      const err = laneX - car.x;
      const dirZ = Math.cos(car.heading) > 0 ? 1 : -1;
      const target = Math.atan2(clamp(err * 0.12, -0.6, 0.6), dirZ);
      car.heading += angleDiff(car.heading, target) * Math.min(1, dt * 4);
    }
    const targetSpeed = blocked ? 0 : car.cruiseSpeed;
    car.speed += clamp(targetSpeed - car.speed, -12 * dt, 8 * dt);
    // Grid edge: turn around instead of driving off the map into the grass
    // (there are no intersections out there, so a car that leaves the grid
    // would otherwise drive straight to the world boundary and sit there).
    const alongX2 = Math.abs(Math.sin(car.heading)) > 0.7;
    const pastEdge = alongX2
      ? Math.abs(car.x) > CITY.halfExtent + 8
      : Math.abs(car.z) > CITY.halfExtent + 8;
    if (pastEdge && !car.edgeTurned) {
      car.edgeTurned = true;
      car.heading += Math.PI; // U-turn; lane-keeping re-centres the new lane
    } else if (!pastEdge) {
      car.edgeTurned = false;
    }
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    // Soft car-car avoidance: slow down when another car is close ahead.
    let carAhead = false;
    for (const other of G.cars) {
      if (other === car) continue;
      if (dist2D(nx, nz, other.x, other.z) < 5) { carAhead = true; break; }
    }
    if (carAhead) car.speed = Math.max(0, car.speed - 10 * dt);
    car.x = clamp(nx, -CITY.worldHalf, CITY.worldHalf);
    car.z = clamp(nz, -CITY.worldHalf, CITY.worldHalf);
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }
}

/** A traffic car near (x, z) — used when the player rams into one. */
export function trafficCarNear(G, x, z, range) {
  for (const car of G.cars) {
    if (car.driver === 'traffic' && dist2D(x, z, car.x, car.z) < range) return car;
  }
  return null;
}

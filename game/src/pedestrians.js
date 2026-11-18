// Pedestrians: ordinary Solmar residents strolling the sidewalks, who run
// away when a car bears down on them or a gun goes off nearby.
import * as THREE from 'three';
import { CITY } from './config.js';
import { clamp, dist2D, pick, range } from './rng.js';

const PED_COUNT = 24;
const SHIRT_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0x34495e];

function makePedMesh(color) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.35), shirt);
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skin);
  head.position.y = 1.62;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.26), pants);
  legL.position.set(-0.15, 0.33, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.15;
  group.add(legR);
  group.userData.legL = legL;
  group.userData.legR = legR;
  return group;
}

export function spawnPedestrians(G) {
  for (let i = 0; i < PED_COUNT; i += 1) {
    const mesh = makePedMesh(pick(G.rng, SHIRT_COLORS));
    G.scene.add(mesh);
    const road = pick(G.rng, CITY.roads);
    const along = (Math.floor(G.rng() * 7) - 3) * CITY.pitch + range(G.rng, -20, 20);
    const horizontal = G.rng() < 0.5;
    const side = G.rng() < 0.5 ? 8 : -8; // just off the asphalt, on the sidewalk
    const x = horizontal ? along : road + side;
    const z = horizontal ? road + side : along;
    const ped = {
      mesh,
      x: clamp(x, -CITY.halfExtent, CITY.halfExtent),
      z: clamp(z, -CITY.halfExtent, CITY.halfExtent),
      heading: G.rng() * Math.PI * 2,
      speed: range(G.rng, 1.2, 2.2),
      scared: 0,
      phase: G.rng() * 6,
      alive: true,
    };
    mesh.position.set(ped.x, 0, ped.z);
    G.peds.push(ped);
  }
}

/** Every living pedestrian near (x, z) turns and runs away from it. */
export function scarePedestriansNear(G, x, z, radius) {
  for (const ped of G.peds) {
    if (!ped.alive) continue;
    if (dist2D(ped.x, ped.z, x, z) < radius) {
      ped.scared = 3 + G.rng() * 2;
      ped.heading = Math.atan2(ped.x - x, ped.z - z) + range(G.rng, -0.4, 0.4);
    }
  }
}

export function updatePedestrians(G, dt) {
  const p = G.player;
  for (const ped of G.peds) {
    if (!ped.alive) continue;
    // Fear: a fast car or the player with a gun nearby.
    const threatX = p.onFoot ? p.pos.x : p.car.x;
    const threatZ = p.onFoot ? p.pos.z : p.car.z;
    const threatSpeed = p.onFoot ? 0 : Math.abs(p.car.speed);
    const dThreat = dist2D(ped.x, ped.z, threatX, threatZ);
    if (dThreat < 6 && (threatSpeed > 8 || G.shotsFiredRecently > 0)) {
      ped.scared = Math.max(ped.scared, 2.5);
      ped.heading = Math.atan2(ped.x - threatX, ped.z - threatZ);
    }
    let speed = ped.speed;
    if (ped.scared > 0) {
      ped.scared -= dt;
      speed = 6.5;
    } else if (G.rng() < dt * 0.05) {
      // Occasionally change direction at an intersection.
      ped.heading += (G.rng() < 0.5 ? 1 : -1) * Math.PI / 2;
    }
    const nx = ped.x + Math.sin(ped.heading) * speed * dt;
    const nz = ped.z + Math.cos(ped.heading) * speed * dt;
    if (Math.abs(nx) > CITY.halfExtent || Math.abs(nz) > CITY.halfExtent) {
      ped.heading += Math.PI;
    } else {
      ped.x = nx;
      ped.z = nz;
    }
    ped.phase += dt * speed * 2.4;
    const swing = Math.sin(ped.phase) * 0.5;
    ped.mesh.userData.legL.rotation.x = swing;
    ped.mesh.userData.legR.rotation.x = -swing;
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.heading;
    // The player ran one over: crime, and the ped is gone (respawns later).
    const px = p.onFoot ? p.pos.x : p.car.x;
    const pz = p.onFoot ? p.pos.z : p.car.z;
    const pr = p.onFoot ? 0.9 : 2.0;
    if (dist2D(ped.x, ped.z, px, pz) < pr) {
      if (!p.onFoot && Math.abs(p.car.speed) > 2) {
        ped.alive = false;
        ped.mesh.visible = false;
        G.addCrime(14, 'hit a pedestrian');
        G.spawnParticles(ped.x, 1, ped.z, 0xcc2222, 14, 3);
        G.audio.crash(0.8);
        G.hud.showToast('You hit a pedestrian! The cops noticed.');
        setTimeout(() => respawnPed(G, ped), 20000);
      }
    }
  }
}

function respawnPed(G, ped) {
  const road = pick(G.rng, CITY.roads);
  const along = (Math.floor(G.rng() * 7) - 3) * CITY.pitch;
  ped.x = clamp(along, -CITY.halfExtent, CITY.halfExtent);
  ped.z = road + 8;
  ped.alive = true;
  ped.mesh.visible = true;
  ped.mesh.position.set(ped.x, 0, ped.z);
}

// Solmar City itself: a sunny coastal grid of roads, blocks of buildings,
// a beach and the sea. Everything is built from boxes and a few procedural
// canvas textures — no external art, no external files.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { pick, range } from './rng.js';

/** A 128x256 facade: flat wall colour with a grid of windows, some lit. */
function facadeTexture(rng, baseColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      ctx.fillStyle = rng() < 0.25 ? '#ffe9a8' : '#2c3e50';
      ctx.fillRect(12 + col * 28, 14 + row * 30, 18, 20);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePalm(rng) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.3, 5.5, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a6b46 }),
  );
  trunk.position.y = 2.75;
  trunk.rotation.z = range(rng, -0.08, 0.08);
  group.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b3a });
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.2, 4), leafMat);
    leaf.position.set(Math.cos(a) * 1.1, 5.6, Math.sin(a) * 1.1);
    leaf.rotation.z = Math.cos(a) * 1.1;
    leaf.rotation.x = -Math.sin(a) * 1.1;
    group.add(leaf);
  }
  const nut = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 6, 5),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2a }),
  );
  nut.position.y = 5.4;
  group.add(nut);
  return group;
}

/**
 * Build the whole city into `scene`. Returns the building colliders, the
 * building list (for the camera and the minimap), the safehouse and bank
 * positions, the plaza, and the sea mesh (animated by main.js).
 */
export function buildCity(scene, rng) {
  const colliders = []; // {minX, maxX, minZ, maxZ}
  const buildings = [];
  const group = new THREE.Group();
  scene.add(group);

  // Outer ground: grass/concrete far beyond the city edge.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.worldHalf * 2 + 200, CITY.worldHalf * 2 + 200),
    new THREE.MeshLambertMaterial({ color: 0x7d8a6a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 40);
  ground.receiveShadow = true;
  group.add(ground);

  // City slab: the sidewalk-coloured block ground under everything.
  const slab = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.halfExtent * 2 + CITY.roadWidth, CITY.halfExtent * 2 + CITY.roadWidth),
    new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk }),
  );
  slab.rotation.x = -Math.PI / 2;
  slab.receiveShadow = true;
  group.add(slab);

  // Roads: dark strips along every grid line, with dashed centrelines.
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.roadLine });
  const roadLen = CITY.halfExtent * 2 + CITY.roadWidth;
  for (const c of CITY.roads) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, CITY.roadWidth), roadMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.02, c);
    h.receiveShadow = true;
    group.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, roadLen), roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(c, 0.02, 0);
    v.receiveShadow = true;
    group.add(v);
    for (let d = -CITY.halfExtent; d < CITY.halfExtent; d += 12) {
      const dashH = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.35), lineMat);
      dashH.rotation.x = -Math.PI / 2;
      dashH.position.set(d, 0.04, c);
      group.add(dashH);
      const dashV = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 4), lineMat);
      dashV.rotation.x = -Math.PI / 2;
      dashV.position.set(c, 0.04, d);
      group.add(dashV);
    }
  }

  // Beach and sea to the south (+Z).
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.halfExtent * 2 + 120, CITY.waterZ - CITY.beachZ + 30),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.01, (CITY.beachZ + CITY.waterZ) / 2 + 10);
  sand.receiveShadow = true;
  group.add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.halfExtent * 2 + 200, 160),
    new THREE.MeshLambertMaterial({ color: PALETTE.water }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.05, CITY.waterZ + 70);
  water.name = 'sea';
  group.add(water);

  // Buildings: one or two per block, with a procedural facade texture.
  const facadeMats = PALETTE.building.map((c) => {
    const hex = `#${c.toString(16).padStart(6, '0')}`;
    return new THREE.MeshLambertMaterial({ map: facadeTexture(rng, hex) });
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5f66 });
  for (let bi = -3; bi <= 2; bi += 1) {
    for (let bj = -3; bj <= 2; bj += 1) {
      const bx0 = bi * CITY.pitch + CITY.roadWidth / 2 + 4;
      const bz0 = bj * CITY.pitch + CITY.roadWidth / 2 + 4;
      const bx1 = (bi + 1) * CITY.pitch - CITY.roadWidth / 2 - 4;
      const bz1 = (bj + 1) * CITY.pitch - CITY.roadWidth / 2 - 4;
      const bw = bx1 - bx0;
      const bd = bz1 - bz0;
      const isSafehouse = bi === -3 && bj === -3;
      const isPlaza = bi === -1 && bj === -1;
      if (isPlaza) {
        // Central plaza: fountain circle, no buildings.
        const fountain = new THREE.Mesh(
          new THREE.CylinderGeometry(5, 5.5, 1, 16),
          new THREE.MeshLambertMaterial({ color: 0x9db8c4 }),
        );
        fountain.position.set((bx0 + bx1) / 2, 0.5, (bz0 + bz1) / 2);
        fountain.castShadow = true;
        group.add(fountain);
        continue;
      }
      if (isSafehouse) continue; // safehouse added separately below
      const count = rng() < 0.55 ? 2 : 1;
      for (let k = 0; k < count; k += 1) {
        const w = count === 1 ? bw * range(rng, 0.55, 0.8) : bw * 0.42;
        const d = count === 1 ? bd * range(rng, 0.55, 0.8) : bd * 0.42;
        const h = range(rng, 8, 34);
        const cx = count === 1 ? (bx0 + bx1) / 2 : bx0 + (k === 0 ? bw * 0.24 : bw * 0.76);
        const cz = count === 1 ? (bz0 + bz1) / 2 : bz0 + (k === 0 ? bd * 0.28 : bd * 0.72);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), pick(rng, facadeMats));
        mesh.position.set(cx, h / 2, cz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), roofMat);
        roof.position.set(cx, h + 0.25, cz);
        group.add(roof);
        colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
        buildings.push({ x: cx, z: cz, w, d, h });
      }
    }
  }

  // Safehouse: a small teal house with a pyramid roof, bottom-left block.
  const safehouse = { x: -140, z: -140 };
  const house = new THREE.Mesh(
    new THREE.BoxGeometry(14, 7, 10),
    new THREE.MeshLambertMaterial({ color: 0x3fa7a0 }),
  );
  house.position.set(safehouse.x, 3.5, safehouse.z);
  house.castShadow = true;
  house.receiveShadow = true;
  group.add(house);
  const houseRoof = new THREE.Mesh(
    new THREE.ConeGeometry(10, 4, 4),
    new THREE.MeshLambertMaterial({ color: 0xb5533c }),
  );
  houseRoof.position.set(safehouse.x, 9, safehouse.z);
  houseRoof.rotation.y = Math.PI / 4;
  group.add(houseRoof);
  colliders.push({ minX: safehouse.x - 7, maxX: safehouse.x + 7, minZ: safehouse.z - 5, maxZ: safehouse.z + 5 });

  // Landmark: the "Sunset Bank" (final mission target) on the east side.
  const bank = { x: 140, z: 0 };
  const bankMesh = new THREE.Mesh(
    new THREE.BoxGeometry(18, 16, 14),
    new THREE.MeshLambertMaterial({ color: 0xe8e0c8 }),
  );
  bankMesh.position.set(bank.x, 8, bank.z);
  bankMesh.castShadow = true;
  group.add(bankMesh);
  colliders.push({ minX: bank.x - 9, maxX: bank.x + 9, minZ: bank.z - 7, maxZ: bank.z + 7 });

  // Palms along the beach and around the plaza.
  for (let i = 0; i < 26; i += 1) {
    const palm = makePalm(rng);
    palm.position.set(range(rng, -180, 180), 0, range(rng, CITY.beachZ + 4, CITY.waterZ - 6));
    group.add(palm);
  }
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const palm = makePalm(rng);
    palm.position.set(-28 + Math.cos(a) * 14, 0, -28 + Math.sin(a) * 14);
    group.add(palm);
  }

  // Streetlights at every other intersection.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x333a40 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const rx of CITY.roads) {
    for (const rz of CITY.roads) {
      if ((rx + rz) % 112 !== 0) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), poleMat);
      pole.position.set(rx + 7, 3, rz + 7);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
      lamp.position.set(rx + 7, 6.1, rz + 7);
      group.add(lamp);
    }
  }

  return {
    colliders,
    buildings,
    safehouse,
    bank,
    plaza: { x: -28, z: -28 },
    group,
    water,
  };
}

/** Push a circle (x, z, radius) out of every building AABB it overlaps. */
export function resolveBuildingCollisions(city, x, z, radius) {
  let nx = x;
  let nz = z;
  let hit = false;
  for (const c of city.colliders) {
    const cx = Math.max(c.minX, Math.min(nx, c.maxX));
    const cz = Math.max(c.minZ, Math.min(nz, c.maxZ));
    const dx = nx - cx;
    const dz = nz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * radius;
        nz = cz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const pl = nx - c.minX;
        const pr = c.maxX - nx;
        const pt = nz - c.minZ;
        const pb = c.maxZ - nz;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) nx = c.minX - radius;
        else if (m === pr) nx = c.maxX + radius;
        else if (m === pt) nz = c.minZ - radius;
        else nz = c.maxZ + radius;
      }
    }
  }
  return { x: nx, z: nz, hit };
}

/** Nearest road centreline coordinate to `v` (snaps to the grid). */
export function nearestRoad(v) {
  let best = CITY.roads[0];
  let bestD = Infinity;
  for (const r of CITY.roads) {
    const d = Math.abs(v - r);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

/** True when (x, z) is on a road (within the asphalt, either direction). */
export function isOnRoad(x, z) {
  const half = CITY.roadWidth / 2;
  for (const r of CITY.roads) {
    if (Math.abs(x - r) <= half || Math.abs(z - r) <= half) return true;
  }
  return false;
}

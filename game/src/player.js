// Danny Reyes on foot: third-person movement, jumping, and the chase camera.
// The camera orbits with the mouse (pointer lock) and falls back to drifting
// behind the player's heading when the mouse is free (title / screenshots).
import * as THREE from 'three';
import { CITY, PLAYER } from './config.js';
import { clamp } from './rng.js';
import { resolveBuildingCollisions } from './city.js';

/** Danny: blue shirt, dark pants, cap, pistol in the right hand. */
export function makePlayerMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2e86c1 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.4), shirt);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.82;
  head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), hair);
  cap.position.y = 2.05;
  group.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.75, 0.3), pants);
  legL.position.set(-0.18, 0.38, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.18;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), shirt);
  armL.position.set(-0.48, 1.15, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.48;
  group.add(armR);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, 0.4),
    new THREE.MeshLambertMaterial({ color: 0x111111 }),
  );
  gun.position.set(0.48, 0.85, 0.25);
  gun.name = 'gun';
  group.add(gun);
  group.userData.legL = legL;
  group.userData.legR = legR;
  group.userData.armL = armL;
  group.userData.armR = armR;
  return group;
}

export function createPlayer(G) {
  const mesh = makePlayerMesh();
  mesh.position.set(0, 0, 20);
  G.scene.add(mesh);
  return {
    mesh,
    pos: new THREE.Vector3(0, 0, 20),
    yaw: 0, // facing direction
    velY: 0,
    grounded: true,
    onFoot: true,
    car: null,
    health: PLAYER.maxHealth,
    money: PLAYER.startMoney,
    ammo: PLAYER.startAmmo,
    mag: PLAYER.magSize,
    walkPhase: 0,
    hurtFlash: 0,
  };
}

/** Move on foot: WASD relative to the camera yaw, Shift to run, Space to jump. */
export function updatePlayerOnFoot(G, input, dt) {
  const p = G.player;
  const camYaw = G.cameraYaw;
  let fx = 0;
  let fz = 0;
  if (input.forward) { fx += -Math.sin(camYaw); fz += -Math.cos(camYaw); }
  if (input.back) { fx += Math.sin(camYaw); fz += Math.cos(camYaw); }
  if (input.left) { fx += -Math.cos(camYaw); fz += Math.sin(camYaw); }
  if (input.right) { fx += Math.cos(camYaw); fz += -Math.sin(camYaw); }
  const len = Math.hypot(fx, fz);
  const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  if (len > 0.01) {
    fx /= len;
    fz /= len;
    const nx = p.pos.x + fx * speed * dt;
    const nz = p.pos.z + fz * speed * dt;
    const resolved = resolveBuildingCollisions(G.city, nx, nz, PLAYER.radius);
    p.pos.x = clamp(resolved.x, -CITY.worldHalf, CITY.worldHalf);
    p.pos.z = clamp(resolved.z, -CITY.worldHalf, CITY.waterZ - 2); // wade to the shore, not into the sea
    p.yaw = Math.atan2(fx, fz);
    p.walkPhase += dt * speed * 1.6;
    // Simple walk-cycle swing.
    const swing = Math.sin(p.walkPhase) * 0.5;
    p.mesh.userData.legL.rotation.x = swing;
    p.mesh.userData.legR.rotation.x = -swing;
    p.mesh.userData.armL.rotation.x = -swing * 0.8;
    p.mesh.userData.armR.rotation.x = swing * 0.8;
  } else {
    p.mesh.userData.legL.rotation.x *= 0.8;
    p.mesh.userData.legR.rotation.x *= 0.8;
    p.mesh.userData.armL.rotation.x *= 0.8;
    p.mesh.userData.armR.rotation.x *= 0.8;
  }
  // Jump + gravity.
  if (input.jump && p.grounded) {
    p.velY = PLAYER.jumpSpeed;
    p.grounded = false;
  }
  if (!p.grounded) {
    p.velY -= PLAYER.gravity * dt;
    p.pos.y += p.velY * dt;
    if (p.pos.y <= 0) {
      p.pos.y = 0;
      p.velY = 0;
      p.grounded = true;
    }
  }
  p.mesh.position.copy(p.pos);
  p.mesh.rotation.y = p.yaw;
}

/**
 * Third-person camera: sits behind the player (or the car) at a distance
 * that grows with speed. `G.cameraYaw`/`G.cameraPitch` come from the mouse
 * when pointer-locked; otherwise the camera eases behind the heading.
 */
export function updateCamera(G, dt) {
  const p = G.player;
  const target = p.onFoot ? p.pos : new THREE.Vector3(p.car.x, 0, p.car.z);
  const heading = p.onFoot ? p.yaw : p.car.heading;
  if (!G.pointerLocked) {
    // Ease the camera yaw behind the current heading.
    let diff = heading - G.cameraYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    G.cameraYaw += diff * Math.min(1, dt * 2.5);
  }
  const speed = p.onFoot ? 0 : Math.abs(p.car.speed);
  const dist = p.onFoot ? 7.5 : 10 + speed * 0.18;
  const height = p.onFoot ? 3.2 : 4.2 + speed * 0.03;
  const pitch = clamp(G.cameraPitch, -0.15, 0.55);
  const cy = G.cameraYaw;
  const cx = target.x + Math.sin(cy) * dist * Math.cos(pitch);
  const cz = target.z + Math.cos(cy) * dist * Math.cos(pitch);
  let camY = target.y + height + Math.sin(pitch) * dist;
  // Keep the camera out of buildings: lift it above any roof it would clip.
  for (const b of G.city.buildings) {
    if (Math.abs(cx - b.x) < b.w / 2 + 0.5 && Math.abs(cz - b.z) < b.d / 2 + 0.5) {
      camY = Math.max(camY, b.h + 1.5);
    }
  }
  G.camera.position.set(cx, camY, cz);
  G.camera.lookAt(target.x, target.y + 1.6, target.z);
  // Impact shake.
  if (G.shake > 0.01) {
    G.camera.position.x += (Math.random() - 0.5) * G.shake;
    G.camera.position.y += (Math.random() - 0.5) * G.shake;
    G.shake *= Math.pow(0.02, dt);
  }
}

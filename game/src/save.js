// Save / load through localStorage: money, health, mission progress, hidden
// packages, player position and wanted heat. Shot mode never touches saves.
import { SAVE_KEY } from './config.js';
import { startMission } from './missions.js';

export function saveGame(G) {
  if (G.shotMode) return;
  try {
    const p = G.player;
    const data = {
      money: Math.floor(p.money),
      health: p.health,
      ammo: p.ammo,
      mag: p.mag,
      missionIndex: G.missions.index,
      completed: G.missions.completed,
      packagesTaken: G.missions.packages.filter((pkg) => pkg.taken).length,
      x: p.onFoot ? p.pos.x : p.car.x,
      z: p.onFoot ? p.pos.z : p.car.z,
      heat: G.heat,
      clockHours: G.clockHours,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* storage unavailable (private mode, etc.) — play on without it */ }
}

export function loadGame(G) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function applySave(G, data) {
  const p = G.player;
  p.money = data.money ?? p.money;
  p.health = data.health ?? p.health;
  p.ammo = data.ammo ?? p.ammo;
  p.mag = data.mag ?? p.mag;
  G.heat = data.heat ?? 0;
  G.clockHours = data.clockHours ?? 9;
  if (typeof data.x === 'number' && typeof data.z === 'number') {
    p.pos.set(data.x, 0, data.z);
    p.mesh.position.copy(p.pos);
  }
  // Mark already-collected packages as taken.
  let toTake = data.packagesTaken ?? 0;
  for (const pkg of G.missions.packages) {
    if (toTake <= 0) break;
    pkg.taken = true;
    pkg.mesh.visible = false;
    pkg.ring.visible = false;
    toTake -= 1;
  }
  // Resume at the saved mission (missions already completed stay complete).
  if (typeof data.missionIndex === 'number' && data.missionIndex > 0) {
    G.missions.completed = data.completed ?? [];
    startMission(G, Math.min(data.missionIndex, 4));
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) { /* ignore */ }
}

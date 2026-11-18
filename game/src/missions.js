// Missions and side activity: five story jobs for Danny Reyes, played in
// order, each with on-screen objectives, a 3D beacon and a minimap marker,
// plus ten hidden packages scattered around Solmar City.
import * as THREE from 'three';
import { dist2D, range } from './rng.js';
import { spawnEnemy } from './combat.js';

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    giver: 'Rosa — your cousin, who runs the corner garage',
    intro: 'Rosa: "New in town, no car, no cash. Grab any car on the street — nobody here locks theirs — and bring it to my garage."',
    reward: 150,
  },
  {
    id: 'package-run',
    title: 'Package Run',
    giver: 'Rosa',
    intro: 'Rosa: "A friend left a package at the plaza fountain. Pick it up and drop it at the pier on the beach. No questions, no peeking."',
    reward: 250,
  },
  {
    id: 'heat',
    title: 'Heat',
    giver: 'Rosa',
    intro: 'Rosa: "You got the cops\' attention on that last run. Lay low until the heat dies down — lose them before you come back."',
    reward: 300,
  },
  {
    id: 'rival-turf',
    title: 'Rival Turf',
    giver: 'Marco — an old friend who owes you',
    intro: 'Marco: "The Red Jackets are moving in on our block by the east park. Go teach them whose streets these are. Take them all down."',
    reward: 500,
  },
  {
    id: 'big-score',
    title: 'The Big Score',
    giver: 'Rosa',
    intro: 'Rosa: "One job and we\'re set: crack the Sunset Bank vault, then lose the cops and get home. This is the one, Danny."',
    reward: 1500,
  },
];

const PACKAGE_VALUE = 50;

/** Build the glowing beacon that marks the current objective. */
function makeBeacon(G) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 1.2, 40, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 20;
  group.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.6, 0.18, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd34d }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  group.add(ring);
  group.visible = false;
  G.scene.add(group);
  return group;
}

export function createMissions(G) {
  const beacon = makeBeacon(G);
  const state = {
    index: 0, // which mission is active (0..4), 5 = all done
    step: 0,
    beacon,
    target: null, // {x, z, label}
    objective: '',
    robTimer: 0,
    enemiesLeft: 0,
    packageCarried: false,
    completed: [],
    packages: [],
  };
  G.missions = state;
  spawnPackages(G);
  startMission(G, 0);
  return state;
}

/** Ten hidden packages: glowing green boxes worth $50 each. */
function spawnPackages(G) {
  const spots = [
    [-84, -140], [28, -168], [140, -112], [-168, 56], [84, 112],
    [-56, 168], [168, -56], [0, 84], [-140, 28], [112, 196],
  ];
  for (const [x, z] of spots) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.5, 0.8),
      new THREE.MeshBasicMaterial({ color: 0x39d353 }),
    );
    mesh.position.set(x, 0.6, z);
    G.scene.add(mesh);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.08, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0x39d353 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.25, z);
    G.scene.add(ring);
    G.missions.packages.push({ x, z, mesh, ring, taken: false });
  }
}

function setObjective(G, text, target) {
  const m = G.missions;
  m.objective = text;
  m.target = target || null;
  if (target) {
    m.beacon.position.set(target.x, 0, target.z);
    m.beacon.visible = true;
  } else {
    m.beacon.visible = false;
  }
  G.hud.setObjective(text);
}

function nearestParkedCar(G) {
  let best = null;
  let bestD = Infinity;
  for (const car of G.cars) {
    if (car.driver === 'player') continue;
    const d = dist2D(G.player.pos.x, G.player.pos.z, car.x, car.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

/** Begin mission `index` at step 0. */
export function startMission(G, index) {
  const m = G.missions;
  m.index = index;
  m.step = 0;
  m.robTimer = 0;
  m.enemiesLeft = 0;
  m.packageCarried = false;
  if (index >= MISSIONS.length) {
    setObjective(G, 'All jobs done! Solmar City is yours, Danny. Free roam — collect packages, cause chaos, stay rich.', null);
    G.hud.showToast('All missions complete! You rule Solmar City.');
    return;
  }
  const mission = MISSIONS[index];
  G.hud.showToast(`New job: ${mission.title} — ${mission.giver}`);
  G.hud.showDialog(mission.title, mission.intro);
  if (index === 0) {
    const car = nearestParkedCar(G);
    setObjective(G, 'Steal any car (walk up and press E)', car ? { x: car.x, z: car.z, label: 'Car' } : null);
  } else if (index === 1) {
    setObjective(G, 'Pick up the package at the plaza fountain', { x: -28, z: -28, label: 'Package' });
  } else if (index === 2) {
    G.heat = 42; // two stars, scripted heat
    G.lastCrimeAt = G.time;
    setObjective(G, 'Lose the cops — get your wanted level to zero', null);
  } else if (index === 3) {
    setObjective(G, 'Go to the east park and face the Red Jackets', { x: 140, z: 56, label: 'Rival turf' });
  } else if (index === 4) {
    setObjective(G, 'Go to the Sunset Bank', { x: G.city.bank.x, z: G.city.bank.z + 12, label: 'Sunset Bank' });
  }
}

function completeMission(G) {
  const m = G.missions;
  const mission = MISSIONS[m.index];
  G.player.money += mission.reward;
  m.completed.push(mission.id);
  G.audio.cash();
  G.audio.missionComplete();
  G.hud.showToast(`Job done: ${mission.title} — +$${mission.reward}`);
  G.hud.showDialog('Job Complete', `"${mission.title}" paid $${mission.reward}. Nice work, Danny.`);
  startMission(G, m.index + 1);
}

/** Called every frame: advance the active mission's steps. */
export function updateMissions(G, dt) {
  const m = G.missions;
  if (!m || m.index >= MISSIONS.length) {
    checkPackages(G);
    return;
  }
  const p = G.player;
  const px = p.onFoot ? p.pos.x : p.car.x;
  const pz = p.onFoot ? p.pos.z : p.car.z;

  if (m.index === 0) {
    if (m.step === 0 && !p.onFoot) {
      m.step = 1;
      setObjective(G, 'Drive the car to Rosa\'s garage', { x: -84, z: -84, label: 'Rosa\'s garage' });
    } else if (m.step === 1 && dist2D(px, pz, -84, -84) < 8) {
      completeMission(G);
    }
  } else if (m.index === 1) {
    if (m.step === 0 && dist2D(px, pz, -28, -28) < 5) {
      m.step = 1;
      m.packageCarried = true;
      G.audio.pickup();
      setObjective(G, 'Deliver the package to the pier on the beach', { x: 56, z: 208, label: 'Pier' });
      G.hud.showToast('Package picked up. Don\'t drop it.');
    } else if (m.step === 1 && dist2D(px, pz, 56, 208) < 6) {
      completeMission(G);
    }
  } else if (m.index === 2) {
    if (G.heat <= 0) completeMission(G);
  } else if (m.index === 3) {
    if (m.step === 0 && dist2D(px, pz, 140, 56) < 10) {
      m.step = 1;
      m.enemiesLeft = 4;
      const spots = [[132, 48], [148, 48], [132, 64], [148, 64]];
      for (const [x, z] of spots) spawnEnemy(G, x, z);
      setObjective(G, 'Take down the Red Jackets (0/4)', { x: 140, z: 56, label: 'Rival turf' });
      G.hud.showToast('The Red Jackets are here! Fight!');
    }
  } else if (m.index === 4) {
    if (m.step === 0 && dist2D(px, pz, G.city.bank.x, G.city.bank.z + 12) < 8) {
      m.step = 1;
      m.robTimer = 0;
      setObjective(G, 'Cracking the vault… stay by the bank!', { x: G.city.bank.x, z: G.city.bank.z + 12, label: 'Sunset Bank' });
    } else if (m.step === 1) {
      if (dist2D(px, pz, G.city.bank.x, G.city.bank.z + 12) < 10) {
        m.robTimer += dt;
        const left = Math.ceil(10 - m.robTimer);
        setObjective(G, `Cracking the vault… ${left}s — stay close!`, { x: G.city.bank.x, z: G.city.bank.z + 12, label: 'Sunset Bank' });
        if (m.robTimer >= 10) {
          m.step = 2;
          G.heat = 62; // three stars: the alarm went off
          G.lastCrimeAt = G.time;
          setObjective(G, 'The alarm is up! Escape to the safehouse!', { x: G.city.safehouse.x + 10, z: G.city.safehouse.z + 6, label: 'Safehouse' });
          G.hud.showToast('Vault cracked! Three stars — run for home!');
        }
      } else {
        m.robTimer = Math.max(0, m.robTimer - dt);
      }
    } else if (m.step === 2 && dist2D(px, pz, G.city.safehouse.x + 10, G.city.safehouse.z + 6) < 8) {
      completeMission(G);
    }
  }
  checkPackages(G);
}

/** Hidden packages: walk or drive over one to collect $50. */
function checkPackages(G) {
  const m = G.missions;
  const p = G.player;
  const px = p.onFoot ? p.pos.x : p.car.x;
  const pz = p.onFoot ? p.pos.z : p.car.z;
  for (const pkg of m.packages) {
    if (pkg.taken) continue;
    if (dist2D(px, pz, pkg.x, pkg.z) < 3) {
      pkg.taken = true;
      pkg.mesh.visible = false;
      pkg.ring.visible = false;
      p.money += PACKAGE_VALUE;
      G.audio.pickup();
      const left = m.packages.filter((q) => !q.taken).length;
      G.hud.showToast(`Hidden package found! +$${PACKAGE_VALUE} (${10 - left}/10)`);
    }
  }
}

/** Called by combat when an enemy dies — only matters in mission 4. */
export function onEnemyKilledInMission(G) {
  const m = G.missions;
  if (m.index !== 3 || m.step !== 1) return;
  m.enemiesLeft -= 1;
  setObjective(G, `Take down the Red Jackets (${4 - m.enemiesLeft}/4)`, { x: 140, z: 56, label: 'Rival turf' });
  if (m.enemiesLeft <= 0) completeMission(G);
}

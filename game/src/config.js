// SOLMAR CITY — all the tuning numbers in one place. Every other module
// reads its speeds, sizes and limits from here, so balancing the game means
// editing this file, not hunting through the code.
export const STEP = 1 / 60; // fixed world step, seconds

export const CITY = {
  pitch: 56, // metres between road centrelines
  roadWidth: 12,
  roads: [-168, -112, -56, 0, 56, 112, 168], // centrelines, both axes
  halfExtent: 196, // walkable / drivable city half-size
  beachZ: 196, // south of this: sand, then the sea
  waterZ: 236,
  worldHalf: 320, // hard boundary for cars and pedestrians
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10.5,
  radius: 0.6,
  jumpSpeed: 7.5,
  gravity: 20,
  maxHealth: 100,
  startMoney: 50,
  startAmmo: 36,
  magSize: 12,
};

export const CAR = {
  maxSpeed: 30,
  maxReverse: 10,
  accel: 14,
  brake: 30,
  steerMax: 0.55, // radians of front-wheel angle
  grip: 6,
  radius: 1.6,
  maxHealth: 100,
};

export const WANTED = {
  maxStars: 5,
  heatPerStar: 20, // heat 0..100 maps to stars
  decayPerSecond: 1.6, // heat lost while no police can see the player
  decayDelay: 6, // seconds after the last crime before decay starts
  bustRange: 3.2,
  bustTime: 2.5, // seconds a cop must stay close on foot to bust you
  fine: 150,
};

export const COMBAT = {
  pistolDamage: 34,
  meleeDamage: 25,
  meleeRange: 2.2,
  enemyHealth: 100,
  enemyShootRange: 26,
  enemyShootInterval: 1.1,
  enemyDamage: 9,
};

export const SAVE_KEY = 'solmar-city-save-v1';

export const PALETTE = {
  sky: 0x87c5eb,
  sun: 0xfff2d0,
  road: 0x3a3f46,
  roadLine: 0xd8d8d8,
  sidewalk: 0x9aa0a3,
  sand: 0xe8d29a,
  water: 0x2e7fb8,
  grass: 0x5da24a,
  building: [0xd8c9a3, 0xc9a06a, 0xa8b6c4, 0xe0b090, 0xb7c4a8, 0xd98a7a, 0x9fb4d8, 0xe8e0d0],
  car: [0xc0392b, 0x2980b9, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xecf0f1, 0x2c3e50, 0xe67e22, 0x16a085, 0xd35400],
  police: 0x2f5aa8,
  taxi: 0xf7c948,
};

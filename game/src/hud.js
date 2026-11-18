// HUD: health bar, cash, wanted stars, objective text, speed, in-game clock,
// control hints, toasts, dialogs, and the top-down minimap canvas.
import { CITY } from './config.js';
import { wantedStars } from './police.js';

export class Hud {
  constructor(G) {
    this.G = G;
    this.el = {};
    for (const id of ['health-fill', 'health-num', 'money', 'stars', 'objective', 'speed', 'clock', 'toast', 'dialog', 'dialog-title', 'dialog-text', 'crosshair', 'ammo', 'damage-flash', 'minimap', 'hint-enter']) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = null;
    this.dialogTimer = null;
  }

  setObjective(text) {
    this.el.objective.textContent = `◆ ${text}`;
  }

  showToast(text, ms = 4200) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.el.toast.style.opacity = '0';
    }, ms);
  }

  showDialog(title, text, ms = 7000) {
    this.el['dialog-title'].textContent = title;
    this.el['dialog-text'].textContent = text;
    this.el.dialog.style.opacity = '1';
    clearTimeout(this.dialogTimer);
    this.dialogTimer = setTimeout(() => {
      this.el.dialog.style.opacity = '0';
    }, ms);
  }

  flashWanted() {
    this.el.stars.style.transform = 'scale(1.25)';
    setTimeout(() => { this.el.stars.style.transform = 'scale(1)'; }, 180);
  }

  flashDamage() {
    this.el['damage-flash'].style.opacity = '0.55';
    setTimeout(() => { this.el['damage-flash'].style.opacity = '0'; }, 160);
  }

  update() {
    const G = this.G;
    const p = G.player;
    this.el['health-fill'].style.width = `${Math.max(0, p.health)}%`;
    this.el['health-fill'].style.background = p.health > 50 ? '#4caf50' : p.health > 25 ? '#ff9800' : '#e53935';
    this.el['health-num'].textContent = Math.ceil(p.health);
    this.el.money.textContent = `$${Math.floor(p.money)}`;
    const stars = wantedStars(G);
    this.el.stars.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    this.el.stars.style.color = stars > 0 ? '#ffd34d' : '#ffffff88';
    const speed = p.onFoot ? 0 : Math.abs(p.car.speed) * 3.6;
    this.el.speed.textContent = p.onFoot ? '' : `${Math.round(speed)} km/h`;
    const hours = Math.floor(G.clockHours) % 24;
    const mins = Math.floor((G.clockHours % 1) * 60);
    this.el.clock.textContent = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    this.el.ammo.textContent = p.onFoot ? `Pistol ${p.mag}/12 · ${p.ammo} spare` : '';
    this.el.crosshair.style.display = p.onFoot && G.screen === 'play' ? 'block' : 'none';
    // "Press E" hint near a car.
    const near = G.nearestCarHint;
    this.el['hint-enter'].style.display = near && G.screen === 'play' ? 'block' : 'none';
    this.drawMinimap();
  }

  /** Top-down map: roads, buildings, player arrow, cars, cops, mission marker. */
  drawMinimap() {
    const G = this.G;
    const ctx = this.mapCtx;
    const size = 180;
    const scale = size / (CITY.worldHalf * 2 + 60);
    const toMap = (x, z) => [size / 2 + x * scale, size / 2 + z * scale];
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#1d2b1f';
    ctx.fillRect(0, 0, size, size);
    // Beach + sea.
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(0, size / 2 + CITY.beachZ * scale, size, size / 2 - CITY.beachZ * scale);
    ctx.fillStyle = '#2e7fb8';
    ctx.fillRect(0, size / 2 + CITY.waterZ * scale, size, size);
    // Roads.
    ctx.strokeStyle = '#707880';
    ctx.lineWidth = CITY.roadWidth * scale;
    for (const r of CITY.roads) {
      const [x1, y1] = toMap(r, -CITY.halfExtent);
      const [x2, y2] = toMap(r, CITY.halfExtent);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [x3, y3] = toMap(-CITY.halfExtent, r);
      const [x4, y4] = toMap(CITY.halfExtent, r);
      ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = '#9aa3ab';
    for (const b of G.city.buildings) {
      const [x, y] = toMap(b.x - b.w / 2, b.z - b.d / 2);
      ctx.fillRect(x, y, b.w * scale, b.d * scale);
    }
    // Safehouse.
    const [sx, sy] = toMap(G.city.safehouse.x, G.city.safehouse.z);
    ctx.fillStyle = '#3fa7a0';
    ctx.fillRect(sx - 4, sy - 4, 8, 8);
    // Hidden packages left.
    ctx.fillStyle = '#39d353';
    for (const pkg of G.missions.packages) {
      if (pkg.taken) continue;
      const [x, y] = toMap(pkg.x, pkg.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Mission target.
    if (G.missions.target) {
      const [x, y] = toMap(G.missions.target.x, G.missions.target.z);
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }
    // Traffic cars.
    ctx.fillStyle = '#ffffff';
    for (const car of G.cars) {
      if (car.driver === 'police') continue;
      const [x, y] = toMap(car.x, car.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Police.
    ctx.fillStyle = '#4488ff';
    for (const car of G.police) {
      const [x, y] = toMap(car.x, car.z);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Enemies.
    ctx.fillStyle = '#ff3333';
    for (const e of G.enemies) {
      const [x, y] = toMap(e.x, e.z);
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    // Player arrow.
    const p = G.player;
    const px = p.onFoot ? p.pos.x : p.car.x;
    const pz = p.onFoot ? p.pos.z : p.car.z;
    const heading = p.onFoot ? p.yaw : p.car.heading;
    const [mx, my] = toMap(px, pz);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(heading);
    ctx.fillStyle = '#ffeb3b';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

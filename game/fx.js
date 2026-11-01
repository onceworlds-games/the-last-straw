// Juice: sand dust, debris that belongs to what landed (splinters off wood, sparks off iron, straw bits, cloth fibres,
// porcelain shards, paper, melon juice), landing rings, sweat drops, wind-blown sand and straw confetti; "+8" floaters
// flying to a tag; camera shake from decaying trauma² along a direction; a punch-in on heavy landings; the freeze and slow
// motion of a break. Reduced motion: no shake, no freeze, no punch, fewer particles.

import { PAL } from './art.js';
import { text } from './ui.js';

const DEBRIS = {
  wood: ['#E8A867', '#B4602C', '#F3C48E'],
  iron: ['#FFE9A0', '#FFC845', '#FFF6D8'],
  tin: ['#FFF6D8', '#D9D3F2', '#FFE9A0'],
  copper: ['#FFB45E', '#FFE0B0', '#F27B35'],
  brass: ['#FFE9A0', '#FFC845', '#FFF6D8'],
  bike: ['#FFF6D8', '#22B8A7', '#FFE9A0'],
  clock: ['#8A4A28', '#C07A44', '#FFD27A'],
  straw: ['#FFD96A', '#E9B840', '#FFF0B0'],
  hay: ['#FFD96A', '#E9B840', '#C9962E'],
  cloth: ['#D63F6E', '#FFC845', '#22B8A7'],
  leather: ['#A35A2E', '#D9904E'],
  paper: ['#FFF8EA', '#F1E3C8'],
  ceramic: ['#22B8A7', '#FFF0D9'],
  porcelain: ['#FFFFFF', '#E8E6FA', '#2E4FA8'],
  enamel: ['#FFFFFF', '#F2EEE4'],
  melon: ['#E8455B', '#FF7A86', '#2E8B57'],
  fruit: ['#E8455B', '#FF7A86', '#2E8B57'],
  clay: ['#E0703A', '#B85A2A'],
  rubber: ['#FFC845', '#3B2160'],
  fur: ['#F0A04B', '#FFF0D9'],
};
const SPARKY = new Set(['iron', 'tin', 'copper', 'brass', 'bike']);
const FLUTTER = new Set(['straw', 'hay', 'cloth', 'paper', 'fur', 'feather']);
const JUICY = new Set(['melon', 'fruit']);

export function createFx() {
  const world = []; // { x, y, vx, vy, life, max, r, color, kind, rot, vr, g, drag }
  const rings = [];
  const screen = [];
  const floaters = [];
  const wind = [];
  let trauma = 0;
  let dir = { x: 0.5, y: 0.5 };
  let freeze = 0;
  let slow = 0;
  let slowScale = 1;
  let punch = 0;
  let reduced = false;
  let seed = 1;
  let windOn = 0;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cap = (n) => (reduced ? Math.ceil(n / 3) : n);

  const fx = {
    set reduced(v) {
      reduced = !!v;
    },
    get reduced() {
      return reduced;
    },
    /** Time scale for the world this frame (freeze, then slow motion). */
    scale(dt) {
      if (freeze > 0) {
        freeze -= dt;
        return 0;
      }
      if (slow > 0) {
        slow -= dt;
        return slowScale + (1 - slowScale) * Math.max(0, 1 - slow / 0.25) * (slow < 0.25 ? 1 : 0);
      }
      return 1;
    },
    get slowing() {
      return freeze > 0 || slow > 0;
    },
    hitStop(freezeS, slowS = 0, scale = 0.3) {
      if (reduced) return;
      freeze = Math.max(freeze, freezeS);
      slow = Math.max(slow, slowS);
      slowScale = scale;
    },
    /** Shake, optionally along a direction ({x, y}: a landing shakes up and down). */
    shake(amount, d = null) {
      if (reduced) return;
      trauma = Math.min(1, trauma + amount);
      dir = d ?? { x: 0.5, y: 0.5 };
    },
    /** A quick zoom toward the action, decaying (0..0.08). */
    punch(amount) {
      if (reduced) return;
      punch = Math.min(0.07, punch + amount);
    },
    get zoom() {
      return 1 + punch;
    },
    /** The camera offset (px) this frame. */
    offset(t) {
      const k = trauma * trauma;
      const a = Math.sin(t * 47.3), b = Math.sin(t * 39.1 + 1.3), c = Math.sin(t * 53.7 + 2.1);
      return { x: k * (5 * a + 11 * dir.x * b), y: k * (4 * c + 14 * dir.y * b) };
    },
    puff(x, y, n = 12, power = 1) {
      for (let i = 0, m = cap(n); i < m; i++) {
        const a = Math.PI * (0.05 + 0.4 * rnd());
        const v = (0.6 + rnd() * 1.6) * power;
        const side = rnd() < 0.5 ? -1 : 1;
        world.push({ x: x + (rnd() - 0.5) * 0.3, y: y + 0.03, vx: Math.cos(a) * v * side, vy: Math.sin(a) * v * 0.7, life: 0, max: 0.6 + rnd() * 0.6, r: 0.05 + rnd() * 0.08 * power, color: rnd() < 0.5 ? '#F7D29A' : '#E9B171', kind: 'puff', g: -0.4 });
      }
    },
    /** What flies off a landing, by the item's material; more for a harder hit. `w`: the item's half width. */
    debris(mat, x, y, energy = 1, w = 0.3) {
      const cols = DEBRIS[mat] ?? DEBRIS.wood;
      const n = cap(Math.round(Math.min(16, 2 + energy * 0.6)));
      for (let i = 0; i < n; i++) {
        const side = rnd() < 0.5 ? -1 : 1;
        const px = x + side * w * (0.3 + rnd() * 0.7);
        if (SPARKY.has(mat)) {
          const a = Math.PI * (0.08 + rnd() * 0.4);
          const v = 2.5 + rnd() * 3 * Math.min(2, 0.5 + energy * 0.08);
          world.push({ x: px, y, vx: Math.cos(a) * v * side, vy: Math.sin(a) * v, life: 0, max: 0.22 + rnd() * 0.28, r: 0.012, color: cols[i % cols.length], kind: 'spark', g: 9 });
        } else if (FLUTTER.has(mat)) {
          const a = Math.PI * (0.15 + rnd() * 0.3);
          const v = 0.6 + rnd() * 1.4;
          world.push({ x: px, y, vx: Math.cos(a) * v * side, vy: Math.sin(a) * v + 0.4, life: 0, max: 1.1 + rnd() * 0.8, r: mat === 'paper' ? 0.05 : 0.05 + rnd() * 0.03, color: cols[i % cols.length], kind: mat === 'paper' ? 'sheet' : 'bit', rot: rnd() * 6, vr: (rnd() - 0.5) * 9, g: 1.4, drag: 2 });
        } else if (JUICY.has(mat)) {
          const a = Math.PI * (0.1 + rnd() * 0.4);
          const v = 1 + rnd() * 2;
          world.push({ x: px, y, vx: Math.cos(a) * v * side, vy: Math.sin(a) * v, life: 0, max: 0.7, r: 0.025 + rnd() * 0.02, color: cols[i % 2], kind: 'drop', g: 8 });
        } else {
          const a = Math.PI * (0.1 + rnd() * 0.4);
          const v = 0.8 + rnd() * 2 * Math.min(2, 0.5 + energy * 0.06);
          world.push({ x: px, y, vx: Math.cos(a) * v * side, vy: Math.sin(a) * v, life: 0, max: 0.7 + rnd() * 0.5, r: 0.018 + rnd() * 0.03, color: cols[i % cols.length], kind: 'chip', rot: rnd() * 6, vr: (rnd() - 0.5) * 20, g: 9 });
        }
      }
    },
    /** A smashed vase: a burst of blue-and-white shards and a white puff. */
    shatter(x, y) {
      for (let i = 0, n = cap(28); i < n; i++) {
        const a = Math.PI * (0.05 + rnd() * 0.9);
        const v = 1.6 + rnd() * 3.2;
        world.push({ x: x + (rnd() - 0.5) * 0.2, y: y + rnd() * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 1.2 + rnd() * 0.6, r: 0.035 + rnd() * 0.05, color: DEBRIS.porcelain[i % 3], kind: 'shard', rot: rnd() * 6, vr: (rnd() - 0.5) * 24, g: 9 });
      }
      for (let i = 0, n = cap(9); i < n; i++) world.push({ x: x + (rnd() - 0.5) * 0.3, y: y + rnd() * 0.25, vx: (rnd() - 0.5) * 1.4, vy: rnd() * 0.9, life: 0, max: 0.6 + rnd() * 0.4, r: 0.08 + rnd() * 0.07, color: '#FFFFFF', kind: 'puff', g: -0.3 });
    },
    /** A flat ring spreading from where something landed (world). */
    ring(x, y, size = 0.5, color = '#FFF0D9') {
      if (rings.length < 12) rings.push({ x, y, life: 0, max: 0.42, r: size, color });
    },
    splinters(x, y, n = 16) {
      for (let i = 0, m = cap(n); i < m; i++) {
        const a = rnd() * Math.PI;
        const v = 1.5 + rnd() * 3;
        world.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.9 + rnd() * 0.5, r: 0.03 + rnd() * 0.05, color: rnd() < 0.5 ? PAL.wood : PAL.woodDark, kind: 'chip', rot: rnd() * 6, vr: (rnd() - 0.5) * 20, g: 9 });
      }
    },
    sweat(x, y) {
      if (reduced && rnd() < 0.6) return;
      world.push({ x, y, vx: (rnd() - 0.2) * 0.8, vy: 0.6 + rnd() * 0.6, life: 0, max: 0.8, r: 0.035, color: '#9FE3F2', kind: 'drop', g: 6 });
    },
    confetti(W, n = 70) {
      for (let i = 0, m = cap(n); i < m; i++) screen.push({ x: rnd() * W, y: -20 - rnd() * 200, vx: (rnd() - 0.5) * 60, vy: 60 + rnd() * 120, life: 0, max: 4 + rnd() * 2, rot: rnd() * 6, vr: (rnd() - 0.5) * 8, len: 14 + rnd() * 12, c: rnd() < 0.7 ? 0 : 1 });
    },
    /** Wind this frame (-1..1, direction and strength): sand streaks across the screen, dust drifts. */
    wind(v) {
      windOn = Math.max(-1, Math.min(1, v));
    },
    /** "+8" rising from a screen point and flying to a target (a tag). `delay`: seconds before it shows. */
    floater(s, x, y, to, color = PAL.turq, delay = 0) {
      floaters.push({ s, x, y, to, life: -delay, max: 1.1, color });
    },
    clear() {
      world.length = 0;
      rings.length = 0;
      screen.length = 0;
      floaters.length = 0;
      wind.length = 0;
      trauma = 0;
      freeze = 0;
      slow = 0;
      punch = 0;
    },
    update(dt, wdt, W = 1280, H = 720) {
      trauma = Math.max(0, trauma - dt * 1.6);
      punch = Math.max(0, punch - punch * dt * 4 - dt * 0.004);
      for (let i = rings.length - 1; i >= 0; i--) if ((rings[i].life += wdt) >= rings[i].max) rings.splice(i, 1);
      for (let i = world.length - 1; i >= 0; i--) {
        const p = world[i];
        p.life += wdt;
        if (p.life >= p.max) {
          world.splice(i, 1);
          continue;
        }
        p.vy -= (p.g ?? 0) * wdt;
        if (p.drag) {
          p.vx *= 1 - p.drag * wdt;
          p.vy = Math.max(p.vy, -0.6);
          p.vx += Math.sin(p.life * 5 + p.rot) * 0.8 * wdt;
        }
        const drift = p.kind === 'puff' || p.drag ? windOn * 1.4 : 0;
        p.x += (p.vx + drift) * wdt;
        p.y += p.vy * wdt;
        if (p.kind === 'puff') {
          p.vx *= 1 - 2.2 * wdt;
          p.vy *= 1 - 2.2 * wdt;
        }
        if ((p.kind === 'chip' || p.kind === 'shard' || p.kind === 'bit' || p.kind === 'sheet') && p.y < 0.02 && p.vy < 0) {
          p.y = 0.02;
          p.vy = Math.abs(p.vy) * 0.25;
          p.vx *= 0.5;
          p.vr = (p.vr ?? 0) * 0.5;
        }
        if (p.rot !== undefined) p.rot += (p.vr ?? 0) * wdt;
      }
      for (let i = screen.length - 1; i >= 0; i--) {
        const p = screen[i];
        p.life += dt;
        if (p.life >= p.max) {
          screen.splice(i, 1);
          continue;
        }
        p.x += (p.vx + Math.sin(p.life * 3 + p.rot) * 30) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
      for (let i = floaters.length - 1; i >= 0; i--) {
        floaters[i].life += dt;
        if (floaters[i].life >= floaters[i].max) floaters.splice(i, 1);
      }
      const want = reduced ? 0 : Math.round(Math.abs(windOn) * 28);
      while (wind.length < want) wind.push({ x: windOn > 0 ? -rnd() * W * 0.4 : W + rnd() * W * 0.4, y: H * (0.2 + rnd() * 0.75), len: 40 + rnd() * 100, v: 600 + rnd() * 600, a: 0.1 + rnd() * 0.22, wob: rnd() * 6 });
      for (let i = wind.length - 1; i >= 0; i--) {
        const p = wind[i];
        p.x += Math.sign(windOn || 1) * p.v * dt;
        if (p.x < -300 || p.x > W + 300 || (wind.length > want && rnd() < 0.05)) wind.splice(i, 1);
      }
    },
    drawWorld(ctx, lw) {
      for (const p of rings) {
        const u = p.life / p.max;
        const e = 1 - (1 - u) ** 3;
        ctx.globalAlpha = (1 - u) * 0.75;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = lw * (5 - u * 4);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r * (0.35 + e), p.r * (0.08 + e * 0.14), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const p of world) {
        const k = 1 - p.life / p.max;
        ctx.globalAlpha = p.kind === 'puff' ? Math.min(1, k * 1.4) * 0.85 : p.kind === 'spark' ? 1 : Math.min(1, k * 3);
        ctx.fillStyle = p.color;
        if (p.kind === 'chip' || p.kind === 'shard') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          if (p.kind === 'shard') {
            ctx.moveTo(-p.r, -p.r * 0.45);
            ctx.lineTo(p.r * 0.95, -p.r * 0.2);
            ctx.lineTo(p.r * 0.15, p.r * 0.65);
          } else ctx.rect(-p.r, -p.r * 0.32, p.r * 2, p.r * 0.64);
          ctx.closePath();
          ctx.fill();
          ctx.lineWidth = lw * 1.3;
          ctx.strokeStyle = PAL.ink;
          ctx.stroke();
          ctx.restore();
        } else if (p.kind === 'spark') {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = p.color;
          ctx.lineWidth = lw * (1 + 3 * k);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
          ctx.stroke();
          ctx.restore();
        } else if (p.kind === 'bit') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.lineCap = 'round';
          ctx.strokeStyle = PAL.ink;
          ctx.lineWidth = lw * 4.4;
          ctx.beginPath();
          ctx.moveTo(-p.r, 0);
          ctx.lineTo(p.r, 0);
          ctx.stroke();
          ctx.strokeStyle = p.color;
          ctx.lineWidth = lw * 2.4;
          ctx.stroke();
          ctx.restore();
        } else if (p.kind === 'sheet') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, Math.max(0.15, Math.abs(Math.cos(p.life * 7 + p.rot))));
          ctx.fillRect(-p.r, -p.r * 0.7, p.r * 2, p.r * 1.4);
          ctx.lineWidth = lw;
          ctx.strokeStyle = PAL.ink;
          ctx.strokeRect(-p.r, -p.r * 0.7, p.r * 2, p.r * 1.4);
          ctx.restore();
        } else if (p.kind === 'drop') {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y + p.r * 1.8);
          ctx.quadraticCurveTo(p.x + p.r, p.y, p.x, p.y - p.r);
          ctx.quadraticCurveTo(p.x - p.r, p.y, p.x, p.y + p.r * 1.8);
          ctx.fill();
          ctx.lineWidth = lw * 1.5;
          ctx.strokeStyle = PAL.ink;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * (1 + (1 - k) * 0.9), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    },
    drawScreen(ctx) {
      if (wind.length) {
        ctx.save();
        ctx.lineCap = 'round';
        for (const p of wind) {
          ctx.strokeStyle = `rgba(255,232,190,${p.a})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.quadraticCurveTo(p.x - Math.sign(windOn || 1) * p.len * 0.5, p.y + Math.sin(p.wob + p.x * 0.01) * 4, p.x - Math.sign(windOn || 1) * p.len, p.y + 2);
          ctx.stroke();
        }
        ctx.restore();
      }
      for (const p of screen) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c ? PAL.rose : PAL.gold;
        ctx.fillRect(-p.len / 2, -2.5, p.len, 5);
        ctx.strokeStyle = p.c ? PAL.roseDark : PAL.goldDark;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-p.len / 2, -2.5, p.len, 5);
        ctx.restore();
      }
      for (const f of floaters) {
        if (f.life < 0) continue;
        const u = f.life / f.max;
        const rise = Math.min(1, u * 3);
        const fly = Math.max(0, (u - 0.35) / 0.65);
        const e = fly * fly * (3 - 2 * fly);
        const x0 = f.x, y0 = f.y - rise * 30;
        const x = f.to ? x0 + (f.to.x - x0) * e : x0;
        const y = f.to ? y0 + (f.to.y - y0) * e : y0 - u * 30;
        const pop = u < 0.1 ? 0.5 + (u / 0.1) * 0.75 : u < 0.2 ? 1.25 - ((u - 0.1) / 0.1) * 0.25 : 1;
        const size = 34 * (1 - e * 0.45) * pop;
        ctx.globalAlpha = f.to ? 1 : Math.min(1, (1 - u) * 2);
        text(ctx, f.s, x, y, { size, display: true, weight: 900, color: f.color, lw: 6 });
        ctx.globalAlpha = 1;
      }
    },
  };
  return fx;
}

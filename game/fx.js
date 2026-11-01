// Juice: sand puffs, splinters, sweat drops and straw confetti; "+8" floaters flying to a tag; camera shake from decaying
// trauma²; the freeze and slow motion of a break. Reduced motion: no shake, no freeze, fewer particles.

import { PAL } from './art.js';
import { text } from './ui.js';

export function createFx() {
  const world = []; // { x, y, vx, vy, life, max, r, color, kind, rot, vr }
  const screen = [];
  const floaters = [];
  let trauma = 0;
  let freeze = 0;
  let slow = 0;
  let slowScale = 1;
  let reduced = false;
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

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
        return slowScale;
      }
      return 1;
    },
    get slowing() {
      return freeze > 0 || slow > 0;
    },
    hitStop(freezeS, slowS, scale = 0.3) {
      if (reduced) return;
      freeze = Math.max(freeze, freezeS);
      slow = Math.max(slow, slowS);
      slowScale = scale;
    },
    shake(amount) {
      if (reduced) return;
      trauma = Math.min(1, trauma + amount);
    },
    /** The camera offset (px) this frame. */
    offset(t) {
      const k = trauma * trauma;
      return { x: k * 14 * Math.sin(t * 47.3), y: k * 10 * Math.sin(t * 39.1 + 1.3) };
    },
    puff(x, y, n = 12, power = 1) {
      const m = reduced ? Math.ceil(n / 3) : n;
      for (let i = 0; i < m; i++) {
        const a = Math.PI * (0.1 + 0.8 * rnd());
        const v = (0.6 + rnd() * 1.4) * power;
        world.push({ x: x + (rnd() - 0.5) * 0.3, y: y + 0.03, vx: Math.cos(a) * v * (rnd() < 0.5 ? -1 : 1), vy: Math.sin(a) * v * 0.6, life: 0, max: 0.5 + rnd() * 0.5, r: 0.05 + rnd() * 0.08 * power, color: rnd() < 0.5 ? '#F7D29A' : '#E9B171', kind: 'puff', g: -0.5 });
      }
    },
    splinters(x, y, n = 16) {
      const m = reduced ? 5 : n;
      for (let i = 0; i < m; i++) {
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
      const m = reduced ? 20 : n;
      for (let i = 0; i < m; i++) screen.push({ x: rnd() * W, y: -20 - rnd() * 200, vx: (rnd() - 0.5) * 60, vy: 60 + rnd() * 120, life: 0, max: 4 + rnd() * 2, rot: rnd() * 6, vr: (rnd() - 0.5) * 8, len: 14 + rnd() * 12 });
    },
    /** "+8" rising from a screen point and flying to a target (a tag). */
    floater(s, x, y, to, color = PAL.turq) {
      floaters.push({ s, x, y, to, life: 0, max: 1.1, color });
    },
    clear() {
      world.length = 0;
      screen.length = 0;
      floaters.length = 0;
      trauma = 0;
      freeze = 0;
      slow = 0;
    },
    update(dt, wdt) {
      trauma = Math.max(0, trauma - dt * 1.6);
      for (let i = world.length - 1; i >= 0; i--) {
        const p = world[i];
        p.life += wdt;
        if (p.life >= p.max) {
          world.splice(i, 1);
          continue;
        }
        p.vy -= (p.g ?? 0) * wdt;
        p.x += p.vx * wdt;
        p.y += p.vy * wdt;
        if (p.kind === 'puff') {
          p.vx *= 1 - 2 * wdt;
          p.vy *= 1 - 2 * wdt;
        }
        if (p.kind === 'chip' && p.y < 0.02) {
          p.y = 0.02;
          p.vy = Math.abs(p.vy) * 0.3;
          p.vx *= 0.6;
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
    },
    drawWorld(ctx, lw) {
      for (const p of world) {
        const k = 1 - p.life / p.max;
        ctx.globalAlpha = p.kind === 'puff' ? Math.min(1, k * 1.5) : 1;
        ctx.fillStyle = p.color;
        if (p.kind === 'chip') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.r, -p.r * 0.3, p.r * 2, p.r * 0.6);
          ctx.lineWidth = lw * 1.5;
          ctx.strokeStyle = PAL.ink;
          ctx.strokeRect(-p.r, -p.r * 0.3, p.r * 2, p.r * 0.6);
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
          ctx.arc(p.x, p.y, p.r * (1 + (1 - k) * 0.8), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    },
    drawScreen(ctx) {
      for (const p of screen) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = PAL.gold;
        ctx.fillRect(-p.len / 2, -2.5, p.len, 5);
        ctx.strokeStyle = PAL.goldDark;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-p.len / 2, -2.5, p.len, 5);
        ctx.restore();
      }
      for (const f of floaters) {
        const u = f.life / f.max;
        const rise = Math.min(1, u * 3);
        const fly = Math.max(0, (u - 0.35) / 0.65);
        const e = fly * fly * (3 - 2 * fly);
        const x0 = f.x, y0 = f.y - rise * 30;
        const x = f.to ? x0 + (f.to.x - x0) * e : x0;
        const y = f.to ? y0 + (f.to.y - y0) * e : y0 - u * 30;
        const size = 34 * (1 - e * 0.45) * (u < 0.1 ? 0.6 + u * 4 : 1);
        ctx.globalAlpha = f.to ? 1 : 1 - u;
        text(ctx, f.s, x, y, { size, display: true, weight: 900, color: f.color, lw: 6 });
        ctx.globalAlpha = 1;
      }
    },
  };
  return fx;
}

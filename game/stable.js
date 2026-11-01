// The Stable and the day's board, in screen pixels: your level and its bar, the streak, today's three goals, and the
// camel's wardrobe (coats, blankets, hats) and your sleeves, the locked ones saying what earns them.

import { PAL, rr, drawGloveAt } from './art.js';
import { COATS, BLANKETS, drawHat } from './camel.js';
import { text, textWidth, plank, brass, nails, rope, LIGHT_WOOD, DARK_WOOD } from './ui.js';
import { UNLOCKS, isUnlocked, unlockLabel, levelOf, goalLabel, streakNow } from './progress.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TAU = Math.PI * 2;

/** A round brass badge with the level number. */
export function levelBadge(ctx, x, y, r, level, t = 0) {
  ctx.save();
  ctx.fillStyle = 'rgba(28,15,46,0.35)';
  ctx.beginPath();
  ctx.arc(x + 2, y + 3, r, 0, TAU);
  ctx.fill();
  const p = new Path2D();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + t * 0.2;
    const rr2 = i % 2 ? r * 0.88 : r;
    if (i === 0) p.moveTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
    else p.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
  }
  p.closePath();
  brass(ctx, p, { x: x - r, y: y - r, w: r * 2, h: r * 2 });
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(p);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.66, 0, TAU);
  ctx.fillStyle = PAL.violet;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, String(level), x, y + 1, { size: r * (level >= 10 ? 0.8 : 0.95), display: true, weight: 900, color: PAL.bone, outline: false });
  ctx.restore();
}

/** The XP bar: a groove with a gold fill. */
export function xpBar(ctx, r, frac, label) {
  const g = rr(new Path2D(), r.x, r.y, r.w, r.h, r.h / 2);
  ctx.fillStyle = 'rgba(42,23,72,0.7)';
  ctx.fill(g);
  if (frac > 0) {
    const f = rr(new Path2D(), r.x, r.y, Math.max(r.h, r.w * clamp(frac, 0, 1)), r.h, r.h / 2);
    brass(ctx, f, r);
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(g);
  if (label) text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, { size: Math.min(13, r.h * 0.85), weight: 900, color: PAL.bone, lw: 3 });
}

/** A small lantern (the streak's mark), lit when the streak is alive. */
export function lantern(ctx, x, y, s, lit, t) {
  ctx.save();
  ctx.translate(x, y);
  if (lit) {
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, s * 1.3);
    g.addColorStop(0, 'rgba(255,200,69,0.6)');
    g.addColorStop(1, 'rgba(255,200,69,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-s * 1.3, -s * 1.3, s * 2.6, s * 2.6);
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = PAL.ink;
  const body = new Path2D();
  body.moveTo(-s * 0.35, -s * 0.45);
  body.quadraticCurveTo(-s * 0.6, 0, -s * 0.35, s * 0.45);
  body.lineTo(s * 0.35, s * 0.45);
  body.quadraticCurveTo(s * 0.6, 0, s * 0.35, -s * 0.45);
  body.closePath();
  ctx.fillStyle = lit ? PAL.gold : 'rgba(255,240,217,0.35)';
  ctx.fill(body);
  ctx.stroke(body);
  if (lit) {
    ctx.fillStyle = '#FFF6D0';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.05, s * 0.12, s * (0.2 + Math.sin(t * 9) * 0.03), 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = PAL.woodDark;
  ctx.fillRect(-s * 0.3, -s * 0.6, s * 0.6, s * 0.16);
  ctx.strokeRect(-s * 0.3, -s * 0.6, s * 0.6, s * 0.16);
  ctx.fillRect(-s * 0.3, s * 0.44, s * 0.6, s * 0.14);
  ctx.strokeRect(-s * 0.3, s * 0.44, s * 0.6, s * 0.14);
  ctx.restore();
}

/** A tick box: empty, or ticked in turquoise. */
function tickBox(ctx, x, y, s, done, pop = 0) {
  const b = rr(new Path2D(), x - s / 2, y - s / 2, s, s, 4);
  ctx.fillStyle = done ? PAL.turq : '#FFF6E2';
  ctx.fill(b);
  ctx.lineWidth = 2;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(b);
  if (done) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1 + pop * 0.5, 1 + pop * 0.5);
    ctx.beginPath();
    ctx.moveTo(-s * 0.28, 0);
    ctx.lineTo(-s * 0.06, s * 0.24);
    ctx.lineTo(s * 0.32, -s * 0.28);
    ctx.strokeStyle = PAL.bone;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * The day's board: level and XP, streak, three goals. Returns its rect.
 * o: { profile, day, t, compact (one row of ticks), title }
 */
export function drawDayBoard(ctx, r, o) {
  const p = o.profile;
  const L0 = levelOf(p.xp);
  const goals = p.goals?.day === o.day ? p.goals.list : [];
  const streak = streakNow(p, o.day);
  const t = o.t ?? 0;
  ctx.save();
  const frame = rr(new Path2D(), r.x, r.y, r.w, r.h, 10);
  ctx.fillStyle = 'rgba(28,15,46,0.4)';
  ctx.save();
  ctx.translate(4, 6);
  ctx.fill(frame);
  ctx.restore();
  if (o.hang) {
    rope(ctx, r.x + 24, r.y + 6, r.x + 34, r.y - 200, 0, 3);
    rope(ctx, r.x + r.w - 24, r.y + 6, r.x + r.w - 34, r.y - 200, 0, 3);
  }
  plank(ctx, frame, r, DARK_WOOD);
  ctx.lineWidth = 3;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(frame);
  const m = 7;
  const face = rr(new Path2D(), r.x + m, r.y + m, r.w - m * 2, r.h - m * 2, 6);
  plank(ctx, face, { x: r.x + m, y: r.y + m, w: r.w - m * 2, h: r.h - m * 2 }, LIGHT_WOOD, { fill: '#FBEBD0' });
  ctx.lineWidth = 2;
  ctx.stroke(face);
  nails(ctx, [[r.x + 24, r.y + 14], [r.x + r.w - 24, r.y + 14]], 2.8);
  // level and XP
  const br = Math.min(22, r.h * 0.13);
  const top = r.y + m + 10 + br;
  levelBadge(ctx, r.x + m + 10 + br, top, br, L0.level, t);
  const bx = r.x + m + 20 + br * 2;
  const bw = r.x + r.w - m - 12 - bx - (streak > 0 ? 58 : 0);
  text(ctx, `Level ${L0.level}`, bx, top - br * 0.42, { size: Math.min(20, br * 0.95), align: 'left', display: true, weight: 900, color: PAL.ink, outline: false });
  xpBar(ctx, { x: bx, y: top + 2, w: bw, h: Math.max(12, br * 0.62) }, L0.frac, `${L0.into}/${L0.need}`);
  if (streak > 0) {
    lantern(ctx, r.x + r.w - m - 44, top, br * 0.95, true, t);
    text(ctx, String(streak), r.x + r.w - m - 22, top + 1, { size: Math.min(22, br), display: true, weight: 900, color: PAL.roseDark, outline: false });
  }
  // today's goals
  let y = top + br + 14;
  const row = clamp((r.y + r.h - m - 6 - y) / 3, 18, 34);
  const fs = clamp(row * 0.5, 12, 16);
  goals.forEach((g, i) => {
    const cy = y + row * (i + 0.5);
    const pop = o.popId === i && o.popAge != null ? Math.max(0, 1 - o.popAge / 0.4) : 0;
    tickBox(ctx, r.x + m + 16, cy, Math.min(20, row * 0.7), g.done, pop);
    const label = goalLabel(g);
    const lw = r.w - m * 2 - 40 - (g.done || g.n <= 1 ? 0 : 52);
    let s = label;
    while (s.length > 4 && textWidth(ctx, s, fs, { weight: 800 }) > lw) s = s.slice(0, -2) + '…';
    text(ctx, s, r.x + m + 32, cy + 1, { size: fs, align: 'left', weight: 800, color: g.done ? 'rgba(59,33,96,0.55)' : PAL.ink, outline: false });
    if (!g.done && g.n > 1) text(ctx, `${g.have}/${g.n}`, r.x + r.w - m - 10, cy + 1, { size: fs - 1, align: 'right', weight: 900, color: PAL.turqDark, outline: false });
    if (g.done) {
      ctx.strokeStyle = 'rgba(59,33,96,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r.x + m + 30, cy + 1);
      ctx.lineTo(r.x + m + 32 + Math.min(lw, textWidth(ctx, s, fs, { weight: 800 })), cy + 1);
      ctx.stroke();
    }
  });
  ctx.restore();
  return r;
}

// ---------------------------------------------------------------- the wardrobe

const KINDS = [
  { kind: 'coat', name: 'Coat' },
  { kind: 'blanket', name: 'Blanket' },
  { kind: 'hat', name: 'Hat' },
  { kind: 'sleeve', name: 'Hands' },
];

function camelHeadPath(s) {
  // a camel's head in profile, facing left, about s across (y down)
  const p = new Path2D();
  p.moveTo(s * 0.42, s * 0.45);
  p.bezierCurveTo(s * 0.36, s * 0.1, s * 0.3, -s * 0.1, s * 0.12, -s * 0.22);
  p.bezierCurveTo(s * 0.1, -s * 0.34, s * 0.02, -s * 0.36, -s * 0.06, -s * 0.28);
  p.bezierCurveTo(-s * 0.22, -s * 0.24, -s * 0.38, -s * 0.2, -s * 0.44, -s * 0.12);
  p.bezierCurveTo(-s * 0.5, -s * 0.04, -s * 0.46, s * 0.04, -s * 0.36, s * 0.05);
  p.bezierCurveTo(-s * 0.2, s * 0.06, -s * 0.05, s * 0.05, s * 0.06, s * 0.14);
  p.bezierCurveTo(s * 0.12, s * 0.28, s * 0.12, s * 0.4, s * 0.12, s * 0.45);
  p.closePath();
  return p;
}

/** One swatch's picture, centred at (x, y), about s across. */
function swatch(ctx, u, x, y, s, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  if (u.kind === 'coat') {
    const C = COATS[u.id] ?? COATS.sand;
    const p = camelHeadPath(s * 0.9);
    const g = ctx.createLinearGradient(0, -s * 0.4, 0, s * 0.4);
    g.addColorStop(0, C.light);
    g.addColorStop(0.5, C.base);
    g.addColorStop(1, C.shade);
    ctx.fillStyle = g;
    ctx.fill(p);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke(p);
    ctx.fillStyle = PAL.ink;
    ctx.beginPath();
    ctx.arc(-s * 0.12, -s * 0.12, s * 0.035, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.mane;
    ctx.beginPath();
    ctx.ellipse(s * 0.1, -s * 0.26, s * 0.04, s * 0.09, 0.4, 0, TAU);
    ctx.fill();
    ctx.stroke();
  } else if (u.kind === 'blanket') {
    const B = BLANKETS[u.id] ?? BLANKETS[0];
    const w = s * 0.86, h = s * 0.6;
    const p = rr(new Path2D(), -w / 2, -h / 2, w, h, 3);
    ctx.save();
    ctx.clip(p);
    const bw = w / B.bands.length;
    B.bands.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(-w / 2 + i * bw, -h / 2, bw + 0.5, h);
    });
    ctx.fillStyle = B.dots;
    for (let i = 1; i < B.bands.length; i += 2) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + (i + 0.5) * bw, -h * 0.12);
      ctx.lineTo(-w / 2 + (i + 0.5) * bw + bw * 0.25, 0);
      ctx.lineTo(-w / 2 + (i + 0.5) * bw, h * 0.12);
      ctx.lineTo(-w / 2 + (i + 0.5) * bw - bw * 0.25, 0);
      ctx.fill();
    }
    ctx.restore();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke(p);
    ctx.strokeStyle = B.fringe;
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const fx = -w / 2 + 4 + (i / 6) * (w - 8);
      ctx.beginPath();
      ctx.moveTo(fx, h / 2);
      ctx.lineTo(fx, h / 2 + 5);
      ctx.stroke();
    }
  } else if (u.kind === 'hat') {
    // a bare camel head in sand, wearing it
    const C = COATS.sand;
    const p = camelHeadPath(s * 0.78);
    ctx.save();
    ctx.translate(0, s * 0.08);
    ctx.fillStyle = C.base;
    ctx.fill(p);
    ctx.lineWidth = 2;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke(p);
    ctx.fillStyle = PAL.ink;
    ctx.beginPath();
    ctx.arc(-s * 0.1, -s * 0.1, s * 0.03, 0, TAU);
    ctx.fill();
    if (u.id !== 'none') {
      // the hat in head space (y up, the poll at 0,0): scale so a 0.4 m head fills the swatch
      const k = s * 1.15;
      ctx.translate(s * 0.07, -s * 0.22);
      ctx.scale(k, -k);
      drawHat(ctx, u.id, 1 / k, PAL.ink, t);
    }
    ctx.restore();
  } else if (u.kind === 'sleeve') {
    // a gloved hand reaching down, in your sleeve
    const k = s / 0.44;
    ctx.scale(k, -k);
    drawGloveAt(ctx, 1 / k, -0.04, -0.05, 0.5, { kind: 'player', seat: 0, sleeve: u.id }, 0.15);
  }
  ctx.restore();
}

/** What earns it, short enough for a swatch. */
function shortLabel(u) {
  if (u.level) return `Lv ${u.level}`;
  if (u.streak) return `${u.streak} days`;
  return unlockLabel(u);
}

function lockIcon(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2;
  ctx.strokeStyle = PAL.ink;
  ctx.beginPath();
  ctx.arc(0, -s * 0.15, s * 0.28, Math.PI, 0);
  ctx.lineWidth = s * 0.14;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke();
  const b = rr(new Path2D(), -s * 0.42, -s * 0.15, s * 0.84, s * 0.62, 3);
  ctx.fillStyle = PAL.gold;
  ctx.fill(b);
  ctx.lineWidth = 2;
  ctx.stroke(b);
  ctx.fillStyle = PAL.ink;
  ctx.beginPath();
  ctx.arc(0, s * 0.1, s * 0.08, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * The wardrobe: a row per kind, a swatch per unlock. Returns [{ rect, u }] for the taps.
 * o: { profile, look ({ coat, blanket, hat }), sleeve, t, fresh (Set of `${kind}:${id}` newly unlocked) }
 */
export function drawWardrobe(ctx, r, o) {
  const hits = [];
  const t = o.t ?? 0;
  const frame = rr(new Path2D(), r.x, r.y, r.w, r.h, 10);
  ctx.save();
  ctx.fillStyle = 'rgba(28,15,46,0.4)';
  ctx.save();
  ctx.translate(4, 6);
  ctx.fill(frame);
  ctx.restore();
  plank(ctx, frame, r, DARK_WOOD);
  ctx.lineWidth = 3;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(frame);
  const m = 8;
  const gap = 6;
  // wide: a row per kind with its name on the left; narrow (a phone held upright): the name above, swatches wrapping
  const narrow = r.w < 560;
  const lists = KINDS.map((K) => UNLOCKS.filter((u) => u.kind === K.kind));
  let place;
  if (!narrow) {
    const rowH = (r.h - m * 2) / KINDS.length;
    const labelW = Math.min(86, r.w * 0.2);
    place = (ri, i, n) => {
      const avail = r.w - m * 2 - labelW - 6;
      const sw = Math.min(rowH - 10, (avail - (n - 1) * gap) / n);
      const y0 = r.y + m + ri * rowH;
      return { sw, x: r.x + m + labelW + i * (sw + gap), y: y0 + (rowH - sw) / 2, lx: r.x + m + 6, ly: y0 + rowH / 2, ls: Math.min(20, rowH * 0.3) };
    };
  } else {
    const labelH = 20;
    const fit = (sw) => {
      const per = Math.max(1, Math.floor((r.w - m * 2 + gap) / (sw + gap)));
      return { per, h: m * 2 + lists.reduce((h, l) => h + labelH + Math.ceil(l.length / per) * (sw + gap), 0) };
    };
    let sw = 66;
    while (sw > 36 && fit(sw).h > r.h) sw -= 2;
    const { per } = fit(sw);
    const tops = [];
    let y = r.y + m;
    for (const l of lists) {
      tops.push(y);
      y += labelH + Math.ceil(l.length / per) * (sw + gap);
    }
    place = (ri, i) => ({ sw, x: r.x + m + (i % per) * (sw + gap), y: tops[ri] + labelH + Math.floor(i / per) * (sw + gap), lx: r.x + m + 2, ly: tops[ri] + labelH / 2, ls: 16 });
  }
  KINDS.forEach((K, ri) => {
    const list = lists[ri];
    const n = list.length;
    const head = place(ri, 0, n);
    text(ctx, K.name, head.lx, head.ly, { size: head.ls, align: 'left', display: true, weight: 900, color: PAL.bone, lw: 4 });
    list.forEach((u, i) => {
      const P = place(ri, i, n);
      const sw = P.sw;
      const x = P.x;
      const y = P.y;
      const box = { x, y, w: sw, h: sw };
      const open = isUnlocked(o.profile, u);
      const on = K.kind === 'sleeve' ? o.sleeve === u.id : o.look[K.kind] === u.id;
      const p = rr(new Path2D(), x, y, sw, sw, 8);
      ctx.fillStyle = on ? '#FFF6E2' : open ? '#F1D9A6' : 'rgba(42,23,72,0.55)';
      ctx.fill(p);
      ctx.lineWidth = on ? 4 : 2;
      ctx.strokeStyle = on ? PAL.gold : PAL.ink;
      ctx.stroke(p);
      if (on) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = PAL.ink;
        ctx.stroke(rr(new Path2D(), x - 3, y - 3, sw + 6, sw + 6, 10));
      }
      ctx.save();
      ctx.clip(p);
      if (!open) ctx.globalAlpha = 0.4;
      swatch(ctx, u, x + sw / 2, y + sw / 2 - (open ? 0 : sw * 0.08), sw * (open ? 0.86 : 0.74), t);
      ctx.restore();
      if (!open) {
        lockIcon(ctx, x + sw - sw * 0.2, y + sw * 0.2, sw * 0.24);
        text(ctx, shortLabel(u), x + sw / 2, y + sw * 0.84, { size: Math.max(9, Math.min(12, sw * 0.18)), weight: 900, color: PAL.bone, lw: 3 });
      }
      if (o.fresh?.has(`${u.kind}:${u.id}`)) {
        const bx = x + sw - 4, by = y + 4;
        const pulse = 1 + Math.sin(t * 6) * 0.1;
        ctx.save();
        ctx.translate(bx, by);
        ctx.scale(pulse, pulse);
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, TAU);
        ctx.fillStyle = PAL.rose;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = PAL.ink;
        ctx.stroke();
        ctx.restore();
      }
      hits.push({ rect: box, u, open });
    });
  });
  ctx.restore();
  return hits;
}

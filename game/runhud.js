// The Caravan run's boards, in screen pixels: the town post (its order filling up), the camel's patience, the Set off plate
// with what the load would pay, and the three gifts a town offers.

import { PAL, rr } from './art.js';
import { text, textWidth, plank, brass, nails, rope, LIGHT_WOOD, DARK_WOOD } from './ui.js';
import { PERKS } from './caravan.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const backOut = (u) => {
  const x = clamp(u, 0, 1) - 1;
  return 1 + 2.4 * x * x * x + 1.4 * x * x;
};

/** The town's post: an arrow plank with the town, and its order as a bar filling up (gold once it's met). */
export function drawTownPost(ctx, r, o) {
  const { town, kg, order, t = 0, bump = 0 } = o;
  const met = kg >= order;
  const p = new Path2D();
  p.moveTo(r.x, r.y);
  p.lineTo(r.x + r.w - 18, r.y);
  p.lineTo(r.x + r.w, r.y + r.h / 2);
  p.lineTo(r.x + r.w - 18, r.y + r.h);
  p.lineTo(r.x, r.y + r.h);
  p.closePath();
  ctx.save();
  const s = 1 + bump * 0.08;
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.scale(s, s);
  ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
  ctx.fillStyle = 'rgba(28,15,46,0.35)';
  ctx.save();
  ctx.translate(4, 5);
  ctx.fill(p);
  ctx.restore();
  plank(ctx, p, r, LIGHT_WOOD);
  ctx.lineWidth = 3;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(p);
  nails(ctx, [[r.x + 9, r.y + 10]], 2.6);
  const big = Math.min(26, r.h * 0.38);
  text(ctx, `Town ${town}`, r.x + 16, r.y + r.h * 0.3, { size: big, align: 'left', display: true, weight: 900, color: PAL.ink, outline: false });
  // the order: a groove with the load's kg filling it
  const bar = { x: r.x + 14, y: r.y + r.h * 0.56, w: r.w - 44, h: Math.max(12, r.h * 0.26) };
  const groove = rr(new Path2D(), bar.x, bar.y, bar.w, bar.h, bar.h / 2);
  ctx.fillStyle = 'rgba(70,35,15,0.55)';
  ctx.fill(groove);
  const f = clamp(kg / Math.max(1, order), 0, 1);
  if (f > 0) {
    const fill = rr(new Path2D(), bar.x, bar.y, Math.max(bar.h, bar.w * f), bar.h, bar.h / 2);
    if (met) brass(ctx, fill, bar);
    else {
      ctx.fillStyle = PAL.turq;
      ctx.fill(fill);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(bar.x + 3, bar.y + 2, Math.max(0, bar.w * f - 6), 2);
    }
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(groove);
  text(ctx, met ? `${kg} kg` : `${kg}/${order} kg`, bar.x + bar.w / 2, bar.y + bar.h / 2 + 1, { size: Math.min(15, bar.h * 0.95), weight: 900, color: PAL.bone, lw: 3 });
  if (met) {
    // a tick stamp at the end of the bar
    const cx = bar.x + bar.w + 12, cy = bar.y + bar.h / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fillStyle = PAL.turq;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy);
    ctx.lineTo(cx - 1, cy + 3.5);
    ctx.lineTo(cx + 4.5, cy - 4);
    ctx.strokeStyle = PAL.bone;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

/** A small tag hanging under the post: the town's twist. */
export function drawTwistTag(ctx, x, y, name, t) {
  const size = 15;
  const w = textWidth(ctx, name, size, { weight: 900 }) + 22;
  const sw = Math.sin(t * 2.1) * 0.05;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sw);
  rope(ctx, 0, -12, 0, 0, 0, 2);
  const p = rr(new Path2D(), -w / 2, 0, w, 24, 5);
  ctx.fillStyle = PAL.rose;
  ctx.fill(p);
  ctx.lineWidth = 2;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(p);
  text(ctx, name, 0, 12.5, { size, weight: 900, color: PAL.bone, lw: 3 });
  ctx.restore();
}

function humpPath(x, y, w, h) {
  const p = new Path2D();
  p.moveTo(x - w / 2, y);
  p.bezierCurveTo(x - w * 0.42, y - h * 0.9, x - w * 0.12, y - h * 1.08, x + w * 0.05, y - h);
  p.bezierCurveTo(x + w * 0.3, y - h * 0.9, x + w * 0.46, y - h * 0.45, x + w / 2, y);
  p.closePath();
  return p;
}

/**
 * The camel's patience: a row of humps ending at x (right-aligned), the lost ones hollow.
 * `lost`: { at, t } when one was just lost (it shakes and drains).
 */
export function drawPatience(ctx, x, y, n, max, o = {}) {
  const w = o.size ?? 22, h = w * 0.62, gap = 4;
  const t = o.t ?? 0;
  ctx.save();
  for (let i = 0; i < max; i++) {
    const cx = x - (max - 1 - i) * (w + gap) - w / 2;
    const full = i < n;
    const justLost = !full && i === n && o.lostAge != null && o.lostAge < 0.9;
    let jx = 0, s = 1;
    if (justLost) {
      jx = Math.sin(o.lostAge * 60) * 3 * (1 - o.lostAge / 0.9);
      s = 1 + 0.4 * Math.max(0, 1 - o.lostAge / 0.3);
    }
    const gained = full && i === n - 1 && o.gainAge != null && o.gainAge < 0.6;
    if (gained) s = backOut(o.gainAge / 0.6);
    ctx.save();
    ctx.translate(cx + jx, y);
    ctx.scale(s, s);
    const p = humpPath(0, 0, w, h);
    ctx.fillStyle = 'rgba(28,15,46,0.35)';
    ctx.save();
    ctx.translate(2, 3);
    ctx.fill(p);
    ctx.restore();
    if (full || justLost) {
      const g = ctx.createLinearGradient(0, -h, 0, 0);
      g.addColorStop(0, '#F6C98E');
      g.addColorStop(1, '#C47B45');
      ctx.fillStyle = justLost ? PAL.rose : g;
      ctx.globalAlpha = justLost ? clamp(1 - o.lostAge / 0.9, 0, 1) : 1;
      ctx.fill(p);
      ctx.globalAlpha = 1;
      if (full) {
        ctx.fillStyle = 'rgba(255,245,220,0.55)';
        ctx.beginPath();
        ctx.ellipse(-w * 0.1, -h * 0.72, w * 0.12, h * 0.12, -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = 'rgba(42,23,72,0.55)';
      ctx.fill(p);
    }
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke(p);
    ctx.restore();
  }
  ctx.restore();
  return { x: x - max * (w + gap), w: max * (w + gap) };
}

/**
 * The Set off plate. can: enough loads on; left: loads still needed. pay: the payout if it left now
 * ({ total, mult, brink }). Returns its rect.
 */
export function drawSetOff(ctx, r, o) {
  const { can, left, pay, t = 0, keys = false, appear = 1 } = o;
  const k = easeOut(appear);
  ctx.save();
  ctx.translate(0, (1 - k) * 60);
  ctx.globalAlpha = k;
  const depth = Math.max(5, Math.round(r.h * 0.11));
  const rad = Math.min(12, r.h * 0.2);
  const pulse = can ? 1 + Math.sin(t * 5) * 0.015 : 1;
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.scale(pulse, pulse);
  ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
  ctx.fillStyle = 'rgba(28,15,46,0.38)';
  ctx.fill(rr(new Path2D(), r.x + 3, r.y + depth + 5, r.w, r.h - depth, rad));
  ctx.fillStyle = can ? '#9C5F0E' : DARK_WOOD.dark;
  ctx.fill(rr(new Path2D(), r.x, r.y + depth, r.w, r.h - depth, rad));
  const fr = { x: r.x, y: r.y, w: r.w, h: r.h - depth };
  const top = rr(new Path2D(), fr.x, fr.y, fr.w, fr.h, rad);
  if (can) brass(ctx, top, fr);
  else plank(ctx, top, fr, DARK_WOOD);
  ctx.lineWidth = 3;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(rr(new Path2D(), r.x, r.y, r.w, r.h, rad));
  // a little camel walking (the icon), then the words
  const cy = r.y + fr.h / 2;
  const size = Math.min(28, fr.h * 0.46);
  const label = 'Set off';
  const tw = textWidth(ctx, label, size, { display: true, weight: 900 });
  const iw = fr.h * 0.62;
  const x0 = r.x + r.w / 2 - (tw + iw + 8) / 2;
  walkerIcon(ctx, x0 + iw / 2, cy + 1, iw, can ? PAL.ink : 'rgba(255,236,200,0.75)', can ? t : 0);
  text(ctx, label, x0 + iw + 8 + tw / 2, cy + 2.2, { size, display: true, weight: 900, color: can ? 'rgba(255,245,200,0.7)' : 'rgba(0,0,0,0.25)', outline: false });
  text(ctx, label, x0 + iw + 8 + tw / 2, cy + 1, { size, display: true, weight: 900, color: can ? PAL.ink : 'rgba(255,236,200,0.8)', outline: false });
  if (keys && can) text(ctx, 'G', r.x + r.w - 8, r.y + fr.h - 9, { size: 12, align: 'right', color: PAL.ink, outline: false, weight: 800 });
  if (!can && left > 0) {
    // how many more loads first
    const bx = r.x + r.w - 6, by = r.y + 4;
    ctx.beginPath();
    ctx.arc(bx, by, 12, 0, Math.PI * 2);
    ctx.fillStyle = PAL.bone;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke();
    text(ctx, String(left), bx, by + 1, { size: 15, display: true, weight: 900, color: PAL.ink, outline: false });
  }
  ctx.restore();
  // what the load would pay, on a kraft tag above
  if (can && pay) {
    const s1 = `+${pay.total}`;
    const tags = [];
    if (pay.mult > 1.001) tags.push({ s: `×${pay.mult.toFixed(1)}`, c: PAL.turqDark });
    if (pay.brink > 1) tags.push({ s: `×${pay.brink} sweat`, c: PAL.roseDark });
    const big = Math.min(30, r.h * 0.46);
    const w1 = textWidth(ctx, s1, big, { display: true, weight: 900 });
    let w2 = 0;
    for (const g of tags) w2 += textWidth(ctx, g.s, 14, { weight: 900 }) + 10;
    const w = Math.max(r.w * 0.7, w1 + w2 + 26);
    const h = big + 14;
    const x = r.x + r.w - w, y = r.y - h - 12;
    ctx.save();
    ctx.translate(0, (1 - k) * 60);
    ctx.globalAlpha = k;
    const p = rr(new Path2D(), x, y, w, h, 6);
    ctx.fillStyle = 'rgba(28,15,46,0.3)';
    ctx.save();
    ctx.translate(3, 4);
    ctx.fill(p);
    ctx.restore();
    ctx.fillStyle = '#F1D9A6';
    ctx.fill(p);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke(p);
    text(ctx, s1, x + 12 + w1 / 2, y + h / 2 + 1, { size: big, display: true, weight: 900, color: PAL.ink, outline: false });
    let tx = x + 12 + w1 + 10;
    for (const g of tags) {
      const gw = textWidth(ctx, g.s, 14, { weight: 900 });
      text(ctx, g.s, tx + gw / 2, y + h / 2 + 1, { size: 14, weight: 900, color: g.c, outline: false });
      tx += gw + 10;
    }
    ctx.restore();
  }
  return r;
}

/** A tiny camel walking: the Set off plate's icon. */
function walkerIcon(ctx, x, y, s, color, t) {
  ctx.save();
  ctx.translate(x, y);
  const k = s / 40;
  ctx.scale(-k, k);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.beginPath();
  // body + hump
  ctx.moveTo(-14, 2);
  ctx.bezierCurveTo(-14, -8, -8, -12, -3, -12);
  ctx.bezierCurveTo(1, -18, 8, -16, 10, -8);
  ctx.bezierCurveTo(13, -6, 14, -2, 13, 2);
  ctx.closePath();
  ctx.fill();
  // neck and head
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(12, -4);
  ctx.quadraticCurveTo(18, -6, 18, -14);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(21, -15, 5, 3.2, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // legs swinging
  ctx.lineWidth = 3.4;
  const sw = Math.sin(t * 9) * 4;
  for (const [lx, ph] of [[-10, 1], [-6, -1], [7, -1], [11, 1]]) {
    ctx.beginPath();
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx + sw * ph, 14);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- the gifts

/** Draw a perk's picture centred at (cx, cy), about s pixels across. */
export function perkIcon(ctx, key, cx, cy, s, t = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  const k = s / 100;
  ctx.scale(k, k);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 5;
  const fillStroke = (p, c) => {
    ctx.fillStyle = c;
    ctx.fill(p);
    ctx.stroke(p);
  };
  if (key === 'knees') {
    // a camel leg with a brass brace at the knee
    const leg = new Path2D();
    leg.moveTo(-14, -46);
    leg.quadraticCurveTo(-4, -20, -8, -2);
    leg.quadraticCurveTo(-14, 22, -8, 38);
    leg.lineTo(14, 38);
    leg.quadraticCurveTo(6, 22, 10, -2);
    leg.quadraticCurveTo(14, -24, 12, -46);
    leg.closePath();
    fillStroke(leg, PAL.camel);
    const hoof = new Path2D();
    hoof.ellipse(3, 40, 17, 7, 0, 0, Math.PI * 2);
    fillStroke(hoof, PAL.camelShade);
    const brace = rr(new Path2D(), -16, -10, 32, 16, 5);
    fillStroke(brace, PAL.gold);
    ctx.fillStyle = 'rgba(255,255,240,0.6)';
    ctx.fillRect(-12, -7, 14, 3);
    for (const sx of [-24, 24]) {
      ctx.beginPath();
      ctx.moveTo(sx * 1.1, -2 + Math.sin(t * 3) * 2);
      ctx.lineTo(sx * 1.45, -6 + Math.sin(t * 3) * 2);
      ctx.stroke();
    }
  } else if (key === 'rails') {
    const tray = rr(new Path2D(), -42, 10, 84, 14, 4);
    fillStroke(tray, PAL.wood);
    for (const sx of [-40, 34]) fillStroke(rr(new Path2D(), sx, -40, 8, 52, 3), PAL.woodDark);
    ctx.beginPath();
    ctx.moveTo(-36, -32);
    ctx.lineTo(-48, -42);
    ctx.moveTo(38, -32);
    ctx.lineTo(50, -42);
    ctx.stroke();
    const box = rr(new Path2D(), -24, -14, 30, 24, 3);
    fillStroke(box, PAL.manila);
    const ball = new Path2D();
    ball.arc(18, -2, 12, 0, Math.PI * 2);
    fillStroke(ball, PAL.turq);
  } else if (key === 'straps') {
    const box = rr(new Path2D(), -34, -26, 68, 52, 5);
    fillStroke(box, PAL.manila);
    ctx.save();
    ctx.clip(box);
    ctx.fillStyle = PAL.rose;
    ctx.fillRect(-8, -30, 16, 60);
    ctx.fillRect(-40, -6, 80, 12);
    ctx.restore();
    ctx.stroke(box);
    ctx.lineWidth = 3;
    ctx.strokeRect(-8, -26, 16, 52);
    ctx.strokeRect(-34, -6, 68, 12);
    const buckle = rr(new Path2D(), -9, -9, 18, 18, 3);
    ctx.lineWidth = 5;
    fillStroke(buckle, PAL.gold);
  } else if (key === 'gait') {
    for (let i = 0; i < 4; i++) {
      const x = -36 + i * 24, y = (i % 2 ? -12 : 12) + Math.sin(t * 2 + i) * 1.5;
      const p = new Path2D();
      p.ellipse(x - 4, y, 7, 10, -0.2, 0, Math.PI * 2);
      p.moveTo(x + 13, y);
      p.ellipse(x + 6, y, 7, 10, 0.2, 0, Math.PI * 2);
      fillStroke(p, PAL.camelShade);
    }
  } else if (key === 'haggler') {
    for (let i = 3; i >= 0; i--) {
      const p = new Path2D();
      p.ellipse(-10, 26 - i * 12, 26, 9, 0, 0, Math.PI * 2);
      fillStroke(p, i % 2 ? PAL.goldDark : PAL.gold);
    }
    const c = new Path2D();
    c.arc(22, -14, 22, 0, Math.PI * 2);
    fillStroke(c, PAL.gold);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(22, -14, 14, 0, Math.PI * 2);
    ctx.stroke();
    text(ctx, '%', 22, -13, { size: 20, display: true, weight: 900, color: PAL.ink, outline: false });
  } else if (key === 'paws') {
    const pad = new Path2D();
    pad.ellipse(0, 14, 22, 18, 0, 0, Math.PI * 2);
    fillStroke(pad, '#F7B6C2');
    for (const [x, y] of [[-26, -10], [-10, -26], [10, -26], [26, -10]]) {
      const toe = new Path2D();
      toe.ellipse(x, y, 9, 11, x * 0.01, 0, Math.PI * 2);
      fillStroke(toe, '#F7B6C2');
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(-6, 8, 7, 4, -0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (key === 'water') {
    const skin = new Path2D();
    skin.moveTo(-8, -34);
    skin.lineTo(8, -34);
    skin.lineTo(10, -20);
    skin.bezierCurveTo(40, -14, 40, 36, 0, 38);
    skin.bezierCurveTo(-40, 36, -40, -14, -10, -20);
    skin.closePath();
    fillStroke(skin, '#A35A2E');
    ctx.save();
    ctx.clip(skin);
    const wob = Math.sin(t * 3) * 3;
    ctx.fillStyle = PAL.turq;
    ctx.beginPath();
    ctx.moveTo(-40, 6 + wob);
    ctx.quadraticCurveTo(0, 0 - wob, 40, 6 + wob);
    ctx.lineTo(40, 40);
    ctx.lineTo(-40, 40);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.stroke(skin);
    const cap = rr(new Path2D(), -10, -42, 20, 10, 3);
    fillStroke(cap, PAL.woodDark);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(-14, -2, 5, 10, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Where the three gift cards go (centred under `top`). */
export function perkRects(W, top, bottom, n = 3) {
  const gap = 12;
  const w = Math.round(clamp((W - 32 - gap * (n - 1)) / n, 96, 220));
  const h = Math.round(clamp(Math.min(w * 1.25, bottom - top), 120, 260));
  const x0 = W / 2 - (w * n + gap * (n - 1)) / 2;
  const y = top + Math.max(0, (bottom - top - h) / 2);
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), y, w, h }));
}

/** The gift cards: a dark frame, a paper face, the picture, the name, a line, the key. `age`: seconds since they came. */
export function drawPerkCards(ctx, rects, keys, o = {}) {
  const t = o.t ?? 0;
  const age = o.age ?? 9;
  rects.forEach((r, i) => {
    const key = keys[i];
    const P = PERKS[key];
    if (!P) return;
    const u = clamp((age - i * 0.09) / 0.45, 0, 1);
    if (u <= 0) return;
    const e = backOut(u);
    const hover = o.sel === i ? 1 : 0;
    ctx.save();
    ctx.globalAlpha = Math.min(1, u * 2);
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2 + (1 - e) * 80 - hover * 6);
    ctx.rotate((1 - e) * (i - 1) * 0.2 + Math.sin(t * 1.3 + i * 2) * 0.008);
    ctx.translate(-r.w / 2, -r.h / 2);
    const frame = rr(new Path2D(), 0, 0, r.w, r.h, 12);
    ctx.fillStyle = 'rgba(28,15,46,0.42)';
    ctx.save();
    ctx.translate(5, 8);
    ctx.fill(frame);
    ctx.restore();
    plank(ctx, frame, { x: 0, y: 0, w: r.w, h: r.h }, DARK_WOOD);
    ctx.lineWidth = 3;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke(frame);
    const m = 8;
    const face = rr(new Path2D(), m, m, r.w - m * 2, r.h - m * 2, 7);
    ctx.fillStyle = hover ? '#FFF6E2' : '#FBEBD0';
    ctx.fill(face);
    ctx.save();
    ctx.clip(face);
    const glow = ctx.createRadialGradient(r.w / 2, r.h * 0.36, 4, r.w / 2, r.h * 0.36, r.w * 0.55);
    glow.addColorStop(0, 'rgba(255,200,69,0.45)');
    glow.addColorStop(1, 'rgba(255,200,69,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, r.w, r.h);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(0, 0, r.w, 6);
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.stroke(face);
    nails(ctx, [[m + 8, m + 8], [r.w - m - 8, m + 8]], 2.6);
    const iconS = Math.min(r.w * 0.62, r.h * 0.42);
    perkIcon(ctx, key, r.w / 2, m + 14 + iconS / 2, iconS, t);
    const nameSize = Math.min(26, r.w * 0.15);
    const name = P.name;
    const nw = textWidth(ctx, name, nameSize, { display: true, weight: 900 });
    const ns = nw > r.w - 20 ? nameSize * ((r.w - 20) / nw) : nameSize;
    const ny = m + 22 + iconS + ns * 0.5;
    text(ctx, name, r.w / 2, ny, { size: ns, display: true, weight: 900, color: PAL.ink, outline: false });
    // the line, wrapped to two rows
    const ls = Math.max(11, Math.min(15, r.w * 0.085));
    const words = P.line.split(' ');
    const rows = [''];
    for (const w of words) {
      const tryRow = rows[rows.length - 1] ? `${rows[rows.length - 1]} ${w}` : w;
      if (textWidth(ctx, tryRow, ls, { weight: 700 }) > r.w - 26 && rows[rows.length - 1]) rows.push(w);
      else rows[rows.length - 1] = tryRow;
    }
    rows.slice(0, 2).forEach((row, j) => text(ctx, row, r.w / 2, ny + ns * 0.62 + ls * 0.7 + j * ls * 1.2, { size: ls, weight: 700, color: PAL.violet, outline: false }));
    // how many the run has already
    for (let j = 0, n = o.have?.[i] ?? 0; j < n; j++) {
      ctx.beginPath();
      ctx.arc(r.w / 2 + (j - (n - 1) / 2) * 12, r.h - m - 12, 4, 0, Math.PI * 2);
      ctx.fillStyle = PAL.goldDark;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (o.keys) {
      const bx = r.w - m - 4, by = r.h - m - 4;
      ctx.beginPath();
      ctx.arc(bx - 8, by - 8, 11, 0, Math.PI * 2);
      ctx.fillStyle = PAL.violet;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
      text(ctx, String(i + 1), bx - 8, by - 7, { size: 14, display: true, weight: 900, color: PAL.bone, outline: false });
    }
    ctx.restore();
  });
}

// The HUD in the world's language, in screen pixels: luggage tags on a rope, the brass dial with its straw needle, the cart
// with its two items and hourglass, sign boards, slabs, signposts and hints. Also the layout around the platform's UI and the
// list of things a tap can hit.

import { PAL, SEATS, drawItem, drawPortrait, drawSymbol, rr } from './art.js';
import { ITEMS, weightLabel, STRAW } from './items.js';
import { extents } from './physics.js';
import { BAND } from './physics.js';

export const DISPLAY = '"Big Shoulders Display", "Arial Narrow", Impact, sans-serif';
export const TEXT = 'Archivo, system-ui, -apple-system, "Segoe UI", sans-serif';

// ---------------------------------------------------------------- text

export function text(ctx, s, x, y, o = {}) {
  const size = o.size ?? 18;
  ctx.font = `${o.weight ?? 800} ${size}px ${o.display ? DISPLAY : TEXT}`;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = o.base ?? 'middle';
  if (o.outline !== false) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = o.lw ?? Math.max(3, size * 0.2);
    ctx.strokeStyle = o.stroke ?? PAL.ink;
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = o.color ?? PAL.bone;
  ctx.fillText(s, x, y);
}

export function fitText(ctx, s, max, size, o = {}) {
  ctx.font = `${o.weight ?? 800} ${size}px ${o.display ? DISPLAY : TEXT}`;
  let out = s;
  while (out.length > 1 && ctx.measureText(out).width > max) out = out.slice(0, -1);
  return out === s ? s : out.slice(0, -1) + '…';
}

export function textWidth(ctx, s, size, o = {}) {
  ctx.font = `${o.weight ?? 800} ${size}px ${o.display ? DISPLAY : TEXT}`;
  return ctx.measureText(s).width;
}

// ---------------------------------------------------------------- taps

export function createHits() {
  let list = [];
  return {
    clear() {
      list = [];
    },
    add(r, id, data) {
      list.push({ ...r, id, data });
    },
    at(x, y) {
      for (let i = list.length - 1; i >= 0; i--) {
        const r = list[i];
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
      }
      return null;
    },
    get list() {
      return list;
    },
  };
}

// ---------------------------------------------------------------- layout

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Where everything goes for a W×H screen around the platform's reserved rectangles.
 * Returns { rope, dial, cart, stage, gy, buttons, posts, narrow, compact, center }.
 */
export function layout(W, H, reserved, { lobby = false, tags = 1 } = {}) {
  const res = Array.isArray(reserved) ? reserved : null;
  const menu = res?.find((r) => r.kind === 'menu') ?? (res ? null : { x: 0, y: 0, w: 150, h: 70 });
  const strip = res?.find((r) => r.kind === 'lobby') ?? (lobby && !res ? { x: 0, y: H - 88, w: W, h: 88 } : null);
  const portrait = H > W * 1.15;
  const phone = Math.min(W, H) < 500;
  const n = Math.max(1, tags);

  // the rope: right of the menu when there's room for the tags, else under it
  const tagMin = phone ? 58 : 96;
  const menuTop = menu && menu.y < H / 2 ? menu : null;
  let rope;
  const right = menuTop && menuTop.x < W / 2 ? menuTop.x + menuTop.w + 10 : 10;
  const leftEnd = menuTop && menuTop.x >= W / 2 ? menuTop.x - 10 : W - 10;
  const tagH = phone ? (portrait ? 84 : 64) : 92;
  if (leftEnd - right >= n * tagMin + 20) rope = { x: right, y: 6, w: leftEnd - right, h: tagH };
  else rope = { x: 8, y: (menuTop ? menuTop.y + menuTop.h : 0) + 4, w: W - 16, h: tagH };
  const compact = rope.w / n < 120;

  // the sand line
  const bottomBlock = strip ? strip.h + (H - (strip.y + strip.h)) : 0;
  const sandH = Math.max(lobby ? bottomBlock + 70 : 60, Math.min(170, H * (portrait ? 0.2 : 0.19)));
  const gy = Math.round(H - sandH);

  // the dial: right of the camel on wide screens, under the rope's right end on narrow ones
  const dialR = Math.round(Math.max(38, Math.min(phone ? (portrait ? 50 : 42) : 64, W * 0.06 + 18)));
  let dial;
  if (portrait) dial = { x: W - dialR - 14, y: rope.y + rope.h + dialR + 14, r: dialR, post: false };
  else dial = { x: W - dialR - Math.max(18, W * 0.03), y: Math.max(rope.y + rope.h + dialR + 16, gy - dialR * 2.6), r: dialR, post: true };

  // the cart at the bottom left, standing on the sand
  const cartW = Math.round(Math.min(phone ? 280 : 340, W * (portrait ? 0.72 : 0.3)));
  const cartH = Math.round(cartW * 0.52);
  const cartBottom = strip ? Math.min(H - 6, strip.y - 6) : H - 6;
  const cart = { x: 10, y: cartBottom - cartH, w: cartW, h: cartH };

  // the stage the camera fits the camel into
  const top = rope.y + rope.h + 16;
  const stage = {
    x: portrait ? 6 : Math.round(cartW * 0.25),
    y: top,
    w: portrait ? W - 12 : W - Math.round(cartW * 0.25) - dialR * 2 - 40,
    h: Math.max(80, gy - top),
  };

  // touch buttons (the game's own), lower right, around anything reserved
  const B = phone ? 64 : 72;
  const b = 64;
  const gap = 12;
  let bx = W - B - 14;
  let by = H - B - 14;
  for (const r of res ?? []) {
    if (r.kind === 'menu' || r.kind === 'lobby') {
      const box = { x: bx - b - gap, y: by - b - gap, w: B + b + gap, h: B + b + gap };
      if (overlaps(box, r)) by = Math.min(by, r.y - B - 10);
    }
  }
  const buttons = {
    drop: { x: bx, y: by, w: B, h: B },
    ccw: { x: bx - b - gap, y: by + B - b, w: b, h: b },
    cw: { x: bx, y: by - b - gap, w: b, h: b },
  };
  // a short landscape screen: the dial sits above the buttons
  if (!portrait && phone) dial.y = Math.max(rope.y + rope.h + dial.r + 6, Math.min(dial.y, buttons.cw.y - dial.r - 10));

  // the lobby's signposts: right of the camel, above the strip
  const postW = phone ? 150 : 190;
  const postH = phone ? 58 : 66;
  const posts = {
    caravan: { x: W - postW - 12, y: gy - postH * 2 - 30, w: postW, h: postH },
    daily: { x: W - postW - 12, y: gy - postH - 18, w: postW, h: postH },
  };
  if (portrait) {
    posts.caravan = { x: W - postW - 10, y: cart.y + 4, w: postW, h: postH };
    posts.daily = { x: W - postW - 10, y: cart.y + postH + 14, w: postW, h: postH };
  }

  return { W, H, rope, dial, cart, stage, gy, buttons, posts, portrait, phone, compact, strip, menu, center: { x: W / 2, y: top + (gy - top) * 0.36 } };
}

// ---------------------------------------------------------------- materials for the HUD (screen space)

export const LIGHT_WOOD = { face: '#E8B07A', light: '#F6CD9C', dark: '#B9733F', grain: 'rgba(120,60,25,0.22)' };
export const DARK_WOOD = { face: '#A8622F', light: '#C9824A', dark: '#6E3A1C', grain: 'rgba(50,20,10,0.3)' };

/** A painted plank: graded face, grain, a lit top edge and a dark lower lip. */
export function plank(ctx, path, r, wood = LIGHT_WOOD, o = {}) {
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, wood.light);
  g.addColorStop(0.35, wood.face);
  g.addColorStop(1, wood.dark);
  ctx.fillStyle = o.fill ?? g;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  if (o.fill) {
    const sh = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    sh.addColorStop(0, 'rgba(255,250,235,0.35)');
    sh.addColorStop(0.4, 'rgba(255,250,235,0)');
    sh.addColorStop(1, 'rgba(42,18,64,0.18)');
    ctx.fillStyle = sh;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  // grain: long wavy lines, seeded by the plank's position so it never crawls
  ctx.strokeStyle = o.fill ? 'rgba(120,70,30,0.08)' : wood.grain;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const n = Math.max(2, Math.round(r.h / 7));
  for (let k = 0; k < n; k++) {
    const y0 = r.y + ((k + 0.5) / n) * r.h;
    const ph = (r.x * 0.37 + k * 1.9) % 6.28;
    ctx.moveTo(r.x, y0);
    for (let x = r.x; x <= r.x + r.w; x += 12) ctx.lineTo(x, y0 + Math.sin(x * 0.045 + ph) * 1.6 + Math.sin(x * 0.13 + ph * 2) * 0.6);
  }
  ctx.stroke();
  // the lit top edge
  ctx.fillStyle = 'rgba(255,248,225,0.45)';
  ctx.fillRect(r.x, r.y, r.w, 2.5);
  ctx.restore();
}

/** A brass plate: a bright bevel, a soft face and a glint. */
export function brass(ctx, path, r) {
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, '#FFE9A0');
  g.addColorStop(0.45, PAL.gold);
  g.addColorStop(1, '#D08A16');
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = 'rgba(255,255,240,0.45)';
  ctx.beginPath();
  ctx.moveTo(r.x + r.w * 0.08, r.y);
  ctx.lineTo(r.x + r.w * 0.22, r.y);
  ctx.lineTo(r.x + r.w * 0.12, r.y + r.h);
  ctx.lineTo(r.x - r.w * 0.02, r.y + r.h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,248,220,0.6)';
  ctx.fillRect(r.x, r.y, r.w, 2.5);
  ctx.restore();
}

/** Two screws or nail heads. */
export function nails(ctx, pts, rad = 3) {
  for (const [x, y] of pts) {
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fillStyle = '#5A3A2A';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,240,210,0.55)';
    ctx.fill();
  }
}

/** A rope (two twisted strands). */
export function rope(ctx, x1, y1, x2, y2, sag = 0, w = 3) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = w + 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + sag, x2, y2);
  ctx.stroke();
  ctx.strokeStyle = '#C9A26A';
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90,55,25,0.8)';
  ctx.lineWidth = Math.max(1, w * 0.45);
  ctx.setLineDash([w * 0.9, w * 1.1]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ---------------------------------------------------------------- slabs (the game's buttons)

/** A chunky plank (or, primary, a brass plate) with a label, that presses in; returns its rect. */
export function slab(ctx, r, label, o = {}) {
  const press = o.pressed ? 3 : 0;
  const depth = Math.max(5, Math.round(r.h * 0.11));
  const rad = Math.min(12, r.h * 0.2);
  ctx.save();
  // shadow on what is behind
  ctx.fillStyle = 'rgba(28,15,46,0.38)';
  ctx.fill(rr(new Path2D(), r.x + 3, r.y + depth + 5, r.w, r.h - depth, rad));
  // the edge (the plank's thickness)
  ctx.fillStyle = o.primary ? '#9C5F0E' : o.color ? 'rgba(28,15,46,0.5)' : DARK_WOOD.dark;
  ctx.fill(rr(new Path2D(), r.x, r.y + depth, r.w, r.h - depth, rad));
  const fr = { x: r.x, y: r.y + press, w: r.w, h: r.h - depth };
  const top = rr(new Path2D(), fr.x, fr.y, fr.w, fr.h, rad);
  if (o.primary) brass(ctx, top, fr);
  else plank(ctx, top, fr, LIGHT_WOOD, o.color ? { fill: o.color } : {});
  ctx.lineWidth = 3;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(rr(new Path2D(), r.x, r.y + press, r.w, r.h - press, rad));
  ctx.beginPath();
  ctx.moveTo(r.x + 3, r.y + r.h - depth + press * 0.3);
  ctx.lineTo(r.x + r.w - 3, r.y + r.h - depth + press * 0.3);
  ctx.lineWidth = 2;
  ctx.stroke();
  const cy = r.y + press + (r.h - depth) / 2;
  if (o.icon) o.icon(ctx, r.x + r.w / 2, cy, Math.min(r.w, r.h - depth));
  else {
    const size = o.size ?? Math.min(30, (r.h - depth) * 0.5);
    // engraved: a light line under the dark letters
    text(ctx, label, r.x + r.w / 2, cy + 2.2, { size, display: o.display !== false, weight: 900, color: o.primary ? 'rgba(255,245,200,0.7)' : 'rgba(255,236,200,0.6)', outline: false });
    text(ctx, label, r.x + r.w / 2, cy + 1, { size, display: o.display !== false, weight: 900, color: PAL.ink, outline: false });
  }
  if (o.key) text(ctx, o.key, r.x + r.w - 8, r.y + r.h - depth - 9, { size: 12, align: 'right', color: PAL.ink, outline: false, weight: 700 });
  if (o.badge) {
    // a small stamp in the corner (a count, a "new")
    const bx = r.x + r.w - 6, by = r.y + 4;
    ctx.beginPath();
    ctx.arc(bx, by, 11, 0, Math.PI * 2);
    ctx.fillStyle = PAL.rose;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, String(o.badge), bx, by + 1, { size: 13, display: true, weight: 900, color: PAL.bone, outline: false });
  }
  ctx.restore();
  return r;
}

/** Turn arrows for the ↺ / ↻ slabs (drawn, so no font is needed for them). */
export function turnIcon(dir) {
  return (ctx, x, y, s) => {
    const r = s * 0.24;
    ctx.save();
    ctx.translate(x, y);
    if (dir > 0) ctx.scale(-1, 1);
    ctx.lineWidth = Math.max(4, s * 0.09);
    ctx.strokeStyle = PAL.ink;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI * 0.15, Math.PI * 1.25);
    ctx.stroke();
    const ax = Math.cos(-Math.PI * 0.15) * r, ay = Math.sin(-Math.PI * 0.15) * r;
    ctx.beginPath();
    ctx.moveTo(ax + r * 0.5, ay - r * 0.05);
    ctx.lineTo(ax - r * 0.05, ay - r * 0.55);
    ctx.lineTo(ax - r * 0.1, ay + r * 0.25);
    ctx.closePath();
    ctx.fillStyle = PAL.ink;
    ctx.fill();
    ctx.restore();
  };
}

// ---------------------------------------------------------------- the golden straw (pointer, needle, crown)

export function goldenStraw(ctx, x1, y1, x2, y2, w) {
  const dx = x2 - x1, dy = y2 - y1;
  const L = Math.hypot(dx, dy) || 1;
  ctx.save();
  ctx.translate(x1, y1);
  ctx.rotate(Math.atan2(dy, dx));
  const shape = new Path2D();
  shape.moveTo(0, -w / 2);
  shape.lineTo(L - w, -w / 2);
  shape.lineTo(L, 0);
  shape.lineTo(L - w, w / 2);
  shape.lineTo(0, w / 2);
  shape.closePath();
  ctx.fillStyle = PAL.gold;
  ctx.fill(shape);
  ctx.save();
  ctx.clip(shape);
  ctx.strokeStyle = PAL.goldDark;
  ctx.lineWidth = Math.max(1, w * 0.18);
  ctx.beginPath();
  for (let s = w; s < L - w; s += w * 1.6) {
    ctx.moveTo(s, -w / 2);
    ctx.lineTo(s + w * 0.4, w / 2);
  }
  ctx.stroke();
  ctx.restore();
  ctx.lineWidth = Math.max(1.5, w * 0.22);
  ctx.strokeStyle = PAL.ink;
  ctx.lineJoin = 'round';
  ctx.stroke(shape);
  ctx.restore();
}

// ---------------------------------------------------------------- an item fitted into a box (screen space)

export function itemInBox(ctx, item, cx, cy, bw, bh, o = {}) {
  const it = ITEMS[item];
  if (!it) return 0;
  const a = o.a ?? (it.key === 'clock' ? Math.PI / 2 : 0);
  const e = extents(item, a);
  const w = e.maxX - e.minX, h = e.maxY - e.minY;
  const s = Math.min(bw / w, bh / h, (o.cap ?? bw / 0.9));
  ctx.save();
  ctx.translate(cx - ((e.minX + e.maxX) / 2) * s, cy + ((e.minY + e.maxY) / 2) * s);
  ctx.scale(s, -s);
  ctx.rotate(a);
  drawItem(ctx, item, 1 / s, { flash: o.flash, ghost: o.ghost, silhouette: o.silhouette });
  ctx.restore();
  return s;
}

// ---------------------------------------------------------------- luggage tags on the rope

/**
 * The tags: [{ id, name, seat, kg, me, host, active, next (item), bot, place, faded, zero, avatar (Image), label }].
 * anim: a Map kept by the caller (swing per tag). Returns where each tag is (for floaters and taps).
 */
export function drawRope(ctx, L, tags, anim, t, dt) {
  const r = L.rope;
  const n = Math.max(1, tags.length);
  const gap = 8;
  const tw = Math.min(L.compact ? 92 : 168, (r.w - gap * (n + 1)) / n);
  const total = n * tw + (n - 1) * gap;
  const x0 = r.x + (r.w - total) / 2;
  const ropeY = r.y + 6;
  // the rope sags between its ends
  rope(ctx, r.x, ropeY, r.x + r.w, ropeY, 20, 3.2);
  const out = new Map();
  tags.forEach((g, i) => {
    let a = anim.get(g.id);
    if (!a) {
      a = { sw: 0, v: 0, drop: 0, kg: g.kg, prevKg: g.kg, bump: 0 };
      anim.set(g.id, a);
    }
    if (g.kg !== a.prevKg) {
      a.v += g.kg > a.prevKg ? 2.4 : -2.4;
      a.prevKg = g.kg;
      a.bump = 1;
    }
    // spring swing
    a.v += -a.sw * 60 * dt - a.v * 4 * dt;
    a.sw += a.v * dt;
    const wantDrop = g.active ? 1 : 0;
    a.drop += (wantDrop - a.drop) * Math.min(1, dt * 8);
    a.kg += (g.kg - a.kg) * Math.min(1, dt * 6);
    if (Math.abs(g.kg - a.kg) < 0.5) a.kg = g.kg;
    a.bump = Math.max(0, a.bump - dt * 2.5);
    const cx = x0 + i * (tw + gap) + tw / 2;
    const sag = 10 * (1 - ((cx - r.x - r.w / 2) / (r.w / 2)) ** 2);
    const hy = ropeY + sag * 0.5;
    const th = r.h - 18;
    const top = hy + 8 + a.drop * 12;
    out.set(g.id, { x: cx, y: top + th / 2, w: tw, h: th, top });
    ctx.save();
    ctx.translate(cx, hy);
    ctx.rotate(a.sw * 0.12 + (g.zero ? 0.18 : 0));
    ctx.translate(-cx, -hy);
    drawTag(ctx, g, cx - tw / 2, top, tw, th, hy, a, t, L.compact);
    ctx.restore();
    if (g.active) {
      // the golden straw points down at whose turn it is
      const bob = Math.sin(t * 5) * 3;
      goldenStraw(ctx, cx + 30, top - 40 + bob, cx + 4, top - 4 + bob, 9);
    }
  });
  return out;
}

function drawTag(ctx, g, x, y, w, h, hy, a, t, compact) {
  const seat = SEATS[(g.seat ?? 0) % SEATS.length];
  ctx.globalAlpha = g.faded ? 0.55 : 1;
  // twine from the rope to the grommet
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(x + w / 2 - 3, hy);
  ctx.lineTo(x + w / 2, y + 12);
  ctx.lineTo(x + w / 2 + 3, hy);
  ctx.stroke();
  ctx.strokeStyle = '#D9B98A';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // the tag: a card with clipped top corners
  const c = 12;
  const p = new Path2D();
  p.moveTo(x + c, y);
  p.lineTo(x + w - c, y);
  p.lineTo(x + w, y + c);
  p.lineTo(x + w, y + h - 6);
  p.quadraticCurveTo(x + w, y + h, x + w - 6, y + h);
  p.lineTo(x + 6, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - 6);
  p.lineTo(x, y + c);
  p.closePath();
  ctx.fillStyle = 'rgba(28,15,46,0.35)';
  ctx.save();
  ctx.translate(3, 4);
  ctx.fill(p);
  ctx.restore();
  // kraft card: graded, with fibres
  const kg0 = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
  kg0.addColorStop(0, g.me ? '#FBEBC4' : '#F2D9A6');
  kg0.addColorStop(1, g.me ? '#EFD49E' : '#DDBB80');
  ctx.fillStyle = kg0;
  ctx.fill(p);
  ctx.save();
  ctx.clip(p);
  ctx.strokeStyle = 'rgba(140,96,40,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 0; k < 7; k++) {
    const fy = y + 10 + ((k * 37 + (g.seat ?? 0) * 11) % Math.max(10, h - 14));
    const fx = x + ((k * 53) % Math.max(10, w - 20));
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + 14, fy + 2);
  }
  ctx.stroke();
  // the seat's colour as a painted band along the bottom, and a fold shadow
  ctx.fillStyle = seat.color;
  ctx.fillRect(x, y + h - 6, w, 6);
  ctx.fillStyle = 'rgba(42,18,64,0.1)';
  ctx.fillRect(x + w - 10, y, 10, h);
  if (g.zero) {
    ctx.fillStyle = 'rgba(214,63,110,0.12)';
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  ctx.lineWidth = g.me ? 3.5 : 2.5;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(p);
  const short = !compact && h < 60;
  // the brass grommet (short tags have no room for it)
  if (!short) {
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 12, 6, 0, Math.PI * 2);
    ctx.fillStyle = PAL.goldDark;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + w / 2 - 1, y + 11, 4.2, Math.PI, Math.PI * 1.7);
    ctx.strokeStyle = 'rgba(255,245,200,0.8)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 12, 3, 0, Math.PI * 2);
    ctx.fillStyle = PAL.ink;
    ctx.fill();
  }

  const pr = compact ? Math.min(14, h * 0.2) : short ? Math.min(14, h * 0.3) : Math.min(20, h * 0.26);
  const px = compact ? x + w / 2 : x + pr + 9;
  const py = compact ? y + 18 + pr : y + h / 2 + 4;
  // portrait: the avatar, or the animal
  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, Math.PI * 2);
  ctx.fillStyle = seat.color;
  ctx.fill();
  ctx.clip();
  if (g.bot) drawPortrait(ctx, g.name, px, py, pr);
  else if (g.avatar && g.avatar.complete && g.avatar.naturalWidth > 0) {
    try {
      ctx.drawImage(g.avatar, px - pr, py - pr * 1.05, pr * 2, pr * 2);
    } catch {}
  } else text(ctx, (g.name || '?').slice(0, 1).toUpperCase(), px, py + 1, { size: pr, display: true, weight: 900, color: PAL.ink, outline: false });
  ctx.restore();
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, Math.PI * 2);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke();
  // the seat symbol on the portrait's edge
  drawSymbol(ctx, seat.sym, px + pr * 0.78, py + pr * 0.72, compact ? 5.5 : 7, seat.color, PAL.ink, 1.8);
  if (g.host) {
    // a small key
    const kx = px - pr * 0.85, ky = py - pr * 0.8;
    ctx.strokeStyle = PAL.ink;
    ctx.fillStyle = PAL.gold;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(kx, ky, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(kx + 3, ky - 1.2, 7, 2.4);
    ctx.strokeRect(kx + 3, ky - 1.2, 7, 2.4);
  }

  const kgStr = g.label ?? `${Math.round(a.kg)}`;
  const bump = 1 + a.bump * 0.25;
  if (compact) {
    text(ctx, kgStr, x + w / 2, py + pr + 11, { size: 18 * bump, display: true, weight: 900, color: g.zero ? PAL.rose : PAL.ink, outline: false });
  } else {
    const tx = px + pr + 8;
    const maxW = x + w - tx - 6;
    ctx.save();
    const ns = short ? 12 : 15;
    const ks = (short ? 21 : 30) * bump;
    const nm = fitText(ctx, g.name || '', maxW, ns, { weight: 800 });
    text(ctx, nm, tx, y + (short ? 17 : 27), { size: ns, align: 'left', color: PAL.ink, outline: false, weight: 800 });
    text(ctx, kgStr, tx, y + h - (short ? 12 : 22), { size: ks, align: 'left', display: true, weight: 900, color: g.zero ? PAL.rose : PAL.ink, outline: false });
    if (!g.label) {
      const kw = textWidth(ctx, kgStr, ks, { display: true, weight: 900 });
      text(ctx, 'kg', tx + kw + 3, y + h - (short ? 10 : 18), { size: short ? 11 : 13, align: 'left', color: PAL.violet, outline: false, weight: 800 });
    }
    ctx.restore();
  }
  // a place number (results), or the item coming to them
  if (g.place) {
    const bx = x + w - 13, by = y + 22;
    ctx.beginPath();
    ctx.arc(bx, by, 11, 0, Math.PI * 2);
    ctx.fillStyle = g.place === 1 ? PAL.gold : PAL.violet;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke();
    text(ctx, String(g.place), bx, by + 1, { size: 15, display: true, weight: 900, color: g.place === 1 ? PAL.ink : PAL.bone, outline: false });
  }
  if (g.next !== undefined && g.next >= 0) {
    const bx = x + w - (compact ? 4 : 18), by = y + h + 6;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(Math.sin(t * 3) * 0.08);
    ctx.fillStyle = PAL.bone;
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    itemInBox(ctx, g.next, 0, 0, 22, 22, { cap: 30 });
    ctx.restore();
  }
  if (g.zero) {
    // the stamped 0
    ctx.save();
    ctx.translate(x + w * 0.72, y + h * 0.55);
    ctx.rotate(-0.25);
    ctx.lineWidth = 3;
    ctx.strokeStyle = PAL.rose;
    ctx.strokeRect(-18, -15, 36, 30);
    text(ctx, '0', 0, 1, { size: 26, display: true, weight: 900, color: PAL.rose, outline: false });
    ctx.restore();
    // the crack
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, y);
    ctx.lineTo(x + w * 0.38, y + h * 0.3);
    ctx.lineTo(x + w * 0.3, y + h * 0.5);
    ctx.lineTo(x + w * 0.42, y + h * 0.8);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- the dial

/** The brass weighbridge dial: 0-100 over a 250° sweep, the red band hatched, a golden straw for the needle. */
export function drawDial(ctx, D, value, o = {}) {
  const { x, y, r } = D;
  const A0 = Math.PI * 0.8, A1 = Math.PI * 2.2;
  const ang = (v) => A0 + (A1 - A0) * Math.max(0, Math.min(1.04, v / 100));
  ctx.save();
  if (D.post && o.gy) {
    const pr2 = { x: x - 8, y: y + r * 0.6, w: 16, h: o.gy - y - r * 0.6 + 6 };
    const pp = new Path2D();
    pp.rect(pr2.x, pr2.y, pr2.w, pr2.h);
    const pg = ctx.createLinearGradient(pr2.x, 0, pr2.x + pr2.w, 0);
    pg.addColorStop(0, DARK_WOOD.light);
    pg.addColorStop(1, DARK_WOOD.dark);
    ctx.fillStyle = pg;
    ctx.fill(pp);
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 2.5;
    ctx.stroke(pp);
  }
  // shadow, a brass bezel with screws, an aged cream face
  ctx.beginPath();
  ctx.arc(x + 4, y + 6, r + 9, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(28,15,46,0.38)';
  ctx.fill();
  const bz = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  bz.addColorStop(0, '#FFF0B8');
  bz.addColorStop(0.35, PAL.gold);
  bz.addColorStop(0.7, '#C9850F');
  bz.addColorStop(1, '#8A560A');
  ctx.beginPath();
  ctx.arc(x, y, r + 9, 0, Math.PI * 2);
  ctx.fillStyle = bz;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke();
  const bz2 = ctx.createLinearGradient(x + r, y + r, x - r, y - r);
  bz2.addColorStop(0, '#FFE49A');
  bz2.addColorStop(1, '#A86A0C');
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  ctx.fillStyle = bz2;
  ctx.fill();
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const sx = x + Math.cos(a) * (r + 5.5), sy = y + Math.sin(a) * (r + 5.5);
    ctx.beginPath();
    ctx.arc(sx, sy, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = '#7A4A08';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,200,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx - 1.6, sy + 1.6);
    ctx.lineTo(sx + 1.6, sy - 1.6);
    ctx.stroke();
  }
  const face = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  face.addColorStop(0, '#FFF8E6');
  face.addColorStop(0.75, '#F6E6C4');
  face.addColorStop(1, '#E2C690');
  ctx.beginPath();
  ctx.arc(x, y, r - 2, 0, Math.PI * 2);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke();
  // the red band, hatched
  const [b0, b1] = o.band ?? BAND;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r - 5, ang(b0), ang(b1));
  ctx.arc(x, y, r * 0.62, ang(b1), ang(b0), true);
  ctx.closePath();
  ctx.fillStyle = PAL.rose;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = PAL.roseDark;
  ctx.lineWidth = Math.max(2, r * 0.05);
  ctx.beginPath();
  for (let k = -r * 2; k < r * 2; k += r * 0.13) {
    ctx.moveTo(x + k, y - r);
    ctx.lineTo(x + k + r, y + r);
  }
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r - 5, ang(b0), ang(b1));
  ctx.arc(x, y, r * 0.62, ang(b1), ang(b0), true);
  ctx.closePath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke();
  // ticks
  ctx.lineCap = 'round';
  for (let v = 0; v <= 100; v += 10) {
    const a = ang(v);
    const big = v % 50 === 0;
    ctx.lineWidth = big ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * (r - 6), y + Math.sin(a) * (r - 6));
    ctx.lineTo(x + Math.cos(a) * (r - (big ? 18 : 12)), y + Math.sin(a) * (r - (big ? 18 : 12)));
    ctx.stroke();
  }
  // the camel's face as the dial's mark: a little hump glyph at the bottom
  const hy = y + r * 0.42;
  ctx.fillStyle = PAL.ink;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.22, hy + r * 0.06);
  ctx.quadraticCurveTo(x - r * 0.12, hy - r * 0.16, x, hy - r * 0.04);
  ctx.quadraticCurveTo(x + r * 0.1, hy - r * 0.18, x + r * 0.2, hy + r * 0.06);
  ctx.closePath();
  ctx.fill();
  // the needle: a golden straw
  const a = ang(value);
  goldenStraw(ctx, x - Math.cos(a) * r * 0.18, y - Math.sin(a) * r * 0.18, x + Math.cos(a) * (r - 10), y + Math.sin(a) * (r - 10), Math.max(6, r * 0.12));
  ctx.beginPath();
  ctx.arc(x, y, Math.max(5, r * 0.1), 0, Math.PI * 2);
  ctx.fillStyle = PAL.goldDark;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke();
  // the glass: a soft glare across the top and a hard glint
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r - 3, 0, Math.PI * 2);
  ctx.clip();
  const gl = ctx.createLinearGradient(x, y - r, x, y + r * 0.2);
  gl.addColorStop(0, 'rgba(255,255,255,0.42)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.1, y - r * 0.55, r * 0.95, r * 0.55, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.max(2, r * 0.05);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.8, Math.PI * 1.12, Math.PI * 1.32);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

// ---------------------------------------------------------------- the cart

/**
 * The merchant's cart with its two items (and, during a pick, big targets). o: { offer, big, sel, hide (index picked),
 * hourglass (0..1 sand left), secs, wobble, settings (lobby board rows) }. Returns the item boxes.
 */
export function drawCart(ctx, R, o, t) {
  const { x, y, w, h } = R;
  const wheelR = h * 0.2;
  const bedY = y + h - wheelR * 1.6;
  const bedH = h * 0.14;
  const bounce = (o.wobble ?? 0) * Math.sin(t * 30) * 4;
  ctx.save();
  ctx.translate(0, bounce);
  // shadow on the sand
  ctx.fillStyle = 'rgba(59,33,96,0.35)';
  ctx.beginPath();
  ctx.ellipse(x + w * 0.55, y + h - 3, w * 0.55, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // the shaft to the left
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 10, bedY + bedH * 0.5);
  ctx.lineTo(x - 30, bedY + bedH + 22);
  ctx.stroke();
  ctx.strokeStyle = PAL.woodDark;
  ctx.lineWidth = 5;
  ctx.stroke();
  // canopy posts and a striped awning
  const awY = y + 4;
  for (const px of [x + 16, x + w - 16]) {
    ctx.fillStyle = PAL.woodDark;
    ctx.fillRect(px - 4, awY + 10, 8, bedY - awY - 10);
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(px - 4, awY + 10, 8, bedY - awY - 10);
  }
  const aw = new Path2D();
  aw.moveTo(x + 4, awY + 22);
  aw.lineTo(x + 18, awY);
  aw.lineTo(x + w - 18, awY);
  aw.lineTo(x + w - 4, awY + 22);
  const scal = 8;
  const sw = (w - 8) / scal;
  for (let k = scal; k > 0; k--) aw.quadraticCurveTo(x + 4 + sw * (k - 0.5), awY + 32, x + 4 + sw * (k - 1), awY + 22);
  aw.closePath();
  ctx.save();
  ctx.clip(aw);
  for (let k = 0; k < scal; k++) {
    ctx.fillStyle = k % 2 ? PAL.bone : PAL.rose;
    ctx.fillRect(x + 4 + sw * k, awY - 2, sw + 1, 40);
  }
  ctx.restore();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(aw);
  // the bed
  const bed = rr(new Path2D(), x, bedY, w, bedH, 4);
  ctx.fillStyle = PAL.wood ?? '#E39A57';
  ctx.fill(bed);
  ctx.fillStyle = PAL.woodDark;
  ctx.fillRect(x, bedY + bedH * 0.62, w, bedH * 0.38);
  ctx.lineWidth = 2.5;
  ctx.stroke(bed);
  for (let k = 1; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(x + (w * k) / 4, bedY);
    ctx.lineTo(x + (w * k) / 4, bedY + bedH);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // wheels
  const spin = (o.roll ?? 0) * 6;
  for (const wx of [x + w * 0.22, x + w * 0.78]) {
    const wy = y + h - wheelR - 2;
    ctx.beginPath();
    ctx.arc(wx, wy, wheelR, 0, Math.PI * 2);
    ctx.fillStyle = PAL.woodDark;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(wx, wy, wheelR * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = PAL.wood ?? '#E39A57';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = spin + (k / 6) * Math.PI * 2;
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + Math.cos(a) * wheelR * 0.7, wy + Math.sin(a) * wheelR * 0.7);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(wx, wy, 4, 0, Math.PI * 2);
    ctx.fillStyle = PAL.gold;
    ctx.fill();
    ctx.stroke();
  }

  const boxes = [];
  if (o.settings) {
    drawBoard(ctx, R, o.settings, awY, bedY);
  } else if (o.offer) {
    // two bays on the bed
    const bayW = (w - 50) / 2;
    const bayH = Math.min(bedY - awY - 40, bayW * 0.9);
    for (let i = 0; i < 2; i++) {
      const item = o.offer[i];
      const cx = x + 20 + bayW / 2 + i * (bayW + 10);
      const cy = bedY - bayH / 2 - 4;
      const box = { x: cx - bayW / 2, y: cy - bayH / 2 - 6, w: bayW, h: bayH + 34, i };
      boxes.push(box);
      if (item < 0 || o.hide === i) continue;
      const lift = o.sel === i ? 6 + Math.sin(t * 6) * 2 : 0;
      if (o.big) {
        // a lit pick target
        ctx.save();
        ctx.fillStyle = o.sel === i ? 'rgba(255,200,69,0.45)' : 'rgba(255,240,217,0.25)';
        ctx.strokeStyle = o.sel === i ? PAL.gold : PAL.bone;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        const pr = rr(new Path2D(), box.x, box.y, box.w, box.h - 28, 12);
        ctx.fill(pr);
        ctx.stroke(pr);
        ctx.setLineDash([]);
        ctx.restore();
      }
      itemInBox(ctx, item, cx, cy - lift, bayW * 0.86, bayH * 0.86, { cap: bayW / 0.85 });
      // its weight tag
      const tagW = Math.max(54, bayW * 0.5);
      const ty = bedY + bedH + 2;
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, bedY + bedH * 0.5);
      ctx.lineTo(cx, ty + 2);
      ctx.stroke();
      const tg = rr(new Path2D(), cx - tagW / 2, ty, tagW, 26, 5);
      ctx.fillStyle = item === STRAW ? PAL.gold : PAL.bone;
      ctx.fill(tg);
      ctx.lineWidth = 2;
      ctx.stroke(tg);
      text(ctx, weightLabel(ITEMS[item]), cx, ty + 14, { size: 20, display: true, weight: 900, color: PAL.ink, outline: false });
      if (o.keys) text(ctx, String(i + 1), box.x + 12, box.y + 14, { size: 14, color: PAL.ink, outline: false, weight: 800 });
    }
  }
  // the hourglass on the right post
  if (o.hourglass !== undefined && o.hourglass !== null) {
    const hx = x + w + 8, hy = y + h * 0.25;
    hourglass(ctx, hx, hy, 22, 38, o.hourglass, t);
    if (o.secs !== undefined) {
      const urgent = o.secs <= 5;
      const pulse = urgent ? 1 + Math.max(0, Math.sin(t * Math.PI * 2)) * 0.18 : 1;
      text(ctx, String(o.secs), hx + 34, hy + 36, { size: 32 * pulse, display: true, weight: 900, color: urgent ? PAL.rose : PAL.bone, align: 'left' });
    }
  }
  ctx.restore();
  return boxes;
}

function hourglass(ctx, x, y, w, h, frac, t) {
  ctx.save();
  ctx.translate(x, y);
  // the stand's side posts
  ctx.fillStyle = DARK_WOOD.face;
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 1.5;
  for (const px of [-5, w + 2]) {
    ctx.fillRect(px, -3, 3, h + 6);
    ctx.strokeRect(px, -3, 3, h + 6);
  }
  const glass = new Path2D();
  glass.moveTo(0, 0);
  glass.lineTo(w, 0);
  glass.quadraticCurveTo(w, h * 0.35, w / 2 + 2, h / 2);
  glass.quadraticCurveTo(w, h * 0.65, w, h);
  glass.lineTo(0, h);
  glass.quadraticCurveTo(0, h * 0.65, w / 2 - 2, h / 2);
  glass.quadraticCurveTo(0, h * 0.35, 0, 0);
  ctx.fillStyle = 'rgba(255,240,217,0.5)';
  ctx.fill(glass);
  ctx.save();
  ctx.clip(glass);
  ctx.fillStyle = PAL.gold;
  const f = Math.max(0, Math.min(1, frac));
  ctx.fillRect(0, h / 2 - (h / 2) * f, w, (h / 2) * f);
  ctx.fillRect(0, h - (h / 2) * (1 - f), w, (h / 2) * (1 - f));
  if (f > 0 && f < 1) {
    ctx.fillRect(w / 2 - 1, h / 2, 2, h / 2);
    // grains tumbling down the stream, a little cone on the pile
    ctx.fillStyle = '#FFE9A0';
    for (let k = 0; k < 3; k++) ctx.fillRect(w / 2 - 0.8, h / 2 + (((t * 60 + k * 7) % (h / 2)) | 0), 1.6, 2);
    ctx.fillStyle = PAL.gold;
    ctx.beginPath();
    const py = h - (h / 2) * (1 - f);
    ctx.moveTo(1, py + 1);
    ctx.lineTo(w / 2, py - 4);
    ctx.lineTo(w - 1, py + 1);
    ctx.fill();
  }
  // the glass's shine
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(2.5, 2, 2, h * 0.3);
  ctx.fillRect(2.5, h * 0.66, 2, h * 0.28);
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(glass);
  ctx.fillStyle = PAL.woodDark;
  ctx.fillRect(-4, -5, w + 8, 5);
  ctx.fillRect(-4, h, w + 8, 5);
  ctx.strokeRect(-4, -5, w + 8, 5);
  ctx.strokeRect(-4, h, w + 8, 5);
  ctx.restore();
}

function drawBoard(ctx, R, rows, awY, bedY) {
  const bx = R.x + 22, bw = R.w - 44;
  const rowH = Math.max(44, Math.min(56, (bedY - awY - 40) / rows.length));
  const by = bedY - rows.length * rowH - 8;
  const board = rr(new Path2D(), bx, by, bw, rows.length * rowH + 6, 6);
  ctx.fillStyle = PAL.violet;
  ctx.fill(board);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(board);
  rows.forEach((row, i) => {
    const ry = by + 3 + i * rowH;
    row.rect = { x: bx, y: ry, w: bw, h: rowH };
    if (i > 0) {
      ctx.strokeStyle = 'rgba(255,240,217,0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx + 8, ry);
      ctx.lineTo(bx + bw - 8, ry);
      ctx.stroke();
    }
    text(ctx, row.label, bx + 12, ry + rowH / 2, { size: 16, align: 'left', color: PAL.boneDark, outline: false, weight: 700 });
    text(ctx, row.value, bx + bw - 12, ry + rowH / 2 + 1, { size: 26, align: 'right', display: true, weight: 900, color: row.can ? PAL.gold : PAL.bone, outline: false });
    if (row.can) {
      const vw = textWidth(ctx, row.value, 26, { display: true, weight: 900 });
      const ax = bx + bw - 18 - vw;
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.moveTo(ax - 4, ry + rowH / 2 - 6);
      ctx.lineTo(ax - 4, ry + rowH / 2 + 6);
      ctx.lineTo(ax - 12, ry + rowH / 2);
      ctx.fill();
    }
  });
}

// ---------------------------------------------------------------- sign boards

/** A board hanging on two ropes, dropped in with `drop` (0 up out of sight, 1 in place). lines: [{ s, size, color }]. */
export function drawSign(ctx, cx, cy, lines, drop = 1, o = {}) {
  // never wider than the screen: a long name shrinks the lines
  const maxW = o.maxW ?? ctx.canvas.width / (ctx.getTransform?.().a || 1) - 24;
  let widest = 0;
  for (const l of lines) widest = Math.max(widest, textWidth(ctx, l.s, l.size, { display: l.display !== false, weight: 900 }));
  const k = Math.min(1, (maxW - 48) / Math.max(1, widest));
  if (k < 1) lines = lines.map((l) => ({ ...l, size: l.size * k }));
  let w = 0;
  let h = 18;
  for (const l of lines) {
    w = Math.max(w, textWidth(ctx, l.s, l.size, { display: l.display !== false, weight: 900 }));
    h += l.size * 1.08;
  }
  w = Math.max(o.minW ?? 0, w + 48);
  const y = cy - h / 2 - (1 - drop) * (cy + h + 40);
  const x = cx - w / 2;
  const swing = (1 - drop) * 0.1;
  ctx.save();
  ctx.translate(cx, y);
  ctx.rotate(swing);
  ctx.translate(-cx, -y);
  rope(ctx, x + 22, y + 6, x + 40, y - 400, 0, 3);
  rope(ctx, x + w - 22, y + 6, x + w - 40, y - 400, 0, 3);
  const frame = rr(new Path2D(), x - 6, y - 6, w + 12, h + 12, 10);
  ctx.fillStyle = 'rgba(28,15,46,0.42)';
  ctx.save();
  ctx.translate(5, 7);
  ctx.fill(frame);
  ctx.restore();
  plank(ctx, frame, { x: x - 6, y: y - 6, w: w + 12, h: h + 12 }, DARK_WOOD);
  ctx.lineWidth = 3;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(frame);
  const p = rr(new Path2D(), x, y, w, h, 6);
  plank(ctx, p, { x, y, w, h }, LIGHT_WOOD, { fill: o.color ?? '#FBEBD0' });
  ctx.save();
  ctx.clip(p);
  ctx.fillStyle = o.band ?? PAL.gold;
  ctx.fillRect(x, y, w, 5);
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(p);
  nails(ctx, [[x + 22, y + 6], [x + w - 22, y + 6]], 3.2);
  let ly = y + 12;
  for (const l of lines) {
    ly += (l.size * 1.08) / 2;
    text(ctx, l.s, cx, ly + 2, { size: l.size, display: l.display !== false, weight: 900, color: l.color ?? PAL.ink, outline: false });
    ly += (l.size * 1.08) / 2;
  }
  ctx.restore();
  return { x, y, w, h };
}

// ---------------------------------------------------------------- hints

/** A 2-5 word hint with a bobbing arrow pointing at (ax, ay) if given. */
export function drawHint(ctx, s, x, y, t, arrow = null, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  text(ctx, s, x, y, { size: 22, weight: 800, color: PAL.bone });
  if (arrow) {
    const bob = Math.sin(t * 6) * 5;
    const dx = arrow.x - x, dy = arrow.y - y;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;
    const tipX = arrow.x - ux * (6 - bob), tipY = arrow.y - uy * (6 - bob);
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(Math.atan2(uy, ux));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-18, -11);
    ctx.lineTo(-13, 0);
    ctx.lineTo(-18, 11);
    ctx.closePath();
    ctx.fillStyle = PAL.gold;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- signposts (lobby)

/** An arrow-shaped plank on a post: label and a value. */
export function signpost(ctx, r, label, value, o = {}) {
  const p = new Path2D();
  p.moveTo(r.x, r.y);
  p.lineTo(r.x + r.w - 20, r.y);
  p.lineTo(r.x + r.w, r.y + r.h / 2);
  p.lineTo(r.x + r.w - 20, r.y + r.h);
  p.lineTo(r.x, r.y + r.h);
  p.closePath();
  ctx.save();
  if (o.post) {
    ctx.fillStyle = PAL.woodDark;
    ctx.fillRect(r.x + 22, r.y + r.h, 10, o.post);
    ctx.lineWidth = 2;
    ctx.strokeStyle = PAL.ink;
    ctx.strokeRect(r.x + 22, r.y + r.h, 10, o.post);
  }
  ctx.fillStyle = 'rgba(28,15,46,0.35)';
  ctx.save();
  ctx.translate(4, 5);
  ctx.fill(p);
  ctx.restore();
  plank(ctx, p, r, LIGHT_WOOD, o.color ? { fill: o.color } : {});
  ctx.save();
  ctx.clip(p);
  ctx.fillStyle = 'rgba(110,58,28,0.55)';
  ctx.fillRect(r.x, r.y + r.h - 6, r.w, 6);
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(p);
  nails(ctx, [[r.x + 9, r.y + r.h / 2]], 2.6);
  text(ctx, label, r.x + 14, r.y + r.h * 0.4, { size: Math.min(26, r.h * 0.42), align: 'left', display: true, weight: 900, color: PAL.ink, outline: false });
  if (value) text(ctx, value, r.x + 14, r.y + r.h * 0.76, { size: 14, align: 'left', color: PAL.violet, outline: false, weight: 800 });
  ctx.restore();
}

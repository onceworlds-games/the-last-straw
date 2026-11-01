// The world: the sunset sky in flat bands, the sun sinking a little each round, three dune layers, the sand, the weighbridge,
// the camel and its long shadow, the load, the hands and the ghost. Metres with y up; the camera maps them to the screen.

import { PAL, drawItem, drawHands, rr } from './art.js';
import { drawCamel, foldPose } from './camel.js';
import { ITEMS } from './items.js';
import { CAMEL, extents } from './physics.js';

const SKY = ['#2A1748', '#3B2160', '#5A2766', '#82305F', '#B23A64', '#D63F6E', '#E9604F', '#F27B35', '#F99A3C'];
const SAND = '#F2B66F';
const SAND_DARK = '#E09A55';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const R = { ctx, W: 1, H: 1, pr: 1 };
  R.resize = (w, h, pr) => {
    R.W = w;
    R.H = h;
    R.pr = pr;
    const cw = Math.max(1, Math.round(w * pr));
    const ch = Math.max(1, Math.round(h * pr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
  };
  R.screen = () => ctx.setTransform(R.pr, 0, 0, R.pr, 0, 0);
  R.world = (cam) => ctx.setTransform(R.pr * cam.s, 0, 0, -R.pr * cam.s, R.pr * cam.ox, R.pr * cam.oy);
  return R;
}

/** The camera: fit a world box into the stage rectangle with world y = 0 on the sand line `gy`. */
export function fitCamera(stage, gy, box, maxS = 175) {
  const w = box.x1 - box.x0;
  const h = box.y1;
  const s = Math.max(20, Math.min(maxS, (stage.w * 0.96) / w, (gy - stage.y) / h));
  const cx = (box.x0 + box.x1) / 2;
  return { s, ox: stage.x + stage.w / 2 - cx * s, oy: gy };
}

export const toScreen = (cam, x, y) => ({ x: cam.ox + x * cam.s, y: cam.oy - y * cam.s });
export const toWorld = (cam, x, y) => ({ x: (x - cam.ox) / cam.s, y: (cam.oy - y) / cam.s });

// ---------------------------------------------------------------- the sky, the sun, the dunes, the sand

/**
 * sc: { t, sun (0 high .. 1 set), night (0..1), scroll (m walked, Caravan), countdown (text on the sun), stars }
 */
export function drawBackdrop(R, cam, sc) {
  const { ctx, W, H } = R;
  R.screen();
  const gy = cam.oy;
  const horizon = gy - Math.min(cam.s * 1.2, H * 0.2);
  // flat bands, the brightest at the horizon
  const n = SKY.length;
  const bandH = horizon / (n - 0.6);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = SKY[i];
    ctx.fillRect(0, Math.floor(i * bandH), W, Math.ceil(bandH) + 1);
  }
  ctx.fillStyle = SKY[n - 1];
  ctx.fillRect(0, horizon - 2, W, gy - horizon + 4);
  // night comes in from the top
  if (sc.night > 0) {
    ctx.fillStyle = `rgba(28,15,46,${0.55 * sc.night})`;
    ctx.fillRect(0, 0, W, horizon);
    stars(ctx, W, horizon * 0.8, sc.night, sc.t);
  }
  // the sun: huge, low on the left, sinking
  const sr = Math.max(W, H) * 0.17;
  const sx = W * 0.24 - (sc.scroll ?? 0) * 0.5;
  const sy = horizon - sr * 0.55 + (sc.sun ?? 0) * sr * 1.1;
  ctx.beginPath();
  ctx.arc(sx, sy, sr * 1.18, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,200,69,0.18)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fillStyle = PAL.gold;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx - sr * 0.08, sy - sr * 0.08, sr * 0.82, 0, Math.PI * 2);
  ctx.fillStyle = '#FFD66B';
  ctx.fill();
  if (sc.onSun) sc.onSun(ctx, sx, sy, sr);
  // dunes: far violet, middle rose, near ember (each with a lit left face)
  const scroll = sc.scroll ?? 0;
  dune(ctx, W, horizon + 4, cam.s * 0.55, scroll * cam.s * 0.15, 0.0023, PAL.violet, '#2F1A4E', 1, H);
  dune(ctx, W, horizon + cam.s * 0.38, cam.s * 0.5, scroll * cam.s * 0.35, 0.0031, '#C23A6A', PAL.roseDark, 2, H);
  dune(ctx, W, gy - cam.s * 0.12, cam.s * 0.42, scroll * cam.s * 0.6, 0.0042, PAL.ember, PAL.emberDark, 3, H);
  // the sand
  ctx.fillStyle = SAND;
  ctx.fillRect(0, gy, W, H - gy);
  ctx.fillStyle = SAND_DARK;
  const off = (scroll * cam.s) % 240;
  for (let k = -1; k < W / 240 + 2; k++) {
    const x = k * 240 + off;
    ctx.beginPath();
    ctx.moveTo(x, gy + 18);
    ctx.quadraticCurveTo(x + 60, gy + 12, x + 150, gy + 20);
    ctx.lineTo(x + 150, gy + 23);
    ctx.quadraticCurveTo(x + 60, gy + 16, x, gy + 21);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 90, gy + 52);
    ctx.quadraticCurveTo(x + 160, gy + 44, x + 230, gy + 54);
    ctx.lineTo(x + 230, gy + 58);
    ctx.quadraticCurveTo(x + 160, gy + 49, x + 90, gy + 56);
    ctx.fill();
  }
}

function stars(ctx, W, h, a, t) {
  ctx.fillStyle = PAL.bone;
  for (let i = 0; i < 46; i++) {
    const x = ((i * 9301 + 49297) % 233280) / 233280 * W;
    const y = ((i * 7919 + 1237) % 10007) / 10007 * h;
    const tw = 0.6 + 0.4 * Math.sin(t * 2 + i);
    ctx.globalAlpha = a * tw;
    const r = i % 7 === 0 ? 2 : 1.2;
    ctx.fillRect(x - r / 2, y - r / 2, r, r);
  }
  ctx.globalAlpha = 1;
}

function dune(ctx, W, base, amp, off, freq, fill, shade, seed, H) {
  const pts = [];
  const step = 16;
  for (let x = -step; x <= W + step; x += step) {
    const u = x - off;
    const y = base - amp * (0.55 + 0.3 * Math.sin(u * freq + seed * 1.7) + 0.15 * Math.sin(u * freq * 2.3 + seed * 4.1));
    pts.push([x, y]);
  }
  const p = new Path2D();
  p.moveTo(-step, H);
  for (const [x, y] of pts) p.lineTo(x, y);
  p.lineTo(W + step, H);
  p.closePath();
  ctx.fillStyle = shade;
  ctx.fill(p);
  // the lit faces: the same ridge nudged left
  ctx.save();
  ctx.clip(p);
  ctx.translate(-Math.max(6, amp * 0.25), Math.max(3, amp * 0.08));
  ctx.fillStyle = fill;
  ctx.fill(p);
  ctx.restore();
}

// ---------------------------------------------------------------- the world

/**
 * w: { t, camel (state for drawCamel), items: [{ item, x, y, a, flash, outline }], hands, ghost, town (x or null),
 * heap: [{ item, x, y, a }], crack (0..1), crown }
 */
export function drawWorld(R, cam, w) {
  const { ctx } = R;
  R.world(cam);
  const lw = 1 / cam.s;
  const camel = w.camel;
  const sad = camel.saddle ?? { y: 0, a: 0 };
  const fp = foldPose(camel.fold ?? 0);

  if (w.town != null) drawTown(ctx, lw, w.town, w.t);

  // the long shadow across the sand, to the right (the sun is low on the left)
  ctx.save();
  ctx.transform(1, 0, 1.25, -0.11, 0.3, -0.02);
  ctx.globalAlpha = 0.33;
  const sh = PAL.violet;
  drawCamel(ctx, lw, { ...camel, silhouette: sh });
  for (const it of w.items) {
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.a);
    drawItem(ctx, it.item, lw, { silhouette: sh });
    ctx.restore();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  if (w.bridge !== false) drawWeighbridge(ctx, lw, w.scroll ?? 0);
  if (w.heap) for (const it of w.heap) placeItem(ctx, lw, it);
  drawCamel(ctx, lw, camel);
  // the saddle tray rides on the hump
  drawTray(ctx, lw, sad.y + fp.y, sad.a + fp.a, w.crack ?? 0);
  for (const it of w.items) placeItem(ctx, lw, it);
  if (w.ghost) drawGhost(ctx, lw, w.ghost, w.t);
  if (w.hands) drawHeld(ctx, lw, w.hands, cam, R);
}

function placeItem(ctx, lw, it) {
  ctx.save();
  ctx.translate(it.x, it.y);
  ctx.rotate(it.a);
  drawItem(ctx, it.item, lw, { flash: it.flash, outline: it.outline });
  ctx.restore();
}

function drawWeighbridge(ctx, lw, scroll) {
  const x0 = -2.9, x1 = 2.5, th = 0.2;
  ctx.save();
  ctx.fillStyle = PAL.woodDark;
  ctx.fillRect(x0, -th, x1 - x0, th);
  ctx.fillStyle = PAL.wood;
  ctx.fillRect(x0, -th * 0.45, x1 - x0, th * 0.45);
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = lw * 2.4;
  ctx.strokeRect(x0, -th, x1 - x0, th);
  ctx.lineWidth = lw * 1.4;
  ctx.beginPath();
  for (let x = x0 + 0.6; x < x1; x += 0.6) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, -th);
  }
  ctx.stroke();
  // brass edge and bolts
  ctx.fillStyle = PAL.gold;
  ctx.fillRect(x0, -0.035, x1 - x0, 0.035);
  ctx.strokeRect(x0, -0.035, x1 - x0, 0.035);
  ctx.fillStyle = PAL.goldDark;
  for (let x = x0 + 0.3; x < x1; x += 0.6) {
    ctx.beginPath();
    ctx.arc(x, -th * 0.6, 0.025, 0, Math.PI * 2);
    ctx.fill();
  }
  // the scale's brass plate on the front
  const p = rr(new Path2D(), -0.35, -th + 0.025, 0.7, th - 0.07, 0.02);
  ctx.fillStyle = PAL.gold;
  ctx.fill(p);
  ctx.stroke(p);
  ctx.lineWidth = lw * 1.2;
  ctx.beginPath();
  for (let x = -0.3; x <= 0.3; x += 0.06) {
    ctx.moveTo(x, -0.07);
    ctx.lineTo(x, x % 0.3 === 0 ? -0.13 : -0.1);
  }
  ctx.stroke();
  ctx.restore();
}

function drawTray(ctx, lw, y, a, crack) {
  ctx.save();
  ctx.translate(0, CAMEL.pivotY + y);
  ctx.rotate(a);
  const H = CAMEL.trayHalf;
  // tray board
  const board = rr(new Path2D(), -H, 0, H * 2, 0.12, 0.02);
  ctx.fillStyle = PAL.woodDark;
  ctx.fill(board);
  ctx.fillStyle = PAL.wood;
  ctx.fillRect(-H, 0.06, H * 2, 0.06);
  ctx.lineWidth = lw * 2.4;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(board);
  // the rails at both ends
  for (const s of [-1, 1]) {
    const r = rr(new Path2D(), s * 1.15 - 0.05, 0.1, 0.1, 0.32, 0.02);
    ctx.fillStyle = PAL.woodDark;
    ctx.fill(r);
    ctx.stroke(r);
    ctx.beginPath();
    ctx.arc(s * 1.15, 0.43, 0.06, 0, Math.PI * 2);
    ctx.fillStyle = PAL.gold;
    ctx.fill();
    ctx.stroke();
  }
  // the straps down to the girth
  ctx.strokeStyle = PAL.violet;
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(-0.55, 0.02);
  ctx.lineTo(-0.5, -0.5);
  ctx.moveTo(0.6, 0.02);
  ctx.lineTo(0.55, -0.5);
  ctx.stroke();
  if (crack > 0) {
    // the zigzag crack along the back
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = lw * 4;
    ctx.beginPath();
    const n = 9;
    const end = -H + 2 * H * Math.min(1, crack);
    for (let k = 0; k <= n; k++) {
      const x = -H + (2 * H * k) / n;
      if (x > end) break;
      const yy = 0.06 + (k % 2 ? 0.05 : -0.04);
      if (k === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    ctx.strokeStyle = PAL.bone;
    ctx.lineWidth = lw * 1.4;
    ctx.stroke();
  }
  ctx.restore();
}

function drawGhost(ctx, lw, g, t) {
  ctx.save();
  // a dotted drop line from the item to where it first touches
  ctx.strokeStyle = 'rgba(34,184,167,0.9)';
  ctx.lineWidth = lw * 2;
  ctx.setLineDash([lw * 4, lw * 6]);
  ctx.beginPath();
  ctx.moveTo(g.x, g.fromY);
  ctx.lineTo(g.x, g.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.translate(g.x, g.y);
  ctx.rotate(g.a);
  ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 6);
  drawItem(ctx, g.item, lw, { ghost: g.color ?? PAL.turq });
  ctx.restore();
}

function drawHeld(ctx, lw, h, cam, R) {
  if (!h.visible) return;
  const it = ITEMS[h.item];
  if (!it) return;
  const e = extents(h.item, h.a);
  const topY = (cam.oy + 40) / cam.s; // above the top of the screen
  const span = Math.min(e.maxX - e.minX, 1.2);
  const cx = h.x + (e.minX + e.maxX) / 2;
  const hy = h.y + e.maxY - 0.04;
  const left = { x: cx - Math.max(0.12, span / 2 - 0.12), y: hy };
  const right = { x: cx + Math.max(0.12, span / 2 - 0.12), y: hy };
  if (h.open < 1) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.a);
    drawItem(ctx, h.item, lw, {});
    ctx.restore();
  }
  drawHands(ctx, lw, left, right, Math.max(topY, hy + 2), h.who, h.open ?? 0);
}

// ---------------------------------------------------------------- a town on the way (Caravan)

function drawTown(ctx, lw, x, t) {
  ctx.save();
  ctx.translate(x, 0);
  const wall = PAL.emberDark;
  // two towers and an arch
  for (const s of [-1, 1]) {
    const tw = rr(new Path2D(), s * 1.6 - 0.45, 0, 0.9, 4.4, 0.05);
    ctx.fillStyle = s < 0 ? PAL.ember : wall;
    ctx.fill(tw);
    ctx.lineWidth = lw * 2.4;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke(tw);
    ctx.beginPath();
    ctx.moveTo(s * 1.6 - 0.5, 4.4);
    ctx.quadraticCurveTo(s * 1.6, 5.4, s * 1.6 + 0.5, 4.4);
    ctx.closePath();
    ctx.fillStyle = PAL.gold;
    ctx.fill();
    ctx.stroke();
  }
  const arch = new Path2D();
  arch.moveTo(-1.15, 3.6);
  arch.lineTo(1.15, 3.6);
  arch.lineTo(1.15, 4.2);
  arch.lineTo(-1.15, 4.2);
  arch.closePath();
  ctx.fillStyle = PAL.rose;
  ctx.fill(arch);
  ctx.stroke(arch);
  // pennants
  for (let k = 0; k < 5; k++) {
    const px = -1.0 + k * 0.5;
    ctx.beginPath();
    ctx.moveTo(px, 3.6);
    ctx.lineTo(px + 0.25, 3.6);
    ctx.lineTo(px + 0.125, 3.25 + Math.sin(t * 3 + k) * 0.03);
    ctx.closePath();
    ctx.fillStyle = k % 2 ? PAL.turq : PAL.gold;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// The picture, back to front: the land (backdrop.js), the sand with its ripples, stones and tracks, the stall and palm behind
// the weighbridge, the planks; then the camel, its saddle tray and the load drawn on their own layer so they can cast one
// soft shadow across the sand, shade each other where they touch and catch the low sun on their edges; then the hands, the
// ghost, the foreground and the grade. Metres with y up; the camera maps them to the screen.

import { drawItem, drawHands } from './art.js';
import { PAL, BIOMES, skyAt, mix, rgba } from './look.js';
import { drawCamel, foldPose } from './camel.js';
import { createBackdrop } from './backdrop.js';
import { ITEMS } from './items.js';
import { CAMEL, extents } from './physics.js';
import { createRng } from './rng.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function canvasOf(w, h) {
  return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(Math.max(1, w), Math.max(1, h)) : Object.assign(document.createElement('canvas'), { width: Math.max(1, w), height: Math.max(1, h) });
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const R = { ctx, W: 1, H: 1, pr: 1, canvas, quality: 'high', backdrop: createBackdrop() };
  R.layer = null; // the actors' layer (camel, tray, load)
  R.rim = null;
  R.shadow = null;
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
    if (!R.layer || R.layer.width !== cw || R.layer.height !== ch) {
      R.layer = canvasOf(cw, ch);
      R.rim = canvasOf(cw, ch);
      R.lctx = R.layer.getContext('2d');
      R.rctx = R.rim.getContext('2d');
    }
  };
  R.screen = (c = ctx) => c.setTransform(R.pr, 0, 0, R.pr, 0, 0);
  R.world = (cam, c = ctx) => c.setTransform(R.pr * cam.s, 0, 0, -R.pr * cam.s, R.pr * cam.ox, R.pr * cam.oy);
  return R;
}

/** The camera: fit a world box into the stage rectangle with world y = 0 on the sand line `gy`. */
export function fitCamera(stage, gy, box, maxS = 190) {
  const w = box.x1 - box.x0;
  const h = box.y1;
  const s = Math.max(20, Math.min(maxS, (stage.w * 0.96) / w, (gy - stage.y) / h));
  const cx = (box.x0 + box.x1) / 2;
  return { s, ox: stage.x + stage.w / 2 - cx * s, oy: gy };
}

export const toScreen = (cam, x, y) => ({ x: cam.ox + x * cam.s, y: cam.oy - y * cam.s });
export const toWorld = (cam, x, y) => ({ x: (x - cam.ox) / cam.s, y: (cam.oy - y) / cam.s });

/** Where the horizon sits for this camera (the camera pulls back as the load grows, so the horizon sinks a little). */
export const horizonOf = (cam, H) => cam.oy - clamp(cam.s * 1.3, 46, H * 0.26);

/** The time of day from a scene: its own `tod`, or the older sun/night pair. */
export const todOf = (sc) => (Number.isFinite(sc.tod) ? sc.tod : clamp((sc.sun ?? 0) * 0.55 + (sc.night ?? 0) * 0.65, 0, 1));

// ---------------------------------------------------------------- the land and the station

/** sc: { t, tod, biome, scroll (m walked), onSun, quality, reduced } */
export function drawBackdrop(R, cam, sc) {
  const { ctx, W, H, pr } = R;
  const gy = cam.oy;
  const hy = horizonOf(cam, H);
  const view = { W, H, pr, gy, hy, pan: cam.ox - W * 0.5, s: cam.s };
  const env = { t: sc.t ?? 0, tod: todOf(sc), biome: sc.biome ?? 'market', scroll: sc.scroll ?? 0, onSun: sc.onSun, quality: R.quality, reduced: sc.reduced };
  R.backdrop.draw(ctx, view, env);
  drawSand(R, cam, view, env);
}

const RIPPLES = (() => {
  const r = createRng('ripples');
  return Array.from({ length: 70 }, () => ({ x: r.range(-14, 14), d: r.next(), w: r.range(0.4, 1.4), c: r.range(0.03, 0.08) }));
})();
const STONES = (() => {
  const r = createRng('stones');
  return Array.from({ length: 26 }, () => ({ x: r.range(-14, 14), d: r.next(), r: r.range(0.03, 0.09), k: r.next() }));
})();
const TUFTS = (() => {
  const r = createRng('tufts');
  return Array.from({ length: 12 }, () => ({ x: r.range(-12, 12), d: r.range(0.05, 1), h: r.range(0.15, 0.35), n: 5 + r.int(4) }));
})();

/** The sand from the near dunes to the bottom of the screen: a gradient, a low near ridge, ripples, stones and tufts. */
function drawSand(R, cam, view, env) {
  const { ctx, W, H } = R;
  const { gy, hy } = view;
  const B = BIOMES[env.biome] ?? BIOMES.market;
  const sky = skyAt(env.tod);
  const night = clamp((env.tod - 0.5) * 2, 0, 1);
  const scroll = env.scroll ?? 0;
  // the near ridge: where the flat ground in front of the dunes begins
  const top = gy - (gy - hy) * 0.3;
  const p = new Path2D();
  p.moveTo(0, H);
  for (let x = 0; x <= W + 8; x += 8) {
    const wx = (x - cam.ox) / (cam.s * 0.7) + scroll * 0.7;
    p.lineTo(x, top - Math.sin(wx * 0.35) * 6 - Math.sin(wx * 0.9 + 1) * 3);
  }
  p.lineTo(W, H);
  p.closePath();
  const g = ctx.createLinearGradient(0, top - 6, 0, H);
  const far = mix(B.groundFar, sky.haze, 0.25);
  const near = mix(B.ground, sky.shade, night * 0.45);
  g.addColorStop(0, mix(far, sky.light, 0.18));
  g.addColorStop(0.25, far);
  g.addColorStop(0.55, near);
  g.addColorStop(1, mix(near, B.ripple, 0.4));
  ctx.fillStyle = g;
  ctx.fill(p);
  // sun glints along the near ridge
  ctx.strokeStyle = rgba(sky.light, 0.45 * (1 - night));
  ctx.lineWidth = 1.5;
  ctx.stroke(p);
  // ripples: rows at depths, the far ones packed, the near ones big
  const ripple = mix(B.ripple, sky.shade, 0.15 + night * 0.3);
  ctx.lineCap = 'round';
  for (const rp of RIPPLES) {
    const d = rp.d;
    const y = top + 8 + (H - top - 8) * d * d;
    const par = 0.55 + d * 0.75;
    const x = cam.ox + (rp.x - scroll * par) * cam.s * par;
    const xs = (((x + 300) % (W + 600)) + (W + 600)) % (W + 600) - 300;
    const w = rp.w * cam.s * par;
    ctx.strokeStyle = rgba(ripple, 0.35 + d * 0.25);
    ctx.lineWidth = 1 + d * 2.2;
    ctx.beginPath();
    ctx.moveTo(xs - w / 2, y);
    ctx.quadraticCurveTo(xs, y - rp.c * cam.s * par, xs + w / 2, y + 1);
    ctx.stroke();
    // the lit edge above each ripple
    ctx.strokeStyle = rgba(sky.light, (0.18 + d * 0.12) * (1 - night));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xs - w * 0.4, y - 2 - d);
    ctx.quadraticCurveTo(xs, y - 2 - d - rp.c * cam.s * par, xs + w * 0.4, y - 1 - d);
    ctx.stroke();
  }
  for (const st of STONES) {
    const d = st.d;
    const y = top + 10 + (H - top - 10) * d;
    const par = 0.55 + d * 0.75;
    const x0 = cam.ox + (st.x - scroll * par) * cam.s * par;
    const x = (((x0 + 300) % (W + 600)) + (W + 600)) % (W + 600) - 300;
    const r = st.r * cam.s * par;
    ctx.fillStyle = rgba(sky.shade, 0.25);
    ctx.beginPath();
    ctx.ellipse(x + r * 0.5, y + r * 0.35, r * 1.2, r * 0.35, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = mix(B.midShade, B.ripple, st.k);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.62, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(sky.light, 0.4);
    ctx.beginPath();
    ctx.ellipse(x - r * 0.3, y - r * 0.35, r * 0.4, r * 0.18, 0, 0, TAU);
    ctx.fill();
  }
  for (const tf of TUFTS) {
    const d = tf.d;
    const y = top + 10 + (H - top - 10) * d;
    const par = 0.55 + d * 0.75;
    const x0 = cam.ox + (tf.x - scroll * par) * cam.s * par;
    const x = (((x0 + 300) % (W + 600)) + (W + 600)) % (W + 600) - 300;
    const h = tf.h * cam.s * par;
    ctx.strokeStyle = mix('#8A6A3A', sky.shade, 0.3 + night * 0.3);
    ctx.lineWidth = 1.2 + d;
    const sway = Math.sin((env.t ?? 0) * 1.5 + tf.x) * 0.15;
    ctx.beginPath();
    for (let i = 0; i < tf.n; i++) {
      const a = -Math.PI / 2 + (i / (tf.n - 1) - 0.5) * 1.3 + sway;
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * h * 0.4, y + Math.sin(a) * h * 0.6, x + Math.cos(a) * h, y + Math.sin(a) * h);
    }
    ctx.stroke();
  }
}

/** The stall and the palm behind the weighbridge (world space, a little further away), and the planks. */
export function drawStation(R, cam, sc) {
  const { ctx, W } = R;
  const B = BIOMES[sc.biome ?? 'market'] ?? BIOMES.market;
  const tod = todOf(sc);
  const sky = skyAt(tod);
  const night = clamp((tod - 0.5) * 2, 0, 1);
  const scroll = sc.scroll ?? 0;
  const t = sc.t ?? 0;
  if (sc.station !== false) {
    // a depth behind the camel: smaller, slower and hazier
    const k = 0.82;
    const s = cam.s * k;
    const base = cam.oy - Math.min(26, cam.s * 0.16);
    const ox = cam.ox + (-scroll * 0.85) * cam.s;
    ctx.save();
    ctx.setTransform(R.pr * s, 0, 0, -R.pr * s, R.pr * ox, R.pr * base);
    const lw = 1 / s;
    drawStall(ctx, lw, 4.1, B, sky, night, t);
    // the palm on the left
    ctx.restore();
    ctx.save();
    R.screen();
    const px = ox + -5.0 * s;
    if (px > -300 && px < W + 300) heroPalm(ctx, px, base, s, t, sky, night);
    ctx.restore();
    // the far-side lantern string
    if (night > 0.05 || B.props === 'lanterns') lanternString(R, ox, base, s, t, Math.max(night, B.props === 'lanterns' ? 0.8 : 0));
  }
  if (sc.town != null) {
    R.world(cam);
    drawTown(ctx, 1 / cam.s, sc.town, t, B, sky, night);
  }
  if (sc.bridge !== false) {
    R.world(cam);
    drawWeighbridge(ctx, 1 / cam.s, sky, night);
  }
}

/** A town's gate on the road (Caravan): mud-brick towers, a pointed arch, banners, a lamp in the arch. */
function drawTown(ctx, lw, x, t, B, sky, night) {
  ctx.save();
  ctx.translate(x, 0);
  const wall = mix('#D98A55', sky.shade, 0.15 + night * 0.45);
  const wallShade = mix('#A65A3A', sky.shade, 0.25 + night * 0.45);
  const wallLight = mix('#F2B47A', sky.light, 0.3);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = lw * 2.4;
  // the wall between the towers, with the arch cut out
  const gate = new Path2D();
  gate.moveTo(-1.6, 0);
  gate.lineTo(-1.6, 3.9);
  gate.lineTo(1.6, 3.9);
  gate.lineTo(1.6, 0);
  gate.lineTo(0.75, 0);
  gate.lineTo(0.75, 2.2);
  gate.quadraticCurveTo(0.7, 2.95, 0, 3.25);
  gate.quadraticCurveTo(-0.7, 2.95, -0.75, 2.2);
  gate.lineTo(-0.75, 0);
  gate.closePath();
  // the dark through the arch, a warm lamp inside
  const inside = ctx.createLinearGradient(0, 3.2, 0, 0);
  inside.addColorStop(0, mix('#3A1F3F', sky.shade, 0.3));
  inside.addColorStop(1, mix('#5B2C4E', sky.shade, 0.2));
  ctx.fillStyle = inside;
  ctx.fillRect(-0.8, 0, 1.6, 3.3);
  const lampG = ctx.createRadialGradient(0, 2.5, 0, 0, 2.5, 1.4);
  lampG.addColorStop(0, `rgba(255,200,110,${0.55 + night * 0.35})`);
  lampG.addColorStop(1, 'rgba(255,200,110,0)');
  ctx.fillStyle = lampG;
  ctx.fillRect(-0.8, 0, 1.6, 3.3);
  const g = ctx.createLinearGradient(-1.6, 0, 1.6, 0);
  g.addColorStop(0, wallLight);
  g.addColorStop(0.35, wall);
  g.addColorStop(1, wallShade);
  ctx.fillStyle = g;
  ctx.fill(gate);
  ctx.stroke(gate);
  // crenellations
  for (let k = -3; k <= 3; k++) {
    ctx.fillStyle = k < 0 ? wall : wallShade;
    ctx.fillRect(k * 0.42 - 0.13, 3.9, 0.26, 0.24);
    ctx.strokeRect(k * 0.42 - 0.13, 3.9, 0.26, 0.24);
  }
  // two round towers with domes
  for (const side of [-1, 1]) {
    const cx = side * 1.75;
    const tw = new Path2D();
    tw.moveTo(cx - 0.5, 0);
    tw.lineTo(cx - 0.44, 4.6);
    tw.lineTo(cx + 0.44, 4.6);
    tw.lineTo(cx + 0.5, 0);
    tw.closePath();
    const tg = ctx.createLinearGradient(cx - 0.5, 0, cx + 0.5, 0);
    tg.addColorStop(0, wallLight);
    tg.addColorStop(0.45, wall);
    tg.addColorStop(1, wallShade);
    ctx.fillStyle = tg;
    ctx.fill(tw);
    ctx.stroke(tw);
    ctx.beginPath();
    ctx.moveTo(cx - 0.5, 4.6);
    ctx.bezierCurveTo(cx - 0.5, 5.25, cx - 0.1, 5.35, cx, 5.6);
    ctx.bezierCurveTo(cx + 0.1, 5.35, cx + 0.5, 5.25, cx + 0.5, 4.6);
    ctx.closePath();
    const dg = ctx.createLinearGradient(cx - 0.5, 0, cx + 0.5, 0);
    dg.addColorStop(0, PAL.goldLight);
    dg.addColorStop(0.5, PAL.gold);
    dg.addColorStop(1, PAL.goldDark);
    ctx.fillStyle = dg;
    ctx.fill();
    ctx.stroke();
    // a slit window, lit at night
    ctx.fillStyle = night > 0.2 ? '#FFD27A' : mix(PAL.ink, wallShade, 0.3);
    ctx.beginPath();
    ctx.roundRect(cx - 0.06, 3.4, 0.12, 0.42, [0.06, 0.06, 0, 0]);
    ctx.fill();
    ctx.stroke();
    // banners hanging from the towers
    const [c1, c2] = B.canopy;
    const sway = Math.sin(t * 2 + side) * 0.04;
    ctx.fillStyle = side < 0 ? c1 : c2 === '#FFF0D9' ? PAL.turq : c2;
    ctx.beginPath();
    ctx.moveTo(cx - 0.22, 4.3);
    ctx.lineTo(cx + 0.22, 4.3);
    ctx.lineTo(cx + 0.22 + sway, 3.0);
    ctx.lineTo(cx + sway, 3.18);
    ctx.lineTo(cx - 0.22 + sway, 3.0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // pennants across the arch
  ctx.lineWidth = lw * 1.4;
  ctx.beginPath();
  ctx.moveTo(-1.25, 3.55);
  ctx.quadraticCurveTo(0, 3.15, 1.25, 3.55);
  ctx.stroke();
  for (let k = 0; k < 7; k++) {
    const u = (k + 0.5) / 7;
    const px = -1.25 + 2.5 * u;
    const py = 3.55 - 0.8 * u * (1 - u) * 2 * 0.5;
    ctx.beginPath();
    ctx.moveTo(px - 0.1, py);
    ctx.lineTo(px + 0.1, py);
    ctx.lineTo(px + Math.sin(t * 3 + k) * 0.02, py - 0.26);
    ctx.closePath();
    ctx.fillStyle = [PAL.gold, PAL.rose, PAL.turq][k % 3];
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** The near palm: a ringed, leaning trunk lit on the sun side, a crown of feathered fronds that sway, dates under the crown. */
function heroPalm(ctx, x0, y0, s, t, sky, night) {
  const h = 3.1 * s;
  const lean = 0.55 * s;
  const tx = x0 + lean, ty = y0 - h;
  const trunk = mix('#8A5A3A', sky.shade, 0.25 + night * 0.4);
  const trunkLit = mix('#C8925E', sky.light, 0.25);
  const leaf = mix('#3F6B3E', sky.shade, 0.22 + night * 0.45);
  const leafLit = mix('#7FA35A', sky.light, 0.2 + night * -0.1);
  const leafDark = mix('#264A33', sky.shade, 0.3 + night * 0.4);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // the trunk: tapering, curved, ringed
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const u = i / 14;
    pts.push({ x: x0 + lean * u * u + Math.sin(u * 2.4) * 0.08 * s, y: y0 - h * u, w: s * (0.16 - u * 0.07) });
  }
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x - p.w, p.y) : ctx.moveTo(p.x - p.w, p.y)));
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x + pts[i].w, pts[i].y);
  ctx.closePath();
  const tg = ctx.createLinearGradient(x0 - 0.2 * s, 0, x0 + 0.25 * s, 0);
  tg.addColorStop(0, trunkLit);
  tg.addColorStop(0.5, trunk);
  tg.addColorStop(1, mix(trunk, '#1C0F2E', 0.35));
  ctx.fillStyle = tg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(28,15,46,0.85)';
  ctx.lineWidth = Math.max(1.5, s * 0.025);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, s * 0.016);
  ctx.strokeStyle = 'rgba(28,15,46,0.45)';
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    ctx.beginPath();
    ctx.moveTo(p.x - p.w, p.y);
    ctx.quadraticCurveTo(p.x, p.y + p.w * 0.45, p.x + p.w, p.y - p.w * 0.1);
    ctx.stroke();
  }
  // dates
  for (let i = 0; i < 9; i++) {
    const a = 0.6 + i * 0.25;
    ctx.fillStyle = i % 3 ? mix('#B8532A', sky.shade, 0.2 + night * 0.4) : mix('#E08A3A', sky.shade, 0.2 + night * 0.4);
    ctx.beginPath();
    ctx.ellipse(tx + Math.cos(a) * 0.12 * s - 0.05 * s, ty + 0.1 * s + Math.sin(a) * 0.05 * s + (i % 3) * 0.05 * s, 0.045 * s, 0.06 * s, 0, 0, TAU);
    ctx.fill();
  }
  // fronds: each a curved rib with leaflets, back ones darker, swaying on their own phase
  const fronds = [
    { a: -2.5, L: 1.5, d: 1 }, { a: -0.55, L: 1.45, d: 1 }, { a: -1.95, L: 1.25, d: 1 },
    { a: -2.95, L: 1.55, d: 0 }, { a: -0.15, L: 1.6, d: 0 }, { a: -1.2, L: 1.1, d: 0 }, { a: -2.2, L: 1.45, d: 0 }, { a: -0.85, L: 1.5, d: 0 },
  ];
  for (const f of fronds) {
    const sw = Math.sin(t * 0.9 + f.a * 3) * 0.05 + Math.sin(t * 2.1 + f.a) * 0.02;
    const a = f.a + sw;
    const L = f.L * s;
    const ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.6 + L * 0.42 * (1 - Math.abs(Math.sin(a)));
    const cx = tx + Math.cos(a) * L * 0.55, cy = ty + Math.sin(a) * L * 0.75 - L * 0.12;
    const col = f.d ? leafDark : leaf;
    // leaflets along the rib
    const N = 16;
    for (let i = 1; i <= N; i++) {
      const u = i / N;
      const bx = (1 - u) * (1 - u) * tx + 2 * (1 - u) * u * cx + u * u * ex;
      const by = (1 - u) * (1 - u) * ty + 2 * (1 - u) * u * cy + u * u * ey;
      const dx = 2 * (1 - u) * (cx - tx) + 2 * u * (ex - cx), dy = 2 * (1 - u) * (cy - ty) + 2 * u * (ey - cy);
      const dl = Math.hypot(dx, dy) || 1;
      const ux = dx / dl, uy = dy / dl;
      const ll = L * 0.22 * Math.sin(Math.PI * Math.min(1, u * 1.15)) + L * 0.02;
      for (const sd of [-1, 1]) {
        const lx = bx + (ux * 0.55 - uy * sd * 0.9) * ll, ly = by + (uy * 0.55 + ux * sd * 0.9) * ll + ll * 0.35;
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1.5, s * 0.035 * (1 - u * 0.5));
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + (lx - bx) * 0.5, by + (ly - by) * 0.3, lx, ly);
        ctx.stroke();
        if (!f.d && sd < 0 && i % 2) {
          ctx.strokeStyle = rgba(leafLit, 0.7);
          ctx.lineWidth = Math.max(1, s * 0.014);
          ctx.stroke();
        }
      }
    }
    ctx.strokeStyle = f.d ? leafDark : mix(leaf, '#1C0F2E', 0.2);
    ctx.lineWidth = Math.max(1.5, s * 0.03);
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStall(ctx, lw, x0, B, sky, night, t) {
  const ink = PAL.ink;
  const wood = mix(PAL.woodDark, sky.shade, 0.15 + night * 0.4);
  const [c1, c2] = B.canopy;
  const dark = (c) => mix(c, sky.shade, 0.25 + night * 0.4);
  ctx.lineJoin = 'round';
  // goods under the awning: crates, sacks, jars
  const goods = (fn) => {
    ctx.save();
    fn();
    ctx.restore();
  };
  goods(() => {
    ctx.fillStyle = mix(PAL.wood, sky.shade, 0.08 + night * 0.4);
    ctx.fillRect(x0 + 0.2, 0, 0.8, 0.7);
    ctx.fillRect(x0 + 0.35, 0.7, 0.6, 0.5);
    ctx.strokeStyle = rgba(ink, 0.85);
    ctx.lineWidth = lw * 2;
    ctx.strokeRect(x0 + 0.2, 0, 0.8, 0.7);
    ctx.strokeRect(x0 + 0.35, 0.7, 0.6, 0.5);
    ctx.beginPath();
    ctx.moveTo(x0 + 0.2, 0);
    ctx.lineTo(x0 + 1.0, 0.7);
    ctx.stroke();
    // sacks
    for (const [x, h, c] of [[x0 + 1.3, 0.6, '#D9A066'], [x0 + 1.75, 0.5, '#C98B4E'], [x0 + 2.15, 0.65, '#E3B072']]) {
      ctx.fillStyle = mix(c, sky.shade, 0.08 + night * 0.4);
      ctx.beginPath();
      ctx.moveTo(x - 0.22, 0);
      ctx.quadraticCurveTo(x - 0.3, h * 0.6, x - 0.08, h);
      ctx.lineTo(x + 0.08, h);
      ctx.quadraticCurveTo(x + 0.3, h * 0.6, x + 0.22, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // a big jar
    ctx.fillStyle = mix('#C9572E', sky.shade, 0.08 + night * 0.4);
    ctx.beginPath();
    ctx.moveTo(x0 + 2.6, 0);
    ctx.quadraticCurveTo(x0 + 2.4, 0.5, x0 + 2.62, 0.8);
    ctx.lineTo(x0 + 2.58, 0.92);
    ctx.lineTo(x0 + 2.92, 0.92);
    ctx.lineTo(x0 + 2.88, 0.8);
    ctx.quadraticCurveTo(x0 + 3.1, 0.5, x0 + 2.9, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
  // posts
  ctx.fillStyle = wood;
  ctx.strokeStyle = rgba(ink, 0.7);
  ctx.lineWidth = lw * 2;
  for (const x of [x0, x0 + 3.2]) {
    ctx.fillRect(x - 0.06, 0, 0.12, 2.5);
    ctx.strokeRect(x - 0.06, 0, 0.12, 2.5);
  }
  // the awning: stripes, a scalloped edge, sagging a little, flapping in the wind
  const flap = Math.sin(t * 1.7) * 0.02;
  const aw = new Path2D();
  aw.moveTo(x0 - 0.3, 2.45);
  aw.lineTo(x0 + 0.2, 2.95);
  aw.lineTo(x0 + 3.0, 2.95);
  aw.lineTo(x0 + 3.5, 2.45);
  const n = 8;
  for (let i = n; i >= 0; i--) {
    const x = x0 - 0.3 + (3.8 * i) / n;
    aw.lineTo(x, 2.45 + flap * (i % 2));
    if (i > 0) aw.quadraticCurveTo(x - 3.8 / n / 2, 2.25 + flap, x - 3.8 / n, 2.45);
  }
  aw.closePath();
  ctx.save();
  ctx.clip(aw);
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = dark(i % 2 ? c2 : c1);
    ctx.beginPath();
    const xa = x0 - 0.3 + i * 0.4;
    ctx.moveTo(xa, 2.1);
    ctx.lineTo(xa + 0.4, 2.1);
    ctx.lineTo(xa + 0.4 - 0.05, 3.0);
    ctx.lineTo(xa - 0.05, 3.0);
    ctx.fill();
  }
  const sh = ctx.createLinearGradient(0, 2.95, 0, 2.2);
  sh.addColorStop(0, rgba(sky.light, 0.25));
  sh.addColorStop(1, rgba(sky.shade, 0.3));
  ctx.fillStyle = sh;
  ctx.fillRect(x0 - 0.4, 2.1, 4, 1);
  ctx.restore();
  ctx.stroke(aw);
  // a hanging lantern
  const lx = x0 + 1.6, ly = 2.2 + Math.sin(t * 1.3) * 0.01;
  ctx.strokeStyle = rgba(ink, 0.7);
  ctx.beginPath();
  ctx.moveTo(lx, 2.45);
  ctx.lineTo(lx, ly + 0.08);
  ctx.stroke();
  ctx.fillStyle = night > 0.2 ? '#FFD27A' : mix(PAL.gold, sky.shade, 0.3);
  ctx.beginPath();
  ctx.ellipse(lx, ly - 0.02, 0.07, 0.1, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  if (night > 0.05) {
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 0.9);
    g.addColorStop(0, `rgba(255,190,90,${0.45 * night})`);
    g.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(lx - 0.9, ly - 0.9, 1.8, 1.8);
    ctx.globalCompositeOperation = 'source-over';
  }
}

function lanternString(R, ox, base, s, t, a) {
  const { ctx } = R;
  R.screen();
  const y0 = base - 3.4 * s;
  const x1 = ox - 3.2 * s, x2 = ox + 7.4 * s;
  ctx.strokeStyle = 'rgba(28,15,46,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, y0);
  ctx.quadraticCurveTo((x1 + x2) / 2, y0 + 0.8 * s, x2, y0);
  ctx.stroke();
  const cols = ['#FFB45E', '#FF7F7F', '#FFE08A', '#8FE0C8'];
  for (let i = 1; i < 12; i++) {
    const u = i / 12;
    const x = x1 + (x2 - x1) * u;
    const y = y0 + 0.8 * s * 2 * u * (1 - u) + 0.12 * s;
    const c = cols[i % cols.length];
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, 0.5 * s);
    g.addColorStop(0, rgba(c, 0.5 * a * (0.8 + 0.2 * Math.sin(t * 4 + i))));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - 0.5 * s, y - 0.5 * s, s, s);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(x, y, 0.06 * s, 0.08 * s, 0, 0, TAU);
    ctx.fill();
  }
}

function drawWeighbridge(ctx, lw, sky, night) {
  const x0 = -2.95, x1 = 2.55, th = 0.24;
  ctx.save();
  // the shadow it throws forward
  ctx.fillStyle = rgba(sky.shade, 0.35);
  ctx.beginPath();
  ctx.moveTo(x0 + 0.1, -th);
  ctx.lineTo(x1 + 0.4, -th);
  ctx.lineTo(x1 + 0.6, -th - 0.12);
  ctx.lineTo(x0 + 0.3, -th - 0.12);
  ctx.fill();
  // planks: a top face catching the light, a front face in shade
  const g = ctx.createLinearGradient(0, 0, 0, -th);
  g.addColorStop(0, mix(PAL.woodLight, sky.light, 0.15));
  g.addColorStop(0.18, PAL.wood);
  g.addColorStop(1, mix(PAL.woodDark, sky.shade, 0.25 + night * 0.3));
  ctx.fillStyle = g;
  ctx.fillRect(x0, -th, x1 - x0, th);
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = lw * 2.4;
  ctx.strokeRect(x0, -th, x1 - x0, th);
  // grain and plank ends
  ctx.strokeStyle = rgba(PAL.woodDark, 0.6);
  ctx.lineWidth = lw * 1.2;
  ctx.beginPath();
  for (let x = x0 + 0.55; x < x1; x += 0.55) {
    ctx.moveTo(x, -0.04);
    ctx.lineTo(x, -th);
  }
  for (let k = 0; k < 9; k++) {
    const xa = x0 + 0.1 + k * 0.6;
    ctx.moveTo(xa, -0.1);
    ctx.quadraticCurveTo(xa + 0.15, -0.12, xa + 0.3, -0.1);
  }
  ctx.stroke();
  // the brass rail on top, iron corner plates, bolts
  ctx.fillStyle = PAL.gold;
  ctx.fillRect(x0, -0.04, x1 - x0, 0.04);
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = lw * 1.6;
  ctx.strokeRect(x0, -0.04, x1 - x0, 0.04);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(x0, -0.015, x1 - x0, 0.008);
  ctx.fillStyle = PAL.iron;
  for (const x of [x0, x1 - 0.22]) {
    ctx.fillRect(x, -th, 0.22, th - 0.04);
    ctx.strokeRect(x, -th, 0.22, th - 0.04);
  }
  ctx.fillStyle = PAL.goldDark;
  for (let x = x0 + 0.38; x < x1 - 0.3; x += 0.55) {
    ctx.beginPath();
    ctx.arc(x, -th * 0.55, 0.022, 0, TAU);
    ctx.fill();
  }
  // the scale's brass plate on the front, with its ticks
  const px = -0.4, pw = 0.8, py = -th + 0.03, ph = th - 0.09;
  ctx.fillStyle = PAL.gold;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 0.02);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = lw * 1.1;
  ctx.beginPath();
  for (let k = -6; k <= 6; k++) {
    ctx.moveTo(k * 0.055, py + ph - 0.01);
    ctx.lineTo(k * 0.055, py + ph - (k % 3 === 0 ? 0.07 : 0.04));
  }
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- the actors: camel, tray, load (with light and shadow)

/**
 * w: { t, camel (state for drawCamel), items: [{ item, x, y, a, flash, outline }], hands, ghost, heap, crack (0..1), crownAt,
 *      tod, biome, light (bool: shadow, contact shade and rim light on this layer) }
 */
export function drawWorld(R, cam, w) {
  const { ctx } = R;
  const lw = 1 / cam.s;
  const sky = skyAt(w.tod ?? 0);
  const night = clamp(((w.tod ?? 0) - 0.5) * 2, 0, 1);
  const fancy = w.light !== false && R.quality !== 'low' && R.lctx;
  const c = fancy ? R.lctx : ctx;
  if (fancy) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, R.layer.width, R.layer.height);
  }
  R.world(cam, c);
  const camel = w.camel;
  const sad = camel.saddle ?? { y: 0, a: 0 };
  const fp = foldPose(camel.fold ?? 0);
  if (w.heap) for (const it of w.heap) placeItem(c, lw, it, true);
  drawCamel(c, lw, camel);
  // the load dips with the camel's squash on a landing
  const dip = camel.actor ? camel.actor.squash.x * 0.06 : 0;
  c.save();
  c.translate(0, dip);
  drawTray(c, lw, sad.y + fp.y, sad.a + fp.a, w.crack ?? 0);
  for (const it of w.items) placeItem(c, lw, it, fancy);
  c.restore();
  if (fancy) {
    // the layer's light: warm from the sun's side, violet in the shade below
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    const top = toScreen(cam, 0, 4.5).y * R.pr, bot = R.H * R.pr;
    const g = c.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, rgba(sky.light, 0.1));
    g.addColorStop(0.55, rgba(sky.light, 0));
    g.addColorStop(1, rgba(sky.shade, 0.22 + night * 0.25));
    c.fillStyle = g;
    c.fillRect(0, 0, R.layer.width, R.layer.height);
    if (night > 0) {
      c.fillStyle = rgba('#241A4A', 0.35 * night);
      c.fillRect(0, 0, R.layer.width, R.layer.height);
    }
    c.globalCompositeOperation = 'source-over';
    // the long soft shadow across the sand (the sun is low behind, so it falls toward us and to the right)
    castShadow(R, cam, sky);
    // the layer itself
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(R.layer, 0, 0);
    // rim light on the edges facing the sun
    if (R.quality === 'high' || R.quality === 'medium') rimLight(R, sky, night);
  }
  R.world(cam);
  if (w.ghost) drawGhost(ctx, lw, w.ghost, w.t);
  if (w.hands) drawHeld(ctx, lw, w.hands, cam, R);
}

function castShadow(R, cam, sky) {
  const { ctx } = R;
  const pr = R.pr;
  const gy = cam.oy * pr;
  const k1 = 0.55, k2 = 0.2;
  ctx.save();
  ctx.setTransform(1, 0, -k1, -k2, k1 * gy, (1 + k2) * gy);
  ctx.globalAlpha = 0.3;
  ctx.filter = R.quality === 'high' ? `blur(${Math.round(3 * pr)}px)` : 'none';
  // the layer drawn as a dark silhouette: tint via a shadow-only draw
  ctx.shadowColor = rgba(sky.shade, 1);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.globalCompositeOperation = 'multiply';
  if (!R.shadowCv || R.shadowCv.width !== R.layer.width || R.shadowCv.height !== R.layer.height) {
    R.shadowCv = canvasOf(R.layer.width, R.layer.height);
    R.sctx = R.shadowCv.getContext('2d');
  }
  const s = R.sctx;
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalCompositeOperation = 'copy';
  s.drawImage(R.layer, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = mix(sky.shade, '#2A1240', 0.4);
  s.fillRect(0, 0, R.layer.width, R.layer.height);
  s.globalCompositeOperation = 'source-over';
  ctx.shadowColor = 'transparent';
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(R.shadowCv, 0, 0);
  ctx.restore();
}

function rimLight(R, sky, night) {
  const { ctx } = R;
  const r = R.rctx;
  const k = Math.max(2, Math.round(2.5 * R.pr));
  r.setTransform(1, 0, 0, 1, 0, 0);
  r.globalCompositeOperation = 'copy';
  r.drawImage(R.layer, 0, 0);
  r.globalCompositeOperation = 'source-in';
  r.fillStyle = night > 0.6 ? '#B8A6E0' : mix(sky.light, '#FFE9B0', 0.5);
  r.fillRect(0, 0, R.rim.width, R.rim.height);
  r.globalCompositeOperation = 'destination-out';
  r.drawImage(R.layer, k, Math.round(k * 0.6));
  r.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5 * (1 - night * 0.5);
  ctx.drawImage(R.rim, 0, 0);
  ctx.restore();
}

function placeItem(ctx, lw, it, shade) {
  if (shade) {
    // its shadow on what is under and behind it
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.28;
    ctx.translate(it.x + 0.035, it.y - 0.035);
    ctx.rotate(it.a);
    drawItem(ctx, it.item, lw, { silhouette: '#2A1240' });
    ctx.restore();
  }
  ctx.save();
  ctx.translate(it.x, it.y);
  ctx.rotate(it.a);
  if (it.sx || it.sy) ctx.scale(1 + (it.sx ?? 0), 1 + (it.sy ?? 0));
  drawItem(ctx, it.item, lw, { flash: it.flash, outline: it.outline });
  ctx.restore();
}

function drawTray(ctx, lw, y, a, crack) {
  ctx.save();
  ctx.translate(0, CAMEL.pivotY + y);
  ctx.rotate(a);
  const H = CAMEL.trayHalf;
  const board = new Path2D();
  board.roundRect(-H, 0, H * 2, 0.12, 0.02);
  const g = ctx.createLinearGradient(0, 0.12, 0, 0);
  g.addColorStop(0, PAL.woodLight);
  g.addColorStop(0.4, PAL.wood);
  g.addColorStop(1, PAL.woodDark);
  ctx.fillStyle = g;
  ctx.fill(board);
  ctx.lineWidth = lw * 2.4;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(board);
  ctx.strokeStyle = rgba(PAL.woodDark, 0.7);
  ctx.lineWidth = lw * 1.2;
  ctx.beginPath();
  for (let x = -H + 0.4; x < H; x += 0.4) {
    ctx.moveTo(x, 0.02);
    ctx.lineTo(x, 0.1);
  }
  ctx.stroke();
  // rails at both ends with brass knobs
  for (const s of [-1, 1]) {
    const r = new Path2D();
    r.roundRect(s * 1.15 - 0.05, 0.1, 0.1, 0.32, 0.02);
    ctx.fillStyle = PAL.woodDark;
    ctx.fill(r);
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = lw * 2.2;
    ctx.stroke(r);
    const kg = ctx.createRadialGradient(s * 1.15 - 0.02, 0.45, 0.005, s * 1.15, 0.43, 0.07);
    kg.addColorStop(0, '#FFF1B8');
    kg.addColorStop(0.5, PAL.gold);
    kg.addColorStop(1, PAL.goldDark);
    ctx.beginPath();
    ctx.arc(s * 1.15, 0.43, 0.06, 0, TAU);
    ctx.fillStyle = kg;
    ctx.fill();
    ctx.stroke();
  }
  if (crack > 0) {
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
  ctx.strokeStyle = rgba(g.color ?? PAL.turq, 0.85);
  ctx.lineWidth = lw * 2;
  ctx.setLineDash([lw * 4, lw * 6]);
  ctx.lineDashOffset = -t * 30 * lw;
  ctx.beginPath();
  ctx.moveTo(g.x, g.fromY);
  ctx.lineTo(g.x, g.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.translate(g.x, g.y);
  ctx.rotate(g.a);
  ctx.globalAlpha = 0.65 + 0.3 * Math.sin(t * 6);
  drawItem(ctx, g.item, lw, { ghost: g.color ?? PAL.turq });
  ctx.restore();
}

function drawHeld(ctx, lw, h, cam, R) {
  if (!h.visible) return;
  const it = ITEMS[h.item];
  if (!it) return;
  const e = extents(h.item, h.a);
  const topY = (cam.oy + 40) / cam.s;
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

// ---------------------------------------------------------------- the grade: vignette and grain

export function drawGrade(R, sc) {
  const { ctx, W, H } = R;
  if (R.quality === 'low') return;
  R.screen();
  if (!R.vig || R.vigW !== W || R.vigH !== H) {
    R.vigW = W;
    R.vigH = H;
    const v = canvasOf(Math.ceil(W / 2), Math.ceil(H / 2));
    const c = v.getContext('2d');
    const g = c.createRadialGradient(W / 4, H / 4, Math.min(W, H) * 0.22, W / 4, H / 4, Math.hypot(W, H) * 0.3);
    g.addColorStop(0, 'rgba(28,15,46,0)');
    g.addColorStop(1, 'rgba(28,15,46,0.42)');
    c.fillStyle = g;
    c.fillRect(0, 0, W / 2, H / 2);
    R.vig = v;
  }
  ctx.drawImage(R.vig, 0, 0, W, H);
  if (R.quality === 'high' && !sc.reduced) {
    if (!R.grain) {
      const n = canvasOf(160, 160);
      const c = n.getContext('2d');
      const img = c.createImageData(160, 160);
      const r = createRng('grain');
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.floor(r.next() * 255);
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 20;
      }
      c.putImageData(img, 0, 0);
      R.grain = ctx.createPattern(n, 'repeat');
    }
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    const ox = Math.floor(((sc.t ?? 0) * 997) % 160), oy = Math.floor(((sc.t ?? 0) * 613) % 160);
    ctx.translate(-ox, -oy);
    ctx.fillStyle = R.grain;
    ctx.fillRect(0, 0, W + 160, H + 160);
    ctx.restore();
  }
}

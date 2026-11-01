// The camel: a dromedary facing left (towards the cart), drawn in metres with y up. Its body rides the saddle's pose (the
// weight shift, the walk), its knees bow with the strain, it chews, side-eyes, sweats, and folds like a deckchair.

import { PAL } from './art.js';
import { CAMEL } from './physics.js';

const C = {
  base: '#ECAA68',
  shade: '#C27845',
  belly: '#F7CB93',
  dark: '#9C5A34',
  pad: '#7A4A35',
  lid: '#D9935A',
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (t) => t * t * (3 - 2 * t);

/** The body's extra drop and tilt for a collapse in progress (0 standing, 1 lying on the planks). Front legs go first. */
export function foldPose(fold) {
  const f1 = ease(clamp01(fold / 0.5));
  const f2 = ease(clamp01((fold - 0.35) / 0.55));
  return { y: -(f1 + f2) * 0.5 * 0.98, a: (f1 - f2) * 0.42, f1, f2 };
}

const HIPS = [
  { x: -0.62, far: true, front: true, ph: Math.PI },
  { x: 0.92, far: true, front: false, ph: 0 },
  { x: -0.86, far: false, front: true, ph: 0 },
  { x: 0.7, far: false, front: false, ph: Math.PI },
];

/** Where the head is (for sweat drops, the eye's look), in world metres, for a camel with this state. */
export function headPoint(s = {}) {
  const p = bodyXf(s);
  return apply(p, -1.98, 2.7);
}

function bodyXf(s) {
  const fp = foldPose(s.fold ?? 0);
  const sy = (s.saddle?.y ?? 0) + fp.y - (s.bow ?? 0) * 0.05;
  const sa = (s.saddle?.a ?? 0) * 0.8 + fp.a;
  return { y: sy, a: sa, fp };
}
function apply(p, x, y) {
  const c = Math.cos(p.a), sn = Math.sin(p.a);
  const dy = y - CAMEL.pivotY;
  return { x: x * c - dy * sn, y: CAMEL.pivotY + p.y + x * sn + dy * c };
}

/**
 * Draw the camel. s: { t, mood 0-3, bow 0-1, tremble 0-1, look -1..1 (side-eye), fold 0-1, walk (phase or null),
 * saddle { y, a }, chew (bool), straw (bool), knocked (bool: tongue out, eyes shut), silhouette (colour) }.
 * lw: one screen pixel in metres.
 */
export function drawCamel(ctx, lw, s = {}) {
  const sil = s.silhouette || null;
  const t = s.t ?? 0;
  const p = bodyXf(s);
  const ink = PAL.ink;
  const OL = lw * 2.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // ------------------------------------------------ legs: all four behind the belly (far pair darker)
  const bow = clamp01(s.bow ?? 0);
  const trem = (s.tremble ?? 0) * 0.014;
  const legs = (far) => {
    for (const h of HIPS) {
      if (h.far !== far) continue;
      const hip = apply(p, h.x, 1.3);
      const f = h.front ? p.fp.f1 : p.fp.f2;
      const dir = h.front ? -1 : 1;
      // standing: the knee under the hip (a hind leg's hock bends back), bowing with the strain; folded: knee on the planks
      let kx = h.x + (h.front ? -0.03 : 0.12) + dir * bow * 0.1 + Math.sin(t * 43 + h.x * 9) * trem;
      let ky = 0.62 - bow * 0.03;
      let ax = h.x + (h.front ? -0.02 : 0.04);
      let ay = 0.12;
      if (s.walk != null) {
        const ph = s.walk + h.ph;
        const lift = Math.max(0, Math.cos(ph)) * 0.12;
        ax += Math.sin(ph) * 0.22;
        ay += lift;
        kx += Math.sin(ph) * 0.11;
        ky += lift * 0.4;
      }
      kx += (hip.x - (h.front ? 0.2 : 0.02) - kx) * f;
      ky += (0.1 - ky) * f;
      ax += (hip.x + (h.front ? 0.28 : 0.4) - ax) * f;
      ay += (0.07 - ay) * f;
      limb(ctx, sil, far ? C.shade : C.base, far ? C.dark : C.shade, hip, { x: kx, y: ky }, { x: ax, y: ay }, h.front, OL, f);
    }
  };
  legs(true);
  legs(false);

  // ------------------------------------------------ tail
  ctx.save();
  xf(ctx, p);
  const sw = Math.sin(t * 2.1) * 0.06 + (s.walk != null ? Math.sin(s.walk) * 0.05 : 0);
  ctx.beginPath();
  ctx.moveTo(1.24, 1.78);
  ctx.quadraticCurveTo(1.42 + sw * 0.5, 1.6, 1.36 + sw, 1.26);
  ctx.lineWidth = 0.07;
  ctx.strokeStyle = sil ?? ink;
  ctx.stroke();
  if (!sil) {
    ctx.lineWidth = 0.035;
    ctx.strokeStyle = C.shade;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(1.36 + sw, 1.22, 0.05, 0.1, sw, 0, Math.PI * 2);
  ctx.fillStyle = sil ?? C.pad;
  ctx.fill();
  if (!sil) {
    ctx.lineWidth = OL;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }

  // ------------------------------------------------ body and hump
  const body = new Path2D();
  body.moveTo(-1.18, 1.56);
  body.bezierCurveTo(-1.12, 1.78, -0.98, 1.86, -0.78, 1.86);
  body.bezierCurveTo(-0.5, 1.9, -0.42, 2.03, 0.05, 2.03);
  body.bezierCurveTo(0.5, 2.03, 0.62, 1.9, 0.92, 1.86);
  body.bezierCurveTo(1.2, 1.84, 1.32, 1.7, 1.3, 1.5);
  body.bezierCurveTo(1.28, 1.3, 1.16, 1.2, 0.96, 1.2);
  body.bezierCurveTo(0.6, 1.16, 0.3, 1.1, -0.1, 1.1);
  body.bezierCurveTo(-0.5, 1.1, -0.8, 1.18, -1.0, 1.24);
  body.bezierCurveTo(-1.14, 1.3, -1.2, 1.42, -1.18, 1.56);
  body.closePath();

  // the neck, from the chest (its base hides inside the body) up to the head; outlined on its long edges only
  const neck = new Path2D();
  neck.moveTo(-0.7, 1.9);
  neck.bezierCurveTo(-1.02, 1.96, -1.28, 2.1, -1.46, 2.36);
  neck.bezierCurveTo(-1.56, 2.52, -1.64, 2.66, -1.7, 2.76);
  neck.lineTo(-1.92, 2.6);
  neck.bezierCurveTo(-1.84, 2.42, -1.74, 2.22, -1.62, 2.02);
  neck.bezierCurveTo(-1.52, 1.82, -1.44, 1.52, -1.17, 1.32);
  neck.lineTo(-0.9, 1.5);
  neck.closePath();
  const neckEdge = new Path2D();
  neckEdge.moveTo(-0.7, 1.9);
  neckEdge.bezierCurveTo(-1.02, 1.96, -1.28, 2.1, -1.46, 2.36);
  neckEdge.bezierCurveTo(-1.56, 2.52, -1.64, 2.66, -1.7, 2.76);
  neckEdge.lineTo(-1.92, 2.6);
  neckEdge.bezierCurveTo(-1.84, 2.42, -1.74, 2.22, -1.62, 2.02);
  neckEdge.bezierCurveTo(-1.52, 1.82, -1.44, 1.52, -1.17, 1.32);

  two(ctx, sil, body, C.base, C.shade, 0.1);
  if (!sil) {
    // belly light
    ctx.save();
    ctx.clip(body);
    ctx.fillStyle = C.belly;
    ctx.beginPath();
    ctx.ellipse(-0.25, 1.12, 0.75, 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = OL;
    ctx.strokeStyle = ink;
    ctx.stroke(body);
  }
  two(ctx, sil, neck, C.base, C.shade, 0.07);
  if (!sil) {
    // inside the body the neck is all body colour (no shade seam), then the front highlight and the shoulder's fold
    ctx.save();
    ctx.clip(neck);
    ctx.save();
    ctx.clip(body);
    ctx.fillStyle = C.base;
    ctx.fill(body);
    ctx.restore();
    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-1.95, 2.58);
    ctx.bezierCurveTo(-1.75, 2.3, -1.56, 1.8, -1.3, 1.42);
    ctx.stroke();
    ctx.strokeStyle = C.shade;
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.moveTo(-0.86, 1.86);
    ctx.quadraticCurveTo(-1.02, 1.66, -1.0, 1.42);
    ctx.stroke();
    ctx.restore();
    ctx.lineWidth = OL;
    ctx.strokeStyle = ink;
    ctx.stroke(neckEdge);
  }

  // ------------------------------------------------ the pack rug over the hump
  if (!sil) {
    const rug = new Path2D();
    rug.moveTo(-0.66, 1.92);
    rug.bezierCurveTo(-0.4, 2.04, 0.5, 2.05, 0.76, 1.9);
    rug.lineTo(0.7, 1.46);
    for (let x = 0.7, k = 0; x > -0.62; x -= 0.12, k++) rug.lineTo(x - 0.06, 1.46 - (k % 2 ? 0 : 0.06));
    rug.lineTo(-0.62, 1.46);
    rug.closePath();
    ctx.save();
    ctx.clip(rug);
    const bands = [PAL.rose, PAL.gold, PAL.rose, PAL.violet, PAL.turq, PAL.violet, PAL.rose, PAL.gold, PAL.rose];
    const w = 1.42 / bands.length;
    bands.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(-0.66 + i * w, 1.3, w + 0.005, 0.8);
    });
    ctx.fillStyle = PAL.ink;
    for (let i = 0; i < bands.length; i++) {
      if (bands[i] !== PAL.violet) continue;
      for (let y = 1.52; y < 1.95; y += 0.1) {
        ctx.beginPath();
        const cx = -0.66 + (i + 0.5) * w;
        ctx.moveTo(cx, y - 0.03);
        ctx.lineTo(cx + 0.03, y);
        ctx.lineTo(cx, y + 0.03);
        ctx.lineTo(cx - 0.03, y);
        ctx.fillStyle = PAL.gold;
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(28,15,46,0.28)';
    ctx.fillRect(0.3, 1.3, 0.6, 0.8);
    ctx.restore();
    ctx.lineWidth = OL;
    ctx.strokeStyle = ink;
    ctx.stroke(rug);
    // tassels
    for (const x of [-0.62, 0.7]) {
      ctx.beginPath();
      ctx.moveTo(x, 1.46);
      ctx.lineTo(x + Math.sin(t * 3 + x) * 0.02, 1.34);
      ctx.lineWidth = 0.03;
      ctx.strokeStyle = PAL.gold;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + Math.sin(t * 3 + x) * 0.02, 1.32, 0.035, 0, Math.PI * 2);
      ctx.fillStyle = PAL.rose;
      ctx.fill();
      ctx.lineWidth = lw * 1.6;
      ctx.strokeStyle = ink;
      ctx.stroke();
    }
  }

  // ------------------------------------------------ head
  drawHead(ctx, lw, s, sil, OL);
  ctx.restore();
}

function drawHead(ctx, lw, s, sil, OL) {
  const t = s.t ?? 0;
  const mood = s.mood ?? 0;
  const knocked = !!s.knocked;
  const ink = PAL.ink;
  // chewing: the lower jaw drops and slides
  const chewing = s.chew !== false && mood < 3 && !knocked;
  const rate = 5 + mood * 1.5;
  const jaw = chewing ? (Math.sin(t * rate) * 0.5 + 0.5) * 0.045 : mood >= 3 ? 0.06 : knocked ? 0.07 : 0;
  const slide = chewing ? Math.cos(t * rate) * 0.012 : 0;

  ctx.save();
  // the head tips with the neck: a nod when chewing, a jolt when alarmed
  const nod = chewing ? Math.sin(t * rate) * 0.015 : mood >= 3 ? Math.sin(t * 30) * 0.02 : 0;
  ctx.translate(-1.8, 2.66);
  ctx.rotate(nod);
  ctx.translate(1.8, -2.66);

  // ear (behind the skull)
  const earA = mood >= 3 || knocked ? -1.25 : -0.35 + Math.sin(t * 0.7) * 0.08;
  ctx.save();
  ctx.translate(-1.74, 2.82);
  ctx.rotate(earA);
  ctx.beginPath();
  ctx.ellipse(0, 0.07, 0.045, 0.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = sil ?? C.shade;
  ctx.fill();
  if (!sil) {
    ctx.lineWidth = OL;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
  ctx.restore();

  // lower jaw (moves)
  const jawP = new Path2D();
  jawP.moveTo(-1.86, 2.6);
  jawP.bezierCurveTo(-1.98, 2.54 - jaw, -2.12 + slide, 2.5 - jaw, -2.22 + slide, 2.52 - jaw);
  jawP.bezierCurveTo(-2.28 + slide, 2.53 - jaw, -2.28 + slide, 2.58 - jaw * 0.5, -2.22, 2.6);
  jawP.lineTo(-1.9, 2.66);
  jawP.closePath();
  two(ctx, sil, jawP, C.base, C.shade, 0.03);
  if (!sil) {
    ctx.lineWidth = OL;
    ctx.strokeStyle = ink;
    ctx.stroke(jawP);
  }
  // tongue
  if (knocked && !sil) {
    ctx.beginPath();
    ctx.moveTo(-2.16, 2.55);
    ctx.quadraticCurveTo(-2.24, 2.4, -2.16, 2.36);
    ctx.quadraticCurveTo(-2.1, 2.4, -2.1, 2.55);
    ctx.fillStyle = PAL.rose;
    ctx.fill();
    ctx.lineWidth = OL;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }

  // skull and snout
  const head = new Path2D();
  head.moveTo(-1.68, 2.66);
  head.bezierCurveTo(-1.66, 2.8, -1.76, 2.88, -1.9, 2.86);
  head.bezierCurveTo(-2.02, 2.85, -2.12, 2.78, -2.22, 2.74);
  head.bezierCurveTo(-2.3, 2.71, -2.34, 2.66, -2.32, 2.6);
  head.bezierCurveTo(-2.3, 2.56, -2.24, 2.56, -2.2, 2.58);
  head.bezierCurveTo(-2.1, 2.6, -1.96, 2.6, -1.86, 2.58);
  head.bezierCurveTo(-1.76, 2.57, -1.7, 2.6, -1.68, 2.66);
  head.closePath();
  two(ctx, sil, head, C.base, C.shade, 0.04);
  if (sil) {
    ctx.restore();
    return;
  }
  // muzzle light and the lip line
  ctx.save();
  ctx.clip(head);
  ctx.fillStyle = C.belly;
  ctx.beginPath();
  ctx.ellipse(-2.22, 2.62, 0.1, 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = OL;
  ctx.strokeStyle = ink;
  ctx.stroke(head);
  ctx.lineWidth = lw * 1.6;
  ctx.beginPath();
  ctx.moveTo(-2.3, 2.6);
  ctx.quadraticCurveTo(-2.22, 2.6, -2.16, 2.63);
  ctx.stroke();
  // nostril
  ctx.beginPath();
  ctx.moveTo(-2.27, 2.7);
  ctx.quadraticCurveTo(-2.24, 2.69, -2.22, 2.71);
  ctx.lineWidth = lw * 2;
  ctx.stroke();

  // the halter: a rose strap with gold studs, a tassel under the cheek
  ctx.lineWidth = 0.035;
  ctx.strokeStyle = PAL.rose;
  ctx.beginPath();
  ctx.moveTo(-2.12, 2.77);
  ctx.lineTo(-2.08, 2.57);
  ctx.moveTo(-1.84, 2.85);
  ctx.lineTo(-1.76, 2.6);
  ctx.moveTo(-2.1, 2.67);
  ctx.lineTo(-1.8, 2.7);
  ctx.stroke();
  ctx.fillStyle = PAL.gold;
  for (const [x, y] of [[-2.1, 2.67], [-1.8, 2.7], [-2.11, 2.76]]) {
    ctx.beginPath();
    ctx.arc(x, y, 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
  const sway = Math.sin(t * 2.4) * 0.03;
  ctx.strokeStyle = PAL.gold;
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  ctx.moveTo(-1.78, 2.6);
  ctx.lineTo(-1.78 + sway, 2.46);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-1.78 + sway, 2.48);
  ctx.lineTo(-1.82 + sway, 2.38);
  ctx.lineTo(-1.74 + sway, 2.38);
  ctx.closePath();
  ctx.fillStyle = PAL.turq;
  ctx.fill();
  ctx.lineWidth = lw * 1.4;
  ctx.strokeStyle = ink;
  ctx.stroke();

  // the eye: heavy-lidded, side-eyeing whoever placed last
  const ex = -1.93, ey = 2.76;
  const er = mood >= 3 ? 0.06 : 0.048;
  if (knocked) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 2.4;
    ctx.beginPath();
    ctx.moveTo(ex - 0.04, ey + 0.02);
    ctx.lineTo(ex + 0.04, ey - 0.02);
    ctx.moveTo(ex - 0.04, ey - 0.02);
    ctx.lineTo(ex + 0.04, ey + 0.02);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(ex, ey, er * 1.1, er, 0, 0, Math.PI * 2);
    ctx.fillStyle = PAL.bone;
    ctx.fill();
    const look = Math.max(-1, Math.min(1, s.look ?? 0));
    const pr = mood >= 3 ? 0.018 : 0.026;
    ctx.beginPath();
    ctx.arc(ex + look * 0.024 - 0.006, ey - 0.004, pr, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + look * 0.024 - 0.012, ey + 0.006, pr * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = PAL.bone;
    ctx.fill();
    // the lid comes down from the top (heavy when bored, gone when alarmed), and blinks
    const blink = (t % 4.3) < 0.12 ? 1 : 0;
    const lid = Math.max(blink, [0.55, 0.4, 0.3, 0][Math.min(3, Math.max(0, mood | 0))]);
    if (lid > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(ex, ey, er * 1.1 + 0.004, er + 0.004, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = C.lid;
      ctx.fillRect(ex - 0.08, ey + er - lid * er * 2, 0.16, 0.2);
      ctx.strokeStyle = ink;
      ctx.lineWidth = lw * 2.2;
      ctx.beginPath();
      ctx.moveTo(ex - 0.08, ey + er - lid * er * 2);
      ctx.lineTo(ex + 0.08, ey + er - lid * er * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.ellipse(ex, ey, er * 1.1, er, 0, 0, Math.PI * 2);
    ctx.lineWidth = lw * 2;
    ctx.strokeStyle = ink;
    ctx.stroke();
    // lashes
    ctx.lineWidth = lw * 1.6;
    ctx.beginPath();
    const ly = ey + er - lid * er * 2;
    for (let k = 0; k < 3; k++) {
      const lx = ex - 0.035 + k * 0.03;
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx - 0.012, ly + 0.03);
    }
    ctx.stroke();
    // the brow: flat when bored, raised and wobbling with sweat
    const brow = mood >= 2 ? 0.03 + Math.sin(t * 12) * 0.006 : 0.012;
    ctx.lineWidth = lw * 2.6;
    ctx.beginPath();
    ctx.moveTo(ex - 0.06, ey + er + brow);
    ctx.quadraticCurveTo(ex, ey + er + brow + (mood >= 3 ? 0.03 : 0.012), ex + 0.06, ey + er + brow - 0.01);
    ctx.stroke();
  }

  // a straw in the mouth (the icon, the title)
  if (s.straw) {
    ctx.save();
    ctx.translate(-2.26, 2.58 - jaw * 0.5);
    ctx.rotate(0.25 + (chewing ? Math.sin(t * rate) * 0.06 : 0));
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(-0.42, -0.015, 0.46, 0.03);
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 1.6;
    ctx.strokeRect(-0.42, -0.015, 0.46, 0.03);
    ctx.restore();
  }
  ctx.restore();
}

function xf(ctx, p) {
  ctx.translate(0, CAMEL.pivotY + p.y);
  ctx.rotate(p.a);
  ctx.translate(0, -CAMEL.pivotY);
}

/** A two-tone fill: the shade, then the base nudged up-left inside the shape (lit from the upper left). */
function two(ctx, sil, path, base, shade, off) {
  if (sil) {
    ctx.fillStyle = sil;
    ctx.fill(path);
    return;
  }
  ctx.fillStyle = shade;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  ctx.translate(-off, off);
  ctx.fillStyle = base;
  ctx.fill(path);
  ctx.restore();
}

/** One leg: a tapered thigh to the knee, a thin shin to the fetlock, a wide soft pad. */
function limb(ctx, sil, fill, shade, hip, knee, ank, front, OL, fold) {
  const seg = (a, b, wa, wb) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const p = new Path2D();
    p.moveTo(a.x + nx * wa, a.y + ny * wa);
    p.lineTo(b.x + nx * wb, b.y + ny * wb);
    p.arc(b.x, b.y, wb, Math.atan2(ny, nx), Math.atan2(-ny, -nx), true);
    p.lineTo(a.x - nx * wa, a.y - ny * wa);
    p.closePath();
    return p;
  };
  const thigh = seg(hip, knee, front ? 0.14 : 0.18, 0.065);
  const shin = seg(knee, ank, 0.055, 0.042);
  for (const part of [thigh, shin]) {
    ctx.fillStyle = sil ?? fill;
    ctx.fill(part);
    if (!sil) {
      ctx.lineWidth = OL;
      ctx.strokeStyle = PAL.ink;
      ctx.stroke(part);
    }
  }
  if (!sil) {
    // the knee's callus
    ctx.beginPath();
    ctx.ellipse(knee.x + (front ? -0.03 : 0.03), knee.y, 0.035, 0.05, 0, 0, Math.PI * 2);
    ctx.fillStyle = shade;
    ctx.fill();
  }
  // the pad
  ctx.beginPath();
  ctx.ellipse(ank.x - 0.03 + fold * 0.04, ank.y - 0.06 + fold * 0.03, 0.12, 0.055, 0, 0, Math.PI * 2);
  ctx.fillStyle = sil ?? C.pad;
  ctx.fill();
  if (!sil) {
    ctx.lineWidth = OL;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke();
  }
}

export { C as CAMEL_COLOURS };

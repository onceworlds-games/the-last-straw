// The camel: a dromedary facing left (towards the cart), drawn in metres with y up on a small 2D rig. Its body rides the
// saddle's pose (the weight shift, the walk); four two-bone legs keep their feet planted on the planks (they buckle and shake
// with the strain, shuffle when it is uneasy, pace when it walks and fold into the kneeling pose on a break); a neck that
// bends to carry a head that breathes, chews cud with a floppy lip, blinks, flicks its ears, watches the item coming, side-eyes
// whoever placed the last one and pulls a face for every mood. Springs give every part follow-through.

import { PAL, mix, rgba } from './look.js';
import { CAMEL } from './physics.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v) => clamp(v, 0, 1);
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/** Coats the Stable unlocks (the camel's colours). */
export const COATS = {
  sand: { base: '#E3A264', light: '#F6CC8E', shade: '#BC7742', dark: '#8A4F2E', belly: '#F3D3A0', pad: '#6B4232', mane: '#B06A38' },
  cream: { base: '#EFD7B0', light: '#FFF0D2', shade: '#CDAA7C', dark: '#9C7A55', belly: '#FFF4DE', pad: '#7A5A44', mane: '#C9A271' },
  cocoa: { base: '#9A5E3C', light: '#C08158', shade: '#734125', dark: '#4E2A18', belly: '#C79A72', pad: '#3E2216', mane: '#5E331D' },
  ash: { base: '#B9A79A', light: '#D9CBBE', shade: '#8F7D72', dark: '#62544C', belly: '#E3D8CC', pad: '#4F4440', mane: '#7D6B60' },
  rose: { base: '#E59B86', light: '#F8C5B2', shade: '#C2725F', dark: '#8F4A3E', belly: '#F9D4C4', pad: '#6A3B33', mane: '#B5624F' },
  gold: { base: '#E8B44C', light: '#FFDC86', shade: '#BF8A2A', dark: '#8A5E1A', belly: '#FBE3A4', pad: '#6A4A1C', mane: '#B07B22' },
};

/** Saddle blankets (the striped rug under the tray). */
export const BLANKETS = [
  { bands: [PAL.rose, PAL.gold, PAL.rose, PAL.violet, PAL.turq, PAL.violet, PAL.rose, PAL.gold, PAL.rose], dots: PAL.gold, fringe: PAL.gold },
  { bands: [PAL.turq, PAL.bone, PAL.turq, PAL.bone, PAL.turq, PAL.bone, PAL.turq], dots: PAL.violet, fringe: PAL.turq },
  { bands: [PAL.violet, PAL.ember, PAL.gold, PAL.ember, PAL.violet, PAL.ember, PAL.gold, PAL.ember, PAL.violet], dots: PAL.bone, fringe: PAL.ember },
  { bands: ['#2E6E5A', PAL.gold, '#2E6E5A', PAL.rose, '#2E6E5A', PAL.gold, '#2E6E5A'], dots: PAL.bone, fringe: PAL.rose },
  { bands: [PAL.ink, PAL.gold, PAL.ink, PAL.gold, PAL.ink, PAL.gold, PAL.ink], dots: PAL.gold, fringe: PAL.gold },
  { bands: [PAL.bone, PAL.rose, PAL.bone, PAL.rose, PAL.bone, PAL.rose, PAL.bone], dots: PAL.rose, fringe: PAL.rose },
];

export const HATS = ['none', 'sun', 'flowers', 'bandana', 'shades', 'top', 'crown'];

/** The body's extra drop and tilt for a fold in progress (0 standing, 1 kneeling). Front legs go first. */
export function foldPose(fold) {
  const f1 = ease(clamp01(fold / 0.5));
  const f2 = ease(clamp01((fold - 0.35) / 0.55));
  return { y: -(f1 + f2) * 0.5 * 0.98, a: (f1 - f2) * 0.42, f1, f2 };
}

// legs: hip (body space), foot (world rest), bone lengths, bend (+1: the knee points forward, toward -x)
const LEGS = [
  { id: 'hf', hip: [0.98, 1.52], foot: [1.08, 0.06], up: 0.88, lo: 0.66, bend: -1, front: false, far: true, ph: Math.PI },
  { id: 'ff', hip: [-0.56, 1.44], foot: [-0.64, 0.06], up: 0.8, lo: 0.64, bend: 1, front: true, far: true, ph: Math.PI },
  { id: 'hn', hip: [0.76, 1.52], foot: [0.86, 0.06], up: 0.88, lo: 0.66, bend: -1, front: false, far: false, ph: 0 },
  { id: 'fn', hip: [-0.76, 1.44], foot: [-0.88, 0.06], up: 0.8, lo: 0.64, bend: 1, front: true, far: false, ph: 0 },
];

/** A damped spring toward a target. */
const spring = (s, target, k, d, dt) => {
  s.v += ((target - s.x) * k - s.v * d) * dt;
  s.x += s.v * dt;
};
const S = (x = 0) => ({ x, v: 0 });

/**
 * The camel's animation state. update(dt, input) each frame; input: { mood 0-3, strain01, fold, walk (phase or null),
 * saddle {y,a}, knocked, look (-1..1 side-eye), lookAt ({x,y} world or null), chew }. impulse(kg, energy) on a landing.
 */
export function createCamelActor() {
  const a = {
    t: 0,
    squash: S(),
    headDip: S(),
    lip: S(),
    tail: S(),
    ears: S(-0.3),
    lid: S(0.5),
    brow: S(0),
    mouth: S(0),
    pupil: { x: S(-0.2), y: S() },
    pitch: S(0),
    hump: S(),
    tassel: S(),
    blink: 0,
    nextBlink: 2,
    squint: 0,
    chewPh: 0,
    breathPh: 0,
    steps: LEGS.map(() => ({ dx: 0, lift: 0, from: 0, to: 0, k: 1 })),
    nextShuffle: 3,
    nextFlick: 4,
    stars: 0,
    oof: 0,
    tongue: S(),
    lastMood: 0,
  };
  a.impulse = (kg, energy = 1) => {
    const k = clamp(kg / 18, 0.08, 1);
    a.squash.v -= 1.8 * k * (0.6 + Math.min(1.4, energy * 0.1));
    a.headDip.v += 3 * k;
    a.lip.v += 6 * k;
    a.tail.v += 4 * k;
    a.hump.v -= 3 * k;
    a.tassel.v += 6 * k;
    a.squint = Math.max(a.squint, 0.12 + 0.25 * k);
    a.oof = Math.max(a.oof, 0.35 * k + 0.1);
  };
  a.flinch = () => {
    a.squint = 0.3;
    a.headDip.v += 2.5;
    a.ears.v -= 6;
  };
  a.update = (dt, I) => {
    dt = Math.min(dt, 0.05);
    a.t += dt;
    const mood = I.mood ?? 0;
    const strain = clamp01(I.strain01 ?? 0);
    const knocked = !!I.knocked;
    // breathing gets quicker with the strain; chewing slows and stops when alarmed
    a.breathPh += dt * (1.6 + strain * 2.2 + (mood >= 3 ? 1.4 : 0));
    const chewing = I.chew !== false && mood < 3 && !knocked && (mood < 2 || Math.sin(a.t * 0.9) > -0.2);
    if (chewing) a.chewPh += dt * (3.2 + mood * 1.2);
    a.nextBlink -= dt;
    if (a.nextBlink <= 0) {
      a.blink = 0.14;
      a.nextBlink = 1.8 + ((a.t * 7.31) % 1) * 3.5 - mood * 0.5;
    }
    a.blink = Math.max(0, a.blink - dt);
    a.squint = Math.max(0, a.squint - dt);
    a.oof = Math.max(0, a.oof - dt);
    a.nextFlick -= dt;
    if (a.nextFlick <= 0) {
      a.ears.v += 9;
      a.nextFlick = 2.5 + ((a.t * 3.17) % 1) * 4;
    }
    spring(a.squash, 0, 140, 9, dt);
    spring(a.headDip, 0, 60, 8, dt);
    spring(a.lip, Math.sin(a.chewPh * 2) * 0.25 * (chewing ? 1 : 0), 90, 5, dt);
    spring(a.tail, Math.sin(a.t * 1.3) * 0.25 + Math.sin(a.t * 3.1) * 0.08 + (I.walk != null ? Math.sin(I.walk) * 0.2 : 0), 30, 4, dt);
    spring(a.hump, 0, 120, 6, dt);
    spring(a.tassel, Math.sin(a.t * 2.2) * 0.15 + (I.saddle?.a ?? 0) * 6, 40, 3, dt);
    const lidT = knocked ? 1 : mood >= 3 ? -0.15 : [0.52, 0.32, 0.12, 0][mood] ?? 0;
    spring(a.lid, lidT, 80, 14, dt);
    spring(a.brow, knocked ? 0 : [0, 0.25, 0.65, 1][mood] ?? 0, 60, 12, dt);
    spring(a.mouth, knocked ? 0.7 : mood >= 3 ? 0.85 : mood >= 2 ? 0.25 : 0, 50, 10, dt);
    spring(a.ears, knocked ? -1.3 : mood >= 3 ? -1.2 : mood >= 2 ? -0.8 : -0.3 + Math.sin(a.t * 0.6) * 0.12, 40, 6, dt);
    spring(a.tongue, knocked ? 1 : 0, 30, 8, dt);
    // where it looks: the item coming down, else side-eye at whoever placed last, else ahead
    let px = I.look ? I.look * 0.9 : -0.25;
    let py = mood >= 1 ? 0.35 : -0.05;
    if (I.lookAt && !knocked) {
      const hp = headPoint({ saddle: I.saddle, fold: I.fold });
      const dx = I.lookAt.x - hp.x, dy = I.lookAt.y - hp.y;
      const L = Math.hypot(dx, dy) || 1;
      px = clamp(dx / L, -1, 1);
      py = clamp(dy / L, -1, 1);
    }
    spring(a.pupil.x, px, 70, 12, dt);
    spring(a.pupil.y, py, 70, 12, dt);
    // the head lifts to watch, droops with the strain, sinks to the planks when knocked out
    const lookUp = I.lookAt && !knocked ? clamp((I.lookAt.y - 2.8) * 0.12, -0.05, 0.22) : 0;
    spring(a.pitch, knocked ? -0.4 : lookUp - strain * 0.12 - (mood >= 3 ? 0.1 : 0), 25, 7, dt);
    a.stars = knocked ? Math.min(1, a.stars + dt * 2) : Math.max(0, a.stars - dt * 2);
    // an uneasy camel re-plants a foot now and then
    a.nextShuffle -= dt;
    if (a.nextShuffle <= 0 && I.walk == null && (I.fold ?? 0) < 0.05 && mood >= 1) {
      const i = Math.floor((a.t * 13.7) % 4);
      const st = a.steps[i];
      if (st.k >= 1) {
        st.from = st.dx;
        st.to = clamp(st.dx + (((a.t * 5.3) % 1) - 0.5) * 0.16, -0.1, 0.1);
        st.k = 0;
      }
      a.nextShuffle = mood >= 3 ? 0.7 : mood >= 2 ? 1.6 : 3.5;
    }
    for (const st of a.steps) {
      if (st.k < 1) {
        st.k = Math.min(1, st.k + dt / 0.28);
        st.dx = lerp(st.from, st.to, ease(st.k));
        st.lift = Math.sin(st.k * Math.PI) * 0.08;
      } else st.lift = 0;
    }
    if (mood !== a.lastMood) {
      if (mood > a.lastMood) a.ears.v -= 4;
      a.lastMood = mood;
    }
  };
  return a;
}

// ---------------------------------------------------------------- geometry

function bodyXf(s) {
  const fp = foldPose(s.fold ?? 0);
  const sq = s.actor ? s.actor.squash.x : 0;
  const sy = (s.saddle?.y ?? 0) + fp.y - (s.bow ?? 0) * 0.06 + sq * 0.06;
  const sa = (s.saddle?.a ?? 0) * 0.8 + fp.a;
  return { y: sy, a: sa, fp };
}
function apply(p, x, y) {
  const c = Math.cos(p.a), sn = Math.sin(p.a);
  const dy = y - CAMEL.pivotY;
  return { x: x * c - dy * sn, y: CAMEL.pivotY + p.y + x * sn + dy * c };
}

/** Where the head is (sweat drops, the eye's aim), in world metres. */
export function headPoint(s = {}) {
  const p = bodyXf(s);
  const k = s.fold ? ease(clamp01(s.fold)) : 0;
  const q = apply(p, -1.94, 2.8);
  return { x: q.x - k * 0.25, y: q.y - k * 0.3 };
}

/** Two-bone IK: the knee for a hip, a foot, bone lengths and the side the knee bends to. */
function knee(hip, foot, l1, l2, bend) {
  const dx = foot.x - hip.x, dy = foot.y - hip.y;
  const D = Math.hypot(dx, dy) || 1;
  const d = Math.min(D, (l1 + l2) * 0.999);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / D, uy = dy / D;
  // the perpendicular on the -x side of a downward bone is (uy, -ux) flipped: pick by `bend`
  const px = -uy * bend, py = ux * bend;
  return { x: hip.x + ux * a - px * h, y: hip.y + uy * a - py * h };
}

// ---------------------------------------------------------------- drawing

const STILL = { squash: { x: 0 }, headDip: { x: 0 }, lip: { x: 0 }, tail: { x: 0 }, ears: { x: -0.3 }, lid: { x: 0.5 }, brow: { x: 0 }, mouth: { x: 0 }, pupil: { x: { x: -0.2 }, y: { x: 0 } }, pitch: { x: 0 }, hump: { x: 0 }, tassel: { x: 0 }, blink: 0, squint: 0, chewPh: 0, breathPh: 0, stars: 0, oof: 0, tongue: { x: 0 }, steps: null };

/**
 * Draw the camel. s: { t, mood 0-3, bow 0-1, tremble 0-1, look, fold 0-1, walk (phase or null), saddle {y,a}, knocked,
 * straw (a straw in its mouth), silhouette (one colour), actor (createCamelActor), coat, blanket, hat }.
 * lw: one screen pixel in metres.
 */
export function drawCamel(ctx, lw, s = {}) {
  const sil = s.silhouette || null;
  const C = COATS[s.coat] ?? COATS.sand;
  const A = s.actor ?? STILL;
  const t = s.t ?? 0;
  const p = bodyXf({ ...s, actor: A });
  const OL = lw * 2.2;
  const ink = mix(PAL.ink, C.dark, 0.25);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const bow = clamp01(s.bow ?? 0);
  const trem = (s.tremble ?? 0) * 0.016;

  const legPose = (L, i) => {
    const hip = apply(p, L.hip[0], L.hip[1]);
    const st = A.steps ? A.steps[i] : null;
    const f = L.front ? p.fp.f1 : p.fp.f2;
    let fx = L.foot[0] + (st ? st.dx : 0);
    let fy = L.foot[1] + (st ? st.lift : 0);
    if (s.walk != null) {
      const u = ((((s.walk + L.ph) / TAU) % 1) + 1) % 1;
      const stride = 0.48;
      if (u < 0.6) fx += stride * (0.5 - u / 0.6);
      else {
        const w = (u - 0.6) / 0.4;
        fx += stride * (-0.5 + w);
        fy += Math.sin(w * Math.PI) * 0.16;
      }
    }
    // folding: front hooves tuck back under the chest, hind feet come forward under the belly
    fx = lerp(fx, L.front ? L.hip[0] + 0.42 : L.hip[0] - 0.46, f);
    fy = lerp(fy, 0.07, f);
    fx += Math.sin(t * 41 + i * 2.3) * trem * (1 - f);
    const foot = { x: fx, y: fy };
    const k = knee(hip, foot, L.up * (1 - bow * 0.03), L.lo, L.bend);
    k.x += -L.bend * bow * 0.05 + Math.sin(t * 37 + i) * trem * 1.5 * (1 - f);
    return { hip, knee: k, foot, f };
  };
  const drawLegs = (far) => {
    LEGS.forEach((L, i) => {
      if (L.far !== far) return;
      leg(ctx, sil, C, legPose(L, i), L, OL, ink, far);
    });
  };
  drawLegs(true);

  ctx.save();
  ctx.translate(0, CAMEL.pivotY + p.y);
  ctx.rotate(p.a);
  ctx.translate(0, -CAMEL.pivotY);
  const breath = Math.sin(A.breathPh ?? 0) * 0.012;

  // ------------------------------------------------ tail (swishes on a spring)
  const ta = (A.tail?.x ?? 0) + (s.walk != null ? Math.sin(s.walk) * 0.2 : 0);
  ctx.save();
  ctx.translate(1.26, 1.78);
  ctx.rotate(-0.15 + ta * 0.5);
  const tail = new Path2D();
  tail.moveTo(-0.04, 0.03);
  tail.bezierCurveTo(0.14, -0.04, 0.16, -0.3, 0.12, -0.52);
  tail.lineTo(0.06, -0.52);
  tail.bezierCurveTo(0.09, -0.3, 0.05, -0.12, -0.05, -0.06);
  tail.closePath();
  ctx.fillStyle = sil ?? C.shade;
  ctx.fill(tail);
  if (!sil) {
    ctx.lineWidth = OL;
    ctx.strokeStyle = ink;
    ctx.stroke(tail);
    ctx.beginPath();
    ctx.ellipse(0.09, -0.6, 0.06, 0.12, 0.1 + ta * 0.3, 0, TAU);
    ctx.fillStyle = C.mane;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // ------------------------------------------------ body and neck in one silhouette
  const hd = headJoint(s, A);
  const body = bodyPath(breath, hd, A);
  if (sil) {
    ctx.fillStyle = sil;
    ctx.fill(body);
  } else {
    const g = ctx.createLinearGradient(0, 2.08, 0, 1.06);
    g.addColorStop(0, C.light);
    g.addColorStop(0.35, C.base);
    g.addColorStop(0.82, C.shade);
    g.addColorStop(1, mix(C.shade, C.belly, 0.45));
    ctx.fillStyle = g;
    ctx.fill(body);
    ctx.save();
    ctx.clip(body);
    // the belly catches warm light off the sand
    ctx.fillStyle = rgba(C.belly, 0.5);
    ctx.beginPath();
    ctx.ellipse(0.05, 1.04, 0.9, 0.11, 0, 0, TAU);
    ctx.fill();
    // shoulder and haunch: soft muscle shading
    ctx.fillStyle = rgba(C.shade, 0.45);
    ctx.beginPath();
    ctx.ellipse(-0.74, 1.34, 0.22, 0.32, 0.25, 0, TAU);
    ctx.ellipse(1.0, 1.4, 0.26, 0.34, -0.15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(C.light, 0.4);
    ctx.beginPath();
    ctx.ellipse(-0.8, 1.52, 0.12, 0.15, 0.25, 0, TAU);
    ctx.ellipse(0.94, 1.58, 0.14, 0.14, -0.15, 0, TAU);
    ctx.fill();
    // light down the front of the neck
    ctx.strokeStyle = rgba(C.light, 0.5);
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.moveTo(hd.x - 0.06, hd.y - 0.22);
    ctx.bezierCurveTo(-1.66, 2.1, -1.5, 1.72, -1.18, 1.5);
    ctx.stroke();
    ctx.restore();
    ctx.lineWidth = OL;
    ctx.strokeStyle = ink;
    ctx.stroke(body);
    mane(ctx, C, hd, A, t, lw);
    blanket(ctx, s, A, lw, ink);
  }
  ctx.restore();

  // ------------------------------------------------ near legs over the body, then the head
  drawLegs(false);
  drawHead(ctx, lw, s, A, sil, C, OL, ink, p, hd);
}

/** The head joint (the poll) in body space: where the neck carries the head. */
function headJoint(s, A) {
  const fold = clamp01(s.fold ?? 0);
  const k = ease(fold);
  const bob = Math.sin((A.breathPh ?? 0) + 0.6) * 0.012 + Math.sin((A.chewPh ?? 0) * 2) * 0.006;
  const dip = A.headDip?.x ?? 0;
  const pitch = A.pitch?.x ?? 0;
  let x = -1.74 + pitch * 0.2;
  let y = 2.8 + bob - dip * 0.05 + pitch * 0.3;
  if (s.walk != null) y += Math.sin(s.walk * 2) * 0.03;
  // folded: the neck reaches forward and down (knocked out: the head lower still)
  const knocked = s.knocked ? 1 : 0;
  x = lerp(x, -1.9 - knocked * 0.3, k);
  y = lerp(y, 2.7 - knocked * 0.75, k);
  return { x, y };
}

/** Body, hump and neck as one shape (body space, y up). */
function bodyPath(breath, hd, A) {
  const hump = (A.hump?.x ?? 0) * 0.04;
  const p = new Path2D();
  // from the withers along the back over the hump to the rump
  p.moveTo(-0.92, 1.88);
  p.bezierCurveTo(-0.6, 1.99 + hump, -0.3, 2.07 + hump, 0.02, 2.07 + hump);
  p.bezierCurveTo(0.42, 2.07 + hump, 0.7, 1.96, 1.0, 1.89);
  p.bezierCurveTo(1.22, 1.85, 1.38, 1.72, 1.38, 1.55);
  // the haunch down to the hind leg, the belly, the chest
  p.bezierCurveTo(1.38, 1.38, 1.26, 1.2 - breath, 1.02, 1.15 - breath);
  p.bezierCurveTo(0.6, 1.06 - breath, -0.2, 1.03 - breath * 2, -0.62, 1.11 - breath);
  p.bezierCurveTo(-0.92, 1.15, -1.08, 1.27, -1.14, 1.43 + breath);
  // up the throat: the neck dips in a U, then rises to the jaw
  p.bezierCurveTo(-1.22, 1.58, -1.44, 1.62, -1.6, 1.86);
  p.bezierCurveTo(-1.74, 2.06, hd.x - 0.14, hd.y - 0.42, hd.x - 0.1, hd.y - 0.22);
  // over the poll and back down the top of the neck to the withers
  p.lineTo(hd.x + 0.1, hd.y + 0.02);
  p.bezierCurveTo(hd.x + 0.26, hd.y - 0.14, -1.3, 2.24, -1.08, 2.0);
  p.bezierCurveTo(-1.02, 1.94, -0.98, 1.9, -0.92, 1.88);
  p.closePath();
  return p;
}

function mane(ctx, C, hd, A, t, lw) {
  ctx.save();
  // a soft crest of longer hair along the top of the neck, ruffled by the wind
  const n = 10;
  const top = [], base = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = lerp(hd.x + 0.12, -1.02, u);
    const y = lerp(hd.y - 0.0, 2.0, u) + Math.sin(u * Math.PI) * 0.06;
    const h = (0.03 + Math.sin(u * Math.PI) * 0.035) * (i % 2 ? 0.85 : 1.05);
    const w = Math.sin(t * 2.3 + i * 0.9) * 0.012;
    base.push([x + 0.03, y - 0.05]);
    top.push([x + 0.05 + w, y + h]);
  }
  ctx.beginPath();
  ctx.moveTo(base[0][0], base[0][1]);
  for (let i = 0; i <= n; i++) {
    const [x, y] = top[i];
    if (i === 0) ctx.lineTo(x, y);
    else {
      const [px, py] = top[i - 1];
      ctx.bezierCurveTo(px + 0.02, py + 0.035, x + 0.05, y + 0.035, x, y);
    }
  }
  for (let i = n; i >= 0; i--) ctx.lineTo(base[i][0], base[i][1]);
  ctx.closePath();
  ctx.fillStyle = C.mane;
  ctx.fill();
  ctx.strokeStyle = rgba(C.dark, 0.6);
  ctx.lineWidth = lw * 1.4;
  ctx.stroke();
  // the shaggy beard under the throat
  ctx.beginPath();
  ctx.moveTo(-1.66, 1.98);
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    const x = lerp(-1.66, -1.24, u);
    const y = lerp(1.95, 1.58, u);
    const sway = Math.sin(t * 1.7 + i * 0.7) * 0.012;
    ctx.bezierCurveTo(x - 0.06 + sway, y - 0.02, x - 0.06 + sway, y - 0.08 - (i % 2) * 0.02, x - 0.02 + sway, y - 0.075 - (i % 2) * 0.02);
    ctx.bezierCurveTo(x + 0.01, y - 0.07, x + 0.03, y - 0.05, x + 0.035, y - 0.035);
  }
  ctx.lineTo(-1.2, 1.6);
  ctx.lineTo(-1.6, 1.97);
  ctx.closePath();
  ctx.fillStyle = mix(C.mane, C.dark, 0.2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function blanket(ctx, s, A, lw, ink) {
  const B = BLANKETS[(s.blanket ?? 0) % BLANKETS.length];
  const rug = new Path2D();
  rug.moveTo(-0.8, 1.98);
  rug.bezierCurveTo(-0.4, 2.09, 0.5, 2.09, 0.88, 1.96);
  rug.lineTo(0.84, 1.42);
  for (let x = 0.84, k = 0; x > -0.72; x -= 0.11, k++) rug.lineTo(x - 0.055, 1.42 - (k % 2 ? 0 : 0.06));
  rug.lineTo(-0.74, 1.42);
  rug.closePath();
  ctx.save();
  ctx.clip(rug);
  const w = 1.68 / B.bands.length;
  B.bands.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(-0.8 + i * w, 1.3, w + 0.004, 0.85);
  });
  ctx.fillStyle = B.dots;
  for (let i = 1; i < B.bands.length; i += 2) {
    const cx = -0.8 + (i + 0.5) * w;
    for (let y = 1.55; y < 1.98; y += 0.11) {
      ctx.beginPath();
      ctx.moveTo(cx, y - 0.032);
      ctx.lineTo(cx + 0.026, y);
      ctx.lineTo(cx, y + 0.032);
      ctx.lineTo(cx - 0.026, y);
      ctx.fill();
    }
  }
  // the folds: light on the sun's side, shade on the far side and lower down
  const g = ctx.createLinearGradient(-0.8, 0, 0.9, 0);
  g.addColorStop(0, 'rgba(255,240,217,0.2)');
  g.addColorStop(0.5, 'rgba(255,240,217,0)');
  g.addColorStop(1, 'rgba(42,18,64,0.32)');
  ctx.fillStyle = g;
  ctx.fillRect(-0.85, 1.3, 1.8, 0.85);
  const g2 = ctx.createLinearGradient(0, 2.0, 0, 1.38);
  g2.addColorStop(0, 'rgba(42,18,64,0)');
  g2.addColorStop(1, 'rgba(42,18,64,0.3)');
  ctx.fillStyle = g2;
  ctx.fillRect(-0.85, 1.3, 1.8, 0.85);
  ctx.restore();
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = ink;
  ctx.stroke(rug);
  // the girth strap, and tassels swinging on a spring
  ctx.strokeStyle = PAL.violet;
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(-0.5, 1.45);
  ctx.quadraticCurveTo(-0.47, 1.25, -0.43, 1.08);
  ctx.stroke();
  const sw = A.tassel?.x ?? 0;
  for (const x of [-0.74, 0.82]) {
    const ex = x + Math.sin(sw + x * 3) * 0.05, ey = 1.26;
    ctx.strokeStyle = B.fringe;
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    ctx.moveTo(x, 1.42);
    ctx.lineTo(ex, ey + 0.04);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex - 0.035, ey + 0.05);
    ctx.lineTo(ex + 0.035, ey + 0.05);
    ctx.lineTo(ex + 0.05, ey - 0.07);
    ctx.lineTo(ex - 0.05, ey - 0.07);
    ctx.closePath();
    ctx.fillStyle = PAL.rose;
    ctx.fill();
    ctx.lineWidth = lw * 1.4;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
}

/** One leg as one outline: a thigh that melts into the body, a knobby knee with its callus, a slim shin, a fetlock, a wide soft foot. */
function leg(ctx, sil, C, P, L, OL, ink, far) {
  const { hip, knee: k, foot } = P;
  const fill = far ? C.shade : C.base;
  const dark = far ? C.dark : C.shade;
  const fet = { x: foot.x + (L.front ? 0.02 : -0.025), y: foot.y + 0.13 };
  const toe = { x: foot.x, y: foot.y + 0.035 };
  const nrm = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: -dy / l, y: dx / l };
  };
  const avg = (a, b) => {
    const x = a.x + b.x, y = a.y + b.y;
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  };
  const n1 = nrm(hip, k), n2 = nrm(k, fet), n3 = nrm(fet, toe);
  const nk = avg(n1, n2), nf = avg(n2, n3);
  const wHip = L.front ? 0.2 : 0.27;
  const wKnee = L.front ? 0.068 : 0.074;
  const wShin = 0.046, wFet = 0.05, wToe = 0.056;
  // which side is the front of the leg (toward -x): the bulges go there
  const sideFront = n1.x < 0 ? 1 : -1;
  const pt = (c, n, w, side) => ({ x: c.x + n.x * w * side, y: c.y + n.y * w * side });
  const ctrl = (a, b, n, w, side) => ({ x: (a.x + b.x) / 2 + n.x * w * side, y: (a.y + b.y) / 2 + n.y * w * side });
  const outline = new Path2D();
  const sides = [1, -1];
  // down one side
  const s0 = sides[0];
  let A = pt(hip, n1, wHip, s0);
  outline.moveTo(A.x, A.y);
  // the thigh: a muscle bulge, more on the back for hind legs, on the front for front legs
  const bulge = (side) => (side === sideFront ? (L.front ? 1.25 : 1.05) : L.front ? 1.0 : 1.35);
  let c1 = ctrl(hip, k, n1, ((wHip + wKnee) / 2) * bulge(s0), s0);
  let K = pt(k, nk, wKnee, s0);
  outline.quadraticCurveTo(c1.x, c1.y, K.x, K.y);
  let c2 = ctrl(k, fet, n2, wShin, s0);
  let F = pt(fet, nf, wFet, s0);
  outline.quadraticCurveTo(c2.x, c2.y, F.x, F.y);
  let T = pt(toe, n3, wToe, s0);
  outline.lineTo(T.x, T.y);
  // round the toe
  const T2 = pt(toe, n3, wToe, -s0);
  outline.quadraticCurveTo(toe.x - n2.y * 0.0 + (T.x + T2.x) / 2 - toe.x, toe.y - 0.03, T2.x, T2.y);
  // and up the other side
  const s1 = -s0;
  F = pt(fet, nf, wFet, s1);
  outline.lineTo(F.x, F.y);
  c2 = ctrl(k, fet, n2, wShin, s1);
  K = pt(k, nk, wKnee, s1);
  outline.quadraticCurveTo(c2.x, c2.y, K.x, K.y);
  c1 = ctrl(hip, k, n1, ((wHip + wKnee) / 2) * bulge(s1), s1);
  A = pt(hip, n1, wHip, s1);
  outline.quadraticCurveTo(c1.x, c1.y, A.x, A.y);
  const fillP = new Path2D(outline);
  fillP.arc(hip.x, hip.y, wHip, Math.atan2(n1.y * s1, n1.x * s1), Math.atan2(n1.y * s0, n1.x * s0), s0 > 0);
  fillP.closePath();
  if (sil) {
    ctx.fillStyle = sil;
    ctx.fill(fillP);
  } else {
    const g = ctx.createLinearGradient(k.x - 0.16, 0, k.x + 0.16, 0);
    g.addColorStop(0, mix(fill, C.light, far ? 0.1 : 0.35));
    g.addColorStop(0.55, fill);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.fill(fillP);
    // the lower leg is a touch darker (dust, shade under the belly)
    ctx.save();
    ctx.clip(fillP);
    const gd = ctx.createLinearGradient(0, k.y + 0.1, 0, foot.y);
    gd.addColorStop(0, rgba(C.dark, 0));
    gd.addColorStop(1, rgba(C.dark, far ? 0.35 : 0.22));
    ctx.fillStyle = gd;
    ctx.fillRect(Math.min(hip.x, foot.x) - 0.4, foot.y - 0.05, 0.8 + Math.abs(hip.x - foot.x), k.y - foot.y + 0.2);
    // the callus on the knee's front, a soft highlight on the shin
    ctx.fillStyle = rgba(C.dark, far ? 0.45 : 0.35);
    ctx.beginPath();
    const cx = k.x + nk.x * wKnee * sideFront * 0.55, cy = k.y + nk.y * wKnee * sideFront * 0.55;
    ctx.ellipse(cx, cy, 0.04, 0.055, Math.atan2(n1.y, n1.x), 0, TAU);
    ctx.fill();
    ctx.restore();
    // the outline fades out where the thigh meets the body
    const og = ctx.createLinearGradient(hip.x, hip.y, k.x, k.y);
    og.addColorStop(0, rgba(ink, 0));
    og.addColorStop(far ? 0.15 : 0.42, rgba(ink, 1));
    og.addColorStop(1, rgba(ink, 1));
    ctx.strokeStyle = og;
    ctx.lineWidth = OL;
    ctx.stroke(outline);
  }
  // the pad: wide, soft, two toes
  const pad = new Path2D();
  const px = foot.x - 0.02, py = foot.y - 0.02;
  pad.moveTo(px - 0.15, py - 0.04);
  pad.quadraticCurveTo(px - 0.17, py + 0.08, px - 0.04, py + 0.085);
  pad.lineTo(px + 0.1, py + 0.075);
  pad.quadraticCurveTo(px + 0.16, py + 0.02, px + 0.12, py - 0.04);
  pad.closePath();
  ctx.fillStyle = sil ?? (far ? mix(C.pad, '#1C0F2E', 0.25) : C.pad);
  ctx.fill(pad);
  if (!sil) {
    ctx.fillStyle = rgba('#FFF0D9', 0.18);
    ctx.beginPath();
    ctx.ellipse(px - 0.06, py + 0.05, 0.06, 0.018, 0, 0, TAU);
    ctx.fill();
    ctx.lineWidth = OL;
    ctx.strokeStyle = ink;
    ctx.stroke(pad);
    ctx.beginPath();
    ctx.moveTo(px - 0.03, py - 0.04);
    ctx.lineTo(px - 0.025, py + 0.03);
    ctx.stroke();
  }
}

function drawHead(ctx, lw, s, A, sil, C, OL, ink, p, hdBody) {
  const t = s.t ?? 0;
  const mood = s.mood ?? 0;
  const knocked = !!s.knocked;
  const hd = apply(p, hdBody.x, hdBody.y);
  const fold = clamp01(s.fold ?? 0);
  const pitch = (A.pitch?.x ?? 0) + p.a * 0.6 + (knocked ? -0.3 * ease(fold) : 0) - (A.headDip?.x ?? 0) * 0.08;
  const chew = Math.sin((A.chewPh ?? 0) * 2);
  const jaw = clamp((chew * 0.5 + 0.5) * 0.035 + (A.mouth?.x ?? 0) * 0.06 + (A.oof ?? 0) * 0.08, 0, 0.12);
  const slide = Math.cos((A.chewPh ?? 0) * 2) * 0.014;

  ctx.save();
  ctx.translate(hd.x, hd.y);
  ctx.rotate(pitch);
  // head space: the poll at (0, 0), the muzzle toward -x. The head is drawn big (it is where the strain reads).
  const HS = 1.34;
  ctx.scale(HS, HS);
  OL /= HS;
  lw /= HS;

  // the ear (behind the skull)
  const ea = A.ears?.x ?? -0.3;
  ctx.save();
  ctx.translate(0.02, 0.07);
  ctx.rotate(ea);
  const ear = new Path2D();
  ear.ellipse(0, 0.08, 0.045, 0.1, 0.1, 0, TAU);
  ctx.fillStyle = sil ?? C.shade;
  ctx.fill(ear);
  if (!sil) {
    ctx.fillStyle = rgba(C.dark, 0.6);
    ctx.beginPath();
    ctx.ellipse(-0.01, 0.08, 0.02, 0.06, 0.1, 0, TAU);
    ctx.fill();
    ctx.lineWidth = OL;
    ctx.strokeStyle = ink;
    ctx.stroke(ear);
  }
  ctx.restore();

  // lower jaw and the hanging lower lip
  const lipSw = (A.lip?.x ?? 0) * 0.04;
  const jawP = new Path2D();
  jawP.moveTo(-0.12, -0.2);
  jawP.bezierCurveTo(-0.24, -0.26 - jaw, -0.4 + slide, -0.28 - jaw, -0.5 + slide, -0.27 - jaw);
  jawP.bezierCurveTo(-0.57 + slide, -0.28 - jaw - lipSw, -0.6 + slide, -0.22 - jaw - lipSw, -0.55 + slide, -0.2 - jaw * 0.6);
  jawP.lineTo(-0.2, -0.14);
  jawP.closePath();
  ctx.fillStyle = sil ?? C.shade;
  ctx.fill(jawP);
  if (!sil) {
    ctx.lineWidth = OL;
    ctx.strokeStyle = ink;
    ctx.stroke(jawP);
  }
  // the mouth's inside, teeth and tongue
  if (!sil && (jaw > 0.04 || knocked)) {
    ctx.beginPath();
    ctx.moveTo(-0.24, -0.17);
    ctx.lineTo(-0.52 + slide, -0.22 - jaw * 0.7);
    ctx.lineTo(-0.52, -0.17);
    ctx.closePath();
    ctx.fillStyle = '#5A1F33';
    ctx.fill();
    if (mood >= 3 && !knocked) {
      ctx.fillStyle = PAL.bone;
      for (let i = 0; i < 4; i++) ctx.fillRect(-0.48 + i * 0.055, -0.185, 0.04, 0.03);
    }
  }
  if (!sil && (A.tongue?.x ?? 0) > 0.05) {
    const tg = A.tongue.x;
    ctx.beginPath();
    ctx.moveTo(-0.46, -0.2);
    ctx.quadraticCurveTo(-0.56, -0.2 - 0.22 * tg, -0.48, -0.26 - 0.2 * tg);
    ctx.quadraticCurveTo(-0.42, -0.22 - 0.1 * tg, -0.4, -0.2);
    ctx.fillStyle = '#E2577A';
    ctx.fill();
    ctx.lineWidth = OL;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }

  // skull and snout: a long face, a domed forehead, a soft bulbous muzzle with a split, hanging upper lip
  const head = new Path2D();
  head.moveTo(0.08, -0.02);
  head.bezierCurveTo(0.08, 0.08, 0.0, 0.13, -0.1, 0.12);
  head.bezierCurveTo(-0.22, 0.11, -0.3, 0.03, -0.42, 0.0);
  head.bezierCurveTo(-0.54, -0.02, -0.62, -0.06, -0.62, -0.13);
  head.bezierCurveTo(-0.63, -0.19, -0.6, -0.21 - lipSw * 0.4, -0.55, -0.2);
  head.bezierCurveTo(-0.5, -0.19, -0.44, -0.17, -0.36, -0.16);
  head.bezierCurveTo(-0.24, -0.16, -0.14, -0.2, -0.08, -0.2);
  head.bezierCurveTo(0.02, -0.19, 0.08, -0.12, 0.08, -0.02);
  head.closePath();
  if (sil) {
    ctx.fillStyle = sil;
    ctx.fill(head);
    ctx.restore();
    return;
  }
  const hg = ctx.createLinearGradient(0, 0.13, 0, -0.2);
  hg.addColorStop(0, C.light);
  hg.addColorStop(0.5, C.base);
  hg.addColorStop(1, C.shade);
  ctx.fillStyle = hg;
  ctx.fill(head);
  ctx.save();
  ctx.clip(head);
  ctx.fillStyle = rgba(C.belly, 0.7);
  ctx.beginPath();
  ctx.ellipse(-0.53, -0.12, 0.11, 0.08, 0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba(C.shade, 0.5);
  ctx.beginPath();
  ctx.ellipse(-0.05, -0.12, 0.1, 0.07, 0, 0, TAU);
  ctx.fill();
  if (mood >= 2 && !knocked) {
    ctx.fillStyle = `rgba(214,63,110,${mood >= 3 ? 0.3 : 0.15})`;
    ctx.beginPath();
    ctx.ellipse(-0.18, -0.08, 0.12, 0.06, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.lineWidth = OL;
  ctx.strokeStyle = ink;
  ctx.stroke(head);
  // the lip's split and the nostril (flaring when it strains)
  ctx.lineWidth = lw * 1.6;
  ctx.beginPath();
  ctx.moveTo(-0.6, -0.19);
  ctx.quadraticCurveTo(-0.57, -0.15, -0.6, -0.12);
  ctx.stroke();
  ctx.lineWidth = lw * 2.2;
  const flare = mood >= 2 ? 0.014 : 0;
  ctx.beginPath();
  ctx.moveTo(-0.57, -0.06);
  ctx.quadraticCurveTo(-0.53, -0.05 + flare, -0.5, -0.08);
  ctx.stroke();

  // the halter
  ctx.lineWidth = 0.03;
  ctx.strokeStyle = PAL.rose;
  ctx.beginPath();
  ctx.moveTo(-0.44, 0.0);
  ctx.lineTo(-0.42, -0.17);
  ctx.moveTo(-0.06, 0.11);
  ctx.lineTo(-0.02, -0.18);
  ctx.moveTo(-0.43, -0.08);
  ctx.lineTo(-0.04, -0.05);
  ctx.stroke();
  ctx.fillStyle = PAL.gold;
  for (const [x, y] of [[-0.43, -0.08], [-0.04, -0.05]]) {
    ctx.beginPath();
    ctx.arc(x, y, 0.02, 0, TAU);
    ctx.fill();
  }

  // the eye
  const ex = -0.18, ey = 0.02;
  const er = mood >= 3 && !knocked ? 0.078 : 0.066;
  if (knocked) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 3;
    ctx.beginPath();
    ctx.moveTo(ex - 0.045, ey + 0.04);
    ctx.lineTo(ex + 0.045, ey - 0.04);
    ctx.moveTo(ex - 0.045, ey - 0.04);
    ctx.lineTo(ex + 0.045, ey + 0.04);
    ctx.stroke();
  } else {
    ctx.fillStyle = rgba(C.dark, 0.35);
    ctx.beginPath();
    ctx.ellipse(ex + 0.005, ey + 0.004, er * 1.35, er * 1.2, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(ex, ey, er * 1.1, er, 0, 0, TAU);
    ctx.fillStyle = '#FFF8EC';
    ctx.fill();
    const px = A.pupil?.x?.x ?? -0.2, py = A.pupil?.y?.x ?? 0;
    const pr = mood >= 3 ? er * 0.32 : er * 0.5;
    const cx = ex + clamp(px, -1, 1) * er * 0.45, cy = ey + clamp(py, -1, 1) * er * 0.35;
    ctx.beginPath();
    ctx.arc(cx, cy, pr, 0, TAU);
    ctx.fillStyle = '#3A2018';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - pr * 0.35, cy + pr * 0.35, pr * 0.36, 0, TAU);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    // the lid comes down from the top (heavy when bored, gone when alarmed), squeezes on a landing, blinks
    const lid = clamp(Math.max(A.lid?.x ?? 0.5, A.blink > 0 ? 1 : 0, A.squint > 0 ? 0.85 : 0), 0, 1);
    const ly = ey + er - lid * er * 2;
    if (lid > 0.01) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(ex, ey, er * 1.1 + 0.004, er + 0.004, 0, 0, TAU);
      ctx.clip();
      ctx.fillStyle = mix(C.base, C.shade, 0.35);
      ctx.fillRect(ex - 0.1, ly, 0.2, 0.2);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.ellipse(ex, ey, er * 1.1, er, 0, 0, TAU);
    ctx.lineWidth = lw * 2;
    ctx.strokeStyle = ink;
    ctx.stroke();
    ctx.lineWidth = lw * 2.6;
    ctx.beginPath();
    const hw = er * 1.1 * Math.sqrt(Math.max(0, 1 - ((ly - ey) / er) ** 2));
    ctx.moveTo(ex - hw, ly);
    ctx.lineTo(ex + hw, ly);
    ctx.stroke();
    ctx.lineWidth = lw * 1.8;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const lx = ex - hw * 0.8 + (k / 3) * hw * 1.6;
      ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo(lx - 0.02, ly + 0.035, lx - 0.042, ly + 0.03);
    }
    ctx.stroke();
    const brow = (A.brow?.x ?? 0) * 0.045 + (mood >= 2 ? Math.sin(t * 13) * 0.004 : 0);
    ctx.lineWidth = lw * 3;
    ctx.beginPath();
    ctx.moveTo(ex - 0.075, ey + er + 0.012 + brow * 0.6);
    ctx.quadraticCurveTo(ex, ey + er + 0.03 + brow, ex + 0.08, ey + er + 0.005 + brow * 0.3);
    ctx.stroke();
  }

  // a straw in the mouth (the title, the icon)
  if (s.straw) {
    ctx.save();
    ctx.translate(-0.58, -0.19 - jaw * 0.5);
    ctx.rotate(-0.3 + chew * 0.06);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(-0.44, -0.016, 0.5, 0.032);
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 1.6;
    ctx.strokeRect(-0.44, -0.016, 0.5, 0.032);
    ctx.restore();
  }
  if (s.hat && s.hat !== 'none') drawHat(ctx, s.hat, lw, ink, t);
  ctx.restore();

  // stars circling a knocked-out head
  if ((A.stars ?? 0) > 0.05) {
    ctx.save();
    ctx.translate(hd.x - 0.2, hd.y + 0.28);
    ctx.globalAlpha = A.stars;
    for (let i = 0; i < 3; i++) {
      const a = t * 3 + (i * TAU) / 3;
      starShape(ctx, Math.cos(a) * 0.3, Math.sin(a) * 0.09, 0.065, PAL.gold, ink, lw);
    }
    ctx.restore();
  }
}

export function starShape(ctx, x, y, r, fill, stroke, lw) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw * 1.4;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

/** Hats, in head space (the poll at 0, 0; the muzzle toward -x). */
export function drawHat(ctx, hat, lw, ink, t) {
  ctx.save();
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = ink;
  if (hat === 'top') {
    ctx.translate(-0.1, 0.12);
    ctx.rotate(0.18);
    ctx.fillStyle = '#2B1E3A';
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.14, 0.03, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-0.08, 0, 0.16, 0.2);
    ctx.strokeRect(-0.08, 0, 0.16, 0.2);
    ctx.fillStyle = PAL.rose;
    ctx.fillRect(-0.08, 0.02, 0.16, 0.035);
  } else if (hat === 'sun') {
    ctx.translate(-0.12, 0.12);
    ctx.rotate(0.12);
    ctx.fillStyle = '#F1D28A';
    ctx.beginPath();
    ctx.ellipse(0, 0.0, 0.22, 0.035, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0.02, 0.1, 0.08, 0, Math.PI, 0, true);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PAL.rose;
    ctx.fillRect(-0.1, 0.02, 0.2, 0.025);
  } else if (hat === 'flowers') {
    ctx.translate(-0.1, 0.11);
    const cols = [PAL.rose, PAL.gold, PAL.bone, PAL.turq, PAL.ember];
    for (let i = 0; i < 5; i++) {
      const x = -0.12 + i * 0.06, y = Math.sin(i * 1.3) * 0.015;
      ctx.fillStyle = cols[i];
      ctx.beginPath();
      ctx.arc(x, y, 0.032, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PAL.goldDark;
      ctx.beginPath();
      ctx.arc(x, y, 0.011, 0, TAU);
      ctx.fill();
    }
  } else if (hat === 'shades') {
    ctx.translate(-0.18, 0.025);
    ctx.fillStyle = '#1C0F2E';
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.088, 0.058, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(-0.05, 0.012, 0.04, 0.012);
    ctx.strokeStyle = '#1C0F2E';
    ctx.beginPath();
    ctx.moveTo(0.08, 0.01);
    ctx.lineTo(0.22, 0.04);
    ctx.stroke();
  } else if (hat === 'crown') {
    ctx.translate(-0.1, 0.12);
    ctx.rotate(0.1);
    ctx.fillStyle = PAL.gold;
    ctx.beginPath();
    ctx.moveTo(-0.1, 0);
    ctx.lineTo(0.1, 0);
    ctx.lineTo(0.11, 0.12);
    ctx.lineTo(0.05, 0.06);
    ctx.lineTo(0, 0.14);
    ctx.lineTo(-0.05, 0.06);
    ctx.lineTo(-0.11, 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PAL.rose;
    ctx.beginPath();
    ctx.arc(0, 0.04, 0.02, 0, TAU);
    ctx.fill();
  } else if (hat === 'bandana') {
    ctx.fillStyle = PAL.turq;
    ctx.beginPath();
    ctx.moveTo(0.06, 0.1);
    ctx.quadraticCurveTo(-0.1, 0.17, -0.3, 0.06);
    ctx.lineTo(-0.28, 0.01);
    ctx.quadraticCurveTo(-0.1, 0.09, 0.07, 0.03);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0.06, 0.07);
    ctx.lineTo(0.16 + Math.sin(t * 4) * 0.02, 0.0);
    ctx.lineTo(0.12, 0.09);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// The camel's back as a physics world (planck.js): the load from a snapshot, a drop, the settle, the camel's weight shift,
// strain, falls and breaks. Pure: no page. Every page that rebuilds the same snapshot with the same drop gets the same steps
// on the same browser engine; the host's run is the one everyone sees.

import * as pl from './vendor/planck.js';
import { ITEMS, itemArea, isItem } from './items.js';

export const DT = 1 / 60;
export const ITER_V = 10;
export const ITER_P = 6;
/** Snapshots store positions in 0.1 mm and angles in 0.1 mrad. */
export const Q = 10000;

export const CAMEL = {
  trayTop: 2.1, // the saddle tray's top surface (m above the weighbridge)
  trayHalf: 1.2,
  lipTop: 2.4,
  pivotY: 1.98,
};
export const HOVER = { xMax: 1.6, minGap: 0.2, maxGap: 1.6, defGap: 0.8 };
export const STRAIN = { perItem: 2, torque: 0.7, impact: 0.1, impactTau: 0.25 };
export const BAND = [70, 100];
/** A soft landing: first touch slower than this (m/s). A fragile item smashes faster than `smash`. A cat walks `walk`. */
export const LANDING = { soft: 2.3, smash: 2.7 };
export const CAT_WALK = { after: 14, steps: 66, speed: 0.42 };

export const SETTLE = {
  quietV: 0.03,
  quietW: 0.06,
  quietSteps: 15,
  minAfterContact: 20,
  fallMax: 180, // 3 s
  shiftSteps: 72, // 1.2 s
  settle2Max: 240, // 4 s (usually quiet far sooner)
  tumbleSteps: 50, // keyframes kept after a fall, so everyone sees the same tumble
  keyEvery: 4, // 15 Hz keyframes
};

const TWO_PI = Math.PI * 2;
export const wrapAngle = (a) => {
  let x = a % TWO_PI;
  if (x > Math.PI) x -= TWO_PI;
  else if (x <= -Math.PI) x += TWO_PI;
  return x;
};

// ---------------------------------------------------------------- item geometry (no engine needed)

/** Local outline points of each part: boxes and polygons as vertices, circles as { c, r }. Cached per item. */
const GEOM = ITEMS.map((it) =>
  it.parts.map((p) => {
    if (p.type === 'circle') return { circle: true, x: p.x, y: p.y, r: p.r };
    if (p.type === 'box') {
      const c = Math.cos(p.a), s = Math.sin(p.a), hw = p.w / 2, hh = p.h / 2;
      const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [p.x + x * c - y * s, p.y + x * s + y * c]);
      return { circle: false, pts };
    }
    return { circle: false, pts: p.pts.map(([x, y]) => [x, y]) };
  }),
);

/** The item's bounds at angle `a`, relative to its origin. */
export function extents(item, a) {
  const c = Math.cos(a), s = Math.sin(a);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const g of GEOM[item]) {
    if (g.circle) {
      const x = g.x * c - g.y * s, y = g.x * s + g.y * c;
      minX = Math.min(minX, x - g.r); maxX = Math.max(maxX, x + g.r);
      minY = Math.min(minY, y - g.r); maxY = Math.max(maxY, y + g.r);
    } else {
      for (const [px, py] of g.pts) {
        const x = px * c - py * s, y = px * s + py * c;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

function lowestHighest(item, x, y, a) {
  const e = extents(item, a);
  return [y + e.minY, y + e.maxY];
}

/** The top of a settled load (or the saddle's lips when empty), from a snapshot. */
export function loadTop(snap) {
  let top = CAMEL.lipTop;
  for (const [it, xq, yq, aq] of snap) top = Math.max(top, lowestHighest(it, xq / Q, yq / Q, aq / Q)[1]);
  return top;
}

/** The hover box for an item at angle a over a load whose top is `top`: the y range of its origin, and the x range. */
export function hoverBox(item, a, top) {
  const e = extents(item, a);
  return { xMin: -HOVER.xMax, xMax: HOVER.xMax, yMin: top + HOVER.minGap - e.minY, yMax: top + HOVER.maxGap - e.minY, yDef: top + HOVER.defGap - e.minY };
}

/**
 * Keep a hover inside the box. `floor` (optional): where the item would first touch straight below; the hands may go down
 * to just above it (a gentle set-down), even below the box's usual bottom.
 */
export function clampHover(item, x, y, a, top, floor = null) {
  const b = hoverBox(item, a, top);
  const yMin = Number.isFinite(floor) ? Math.min(b.yMin, floor + 0.02) : b.yMin;
  return { x: Math.min(b.xMax, Math.max(b.xMin, x)), y: Math.min(b.yMax, Math.max(yMin, y)), a };
}

/** The lowest a hover may go at (x, a) on this load: just above where it would first touch. */
export function hoverFloor(snap, item, x, a, top) {
  const sim = new Sim(snap);
  const b = hoverBox(item, a, top);
  const xx = Math.min(b.xMax, Math.max(b.xMin, x));
  return landing(sim, item, xx, b.yMax, a).y;
}

/** Quantise a drop the way it travels over the network, so the host and the dropper simulate the same numbers. */
export const quantDrop = (d) => ({ x: Math.round(d.x * Q) / Q, y: Math.round(d.y * Q) / Q, a: Math.round(wrapAngle(d.a) * Q) / Q });

// ---------------------------------------------------------------- the world

function shapesOf(item) {
  return ITEMS[item].parts.map((p) => {
    if (p.type === 'circle') return new pl.Circle(pl.Vec2(p.x, p.y), p.r);
    if (p.type === 'box') return new pl.Box(p.w / 2, p.h / 2, pl.Vec2(p.x, p.y), p.a);
    return new pl.Polygon(p.pts.map(([x, y]) => pl.Vec2(x, y)));
  });
}
const SHAPES = ITEMS.map((_, i) => shapesOf(i));

/**
 * One world: the weighbridge, the camel's head, neck and body, the saddle tray (it moves for the weight shift and the walk),
 * and the load. `broken: true` builds the collapse: no camel, the tray sinking.
 */
export class Sim {
  constructor(snap = [], options = {}) {
    this.world = new pl.World({ gravity: pl.Vec2(0, -10) });
    this.items = []; // { body, item, kg }
    this.broken = !!options.broken;
    const ground = this.world.createBody({ userData: { ground: true } });
    ground.createFixture(new pl.Box(40, 0.5, pl.Vec2(0, -0.5), 0), { friction: 0.8 });
    this.ground = ground;
    if (!this.broken) {
      const camel = this.world.createBody({ userData: { camel: true } });
      camel.createFixture(new pl.Box(0.5, 0.13, pl.Vec2(-1.45, 2.26), (3 * Math.PI) / 4 - Math.PI), { friction: 0.6 });
      camel.createFixture(new pl.Box(0.27, 0.13, pl.Vec2(-1.98, 2.66), -0.18), { friction: 0.6 });
      const body = [];
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * TWO_PI + Math.PI / 8;
        body.push(pl.Vec2(0.05 + Math.cos(t) * 1.25, 1.62 + Math.sin(t) * 0.4));
      }
      camel.createFixture(new pl.Polygon(body), { friction: 0.5 });
    }
    this.saddle = this.world.createKinematicBody({ position: pl.Vec2(0, CAMEL.pivotY), userData: { saddle: true } });
    const grip = 0.75 + (options.grip ?? 0);
    const rail = 0.15 + (options.rails ?? 0);
    this.saddle.createFixture(new pl.Box(CAMEL.trayHalf, 0.06, pl.Vec2(0, 0.06), 0), { friction: grip });
    this.saddle.createFixture(new pl.Box(0.05, rail, pl.Vec2(-1.15, 0.12 + rail), 0), { friction: grip });
    this.saddle.createFixture(new pl.Box(0.05, rail, pl.Vec2(1.15, 0.12 + rail), 0), { friction: grip });
    this.wind = options.wind ?? 0; // m/s² sideways on every item, in gusts
    this.motion = null; // (t) => { y, a } offsets of the tray
    this.motionT = 0;
    this.steps = 0;
    this.contactCb = null;
    this.world.on('begin-contact', (c) => this.contactCb?.(c));
    for (const row of snap) this.addItem(row[0], row[1] / Q, row[2] / Q, row[3] / Q);
  }

  addItem(item, x, y, a, vx = 0, vy = 0, w = 0) {
    if (!isItem(item)) throw new Error(`bad item ${item}`);
    const def = ITEMS[item];
    const body = this.world.createDynamicBody({
      position: pl.Vec2(x, y),
      angle: a,
      linearDamping: def.damping ?? 0.05,
      angularDamping: def.angularDamping ?? 0.4,
      bullet: item === 0,
      userData: { index: this.items.length },
    });
    const density = def.mass / itemArea(def);
    for (const shape of SHAPES[item]) body.createFixture(shape, { density, friction: def.friction ?? 0.9, restitution: def.restitution ?? 0.03 });
    if (vx || vy) body.setLinearVelocity(pl.Vec2(vx, vy));
    if (w) body.setAngularVelocity(w);
    this.items.push({ body, item, kg: def.kg, gone: false });
    return this.items.length - 1;
  }

  /** Take an item out of the world (a smashed vase): it stays in the list (poses keep their length), far below. */
  remove(i) {
    const it = this.items[i];
    if (!it || it.gone) return;
    it.gone = true;
    it.kg = 0;
    it.body.setPosition(pl.Vec2(it.body.getPosition().x, -5));
    it.body.setLinearVelocity(pl.Vec2(0, 0));
    it.body.setAngularVelocity(0);
    it.body.setActive(false);
  }

  /** One step of wind on the load (gusts that rise and fall, the same on every page). */
  blow() {
    if (!this.wind) return;
    const t = this.steps * DT;
    const g = this.wind * (0.55 + 0.45 * Math.sin(t * 2.3) * Math.sin(t * 0.7 + 1));
    for (const it of this.items) {
      if (it.gone) continue;
      const b = it.body;
      b.applyForceToCenter(pl.Vec2(g * b.getMass(), 0), true);
    }
  }

  /** Move the tray for one step to where `motion(t)` says it is next (velocities, so contacts behave). */
  driveSaddle() {
    const target = this.motion ? this.motion(this.motionT + DT) : { y: 0, a: 0 };
    const p = this.saddle.getPosition();
    const a = this.saddle.getAngle();
    this.saddle.setLinearVelocity(pl.Vec2(0, (CAMEL.pivotY + target.y - p.y) / DT));
    this.saddle.setAngularVelocity((target.a - a) / DT);
    this.motionT += DT;
  }

  step() {
    this.driveSaddle();
    this.blow();
    this.world.step(DT, ITER_V, ITER_P);
    this.steps++;
  }

  /** x, y, angle of every item, in load order. */
  pose(out) {
    const n = this.items.length;
    const p = out && out.length === n * 3 ? out : new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const b = this.items[i].body;
      const q = b.getPosition();
      p[i * 3] = q.x;
      p[i * 3 + 1] = q.y;
      p[i * 3 + 2] = b.getAngle();
    }
    return p;
  }

  saddlePose() {
    return { y: this.saddle.getPosition().y - CAMEL.pivotY, a: this.saddle.getAngle() };
  }

  snapshot() {
    return this.items.filter((it) => !it.gone).map(({ body, item }) => {
      const q = body.getPosition();
      return [item, Math.round(q.x * Q), Math.round(q.y * Q), Math.round(wrapAngle(body.getAngle()) * Q)];
    });
  }

  /** Strain without the landing impact: weight, a little per item, and the off-centre load. */
  strain(count = this.items.length) {
    let w = 0, m = 0;
    for (let i = 0; i < count; i++) {
      const it = this.items[i];
      if (it.gone) continue;
      const x = it.body.getPosition().x;
      // something already tumbling off the side no longer weighs on the camel (it is about to land in the sand)
      if (Math.abs(x) > 2.5 || this.lowest(i) < 1.2) continue;
      w += it.kg + STRAIN.perItem;
      m += it.kg * x;
    }
    return { S: w + STRAIN.torque * Math.abs(m), M: m };
  }

  /** The lowest point of item i (y), and its centre. */
  lowest(i) {
    const { body, item } = this.items[i];
    const q = body.getPosition();
    return lowestHighest(item, q.x, q.y, body.getAngle())[0];
  }

  /** The first item touching the ground or gone off the world, or -1. */
  fallen() {
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].gone) continue;
      const q = this.items[i].body.getPosition();
      if (Math.abs(q.x) > 7 || q.y < -1 || this.lowest(i) < 0.04) return i;
    }
    return -1;
  }

  quiet(from = 0) {
    for (let i = from; i < this.items.length; i++) {
      const b = this.items[i].body;
      if (this.items[i].gone || !b.isAwake()) continue;
      const v = b.getLinearVelocity();
      if (Math.hypot(v.x, v.y) > SETTLE.quietV || Math.abs(b.getAngularVelocity()) > SETTLE.quietW) return false;
    }
    return true;
  }

  top() {
    let top = CAMEL.lipTop;
    for (let i = 0; i < this.items.length; i++) {
      const { body, item, gone } = this.items[i];
      if (gone) continue;
      const q = body.getPosition();
      top = Math.max(top, lowestHighest(item, q.x, q.y, body.getAngle())[1]);
    }
    return top;
  }
}

// ---------------------------------------------------------------- the camel's own movements (the tray's offsets)

/** After a placement the camel shifts its weight toward the heavier side. `M` is the off-centre load (kg·m). */
export function shiftMotion(M, wobble = 1) {
  const dir = M > 0 ? -1 : 1; // the heavy side dips first
  const A = Math.min(0.05 * wobble, (0.008 + 0.002 * Math.abs(M)) * wobble);
  const len = SETTLE.shiftSteps * DT;
  return (t) => {
    if (t >= len) return { y: 0, a: 0 };
    return { y: -0.02 * Math.sin((Math.PI * t) / len), a: dir * A * Math.sin((TWO_PI * t) / 0.9) * Math.exp(-t / 0.5) };
  };
}

/** Caravan: three steps of walking (or the longer walk into a town). `leg` from 1. */
export function walkMotion(leg, town = false, M = 0, sway = 1) {
  const len = town ? 3 : 1.6;
  const steps = town ? 6 : 3;
  // the first roads are gentle (you learn the walk), then the sway grows town by town
  const amp = 0.02 * Math.min(0.55 + 0.2 * (leg - 1), 1 + 0.15 * (leg - 1)) * (town ? 1.5 : 1) * sway;
  const lean = Math.max(-0.02, Math.min(0.02, -0.002 * M));
  return {
    len,
    fn: (t) => {
      if (t >= len) return { y: 0, a: 0 };
      const ph = (Math.PI * steps * t) / len;
      const env = Math.sin((Math.PI * t) / len) ** 0.5;
      return { y: -0.03 * Math.abs(Math.sin(ph)) * env * (town ? 1.4 : 1), a: (amp * Math.sin(ph) + lean) * env };
    },
  };
}

// ---------------------------------------------------------------- a drop, simulated to its verdict

/**
 * Simulate one drop on a snapshot until the load settles, falls or breaks. Run it in slices (`run(n)` steps at a time);
 * it records 15 Hz keyframes (full poses and the live strain) and ends with a verdict:
 *   { r: 'held' | 'fell' | 'broke', at: step, fi: fallen item's index or -1, S, M, top, impact }
 * options: T (breaking point; Infinity for none), motion: 'shift' | 'walk' | 'town', leg (Caravan), keyframes (default true).
 */
export function createSettle(snap, drop, options = {}) {
  const sim = new Sim(snap, { wind: options.wind, grip: options.grip, rails: options.rails });
  const T = options.T ?? Infinity;
  const d = quantDrop(drop);
  const ni = sim.addItem(drop.item, d.x, d.y, d.a);
  const def = ITEMS[drop.item];
  const newKg = def.kg;
  const wobble = options.wobble ?? 1;
  let vin = -1; // the new item's speed at its first touch
  let smashAt = -1;
  let smashPending = false;
  const catDir = d.x >= 0 ? 1 : -1; // a cat strolls toward the end it is nearer
  const keep = options.keyframes !== false;
  const frames = [];
  let phase = 'fall';
  let contactStep = -1;
  let impact = 0;
  let impactPeak = 0;
  let quietRun = 0;
  let phaseStep = 0;
  let verdict = null;
  let tumble = 0;
  let liveS = 0;
  sim.contactCb = (c) => {
    if (contactStep >= 0) return;
    const a = c.getFixtureA().getBody();
    const b = c.getFixtureB().getBody();
    const other = a === sim.items[ni].body ? b : b === sim.items[ni].body ? a : null;
    if (!other || other.getUserData()?.ground) return;
    const v = sim.items[ni].body.getLinearVelocity();
    vin = Math.hypot(v.x, v.y);
    impact = STRAIN.impact * newKg * vin;
    impactPeak = impact;
    contactStep = sim.steps;
    if (def.fragile && vin > LANDING.smash) smashPending = true;
  };

  const record = () => {
    if (!keep) return;
    frames.push({ s: sim.steps, S: liveS, pose: sim.pose(), saddle: sim.saddlePose() });
  };

  function measure() {
    const count = contactStep >= 0 ? sim.items.length : sim.items.length - 1;
    const st = sim.strain(count);
    if (contactStep >= 0 && sim.steps > contactStep) impact *= Math.exp(-DT / STRAIN.impactTau);
    liveS = st.S + impact;
    return st;
  }

  function finish(r, fi) {
    const st = sim.strain();
    const smashed = smashAt >= 0;
    const soft = r === 'held' && !smashed && vin >= 0 && vin < LANDING.soft;
    verdict = { r, at: sim.steps, fi, S: Math.round(st.S * 10) / 10, M: Math.round(st.M * 100) / 100, top: sim.top(), impact: Math.round(impactPeak * 10) / 10, ni, vin: Math.round(Math.max(0, vin) * 100) / 100, soft, smash: smashAt };
  }

  measure();
  record();

  function stepOnce() {
    if (verdict && verdict.r !== 'fell') return true;
    if (verdict) {
      // the tumble after a fall, the same for everyone
      sim.step();
      measure();
      if (sim.steps % SETTLE.keyEvery === 0) record();
      return ++tumble >= SETTLE.tumbleSteps;
    }
    // a cat that has landed strolls along the load for a moment, then curls up
    if (def.walks && contactStep >= 0 && !sim.items[ni].gone) {
      const k = sim.steps - contactStep;
      if (k >= CAT_WALK.after && k < CAT_WALK.after + CAT_WALK.steps) {
        const b = sim.items[ni].body;
        const v = b.getLinearVelocity();
        const ramp = Math.min(1, (k - CAT_WALK.after) / 8, (CAT_WALK.after + CAT_WALK.steps - k) / 8);
        b.setLinearVelocity(pl.Vec2(catDir * CAT_WALK.speed * ramp, v.y));
        b.setAngularVelocity(b.getAngularVelocity() * 0.6);
      }
    }
    sim.step();
    phaseStep++;
    if (smashPending) {
      smashPending = false;
      smashAt = sim.steps;
      sim.remove(ni);
      impact *= 0.5;
    }
    const st = measure();
    const fi = sim.fallen();
    if (liveS > T) finish('broke', -1);
    else if (fi >= 0) finish('fell', fi);
    else {
      const q = sim.quiet();
      quietRun = q ? quietRun + 1 : 0;
      if (phase === 'fall') {
        const settled = contactStep >= 0 && sim.steps - contactStep >= SETTLE.minAfterContact && quietRun >= SETTLE.quietSteps;
        if (settled || phaseStep >= SETTLE.fallMax) {
          phase = 'shift';
          phaseStep = 0;
          quietRun = 0;
          sim.motionT = 0;
          if (options.motion === 'walk' || options.motion === 'town') {
            const w = walkMotion(options.leg ?? 1, options.motion === 'town', st.M, options.sway ?? 1);
            sim.motion = w.fn;
            phase = 'walk';
            sim.walkSteps = Math.round(w.len / DT);
          } else if (options.motion !== 'none') sim.motion = shiftMotion(st.M, wobble);
          else phase = 'settle2';
        }
      } else if (phase === 'shift' || phase === 'walk') {
        const len = phase === 'walk' ? sim.walkSteps : SETTLE.shiftSteps;
        if (phaseStep >= len) {
          phase = 'settle2';
          phaseStep = 0;
          quietRun = 0;
          sim.motion = null;
        }
      } else if (phase === 'settle2') {
        if (quietRun >= SETTLE.quietSteps || phaseStep >= SETTLE.settle2Max) finish('held', -1);
      }
    }
    if (sim.steps % SETTLE.keyEvery === 0 || verdict) record();
    return !!verdict && verdict.r !== 'fell';
  }

  return {
    sim,
    frames,
    get verdict() {
      return verdict;
    },
    get done() {
      return !!verdict && (verdict.r !== 'fell' || tumble >= SETTLE.tumbleSteps);
    },
    get phase() {
      return phase;
    },
    get strain() {
      return liveS;
    },
    /** The step a fragile item smashed at (-1: it did not), and the new item's index. */
    get smashAt() {
      return smashAt;
    },
    ni,
    /** Advance up to n steps; true when finished. */
    run(n = 1e9) {
      for (let i = 0; i < n; i++) if (stepOnce() || this.done) return true;
      return this.done;
    },
    /** Advance until `ms` of wall time is used (the host's slices). */
    runFor(ms, now = () => performance.now()) {
      const end = now() + ms;
      while (now() < end) if (this.run(4)) return true;
      return this.done;
    },
    /** The settled load (held), or the load at the verdict. */
    final() {
      return sim.snapshot();
    },
  };
}

/**
 * Caravan's road: the loaded camel walks to the next town (no new item). Same interface as a settle: run(n), sim, strain,
 * phase ('walk', then 'settle2'), verdict { r: 'held' | 'fell' | 'broke', fi, S, M, top }.
 * options: T, leg, sway (the walk's sway, 1 = normal), grip, rails, wind.
 */
export function createWalk(snap, options = {}) {
  const sim = new Sim(snap, { wind: options.wind, grip: options.grip, rails: options.rails });
  const T = options.T ?? Infinity;
  const st0 = sim.strain();
  const w = walkMotion(options.leg ?? 1, true, st0.M, options.sway ?? 1);
  sim.motion = w.fn;
  const len = Math.round((w.len * (options.long ?? 1)) / DT);
  if (options.long && options.long > 1) {
    const base = w.fn;
    const L = w.len;
    sim.motion = (t) => base(t % L);
  }
  let phase = 'walk';
  let phaseStep = 0;
  let quietRun = 0;
  let verdict = null;
  let tumble = 0;
  let liveS = st0.S;
  function finish(r, fi) {
    const st = sim.strain();
    verdict = { r, at: sim.steps, fi, S: Math.round(st.S * 10) / 10, M: Math.round(st.M * 100) / 100, top: sim.top(), impact: 0, ni: -1, vin: 0, soft: false, smash: -1 };
  }
  function stepOnce() {
    if (verdict && verdict.r !== 'fell') return true;
    if (verdict) {
      sim.step();
      return ++tumble >= SETTLE.tumbleSteps;
    }
    sim.step();
    phaseStep++;
    liveS = sim.strain().S;
    const fi = sim.fallen();
    if (liveS > T) finish('broke', -1);
    else if (fi >= 0) finish('fell', fi);
    else if (phase === 'walk') {
      if (phaseStep >= len) {
        phase = 'settle2';
        phaseStep = 0;
        sim.motion = null;
      }
    } else {
      quietRun = sim.quiet() ? quietRun + 1 : 0;
      if (quietRun >= SETTLE.quietSteps || phaseStep >= SETTLE.settle2Max) finish('held', -1);
    }
    return !!verdict && verdict.r !== 'fell';
  }
  return {
    sim,
    frames: [],
    smashAt: -1,
    ni: -1,
    get verdict() {
      return verdict;
    },
    get done() {
      return !!verdict && (verdict.r !== 'fell' || tumble >= SETTLE.tumbleSteps);
    },
    get phase() {
      return phase;
    },
    get strain() {
      return liveS;
    },
    run(n = 1e9) {
      for (let i = 0; i < n; i++) if (stepOnce() || this.done) return true;
      return this.done;
    },
    final() {
      return sim.snapshot();
    },
  };
}

// ---------------------------------------------------------------- where an item would first touch (the ghost)

const xfA = new pl.Transform();
const xfB = new pl.Transform();
const landBox = new pl.AABB();
// how far under the item's lowest point still counts as clear air (shape skins are far thinner)
const CLEAR = 0.05;

/**
 * Lower the item straight down from (x, y) at angle a until it first touches the load, the camel or the ground.
 * Returns the origin's y at first contact and what it touched ('load' | 'camel' | 'ground').
 */
export function landing(sim, item, x, y, a) {
  const shapes = SHAPES[item];
  const e = extents(item, a);
  const fixtures = [];
  const aabb = new pl.AABB(pl.Vec2(x + e.minX - 0.02, -1), pl.Vec2(x + e.maxX + 0.02, y + e.maxY + 0.02));
  sim.world.queryAABB(aabb, (f) => {
    fixtures.push(f);
    return true;
  });
  // each fixture's highest point: nothing touches while the item's underside is above it, so the lowering skips that air
  const tops = [];
  let top = -Infinity;
  for (const f of fixtures) {
    let t = -Infinity;
    const xf = f.getBody().getTransform();
    for (let ci = 0; ci < f.getShape().getChildCount(); ci++) {
      f.getShape().computeAABB(landBox, xf, ci);
      t = Math.max(t, landBox.upperBound.y);
    }
    tops.push(t);
    top = Math.max(top, t);
  }
  const hits = (yy) => {
    xfA.set(pl.Vec2(x, yy), a);
    const under = yy + e.minY - CLEAR;
    for (let i = 0; i < fixtures.length; i++) {
      if (tops[i] < under) continue;
      const f = fixtures[i];
      const b = f.getBody();
      xfB.set(b.getPosition(), b.getAngle());
      for (const s of shapes) for (let ci = 0; ci < f.getShape().getChildCount(); ci++) if (pl.testOverlap(s, 0, f.getShape(), ci, xfA, xfB)) return f;
    }
    return null;
  };
  if (hits(y)) return { y, what: whatOf(hits(y)) };
  let hi = y;
  let lo = y;
  let hit = null;
  const stepDown = 0.04;
  for (let i = 0; i < 400; i++) {
    lo = hi - stepDown;
    // the same heights as testing each one (so the same answer), without overlap tests in clear air
    hit = lo + e.minY - CLEAR > top ? null : hits(lo);
    if (hit) break;
    hi = lo;
    if (lo + e.minY < -0.2) return { y: -e.minY, what: 'ground' };
  }
  for (let i = 0; i < 12; i++) {
    const mid = (hi + lo) / 2;
    const h = hits(mid);
    if (h) {
      lo = mid;
      hit = h;
    } else hi = mid;
  }
  return { y: hi, what: whatOf(hit) };
}

function whatOf(f) {
  if (!f) return 'ground';
  const u = f.getBody().getUserData() ?? {};
  if (u.ground) return 'ground';
  if (u.camel) return 'camel';
  return 'load';
}

// ---------------------------------------------------------------- keyframes on the wire

/** Encode keyframes compactly: [s, S×10, saddle y mm, saddle a mrad, ...per item x mm, y mm, a mrad]. */
export function encodeFrames(frames) {
  return frames.map((f) => {
    const out = [f.s, Math.round(f.S * 10), Math.round(f.saddle.y * 1000), Math.round(f.saddle.a * 1000)];
    for (let i = 0; i < f.pose.length; i++) out.push(Math.round(f.pose[i] * 1000));
    return out;
  });
}

/** Decode (and check) keyframes for `n` items. Returns null when anything is off. */
export function decodeFrames(list, n) {
  if (!Array.isArray(list) || list.length > 400) return null;
  const out = [];
  for (const row of list) {
    if (!Array.isArray(row) || row.length !== 4 + n * 3) return null;
    for (const v of row) if (!Number.isInteger(v) || Math.abs(v) > 1e7) return null;
    const pose = new Float64Array(n * 3);
    for (let i = 0; i < n * 3; i++) pose[i] = row[4 + i] / 1000;
    out.push({ s: row[0], S: row[1] / 10, saddle: { y: row[2] / 1000, a: row[3] / 1000 }, pose });
  }
  return out;
}

/** Interpolate a pose between keyframes at step s (frames sorted by s). */
export function poseAt(frames, s, out) {
  if (!frames.length) return null;
  let i = 0;
  while (i < frames.length - 1 && frames[i + 1].s <= s) i++;
  const a = frames[i];
  const b = frames[Math.min(frames.length - 1, i + 1)];
  const n = a.pose.length;
  const p = out && out.length === n ? out : new Float64Array(n);
  const t = b.s > a.s ? Math.max(0, Math.min(1, (s - a.s) / (b.s - a.s))) : 0;
  for (let k = 0; k < n; k++) {
    if (k % 3 === 2) p[k] = a.pose[k] + wrapAngle(b.pose[k] - a.pose[k]) * t;
    else p[k] = a.pose[k] + (b.pose[k] - a.pose[k]) * t;
  }
  return { pose: p, S: a.S + (b.S - a.S) * t, saddle: { y: a.saddle.y + (b.saddle.y - a.saddle.y) * t, a: a.saddle.a + (b.saddle.a - a.saddle.a) * t } };
}

/** A snapshot as a pose array (for drawing). */
export function snapPose(snap) {
  const p = new Float64Array(snap.length * 3);
  snap.forEach((r, i) => {
    p[i * 3] = r[1] / Q;
    p[i * 3 + 1] = r[2] / Q;
    p[i * 3 + 2] = r[3] / Q;
  });
  return p;
}

/** Strain of a snapshot (weight + per item + off-centre), with its off-centre load. */
export function snapStrain(snap) {
  let w = 0, m = 0;
  for (const [it, xq] of snap) {
    const kg = ITEMS[it].kg;
    w += kg + STRAIN.perItem;
    m += kg * (xq / Q);
  }
  return { S: w + STRAIN.torque * Math.abs(m), M: m };
}

/** A valid snapshot row list (from the room: shapes and ranges). */
export function checkSnap(snap, max = 60) {
  if (!Array.isArray(snap) || snap.length > max) return false;
  for (const r of snap) {
    if (!Array.isArray(r) || r.length !== 4 || !isItem(r[0])) return false;
    for (let k = 1; k < 4; k++) if (!Number.isInteger(r[k]) || Math.abs(r[k]) > 200000) return false;
  }
  return true;
}

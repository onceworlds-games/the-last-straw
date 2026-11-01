// The animals at the market: how each picks, where it sets things down, and how its paws carry them there.
// Pure: the host runs them for bots, the autoplay runs them for a captured player, and node tests run whole matches with them.

import { ITEMS, STRAW, ANVIL } from './items.js';
import { Sim, landing, extents, hoverBox, shiftMotion, HOVER, STRAIN, Q, wrapAngle } from './physics.js';

/**
 * Each animal's habits. greed: keeps the heavier item while it dares; care: how much it minds an off-centre load;
 * drop: release height above where it lands (m); pace: how long its paws take; prank: past this strain it hands the next
 * player the heavier item; tall: likes standing things up; jitter: nervous early releases.
 */
export const PERSONAS = {
  Fennec: { greed: 1, dares: 3, care: 0.6, drop: [0.55, 1.1], pace: 0.7, prank: Infinity, tall: 0, jitter: 0, fur: 'fennec' },
  Tortoise: { greed: 0.2, dares: 1, care: 2, drop: [0.06, 0.2], pace: 1.5, prank: Infinity, tall: -0.5, jitter: 0, fur: 'tortoise', lightFrom: 45 },
  Vulture: { greed: 0.7, dares: 2, care: 1, drop: [0.2, 0.5], pace: 1.1, prank: 50, tall: 0, jitter: 0, fur: 'vulture' },
  Gecko: { greed: 0.6, dares: 2, care: 0.8, drop: [0.15, 0.45], pace: 1, prank: Infinity, tall: 1, jitter: 0, fur: 'gecko' },
  Jerboa: { greed: 0.5, dares: 2, care: 1, drop: [0.25, 0.6], pace: 0.9, prank: Infinity, tall: 0, jitter: 0.15, fur: 'jerboa' },
};
export const BOT_NAMES = Object.keys(PERSONAS);
export const personaOf = (name) => PERSONAS[String(name).split(' ')[0]] ?? PERSONAS.Gecko;

/** How risky one more `kg` looks at strain S with the camel's face showing `mood` (0-3), to a bot that knows the band. */
function risk(S, kg, mood) {
  const after = S + kg + STRAIN.perItem;
  const lo = mood >= 3 ? Math.max(70, S) : mood >= 2 ? Math.max(70, S - 4) : 70;
  if (after <= lo) return 0;
  return Math.min(1, (after - lo) / Math.max(4, 100 - lo));
}

/**
 * Pick 0 or 1 from the cart. S: strain now; mood: the camel's face.
 * The careful keep light things late, the greedy keep heavy things until the camel looks alarmed,
 * the prankster hands the next player the heavier one once the camel is loaded.
 */
export function botPick({ persona, skill = 0.5, offer, S, mood, rng }) {
  const [a, b] = offer.map((i) => ITEMS[i]);
  const heavier = a.kg >= b.kg ? 0 : 1;
  const lighter = 1 - heavier;
  if (S >= persona.prank) return lighter; // the heavier goes to the next player
  if (persona.lightFrom !== undefined && S >= persona.lightFrom) return lighter;
  if (mood >= persona.dares) return lighter;
  // weigh points against risk; low skill blurs it
  const value = (i) => ITEMS[offer[i]].kg * (1 - risk(S, ITEMS[offer[i]].kg, mood) * (2 - persona.greed)) + rng.gauss() * (1 - skill) * 3;
  return value(0) >= value(1) ? 0 : 1;
}

/** Candidate spots: x over the load, at the item's rest angles. More for a sharper bot. */
function candidates(item, snap, skill, persona, rng) {
  const def = ITEMS[item];
  const angles = def.rest.slice();
  if (persona.tall > 0 && (def.key === 'clock' || def.key === 'cactus' || def.key === 'birdcage')) angles.unshift(0);
  // where the load is: centre the search there
  let cx = 0;
  if (snap.length) cx = snap.reduce((s, r) => s + r[1] / Q, 0) / snap.length;
  const xs = [];
  for (let x = -1.1; x <= 1.1001; x += 0.1) xs.push(Math.round(x * 100) / 100);
  xs.sort((p, q) => Math.abs(p - cx * 0.5) - Math.abs(q - cx * 0.5));
  const want = Math.round(7 + 12 * skill);
  const out = [];
  for (const x of xs) for (const a of angles) out.push({ x, a: wrapAngle(a) });
  // keep the nearest ones plus a few random far ones
  const near = out.slice(0, Math.ceil(want * 0.7));
  const rest = out.slice(near.length);
  while (near.length < want && rest.length) near.push(rest.splice(rng.int(rest.length), 1)[0]);
  return near;
}

/** Steps of one trial per slice of work (about a millisecond on a tall load). */
const SLICE = 12;
const TRIAL_STEPS = 84;

/** Start trying one spot: set the item down there (from `h` above where it would land). `advance` then watches it. */
function startSpot(snap, item, x, a, h) {
  const sim = new Sim(snap);
  const top = sim.top();
  const box = hoverBox(item, a, top);
  const land = landing(sim, item, x, box.yMax, a);
  const y = Math.min(box.yMax, Math.max(box.yMin, land.y + h));
  const before = sim.pose();
  const ni = sim.addItem(item, x, y, a);
  return { sim, x, a, y, land: land.what, before, ni, s: 0, fell: false };
}

/** Watch a trial up to `k` more steps; true once it has fallen or run its course. */
function advance(t, k) {
  const { sim } = t;
  // set down, then a short taste of the camel's weight shift (what makes top-heavy piles go)
  for (let n = 0; n < k && t.s < TRIAL_STEPS; n++, t.s++) {
    if (t.s === 46) {
      sim.motionT = 0;
      sim.motion = shiftMotion(sim.strain().M);
    }
    sim.step();
    if (sim.fallen() >= 0) {
      t.fell = true;
      return true;
    }
  }
  return t.s >= TRIAL_STEPS;
}

/** What a finished trial came to. */
function resultOf(t) {
  const { sim, before, ni, x, a, y } = t;
  const after = sim.pose();
  let moved = 0;
  for (let i = 0; i < before.length; i += 3) moved += Math.hypot(after[i] - before[i], after[i + 1] - before[i + 1]) + Math.abs(wrapAngle(after[i + 2] - before[i + 2])) * 0.3;
  const b = sim.items[ni].body;
  const v = b.getLinearVelocity();
  const tilt = Math.abs(wrapAngle(b.getAngle() - a));
  const st = sim.strain();
  const height = sim.top();
  return { x, a, y, land: t.land, fell: t.fell, moved, speed: Math.hypot(v.x, v.y) + Math.abs(b.getAngularVelocity()) * 0.3, tilt, M: st.M, height };
}

function scoreSpot(r, persona) {
  if (r.fell || r.land === 'ground') return -1000;
  let s = 0;
  s -= r.moved * 40;
  s -= r.speed * 30;
  s -= r.tilt * 6;
  s -= Math.abs(r.M) * 0.6 * persona.care;
  s -= (r.height - 2.2) * (1 - persona.tall) * 1.5;
  if (r.land === 'camel') s -= 6;
  return s;
}

/**
 * Plan where to put `item` on `snap`: an incremental search (call `work(n)` until it returns the plan), so the host can
 * spread it over frames: each unit of work is a short slice of one trial. The plan: { x, y, a } where the paws let go.
 */
export function createPlanner({ snap, item, persona, skill = 0.5, rng }) {
  const list = candidates(item, snap, skill, persona, rng);
  const results = [];
  let cur = null;
  let plan = null;
  // a careful animal sets fragile things down gently (a reckless one smashes vases)
  let h = rng.range(persona.drop[0], persona.drop[1]);
  if (ITEMS[item]?.fragile && persona.care >= 0.8) h = Math.min(h, 0.1);
  return {
    get plan() {
      return plan;
    },
    /** Do up to n more slices of the search; returns the plan once every spot is tried. */
    work(n = 4) {
      if (plan) return plan;
      for (let k = 0; k < n && results.length < list.length; k++) {
        if (!cur) {
          const c = list[results.length];
          cur = startSpot(snap, item, c.x, c.a, h);
          continue;
        }
        if (advance(cur, SLICE)) {
          results.push(resultOf(cur));
          cur = null;
        }
      }
      if (results.length < list.length) return null;
      results.sort((p, q) => scoreSpot(q, persona) - scoreSpot(p, persona));
      // a less sharp bot sometimes takes a worse spot, and its hand is less exact
      const pickFrom = Math.max(1, Math.round(1 + (1 - skill) * 3));
      const chosen = results[Math.min(results.length - 1, rng.int(pickFrom))];
      const noiseX = rng.gauss() * 0.06 * (1 - skill);
      const noiseA = rng.gauss() * ((5 * Math.PI) / 180) * (1 - skill);
      const sim = new Sim(snap);
      const top = sim.top();
      const x = Math.max(-HOVER.xMax, Math.min(HOVER.xMax, chosen.x + noiseX));
      const a = chosen.a + noiseA;
      const box = hoverBox(item, a, top);
      const land = landing(sim, item, x, box.yMax, a);
      const y = Math.min(box.yMax, Math.max(box.yMin, land.y + h));
      plan = { x, y, a, score: scoreSpot(chosen, persona), trial: chosen };
      return plan;
    },
    /** Finish at once (tests, and a host that has to act now). */
    finish() {
      while (!this.work(64));
      return plan;
    },
  };
}

/**
 * The paws' path from where the item appears to the release point: eased waypoints [t ms, x, y, a] from `t0`, with a small
 * overshoot (and a nervous animal's jiggle). Returns { path, dropAt }.
 */
export function carryPath({ from, to, persona, rng, t0, early = false }) {
  const dur = (1000 + rng.next() * 700) * persona.pace;
  const pts = [[t0, from.x, from.y, from.a]];
  const over = 0.12 + rng.next() * 0.1;
  const dx = to.x - from.x;
  pts.push([t0 + dur * 0.45, from.x + dx * (1 + over), Math.max(to.y, from.y) + 0.15, from.a + wrapAngle(to.a - from.a) * 0.7]);
  if (persona.jitter > 0) {
    pts.push([t0 + dur * 0.62, to.x - dx * 0.08, to.y + 0.18, to.a + 0.12]);
    pts.push([t0 + dur * 0.75, to.x + dx * 0.05, to.y + 0.1, to.a - 0.06]);
  }
  pts.push([t0 + dur * 0.85, to.x, to.y + 0.05, to.a]);
  pts.push([t0 + dur, to.x, to.y, to.a]);
  if (early) {
    // let go too soon, short of the spot
    const cut = pts.slice(0, -2);
    const last = cut[cut.length - 1];
    return { path: cut.map((p) => p.map((v) => Math.round(v * 1000) / 1000)), dropAt: last[0], drop: { x: last[1], y: last[2], a: last[3] } };
  }
  return { path: pts.map((p) => p.map((v) => Math.round(v * 1000) / 1000)), dropAt: t0 + dur, drop: { x: to.x, y: to.y, a: to.a } };
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Where the paws are at time t on a path (eased between waypoints). */
export function pathAt(path, t) {
  if (!Array.isArray(path) || !path.length) return null;
  if (t <= path[0][0]) return { x: path[0][1], y: path[0][2], a: path[0][3] };
  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i], q = path[i + 1];
    if (t <= q[0]) {
      const u = ease((t - p[0]) / Math.max(1, q[0] - p[0]));
      return { x: p[1] + (q[1] - p[1]) * u, y: p[2] + (q[2] - p[2]) * u, a: p[3] + (q[3] - p[3]) * u };
    }
  }
  const l = path[path.length - 1];
  return { x: l[1], y: l[2], a: l[3] };
}

/** Is this a well-formed carry path from the room? */
export function checkPath(path) {
  return Array.isArray(path) && path.length >= 2 && path.length <= 8 && path.every((p) => Array.isArray(p) && p.length === 4 && p.every(Number.isFinite) && Math.abs(p[1]) < 5 && p[2] > -1 && p[2] < 20);
}

export { STRAW, ANVIL, extents };

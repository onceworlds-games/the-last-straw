// Runs on this page only: Caravan, the Daily cart and the title's attract mode (animals loading the camel). It owns the
// physics of each settle, the walk, town deliveries and the run's end, and reports what happens as events for sound and juice.
// Also the "auto hand": the animals' brain driving a pair of hands (attract mode, autoplay captures).

import { ITEMS, STRAW } from './items.js';
import { createRng } from './rng.js';
import { createSettle, hoverBox, clampHover, quantDrop, wrapAngle, snapPose, Sim, CAMEL } from './physics.js';
import { newCaravan, caravanPick, caravanHeld, caravanMotion, caravanDrop, caravanResolve, caravanDeliver, loadsLeft } from './caravan.js';
import { legLoads } from './rules.js';
import { createPlanner, carryPath, pathAt, botPick, personaOf } from './bots.js';
import { foldPose } from './camel.js';

const STEP = 1 / 60;
export const WALK_SPEED = 1.5; // m/s while the camel walks

/**
 * The animals' hands: plan a spot (a few ms a frame), then carry the item there on an eased path and let go.
 * update(nowMs) → { x, y, a, drop } (drop: true once, when the paws open).
 */
export function createAutoHand({ snap, item, top, persona, skill, seed, now }) {
  const rng = createRng(`hand:${seed}`);
  const planner = createPlanner({ snap, item, persona, skill, rng });
  const box = hoverBox(item, 0, top);
  const from = { x: 0, y: box.yDef, a: 0 };
  let path = null;
  let dropAt = 0;
  let dropped = false;
  const startAt = now + 250 * persona.pace;
  return {
    get planning() {
      return !path;
    },
    update(t, budget = 6) {
      if (!path) {
        const end = performance.now() + budget;
        let plan = planner.plan;
        while (!plan && performance.now() < end) plan = planner.work(1);
        if (plan && t >= startAt) {
          const c = carryPath({ from, to: plan, persona, rng, t0: t, early: rng.chance(persona.jitter) });
          path = c.path;
          dropAt = c.dropAt;
        }
        const j = persona.jitter > 0 ? Math.sin(t / 90) * 0.03 : 0;
        return { x: from.x + j, y: from.y + Math.sin(t / 400) * 0.03, a: from.a, drop: false };
      }
      const p = pathAt(path, t);
      const fire = !dropped && t >= dropAt;
      if (fire) dropped = true;
      return { ...p, drop: fire };
    },
  };
}

/**
 * A local run. kind: 'caravan' | 'daily' | 'demo'. auto: true for the attract mode (animals play it).
 * onEvent(type, data): 'offer', 'pick', 'drop', 'land', 'held', 'walk', 'town', 'deliver', 'leg', 'over', 'collapse', 'done'.
 */
export function createSolo({ seed, kind = 'caravan', auto = false, onEvent = () => {} }) {
  const c = newCaravan(seed);
  const demo = kind === 'demo';
  const rng = createRng(`solo:${seed}`);
  if (demo) c.T = rng.range(72, 86);
  const st = {
    kind,
    c,
    auto,
    runner: null,
    acc: 0,
    motion: 'shift',
    drop: null,
    item: -1,
    lastS: 0,
    contact: false,
    scroll: 0,
    walking: false,
    walkPhase: 0,
    townX: null,
    deliver: null,
    beat: null,
    hand: null,
    persona: null,
    pickAt: 0,
    time: 0,
    done: false,
    who: { kind: 'bot', fur: 'fennec', name: 'Fennec' },
    bornAt: 0,
  };
  newTurn();

  function newTurn() {
    st.hand = null;
    st.drop = null;
    st.item = -1;
    st.contact = false;
    st.fallSeen = false;
    if (auto) {
      const name = ['Fennec', 'Tortoise', 'Vulture', 'Gecko', 'Jerboa'][rng.int(5)];
      st.persona = personaOf(name);
      st.who = { kind: 'bot', fur: st.persona.fur, name };
      st.pickAt = st.time + 0.7 + rng.next() * 0.8;
    }
    onEvent('offer', { offer: c.offer.slice() });
  }

  function pick(i) {
    if (!caravanPick(c, i)) return false;
    st.item = caravanHeld(c);
    st.bornAt = st.time;
    onEvent('pick', { i, item: st.item });
    if (auto) st.hand = createAutoHand({ snap: c.snap, item: st.item, top: c.top, persona: st.persona, skill: 0.55 + rng.next() * 0.35, seed: `${seed}:${c.draws}:${c.load}`, now: st.time * 1000 });
    return true;
  }

  /** Let go at the hover h ({ x, y, a }). */
  function drop(h) {
    if (c.step !== 'place') return false;
    const item = st.item;
    const q = quantDrop(clampHover(item, h.x, h.y, wrapAngle(h.a), c.top));
    caravanDrop(c);
    st.drop = { item, ...q };
    st.motion = demo ? 'shift' : caravanMotion(c);
    st.runner = createSettle(c.snap, { item, ...q }, { T: c.T, motion: st.motion, leg: c.leg, keyframes: false });
    st.acc = 0;
    st.lastS = st.runner.strain;
    if (st.motion === 'town') st.townX = -3.2 - WALK_SPEED * 3 - 0.6;
    onEvent('drop', { item, x: q.x, y: q.y, a: q.a });
    return true;
  }

  function settleStep() {
    const r = st.runner;
    r.run(1);
    const S = r.strain;
    if (!st.contact && S > st.lastS + 1.5) {
      st.contact = true;
      const n = r.sim.items.length - 1;
      const b = r.sim.items[n].body;
      const p = b.getPosition();
      onEvent('land', { item: st.drop.item, x: p.x, y: p.y, energy: ITEMS[st.drop.item].kg * 0.6 + (S - st.lastS) });
    }
    st.lastS = S;
    if (r.verdict && r.verdict.r === 'fell' && !st.fallSeen) {
      st.fallSeen = true;
      const fi = r.verdict.fi;
      const b = r.sim.items[fi]?.body;
      const p = b ? b.getPosition() : { x: 0, y: 0 };
      onEvent('fall', { fi, item: r.sim.items[fi]?.item ?? -1, x: p.x, y: 0 });
    }
    const walking = r.phase === 'walk' && !r.verdict;
    if (walking && !st.walking) onEvent('walk', { town: st.motion === 'town' });
    st.walking = walking;
    if (walking) {
      st.scroll += WALK_SPEED * STEP;
      st.walkPhase += STEP * 5.9;
      if (st.townX !== null) st.townX += WALK_SPEED * STEP;
    }
    if (r.done) finishSettle();
  }

  function finishSettle() {
    const r = st.runner;
    const v = r.verdict;
    const final = r.final();
    if (demo) c.load = 0;
    st.runner = null;
    st.walking = false;
    if (v.r !== 'held') {
      const result = caravanResolve(c, v, final);
      st.beat = { kind: v.r, t: 0, fi: v.fi, item: c.last?.item ?? -1, fell: c.last?.fell ?? -1, sim: null, collapsed: false, final };
      if (v.r === 'broke') {
        const sim = new Sim(final, { broken: true });
        sim.motion = (t) => foldPose(foldAt(t));
        st.beat.sim = sim;
      }
      onEvent('over', { r: v.r, item: st.beat.item, fell: st.beat.fell, fi: v.fi, result });
      return;
    }
    const kg = ITEMS[st.drop.item].kg;
    const res = caravanResolve(c, v, final);
    onEvent('held', { item: st.drop.item, kg, S: c.S, mood: c.mood, top: c.top });
    if (res === 'town') {
      st.deliver = { i: 0, t: 0, list: final.map((row) => row.slice()) };
      onEvent('town', { leg: c.leg, kg: c.kgLeg });
    } else newTurn();
  }

  function update(dt) {
    if (st.done) return;
    st.time += dt;
    if (st.beat) {
      const b = st.beat;
      b.t += dt;
      if (b.sim) {
        st.acc += dt * 60;
        while (st.acc >= 1) {
          b.sim.step();
          st.acc -= 1;
          if (!b.collapsed && foldAt(b.sim.motionT) >= 0.98) {
            b.collapsed = true;
            onEvent('collapse', {});
          }
        }
      }
      if (b.t >= (b.kind === 'broke' ? 2.6 : 2.2) && !st.done) {
        st.done = true;
        onEvent('done', { kind: b.kind });
      }
      return;
    }
    if (st.deliver) {
      const d = st.deliver;
      d.t += dt;
      while (d.t >= 0.3 && d.i < d.list.length) {
        d.t -= 0.3;
        const row = d.list[d.i++];
        onEvent('deliver', { item: row[0], kg: ITEMS[row[0]].kg, x: row[1] / 10000, y: row[2] / 10000, i: d.i });
      }
      if (d.i >= d.list.length && d.t >= 0.5) {
        st.deliver = null;
        const kg = caravanDeliver(c);
        st.townX = null;
        onEvent('leg', { leg: c.leg, kg });
        newTurn();
      }
      return;
    }
    if (c.step === 'settle' && st.runner) {
      st.acc += dt * 60;
      let guard = 0;
      while (st.acc >= 1 && st.runner && guard++ < 8) {
        settleStep();
        st.acc -= 1;
      }
      if (guard >= 8) st.acc = 0;
      return;
    }
    if (auto) {
      if (c.step === 'pick' && st.time >= st.pickAt) {
        const i = botPick({ persona: st.persona, skill: 0.7, offer: c.offer, S: c.S, mood: c.mood, rng });
        pick(i);
      } else if (c.step === 'place' && st.hand) {
        const h = st.hand.update(st.time * 1000);
        st.handPos = h;
        if (h.drop) drop(h);
      }
    }
  }

  /** What to draw: the load's items, the tray's pose, the needle's strain. */
  function view() {
    const out = { items: [], saddle: { y: 0, a: 0 }, S: c.S, fold: 0, crack: 0, knocked: false };
    if (st.beat && st.beat.sim) {
      const sim = st.beat.sim;
      const p = sim.pose();
      sim.items.forEach((it, i) => out.items.push({ item: it.item, x: p[i * 3], y: p[i * 3 + 1], a: p[i * 3 + 2] }));
      out.fold = foldAt(sim.motionT);
      out.crack = Math.min(1, st.beat.t / 0.25);
      out.knocked = out.fold > 0.55;
      out.S = 100;
      return out;
    }
    if (st.runner) {
      const sim = st.runner.sim;
      const p = sim.pose();
      sim.items.forEach((it, i) => out.items.push({ item: it.item, x: p[i * 3], y: p[i * 3 + 1], a: p[i * 3 + 2] }));
      out.saddle = sim.saddlePose();
      out.S = st.runner.strain;
      if (st.fallSeen && out.items[st.runner.verdict?.fi]) out.items[st.runner.verdict.fi].outline = '#D63F6E';
      return out;
    }
    let list = c.snap;
    if (st.deliver) list = st.deliver.list.slice(st.deliver.i);
    const p = snapPose(list);
    list.forEach((row, i) => out.items.push({ item: row[0], x: p[i * 3], y: p[i * 3 + 1], a: p[i * 3 + 2] }));
    if (st.beat && st.beat.kind === 'fell' && st.beat.fi >= 0 && out.items[st.beat.fi]) out.items[st.beat.fi].outline = '#D63F6E';
    return out;
  }

  return {
    st,
    c,
    pick,
    drop,
    update,
    view,
    get step() {
      return c.step;
    },
    get held() {
      return st.item;
    },
    get loadsLeft() {
      return loadsLeft(c);
    },
    get delivered() {
      return c.delivered;
    },
  };
}

/** The collapse's progress for a time since the break (seconds of the collapse sim). */
export function foldAt(t) {
  return Math.max(0, Math.min(1, (t - 0.2) / 1.15));
}

export { STRAW, legLoads, CAMEL };

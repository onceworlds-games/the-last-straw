// Runs on this page only: Caravan, the Daily cart and the title's attract mode (animals loading the camel). It owns the
// physics of each settle, the walk, town deliveries and the run's end, and reports what happens as events for sound and juice.
// Also the "auto hand": the animals' brain driving a pair of hands (attract mode, autoplay captures).

import { ITEMS, STRAW } from './items.js';
import { createRng } from './rng.js';
import { createSettle, createWalk, hoverBox, hoverFloor, clampHover, quantDrop, wrapAngle, snapPose, Sim, CAMEL } from './physics.js';
import { newCaravan, caravanPick, caravanHeld, caravanDrop, caravanResolve, caravanDeliver, caravanArrive, caravanSetOff, caravanPerk, caravanRestart, canSetOff, payout, runPhysics, loadsLeft, RUN } from './caravan.js';
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
 * A local run. kind: 'caravan' | 'daily' | 'demo'. auto: true for the attract mode and autoplay (animals play it).
 * onEvent(type, data): 'offer', 'pick', 'drop', 'land', 'smash', 'held', 'setoff', 'road', 'arrive', 'deliver', 'leg', 'perk',
 * 'lost', 'over', 'collapse', 'done'.
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
    runner: null, // a settle (a new item) or the road (createWalk)
    road: false,
    acc: 0,
    prev: null, // the pose one physics step ago (drawn in between)
    prevSaddle: null,
    drop: null,
    item: -1,
    lastS: 0,
    contact: false,
    smashSeen: false,
    scroll: 0,
    walking: false,
    walkPhase: 0,
    townX: null,
    deliver: null,
    beat: null,
    hand: null,
    persona: null,
    pickAt: 0,
    perkAt: 0,
    setOffAt: 0,
    time: 0,
    done: false,
    who: { kind: 'bot', fur: 'fennec', name: 'Fennec' },
    bornAt: 0,
    stand: 0, // 1 → 0 as the camel gets up after a lost load
  };
  newTurn();

  function newTurn() {
    st.hand = null;
    st.drop = null;
    st.item = -1;
    st.contact = false;
    st.fallSeen = false;
    st.smashSeen = false;
    if (auto) {
      const name = ['Fennec', 'Tortoise', 'Vulture', 'Gecko', 'Jerboa'][rng.int(5)];
      st.persona = personaOf(name);
      st.who = { kind: 'bot', fur: st.persona.fur, name };
      st.pickAt = st.time + 0.35 + rng.next() * 0.45;
      // an animal sets off once the camel sweats, or with a good load on
      st.setOffAt = st.time + 0.5;
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

  const physics = () => (demo ? {} : runPhysics(c));

  /** Let go at the hover h ({ x, y, a }). */
  function drop(h) {
    if (c.step !== 'place') return false;
    const item = st.item;
    const a = wrapAngle(h.a);
    const floor = hoverFloor(c.snap, item, h.x, a, c.top);
    const q = quantDrop(clampHover(item, h.x, h.y, a, c.top, floor));
    caravanDrop(c);
    st.drop = { item, ...q };
    st.runner = createSettle(c.snap, { item, ...q }, { T: c.T, motion: 'shift', leg: c.leg, keyframes: false, ...physics() });
    st.road = false;
    st.acc = 0;
    st.prev = null;
    st.lastS = st.runner.strain;
    onEvent('drop', { item, x: q.x, y: q.y, a: q.a });
    return true;
  }

  /** Set off for the next town with the load on (once there are enough loads). */
  function setOff() {
    if (demo || !caravanSetOff(c)) return false;
    st.runner = createWalk(c.snap, { T: c.T, leg: c.leg, ...physics() });
    st.road = true;
    st.acc = 0;
    st.prev = null;
    st.lastS = st.runner.strain;
    st.townX = -4.9 - WALK_SPEED * 3; // the gate stops just ahead of the camel's nose
    onEvent('setoff', { mood: c.mood, pay: payout(c, c.mood) });
    return true;
  }

  function choosePerk(i) {
    if (!caravanPerk(c, i)) return false;
    st.townX = null;
    st.scroll = 0;
    onEvent('perk', { perk: c.perks[c.perks.length - 1], leg: c.leg });
    newTurn();
    return true;
  }

  function settleStep() {
    const r = st.runner;
    st.prev = r.sim.pose(st.prev);
    st.prevSaddle = r.sim.saddlePose();
    r.run(1);
    const S = r.strain;
    if (!st.road && !st.contact && S > st.lastS + 1.5) {
      st.contact = true;
      const n = r.ni;
      const b = r.sim.items[n].body;
      const p = b.getPosition();
      onEvent('land', { item: st.drop.item, x: p.x, y: p.y, energy: ITEMS[st.drop.item].kg * 0.6 + (S - st.lastS) });
    }
    if (!st.road && !st.smashSeen && r.smashAt >= 0) {
      st.smashSeen = true;
      st.contact = true;
      const p = r.sim.items[r.ni].body.getPosition();
      onEvent('smash', { item: st.drop.item, x: st.drop.x, y: Math.max(c.top - 0.2, 2.2), px: p.x });
    }
    st.lastS = S;
    if (r.verdict && r.verdict.r === 'fell' && !st.fallSeen) {
      st.fallSeen = true;
      const fi = r.verdict.fi;
      const b = r.sim.items[fi]?.body;
      const p = b ? b.getPosition() : { x: 0, y: 0 };
      onEvent('fall', { fi, item: r.sim.items[fi]?.item ?? -1, x: p.x, y: 0 });
    }
    const walking = st.road && r.phase === 'walk' && !r.verdict;
    if (walking && !st.walking) onEvent('road', { leg: c.leg });
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
    const road = st.road;
    st.runner = null;
    st.walking = false;
    st.prev = null;
    if (demo) c.load = 0;
    const result = road ? caravanArrive(c, v, final) : caravanResolve(c, v, final);
    if (v.r !== 'held') {
      st.beat = { kind: v.r, t: 0, fi: v.fi, item: c.last?.item ?? -1, fell: c.last?.fell ?? -1, sim: null, collapsed: false, final, result };
      if (v.r === 'broke') {
        const sim = new Sim(final, { broken: true });
        sim.motion = (t) => foldPose(foldAt(t));
        st.beat.sim = sim;
      }
      onEvent('over', { r: v.r, item: st.beat.item, fell: st.beat.fell, fi: v.fi, result, patience: c.patience, road });
      return;
    }
    if (road) {
      st.deliver = { i: 0, t: 0, list: final.map((row) => row.slice()), pay: c.pay };
      onEvent('arrive', { leg: c.leg, pay: c.pay });
      return;
    }
    const item = st.drop.item;
    onEvent('held', { item, kg: ITEMS[item].kg, S: c.S, mood: c.mood, top: c.top, soft: !!v.soft, bonus: c.last?.bonus ?? 0, streak: c.streak, smash: v.smash >= 0, x: st.drop.x, vin: v.vin });
    if (result === 'full' && auto) setOff();
    else newTurn();
  }

  function update(dt) {
    if (st.done) return;
    st.time += dt;
    st.stand = Math.max(0, st.stand - dt / 1.4);
    if (st.beat) {
      const b = st.beat;
      b.t += dt;
      if (b.sim) {
        st.acc += dt * 60;
        while (st.acc >= 1) {
          st.prev = b.sim.pose(st.prev);
          b.sim.step();
          st.acc -= 1;
          if (!b.collapsed && foldAt(b.sim.motionT) >= 0.98) {
            b.collapsed = true;
            onEvent('collapse', {});
          }
        }
      }
      if (b.t >= (b.kind === 'broke' ? 2.6 : 2.2)) {
        st.beat = null;
        st.prev = null;
        if (demo || c.step === 'over') {
          st.done = true;
          onEvent('done', { kind: b.kind });
        } else {
          caravanRestart(c);
          st.stand = b.kind === 'broke' ? 1 : 0;
          st.scroll = 0;
          st.townX = null;
          onEvent('lost', { patience: c.patience, leg: c.leg });
          newTurn();
        }
      }
      return;
    }
    if (st.deliver) {
      const d = st.deliver;
      d.t += dt;
      while (d.t >= 0.22 && d.i < d.list.length) {
        d.t -= 0.22;
        const row = d.list[d.i++];
        onEvent('deliver', { item: row[0], kg: ITEMS[row[0]].kg, x: row[1] / 10000, y: row[2] / 10000, i: d.i });
      }
      if (d.i >= d.list.length && d.t >= 0.6) {
        st.deliver = null;
        const pay = caravanDeliver(c);
        onEvent('leg', { leg: c.leg, kg: pay, pay: c.pay, step: c.step });
        if (c.step === 'over') {
          st.done = true;
          onEvent('done', { kind: 'short' });
        } else st.perkAt = st.time + 3.2;
      }
      return;
    }
    if (c.step === 'perk') {
      if (auto && st.time >= st.perkAt) choosePerk(rng.int(c.perkOffer.length));
      return;
    }
    if ((c.step === 'settle' || c.step === 'road') && st.runner) {
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
      if (c.step === 'pick' && !demo && canSetOff(c) && st.time >= st.setOffAt && (c.mood >= 2 || c.load >= 5 + rng.int(3))) {
        setOff();
        return;
      }
      if (c.step === 'full') {
        setOff();
        return;
      }
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

  const lerpPose = (out, prev, cur, k) => {
    if (!prev || prev.length !== cur.length) return cur;
    for (let i = 0; i < cur.length; i++) out[i] = i % 3 === 2 ? prev[i] + wrapAngle(cur[i] - prev[i]) * k : prev[i] + (cur[i] - prev[i]) * k;
    return out;
  };
  let poseBuf = null;

  /** What to draw: the load's items, the tray's pose, the needle's strain (drawn between the last two physics steps). */
  function view() {
    const out = { items: [], saddle: { y: 0, a: 0 }, S: c.S, fold: st.stand, crack: 0, knocked: false, walkingCat: -1 };
    const k = Math.max(0, Math.min(1, st.acc));
    if (st.beat && st.beat.sim) {
      const sim = st.beat.sim;
      const cur = sim.pose();
      const p = lerpPose((poseBuf = poseBuf && poseBuf.length === cur.length ? poseBuf : new Float64Array(cur.length)), st.prev, cur, k);
      sim.items.forEach((it, i) => out.items.push({ item: it.item, x: p[i * 3], y: p[i * 3 + 1], a: p[i * 3 + 2] }));
      out.fold = foldAt(sim.motionT);
      out.crack = Math.min(1, st.beat.t / 0.25);
      out.knocked = out.fold > 0.55;
      out.S = 100;
      return out;
    }
    if (st.runner) {
      const sim = st.runner.sim;
      const cur = sim.pose();
      const p = lerpPose((poseBuf = poseBuf && poseBuf.length === cur.length ? poseBuf : new Float64Array(cur.length)), st.prev, cur, k);
      sim.items.forEach((it, i) => {
        if (it.gone) return;
        out.items.push({ item: it.item, x: p[i * 3], y: p[i * 3 + 1], a: p[i * 3 + 2] });
      });
      const sp = sim.saddlePose();
      const ps = st.prevSaddle ?? sp;
      out.saddle = { y: ps.y + (sp.y - ps.y) * k, a: ps.a + (sp.a - ps.a) * k };
      out.S = st.runner.strain;
      if (!st.road && ITEMS[st.drop?.item]?.walks && !st.runner.verdict) out.walkingCat = out.items.length - 1;
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
    setOff,
    choosePerk,
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
    get canSetOff() {
      return canSetOff(c) && !st.runner && !st.beat && !st.deliver;
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

export { STRAW, CAMEL, RUN };

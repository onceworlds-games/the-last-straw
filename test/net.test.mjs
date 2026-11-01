// The match over a pretend room: two pages (the host and a guest) and an animal, one shared match record, messages between
// the pages, and the host's rpcs. Checks the host runs the turns, every page gets the same keyframes, and a new host
// carries a settle on to the same result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNet } from '../game/net.js';
import { turnKey, placer, heldItem, checkRecord } from '../game/rules.js';
import { hoverBox, createSettle, snapPose } from '../game/physics.js';
import { createPlanner, personaOf } from '../game/bots.js';
import { createRng } from '../game/rng.js';

function createWorld({ seats, hostId }) {
  const w = {
    now: 10000,
    hostId,
    data: null,
    phase: 'round',
    round: 1,
    roundId: 'r1',
    seats,
    settings: { rounds: 3, turn: 15, bots: 0 },
    privates: new Map(),
    presence: new Map(),
    rpcs: new Map(),
    opts: new Map(),
    pages: new Map(),
    ended: null,
    refused: [],
  };
  w.call = (fromId, name, args) => {
    const spec = w.rpcs.get(`${w.hostId}:${name}`);
    const ok = spec.validate({ id: fromId }, args);
    if (ok !== true) return w.refused.push({ fromId, name, ok });
    spec.run({ id: fromId }, args);
  };
  w.page = (id) => {
    const handlers = new Map();
    const on = (ev, fn) => {
      handlers.set(ev, (handlers.get(ev) ?? []).concat(fn));
      return () => handlers.set(ev, handlers.get(ev).filter((f) => f !== fn));
    };
    const room = {
      kind: 'private',
      me: { id },
      get host() {
        return w.hostId;
      },
      get isHost() {
        return w.hostId === id;
      },
      get match() {
        return { seed: 4242, phase: w.phase };
      },
      get settings() {
        return w.settings;
      },
      online: seats.filter((s) => !s.bot),
      players: { get: (pid) => ({ presence: w.presence.get(pid) }) },
      matchNow: () => w.now,
      setPrivate: (k, v) => w.privates.set(`${id}:${k}`, structuredClone(v)),
      get private() {
        return { 'tls.T': w.privates.get(`${id}:tls.T`) };
      },
      privateOf: (pid) => ({ 'tls.T': w.privates.get(`${pid}:tls.T`) }),
      send: (data) => {
        for (const [pid, p] of w.pages) if (pid !== id) for (const f of p.handlers.get('message') ?? []) f(JSON.parse(JSON.stringify(data)), { id });
      },
      on,
      setPresence: (p) => w.presence.set(id, p),
      presenceAt: (pid) => w.presence.get(pid),
      setSetting() {},
      clearReady() {},
    };
    const lib = {
      t: { string: () => 'string', int: () => 'int', number: () => 'number' },
      createHost: () => ({
        rpc(name, spec) {
          w.rpcs.set(`${id}:${name}`, spec);
          return (args) => w.call(id, name, args);
        },
        callAs: (from, name, args) => w.call(from.id, name, args),
      }),
      createMatch(r, opts) {
        w.opts.set(id, opts);
        return {
          get data() {
            return w.data;
          },
          get phase() {
            return w.phase;
          },
          get seats() {
            return w.seats;
          },
          get round() {
            return w.round;
          },
          get roundId() {
            return w.roundId;
          },
          setData(x) {
            assert.equal(w.hostId, id, 'only the host writes the match');
            let next;
            if (typeof x === 'function') {
              const draft = structuredClone(w.data);
              const out = x(draft);
              next = out === undefined ? draft : out;
            } else next = structuredClone(x);
            assert.equal(opts.data(next), true, 'the record stays valid');
            w.data = next;
          },
          endRound(points) {
            w.ended = points;
            w.phase = 'roundEnd';
          },
          on: () => () => {},
          dispose() {},
        };
      },
      createBots: () => ({ setFill() {}, dispose() {} }),
    };
    const net = createNet(room, lib, {});
    const page = { id, room, net, handlers };
    w.pages.set(id, page);
    return page;
  };
  w.start = () => {
    const m = w.pages.get(w.hostId).net.match;
    w.data = w.opts.get(w.hostId).startRound({ seats: w.seats, round: w.round, roundId: w.roundId, data: null });
    assert.ok(checkRecord(w.data));
    return m;
  };
  w.tick = () => {
    w.now += 50;
    w.opts.get(w.hostId).onTick(w.pages.get(w.hostId).net.match);
  };
  return w;
}

/** A careful human hand: the animals' planner at full skill. */
function carefulDrop(d) {
  const item = heldItem(d);
  return createPlanner({ snap: d.snap, item, persona: personaOf('Tortoise'), skill: 1, rng: createRng(turnKey(d)) }).finish();
}

/** Play the humans' turns on their own pages; returns per-turn records of who dropped what. */
function playHumans(w, humans, until) {
  const drops = [];
  for (let guard = 0; guard < 40000 && !w.ended && !until?.(); guard++) {
    const d = w.data;
    const pid = placer(d);
    const page = humans.includes(pid) ? w.pages.get(pid) : null;
    if (page && d.step === 'pick') page.net.pick(turnKey(d), 1);
    else if (page && d.step === 'place') {
      const plan = carefulDrop(d);
      drops.push({ k: turnKey(d), by: pid });
      page.net.drop(turnKey(d), plan);
    }
    w.tick();
  }
  return drops;
}

const SEATS = () => [
  { id: 'A', name: 'Ann' },
  { id: 'B', name: 'Bo' },
  { id: 'bot:1', name: 'Fennec', bot: true, skill: 0.6 },
];

test('the host runs a whole round: picks, drops, the animal, keyframes to the guest, and the score', () => {
  const w = createWorld({ seats: SEATS(), hostId: 'A' });
  const A = w.page('A');
  const B = w.page('B');
  w.start();
  const drops = playHumans(w, ['A', 'B']);
  assert.ok(w.ended, 'the round ended');
  assert.ok(drops.some((x) => x.by === 'B'), 'the guest placed');
  assert.ok(['broke', 'fell', 'limit'].includes(w.data.last.r));
  if (w.data.last.r !== 'limit') assert.equal(w.ended[w.data.last.by], 0);
  for (const v of Object.values(w.ended)) assert.ok(Number.isInteger(v) && v >= 0);
  // the guest drew every settle from the host's keyframes, the same ones the host kept (pages keep the last few turns)
  const tn = w.data.tn;
  for (const k of [tn - 2, tn - 1, tn].map((n) => `${w.data.rid}.${n}`)) {
    const mine = A.net.keyframes(k);
    const theirs = B.net.keyframes(k);
    assert.ok(theirs.length > 2, `keyframes for ${k}`);
    assert.equal(theirs.length, mine.length);
    for (let i = 0; i < mine.length; i++) {
      assert.equal(theirs[i].s, mine[i].s);
      for (let j = 0; j < mine[i].pose.length; j++) assert.ok(Math.abs(theirs[i].pose[j] - mine[i].pose[j]) < 0.0006);
    }
  }
});

test('only the placer may pick or drop, and only for this turn', () => {
  const w = createWorld({ seats: SEATS(), hostId: 'A' });
  w.page('A');
  const B = w.page('B');
  w.start();
  const before = JSON.stringify(w.data);
  B.net.pick(turnKey(w.data), 0); // A's turn
  B.net.drop(turnKey(w.data), { x: 0, y: 3, a: 0 });
  w.pages.get('A').net.pick('r1.99', 0); // a stale turn
  assert.equal(JSON.stringify(w.data), before);
  assert.equal(w.refused.length, 3);
});

test('a new host mid-settle carries the same drop on to the same result', () => {
  const w = createWorld({ seats: SEATS(), hostId: 'A' });
  w.page('A');
  const B = w.page('B');
  w.start();
  // A places once, then B picks and drops; the host leaves while it settles
  playHumans(w, ['A', 'B'], () => w.data.step === 'settle' && placer(w.data) === 'B');
  assert.equal(w.data.step, 'settle');
  // the record as it stood before the host finished simulating (a settle can finish within one slice)
  w.data = { ...w.data, verdict: null, final: null };
  const d = structuredClone(w.data);
  const k = turnKey(d);
  const T = w.privates.get('A:tls.T').T;
  const expected = createSettle(d.snap, { item: d.drop.item, x: d.drop.x, y: d.drop.y, a: d.drop.a }, { T });
  expected.run();
  // B takes over as host (A's page is gone); it reads the hidden limit A kept and simulates the drop again
  w.pages.get('A').net.dispose();
  w.pages.delete('A');
  w.seats.find((s) => s.id === 'A').left = true;
  w.hostId = 'B';
  for (let i = 0; i < 400 && !(w.data.verdict && turnKey(w.data) === k); i++) w.tick();
  assert.equal(turnKey(w.data), k);
  assert.equal(w.data.verdict.r, expected.verdict.r);
  assert.deepEqual(w.data.final, expected.final());
  const last = B.net.keyframes(k).at(-1).pose;
  const end = snapPose(expected.final());
  for (let j = 0; j < end.length; j++) assert.ok(Math.abs(last[j] - end[j]) < 0.003);
});

test('a player who leaves on their turn is passed over, and the pair goes on', () => {
  const w = createWorld({ seats: SEATS(), hostId: 'A' });
  w.page('A');
  w.page('B');
  w.start();
  playHumans(w, ['A'], () => placer(w.data) === 'B');
  const pair = w.data.offer.slice();
  w.seats.find((s) => s.id === 'B').left = true;
  w.tick();
  assert.equal(placer(w.data), 'bot:1');
  assert.deepEqual(w.data.offer, pair);
});

test('out of time: the cart picks for you and your hands open where they are', () => {
  const w = createWorld({ seats: SEATS(), hostId: 'A' });
  w.page('A');
  const B = w.page('B');
  w.start();
  playHumans(w, ['A'], () => placer(w.data) === 'B');
  const d = w.data;
  const box = hoverBox(d.offer[0], 0, d.top / 1000);
  B.net.setHover(turnKey(d), { x: 0.4, y: box.yDef, a: 0 });
  w.now = d.until + 1;
  w.tick();
  assert.equal(w.data.step, 'settle');
  assert.equal(w.data.pick, 0);
  assert.equal(w.data.drop.by, 'B');
  assert.ok(Math.abs(w.data.drop.x - 0.4) < 0.001);
});

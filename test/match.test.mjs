import test from 'node:test';
import assert from 'node:assert/strict';
import { playRound, playMatch, botSeats } from './play.mjs';
import { ITEMS, ITEM_BY_KEY as K, isItem } from '../game/items.js';
import { Sim, hoverBox, createSettle, checkSnap } from '../game/physics.js';
import { createPlanner, carryPath, checkPath, pathAt, personaOf, BOT_NAMES } from '../game/bots.js';
import { createRng } from '../game/rng.js';
import { createSolo } from '../game/solo.js';

test('every animal plans a legal spot on the load and carries it there', () => {
  let snap = [];
  for (const [i, name] of BOT_NAMES.entries()) {
    const persona = personaOf(name);
    const item = [K.crate, K.suitcase, K.books, K.melon, K.tuba][i];
    const rng = createRng(`plan:${name}`);
    const plan = createPlanner({ snap, item, persona, skill: 0.6, rng }).finish();
    const box = hoverBox(item, plan.a, new Sim(snap).top());
    assert.ok(Math.abs(plan.x) <= box.xMax + 1e-9 && plan.y >= box.yMin - 1e-9 && plan.y <= box.yMax + 1e-9, `${name}'s plan is in the box`);
    const c = carryPath({ from: { x: 0, y: box.yDef, a: 0 }, to: plan, persona, rng, t0: 1000 });
    assert.ok(checkPath(c.path));
    const end = pathAt(c.path, c.dropAt);
    assert.ok(Math.abs(end.x - c.drop.x) < 0.01 && Math.abs(end.y - c.drop.y) < 0.01);
    const r = createSettle(snap, { item, x: plan.x, y: plan.y, a: plan.a }, { T: Infinity });
    r.run();
    if (r.verdict.r === 'held') snap = r.final();
  }
  assert.ok(snap.length >= 4, `${snap.length} of 5 careful placements held`);
});

test('whole matches of animals: every round ends, points are whole kg, the one who ended it scores 0', () => {
  const seen = { broke: 0, fell: 0 };
  for (const seed of ['m1', 'm2']) {
    const seats = botSeats(4, seed);
    const { totals, log } = playMatch({ seats, seed, rounds: 2 });
    for (const r of log) {
      assert.ok(['broke', 'fell', 'limit'].includes(r.verdict), r.verdict);
      if (r.verdict !== 'limit') {
        seen[r.verdict]++;
        assert.equal(r.points[r.d.last.by], 0);
      }
      assert.ok(checkSnap(r.d.snap));
      assert.ok(r.placements >= 2 && r.placements <= 40);
      for (const [id, p] of Object.entries(r.points)) assert.ok(Number.isInteger(p) && p >= 0, `${id}: ${p}`);
    }
    for (const v of Object.values(totals)) assert.ok(Number.isFinite(v));
  }
  assert.ok(seen.broke + seen.fell === 4);
});

test('a careless hand ends rounds: dropping big things high on the edge loses', () => {
  let lost = 0;
  for (const seed of ['c1', 'c2']) {
    const seats = botSeats(3, seed);
    seats[0].policy = {
      pick: (d) => (ITEMS[d.offer[0]].kg >= ITEMS[d.offer[1]].kg ? 0 : 1),
      plan: (d, item) => {
        const box = hoverBox(item, 0, d.top / 1000);
        return { x: box.xMax * 0.95, y: box.yMax, a: 0.6 };
      },
    };
    const r = playRound({ seats, seed });
    if (r.d.last.by === seats[0].id) lost++;
  }
  assert.equal(lost, 2);
});

test("a Caravan run and the title's animals play to the end on their own", () => {
  for (const kind of ['caravan', 'demo']) {
    const events = [];
    const so = createSolo({ seed: `run:${kind}`, kind, auto: true, onEvent: (type) => events.push(type) });
    let frames = 0;
    while (!so.st.done && frames < 60 * 60 * 6) {
      so.update(1 / 60);
      frames++;
      if (frames % 30 === 0) {
        const v = so.view();
        assert.ok(Number.isFinite(v.S) && v.items.every((it) => isItem(it.item) && Number.isFinite(it.x + it.y + it.a)));
      }
    }
    assert.ok(so.st.done, `${kind} ended`);
    assert.equal(events[events.length - 1], 'done');
    assert.ok(events.includes('held'));
    assert.ok(events.includes('over'));
    if (kind === 'caravan') assert.ok(Number.isInteger(so.delivered) && so.delivered >= 0);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, STRAW, isItem } from '../game/items.js';
import { BAND } from '../game/physics.js';
import { createRng } from '../game/rng.js';
import {
  newRound, beginTurn, applyPick, applyDrop, storeVerdict, applyVerdict, skipTurn, roundPoints, roundOrder, drawThreshold, moodOf,
  heldItem, nextPlayer, checkRecord, strawWeight, drawItem, MAX_TURNS, checkDailyEntry, dailyBoard, maxKgByTown, legBand,
} from '../game/rules.js';

const ctx = { seed: 7, now: 1000, turnMs: 15000 };
const fresh = (ids = ['a', 'b', 'c'], round = 2) => beginTurn(newRound({ order: ids, rid: `r${round}`, round }), ctx);

/** Hold or end a turn with a made-up verdict. */
function settle(d, r, { S = 300, top = 2400, fi = -1 } = {}) {
  applyPick(d, 0);
  const item = heldItem(d);
  applyDrop(d, d.order[d.ti], { x: 0, y: 3, a: 0 }, ctx.now);
  const final = d.snap.concat([[item, 0, 30000, 0]]);
  storeVerdict(d, { r, at: 100, fi, S: S / 10, top: top / 1000 }, final, r === 'held' ? 1 : 3, 100);
  return { item, result: applyVerdict(d, ctx) };
}

test('the breaking point is always inside the red band, round 1 sturdier', () => {
  const rng = createRng('T');
  for (let i = 0; i < 500; i++) {
    const T = drawThreshold(rng, i % 2 === 0);
    assert.ok(T >= BAND[0] && T <= BAND[1]);
    if (i % 2 === 0) assert.ok(T >= 85);
  }
});

test("the camel's face follows the strain against its hidden limit", () => {
  assert.equal(moodOf(10, 90), 0);
  assert.equal(moodOf(60, 90), 1);
  assert.equal(moodOf(78, 90), 2);
  assert.equal(moodOf(88, 90), 3);
  assert.equal(moodOf(5, 0), 0);
});

test('the cart offers two different items, common ones first in round 1', () => {
  const d = beginTurn(newRound({ order: ['a', 'b'], rid: 'r1', round: 1 }), ctx);
  assert.ok(d.offer.every(isItem));
  assert.notEqual(d.offer[0], d.offer[1]);
  assert.ok(d.offer.every((i) => ITEMS[i].rarity === 'common'));
  let same = 0;
  for (let i = 0; i < 300; i++) {
    const rng = createRng(`o${i}`);
    const a = drawItem(rng, 50);
    if (drawItem(rng, 50, false, a) === a) same++;
  }
  assert.ok(same < 15, `identical pairs ${same}`);
});

test('straws get likelier as the strain climbs, and an alarmed camel is always offered one', () => {
  assert.ok(strawWeight(85) > strawWeight(60) && strawWeight(60) > strawWeight(10));
  const d = fresh();
  d.mood = 3;
  for (let i = 0; i < 20; i++) {
    beginTurn(d, { ...ctx, seed: i });
    assert.ok(d.offer.includes(STRAW));
  }
});

test("the item you don't pick goes to the next player", () => {
  const d = fresh();
  const other = d.offer[1];
  const { result } = settle(d, 'held');
  assert.equal(result, 'next');
  assert.equal(d.order[d.ti], 'b');
  assert.equal(d.offer[0], other);
  assert.equal(nextPlayer(d), 'c');
});

test('kg that held score, and whoever breaks the camel scores 0 for the round', () => {
  const d = fresh();
  const first = settle(d, 'held');
  const second = settle(d, 'held');
  assert.equal(d.kg.a, ITEMS[first.item].kg);
  assert.equal(d.kg.b, ITEMS[second.item].kg);
  settle(d, 'held');
  const breaker = d.order[d.ti];
  const end = settle(d, 'broke');
  assert.equal(end.result, 'over');
  assert.equal(d.last.r, 'broke');
  assert.equal(d.last.by, breaker);
  const pts = roundPoints(d);
  assert.equal(pts[breaker], 0);
  assert.equal(pts.b, ITEMS[second.item].kg);
});

test('dropping something off the camel ends the round the same way, naming the item', () => {
  const d = fresh();
  settle(d, 'held');
  const by = d.order[d.ti];
  const end = settle(d, 'fell', { fi: 0 });
  assert.equal(end.result, 'over');
  assert.equal(d.last.r, 'fell');
  assert.equal(d.last.by, by);
  assert.ok(isItem(d.last.fell));
  assert.equal(roundPoints(d)[by], 0);
});

test('a skipped player passes the same pair on; a player who left is skipped over', () => {
  const d = fresh(['a', 'b', 'c']);
  const pair = d.offer.slice();
  skipTurn(d, { ...ctx, alive: (id) => id !== 'b' });
  assert.equal(d.order[d.ti], 'c');
  assert.deepEqual(d.offer, pair);
  assert.equal(nextPlayer(d, (id) => id !== 'b'), 'a');
});

test('a round never runs past the turn limit, and nobody loses then', () => {
  const d = fresh(['a', 'b']);
  let result = null;
  for (let i = 0; i < MAX_TURNS + 2 && result !== 'over'; i++) result = settle(d, 'held', { S: 100 }).result;
  assert.equal(result, 'over');
  assert.equal(d.last.r, 'limit');
  assert.ok(Object.values(roundPoints(d)).every((p) => p > 0));
});

test('each round starts with the next player', () => {
  assert.deepEqual(roundOrder(['a', 'b', 'c'], 1), ['a', 'b', 'c']);
  assert.deepEqual(roundOrder(['a', 'b', 'c'], 2), ['b', 'c', 'a']);
  assert.deepEqual(roundOrder(['a', 'b', 'c'], 4), ['a', 'b', 'c']);
  assert.deepEqual(roundOrder([], 3), []);
});

test('a round record from the room is checked before anything draws it', () => {
  const d = fresh();
  assert.ok(checkRecord(d));
  assert.ok(checkRecord(structuredClone(d)));
  const bad = [
    null,
    { ...d, v: 2 },
    { ...d, order: 'abc' },
    { ...d, step: 'dance' },
    { ...d, offer: [1] },
    { ...d, offer: [1, 999] },
    { ...d, snap: [[1, 'x', 0, 0]] },
    { ...d, S: -1 },
    { ...d, mood: 7 },
    { ...d, kg: { a: -5 } },
    { ...d, drop: { item: 1, x: NaN, y: 0, a: 0 } },
    { ...d, ti: 40 },
  ];
  for (const b of bad) assert.equal(checkRecord(b), false, JSON.stringify(b)?.slice(0, 80));
});

test("the daily board takes only true entries, each player's best, best first", () => {
  const today = 20000;
  const by = (id, name = id) => ({ id, name });
  const list = [
    { value: { d: today, kg: 40, t: 2 }, by: by('a', 'Ann') },
    { value: { d: today, kg: 55, t: 2 }, by: by('a', 'Ann') },
    { value: { d: today, kg: 70, t: 3 }, by: by('b', 'Bo') },
    { value: { d: today - 1, kg: 99, t: 3 }, by: by('c') }, // yesterday
    { value: { d: today, kg: 5000, t: 2 }, by: by('d') }, // impossible for town 2
    { value: { d: today, kg: 3.5, t: 2 }, by: by('e') }, // not whole
    { value: { d: today, kg: 10, t: 2 }, by: null },
    'junk',
  ];
  const board = dailyBoard(list, today);
  assert.deepEqual(board.map((e) => [e.id, e.kg]), [['b', 70], ['a', 55]]);
  assert.ok(maxKgByTown(2) >= 70);
  assert.equal(checkDailyEntry({ d: today, kg: maxKgByTown(2) + 1, t: 2 }, today), false);
  assert.deepEqual(dailyBoard(null, today), []);
});

test('each Caravan town the camel is a little weaker', () => {
  const [lo1, hi1] = legBand(1);
  const [lo5, hi5] = legBand(5);
  assert.deepEqual([lo1, hi1], BAND);
  assert.ok(lo5 < lo1 && hi5 < hi1);
});

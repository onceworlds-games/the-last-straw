import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_BY_KEY as K } from '../game/items.js';
import { Sim, createSettle, landing, hoverBox, clampHover, quantDrop, encodeFrames, decodeFrames, poseAt, checkSnap, snapPose, BAND, HOVER } from '../game/physics.js';

/** Lower an item onto the load at x and let it settle. */
function dropOn(snap, key, x, a = 0, options = {}) {
  const item = K[key];
  const sim = new Sim(snap);
  const box = hoverBox(item, a, sim.top());
  const y = landing(sim, item, x, box.yMax, a).y + 0.05;
  const r = createSettle(snap, { item, x, y, a }, { T: Infinity, motion: 'none', ...options });
  r.run();
  return r;
}

function load(keys) {
  let snap = [];
  for (const [key, x] of keys) {
    const r = dropOn(snap, key, x);
    assert.equal(r.verdict.r, 'held', `${key} should hold`);
    snap = r.final();
  }
  return snap;
}

test('a crate set down on the empty tray holds, and the needle moves', () => {
  const r = dropOn([], 'crate', 0);
  assert.equal(r.verdict.r, 'held');
  assert.equal(r.final().length, 1);
  assert.ok(r.verdict.S > 5 && r.verdict.S < BAND[0], `strain ${r.verdict.S}`);
  assert.ok(checkSnap(r.final()));
});

test('weight off to one side strains the camel more than the same weight centred', () => {
  const mid = dropOn([], 'suitcase', 0).verdict.S;
  const side = dropOn([], 'suitcase', 0.9).verdict.S;
  assert.ok(side > mid, `${side} > ${mid}`);
});

test('the same drop settles the same way twice, keyframes and all', () => {
  const snap = load([['rug', 0], ['crate', -0.3], ['books', 0.35]]);
  const drop = { item: K.melon, x: 0.1, y: 3.9, a: 0.2 };
  const a = createSettle(snap, drop, { T: 90 });
  const b = createSettle(snap, drop, { T: 90 });
  a.run();
  b.run();
  assert.deepEqual(a.verdict, b.verdict);
  assert.deepEqual(a.final(), b.final());
  assert.deepEqual(encodeFrames(a.frames), encodeFrames(b.frames));
});

test('a breaking point under the strain breaks the camel', () => {
  const snap = load([['crate', 0], ['suitcase', 0]]);
  const r = dropOn(snap, 'anvil', 0, 0, { T: 30 });
  assert.equal(r.verdict.r, 'broke');
  assert.equal(r.verdict.fi, -1);
});

test('something dropped past the end of the tray falls into the sand', () => {
  const item = K.melon;
  const box = hoverBox(item, 0, new Sim([]).top());
  const r = createSettle([], { item, x: HOVER.xMax, y: box.yMax, a: 0 }, { T: Infinity, motion: 'none' });
  r.run();
  assert.equal(r.verdict.r, 'fell');
  assert.equal(r.verdict.fi, 0);
  assert.ok(r.done);
});

test('keyframes survive the wire', () => {
  const r = createSettle(load([['rug', 0]]), { item: K.crate, x: 0.2, y: 3.4, a: 0.1 }, { T: Infinity });
  r.run();
  const n = r.final().length;
  const wire = JSON.parse(JSON.stringify(encodeFrames(r.frames)));
  const back = decodeFrames(wire, n);
  assert.equal(back.length, r.frames.length);
  for (let i = 0; i < back.length; i++) {
    assert.equal(back[i].s, r.frames[i].s);
    for (let k = 0; k < n * 3; k++) assert.ok(Math.abs(back[i].pose[k] - r.frames[i].pose[k]) <= 0.0006);
  }
  // the last keyframe is where the load ends
  const last = back[back.length - 1].pose;
  const end = snapPose(r.final());
  for (let k = 0; k < n * 3; k++) assert.ok(Math.abs(last[k] - end[k]) < 0.002, `pose ${k}`);
  // junk is refused
  assert.equal(decodeFrames([[1, 2, 3]], n), null);
  assert.equal(decodeFrames([[1, 2, 3, 4, 'x', 0, 0, 0, 0, 0]], 2), null);
  assert.equal(decodeFrames('nope', 1), null);
});

test('poseAt holds the first and last keyframes outside their range', () => {
  const frames = [
    { s: 0, S: 0, saddle: { y: 0, a: 0 }, pose: new Float64Array([0, 1, 0]) },
    { s: 10, S: 10, saddle: { y: 0, a: 0 }, pose: new Float64Array([1, 2, 0.5]) },
  ];
  assert.deepEqual([...poseAt(frames, -5).pose], [0, 1, 0]);
  assert.deepEqual([...poseAt(frames, 50).pose], [1, 2, 0.5]);
  const mid = poseAt(frames, 5);
  assert.ok(Math.abs(mid.pose[0] - 0.5) < 1e-9 && Math.abs(mid.S - 5) < 1e-9);
});

test('a drop is kept inside the hover box and rounded to what travels', () => {
  const top = new Sim([]).top();
  const c = clampHover(K.crate, 9, 99, 0, top);
  const box = hoverBox(K.crate, 0, top);
  assert.equal(c.x, HOVER.xMax);
  assert.equal(c.y, box.yMax);
  const q = quantDrop({ x: 0.123456, y: 3.333333, a: 7 });
  assert.equal(q.x, 0.1235);
  assert.ok(Math.abs(q.a) <= Math.PI);
});

test('checkSnap refuses rows that are not a load', () => {
  assert.equal(checkSnap('x'), false);
  assert.equal(checkSnap([[99, 0, 0, 0]]), false);
  assert.equal(checkSnap([[1, 0.5, 0, 0]]), false);
  assert.equal(checkSnap(new Array(61).fill([1, 0, 0, 0])), false);
  assert.equal(checkSnap([[1, 0, 25000, 0]]), true);
});

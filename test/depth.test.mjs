import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, ITEM_BY_KEY as K, STRAW, FROM_TOWN } from '../game/items.js';
import { createSettle, hoverFloor, hoverBox, CAMEL, LANDING } from '../game/physics.js';
import { twistFor, twistPhysics, TWISTS, softBonus, heldKg } from '../game/rules.js';
import {
  newCaravan, caravanPick, caravanDrop, caravanResolve, caravanSetOff, caravanArrive, caravanDeliver, caravanPerk, caravanRestart,
  canSetOff, payout, loadMult, townOrder, perkCount, drawPerks, runThreshold, runPhysics, legThreshold, RUN, PERKS,
} from '../game/caravan.js';

/** A held verdict for a caravan step (the physics is tested elsewhere). */
const held = (S = 20, extra = {}) => ({ r: 'held', S, top: CAMEL.trayTop + 0.3, fi: -1, soft: false, smash: -1, ...extra });

/** Load one item onto a run's camel with a made-up verdict. */
function load(c, verdict = held()) {
  assert.ok(caravanPick(c, 0));
  const item = c.offer[0];
  caravanDrop(c);
  return { item, result: caravanResolve(c, verdict, c.snap.concat([[item, 0, 30000, 0]])) };
}

test('twists: none in round 1, never the same twice in a row, and each changes the settle', () => {
  for (let seed = 0; seed < 40; seed++) {
    assert.equal(twistFor(seed, 1), '');
    for (let r = 3; r <= 6; r++) assert.notEqual(twistFor(seed, r), twistFor(seed, r - 1), `seed ${seed} round ${r}`);
  }
  assert.ok(Math.abs(twistPhysics('gust', 1, 2).wind) === TWISTS.gust.wind);
  assert.equal(twistPhysics('wobble', 1, 2).wobble, TWISTS.wobble.wobble);
  assert.deepEqual(twistPhysics('', 1, 2), {});
  assert.equal(heldKg(K.crate, 'night'), ITEMS[K.crate].kg * 2);
  assert.equal(heldKg(K.crate, ''), ITEMS[K.crate].kg);
  assert.equal(heldKg(K.crate, '', true), 0);
});

test('soft landings: set down gently it counts as soft, dropped from high it does not; bonuses grow +1, +2, +3', () => {
  const top = CAMEL.trayTop;
  const floor = hoverFloor([], K.crate, 0, 0, top);
  const gentle = createSettle([], { item: K.crate, x: 0, y: floor + 0.03, a: 0 }, { T: Infinity });
  gentle.run();
  assert.equal(gentle.verdict.r, 'held');
  assert.ok(gentle.verdict.soft, 'set down: soft');
  const high = hoverBox(K.crate, 0, top).yMax;
  const dropped = createSettle([], { item: K.crate, x: 0, y: high, a: 0 }, { T: Infinity });
  dropped.run();
  assert.ok(!dropped.verdict.soft, `dropped from ${high.toFixed(2)} m: not soft`);
  assert.deepEqual([1, 2, 3, 4].map(softBonus), [1, 2, 3, 3]);
});

test('a vase dropped from high smashes (scores nothing), set down gently it holds whole', () => {
  const top = CAMEL.trayTop;
  const high = createSettle([], { item: K.vase, x: 0, y: hoverBox(K.vase, 0, top).yMax, a: 0 }, { T: Infinity });
  high.run();
  assert.ok(high.verdict.smash >= 0, 'high: smashed');
  assert.equal(high.verdict.r, 'held', 'a smash does not end the round');
  const low = createSettle([], { item: K.vase, x: 0, y: hoverFloor([], K.vase, 0, 0, top) + 0.03, a: 0 }, { T: Infinity });
  low.run();
  assert.equal(low.verdict.smash, -1);
  assert.ok(LANDING.smash > LANDING.soft);
});

test('a cat walks along the load after it lands, then settles', () => {
  const r = createSettle([], { item: K.cat, x: 0.4, y: hoverFloor([], K.cat, 0.4, 0, CAMEL.trayTop) + 0.05, a: 0 }, { T: Infinity });
  const xs = [];
  while (!r.done) {
    r.run(1);
    xs.push(r.sim.items[0].body.getPosition().x);
  }
  assert.equal(r.verdict.r, 'held');
  assert.ok(Math.max(...xs) - Math.min(...xs) > 0.15, 'it moved along the tray');
});

test('items come onto the cart town by town', () => {
  const c = newCaravan('stock');
  for (let i = 0; i < 40; i++) {
    for (const it of c.offer) assert.ok((FROM_TOWN[ITEMS[it].key] ?? 1) <= 1, `${ITEMS[it].key} not stocked in town 1`);
    caravanPick(c, 0);
    caravanDrop(c);
    caravanResolve(c, held(1), []);
    if (c.step === 'full') break;
    c.snap = [];
    c.load = Math.min(c.load, 2);
  }
});

test('Caravan: no setting off before three loads; the load pays its kg × the load multiplier, double when sweating', () => {
  const c = newCaravan('pay');
  assert.ok(!canSetOff(c));
  let kg = 0;
  for (let i = 0; i < RUN.minLoads; i++) {
    assert.ok(!caravanSetOff(c), `not with ${c.load} loads`);
    kg += heldKg(load(c).item, c.twist);
  }
  assert.ok(canSetOff(c));
  c.mood = 0;
  const calm = payout(c, 0);
  assert.equal(calm.base, kg);
  assert.equal(calm.mult, 1);
  assert.equal(calm.total, kg);
  assert.equal(payout(c, 2).total, kg * RUN.brink);
  assert.equal(loadMult(5), 1 + 2 * RUN.multStep);
  // set off, arrive, unload
  assert.ok(caravanSetOff(c));
  assert.equal(c.step, 'road');
  assert.equal(caravanArrive(c, held(30), c.snap), 'town');
  assert.equal(c.step, 'deliver');
  const paid = caravanDeliver(c);
  assert.equal(paid, c.pay?.total ?? paid);
  assert.equal(c.delivered, paid);
  assert.equal(c.step, 'perk');
  assert.equal(c.perkOffer.length, 3);
});

test('Caravan: short of the town order costs patience; a lost load does too; out of patience the run is over', () => {
  const c = newCaravan('patience');
  for (let i = 0; i < RUN.minLoads; i++) load(c, held(5));
  c.kgLeg = townOrder(c.leg) - 1; // just short
  c.softLeg = 0;
  caravanSetOff(c);
  caravanArrive(c, held(), c.snap);
  assert.ok(c.pay.short);
  caravanDeliver(c);
  assert.equal(c.patience, RUN.patience - 1);
  caravanPerk(c, c.perkOffer.indexOf('water') >= 0 ? (c.perkOffer.indexOf('water') + 1) % 3 : 0);
  assert.equal(c.leg, 2);
  // two broken loads end it
  let r;
  for (let i = 0; i < 5 && c.step !== 'over'; i++) {
    caravanPick(c, 0);
    caravanDrop(c);
    r = caravanResolve(c, { r: 'broke', S: 200, top: 2, fi: -1 }, []);
    if (r === 'lost') assert.ok(caravanRestart(c));
  }
  assert.equal(r, 'over');
  assert.equal(c.patience, 0);
});

test('Caravan: towns want more, the camel weakens, perks stack only as far as they go', () => {
  for (let t = 2; t <= 8; t++) assert.ok(townOrder(t) > townOrder(t - 1));
  const c = newCaravan('perks');
  const base = runThreshold(c);
  c.perks.push('knees');
  assert.ok(Math.abs(runThreshold(c) - base * 1.08) < 1e-9);
  c.perks.push('rails', 'straps', 'gait');
  const ph = runPhysics(c);
  assert.ok(ph.rails > 0 && ph.grip > 0 && ph.sway < 1);
  // a perk taken as often as it stacks is never offered again
  c.perks = ['haggler', 'haggler', 'haggler'];
  for (let leg = 1; leg < 12; leg++) {
    c.leg = leg;
    assert.ok(!drawPerks(c).includes('haggler'));
  }
  for (const k of Object.keys(PERKS)) assert.ok(PERKS[k].stack >= 1 && PERKS[k].name && PERKS[k].line);
  assert.equal(perkCount(c, 'haggler'), 3);
  c.perks = [];
  for (let leg = 2; leg < 8; leg++) assert.ok(legThreshold('perks', leg) <= legThreshold('perks', 1) + 25);
});

test('Caravan: the same day deals the same items, gifts and twists to everyone', () => {
  const a = newCaravan('daily:20000'), b = newCaravan('daily:20000');
  for (let i = 0; i < 6; i++) {
    assert.deepEqual(a.offer, b.offer);
    load(a, held(1));
    load(b, held(1));
    if (a.step === 'full') break;
  }
  a.leg = b.leg = 4;
  assert.deepEqual(drawPerks(a), drawPerks(b));
  assert.equal(twistFor(a.seed, 4), twistFor(b.seed, 4));
});

test('soft landings in a run: the streak pays more each time, a hard landing resets it', () => {
  const c = newCaravan('softs');
  let k = 0;
  for (let i = 0; i < 4; i++) {
    const { item } = load(c, held(5, { soft: true }));
    if (ITEMS[item].kg > 0) {
      k++;
      assert.equal(c.last.bonus, Math.min(3, k), `soft landing ${k} in a row`);
    }
  }
  assert.ok(c.softLeg > 0 && c.softs === k);
  load(c, held(5));
  assert.equal(c.streak, 0);
  assert.ok(STRAW >= 0);
});

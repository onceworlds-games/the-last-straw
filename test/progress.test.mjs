import test from 'node:test';
import assert from 'node:assert/strict';
import {
  xpFor, levelOf, MAX_LEVEL, XP, UNLOCKS, isUnlocked, unlocksOf, lookOf, newUnlocks, goalsFor, goalsToday, track, streakNow,
  streakBonus, addXp, cleanProgress, GOALS, goalLabel, RANKS, rankOf, starsFor, rankMatch,
} from '../game/progress.js';

const fresh = () => cleanProgress({ wins: 0, bestTown: 1, dailies: 0, steady: false, xp: 0 });

test('levels: XP needed grows every level, levelOf inverts it', () => {
  let prevGap = 0;
  for (let l = 2; l <= MAX_LEVEL; l++) {
    const gap = xpFor(l) - xpFor(l - 1);
    assert.ok(gap >= prevGap, `level ${l} needs more than level ${l - 1}`);
    prevGap = gap;
    assert.equal(levelOf(xpFor(l)).level, l);
    assert.equal(levelOf(xpFor(l) - 1).level, l - 1);
  }
  assert.equal(levelOf(0).level, 1);
  assert.equal(levelOf(-5).level, 1);
  assert.equal(levelOf(1e9).level, MAX_LEVEL);
  // about two good Caravan runs a level early on
  assert.ok(xpFor(2) <= 120 && xpFor(5) <= 800, `${xpFor(2)} ${xpFor(5)}`);
});

test("the Stable: what's locked stays off the camel, and earning it unlocks it", () => {
  const p = fresh();
  p.look = { coat: 'gold', blanket: 4, hat: 'crown' };
  assert.deepEqual(lookOf(p), { coat: 'sand', blanket: 0, hat: 'none' });
  const before = { ...p };
  p.xp = xpFor(13);
  const got = newUnlocks(before, p).map((u) => `${u.kind}:${u.id}`);
  assert.ok(got.includes('coat:cream') && got.includes('blanket:4') && got.includes('hat:shades'));
  assert.ok(!got.includes('hat:crown'));
  p.streakBest = 7;
  p.bestTown = 10;
  assert.deepEqual(lookOf(p), { coat: 'gold', blanket: 4, hat: 'crown' });
  for (const kind of ['coat', 'blanket', 'hat', 'sleeve']) assert.ok(unlocksOf(fresh(), kind).length >= 1, `${kind}: something to wear from the start`);
  assert.ok(UNLOCKS.every((u) => u.kind && u.name));
});

test("today's goals: three different ones, the same for everyone that day, and new ones the next day", () => {
  const a = goalsFor(20000), b = goalsFor(20000), c = goalsFor(20001);
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map((g) => g.id)).size, 3);
  assert.notDeepEqual(a, c);
  for (let d = 20000; d < 20060; d++) for (const g of goalsFor(d)) assert.ok(GOALS[g.id] && g.n >= 1 && goalLabel(g).length <= 22, goalLabel(g));
  const p = fresh();
  assert.equal(goalsToday(p, 5).day, 5);
  goalsToday(p, 5).list[0].have = 1;
  assert.equal(goalsToday(p, 5).list[0].have, 1, 'kept through the day');
  assert.equal(goalsToday(p, 6).list[0].have, 0, 'new day, new goals');
});

test('tracking: goals fill, finish once, pay XP; a day with a goal done keeps the streak, a missed day ends it', () => {
  const p = fresh();
  const day = 30000;
  const goals = goalsToday(p, day);
  goals.list = [{ id: 'soft', n: 2, have: 0, done: false }, { id: 'town', n: 3, have: 0, done: false }, { id: 'cat', n: 1, have: 0, done: false }];
  assert.deepEqual(track(p, 'soft', 1, day).done, []);
  const r = track(p, 'soft', 1, day);
  assert.equal(r.done.length, 1);
  assert.equal(r.xp, XP.goal);
  assert.equal(track(p, 'soft', 1, day).done.length, 0, 'done once');
  // 'max' goals take the best value, not the sum
  track(p, 'town', 2, day);
  track(p, 'town', 2, day);
  assert.ok(!goals.list[1].done);
  track(p, 'town', 3, day);
  assert.ok(goals.list[1].done);
  assert.equal(streakNow(p, day), 1);
  // tomorrow: the streak grows and goal XP with it
  goalsToday(p, day + 1).list = [{ id: 'cat', n: 1, have: 0, done: false }, { id: 'vase', n: 1, have: 0, done: false }, { id: 'daily', n: 1, have: 0, done: false }];
  track(p, 'cat', 1, day + 1);
  assert.equal(streakNow(p, day + 1), 2);
  assert.ok(streakBonus(p) > 1);
  // a missed day: gone, and it starts again from 1
  assert.equal(streakNow(p, day + 3), 0);
  goalsToday(p, day + 3).list = [{ id: 'cat', n: 1, have: 0, done: false }, { id: 'vase', n: 1, have: 0, done: false }, { id: 'daily', n: 1, have: 0, done: false }];
  track(p, 'vase', 1, day + 3);
  assert.equal(streakNow(p, day + 3), 1);
  assert.equal(p.streakBest, 2);
});

test('a broken or old save is cleaned, never trusted', () => {
  const p = cleanProgress({ xp: -40, streak: 'x', goals: { day: 1, list: [{ id: 'nope', n: 1, have: 0 }] }, look: 7, streakBest: NaN });
  assert.equal(p.xp, 0);
  assert.deepEqual(p.streak, { day: -9, n: 0 });
  assert.equal(p.goals, null);
  assert.deepEqual(p.look, {});
  assert.equal(p.streakBest, 0);
  assert.equal(addXp(p, 12.6), 13);
  assert.equal(p.xp, 13);
  assert.ok(isUnlocked(p, UNLOCKS[0]));
});

test('trade ranks: a win pays two stars, second of four one, last of three or more loses one; a rank is never lost', () => {
  assert.equal(starsFor(1, 2), 2);
  assert.equal(starsFor(2, 2), 0, 'losing a duel costs nothing');
  assert.equal(starsFor(2, 4), 1);
  assert.equal(starsFor(2, 3), 0);
  assert.equal(starsFor(3, 3), -1);
  assert.equal(starsFor(4, 6), 0);
  assert.equal(starsFor(6, 6), -1);
  assert.equal(starsFor(undefined, 4), 0, 'no place (watching): nothing');
  assert.deepEqual(rankOf(0), { rank: 0, name: 'Peddler', stars: 0, need: 4, total: 0 });
  assert.equal(rankOf(4).name, 'Trader');
  assert.equal(rankOf(4).stars, 0);
  // the top takes a while: a player who wins half their matches needs a couple of dozen
  assert.ok(RANKS.slice(0, -1).reduce((a, r) => a + r.stars, 0) >= 24);
  const sultanAt = RANKS.slice(0, -1).reduce((a, r) => a + r.stars, 0);
  assert.equal(rankOf(sultanAt - 1).name, 'Caravaneer');
  assert.equal(rankOf(sultanAt + 40).name, 'Sultan');
  assert.equal(rankOf(sultanAt + 40).stars, 40);
  const p = cleanProgress({ xp: 0 });
  assert.equal(p.stars, 0);
  assert.equal(rankMatch(p, 4, 4).delta, 0, 'no stars to lose yet');
  rankMatch(p, 1, 4);
  assert.equal(rankMatch(p, 2, 4).delta, 1);
  const up = rankMatch(p, 2, 4);
  assert.ok(up.up && up.after.name === 'Trader' && p.rankBest === 1);
  const down = rankMatch(p, 4, 4);
  assert.equal(down.delta, 0, 'a fresh Trader keeps the rank');
  rankMatch(p, 1, 4);
  assert.equal(rankMatch(p, 4, 4).delta, -1, 'stars inside a rank can go');
  // the Stable's rank prizes come with the rank
  const before = { ...p, rankBest: 0 };
  assert.ok(newUnlocks(before, p).some((u) => u.id === 'fez'));
  assert.ok(!isUnlocked(p, UNLOCKS.find((u) => u.id === 'turban')));
  assert.equal(cleanProgress({ stars: -3 }).stars, 0);
  assert.equal(cleanProgress({ stars: 'x', rankBest: 99 }).rankBest, RANKS.length - 1);
});

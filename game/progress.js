// What a player keeps between visits (in their save): XP and levels, the Stable's unlocks (coats, blankets, hats, sleeves),
// three goals a day and the streak of days with one done. Pure: the page calls it, node tests check it.

import { createRng } from './rng.js';

// ---------------------------------------------------------------- levels

/** XP needed to reach `level` from level 1. */
export const xpFor = (level) => (level <= 1 ? 0 : Math.round((90 * (level - 1) ** 1.45) / 10) * 10);
export const MAX_LEVEL = 40;

/** { level, into (xp past this level), need (xp from this level to the next), frac } */
export function levelOf(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (level < MAX_LEVEL && xpFor(level + 1) <= x) level++;
  const base = xpFor(level);
  const need = level >= MAX_LEVEL ? 1 : xpFor(level + 1) - base;
  const into = level >= MAX_LEVEL ? 1 : x - base;
  return { level, into, need, frac: Math.min(1, into / need) };
}

/** XP for each thing. */
export const XP = { load: 2, soft: 5, kg: 1, match: 20, win: 40, goal: 100 };

// ---------------------------------------------------------------- the Stable

/**
 * Everything the Stable can dress the camel (and your hands) in, and how each is earned: a level, or a feat
 * (`best`: a Caravan run reaching that town; `streak`: days in a row; `badge`: a badge's feat).
 */
export const UNLOCKS = [
  { kind: 'coat', id: 'sand', name: 'Sand' },
  { kind: 'coat', id: 'cream', name: 'Cream', level: 3 },
  { kind: 'coat', id: 'cocoa', name: 'Cocoa', level: 6 },
  { kind: 'coat', id: 'ash', name: 'Ash', level: 10 },
  { kind: 'coat', id: 'rose', name: 'Rose', level: 15 },
  { kind: 'coat', id: 'gold', name: 'Gold', town: 10 },
  { kind: 'blanket', id: 0, name: 'Bazaar' },
  { kind: 'blanket', id: 1, name: 'Sea', level: 2 },
  { kind: 'blanket', id: 2, name: 'Ember', level: 5 },
  { kind: 'blanket', id: 3, name: 'Palm', level: 8 },
  { kind: 'blanket', id: 4, name: 'Night', level: 12 },
  { kind: 'blanket', id: 5, name: 'Candy', streak: 3 },
  { kind: 'hat', id: 'none', name: 'Bare' },
  { kind: 'hat', id: 'sun', name: 'Sun hat', level: 4 },
  { kind: 'hat', id: 'flowers', name: 'Flowers', level: 7 },
  { kind: 'hat', id: 'bandana', name: 'Bandana', level: 9 },
  { kind: 'hat', id: 'shades', name: 'Shades', level: 13 },
  { kind: 'hat', id: 'top', name: 'Top hat', level: 18 },
  { kind: 'hat', id: 'crown', name: 'Crown', streak: 7 },
  { kind: 'sleeve', id: 0, name: 'Plain' },
  { kind: 'sleeve', id: 1, name: 'Stripes', wins: 1 },
  { kind: 'sleeve', id: 2, name: 'Checks', town: 3 },
  { kind: 'sleeve', id: 3, name: 'Stars', dailies: 3 },
  { kind: 'sleeve', id: 4, name: 'Zigzag', level: 11 },
  { kind: 'sleeve', id: 5, name: 'Gold', steady: true },
];

/** What earns this unlock, as a short label ("Level 6", "Town 10", "3-day streak"). */
export function unlockLabel(u) {
  if (u.level) return `Level ${u.level}`;
  if (u.town) return `Town ${u.town}`;
  if (u.streak) return `${u.streak}-day streak`;
  if (u.wins) return 'Win a match';
  if (u.dailies) return `${u.dailies} dailies`;
  if (u.steady) return 'Steady hand';
  return '';
}

/** Whether profile p has earned unlock u. */
export function isUnlocked(p, u) {
  const lv = levelOf(p.xp).level;
  if (u.level) return lv >= u.level;
  if (u.town) return (p.bestTown ?? 1) >= u.town;
  if (u.streak) return (p.streakBest ?? 0) >= u.streak;
  if (u.wins) return (p.wins ?? 0) >= u.wins;
  if (u.dailies) return (p.dailies ?? 0) >= u.dailies;
  if (u.steady) return !!p.steady;
  return true;
}

export const unlocksOf = (p, kind) => UNLOCKS.filter((u) => u.kind === kind && isUnlocked(p, u));

/** The camel's look from the save, every part checked against what is unlocked (anything else falls back to the first). */
export function lookOf(p) {
  const want = p.look && typeof p.look === 'object' ? p.look : {};
  const pick = (kind) => {
    const ok = unlocksOf(p, kind);
    return (ok.find((u) => u.id === want[kind]) ?? ok[0]).id;
  };
  return { coat: pick('coat'), blanket: pick('blanket'), hat: pick('hat') };
}

/** Unlocks that p has now but did not have before (to show what a level-up or a feat just earned). */
export function newUnlocks(before, after) {
  return UNLOCKS.filter((u) => (u.level || u.town || u.streak || u.wins || u.dailies || u.steady) && isUnlocked(after, u) && !isUnlocked(before, u));
}

// ---------------------------------------------------------------- goals

/** Each goal: a short label for n, the sizes it comes in, and the stat that moves it ('max': the best single value counts). */
export const GOALS = {
  kg: { label: (n) => `Deliver ${n} kg`, sizes: [120, 200, 320], stat: 'kg' },
  soft: { label: (n) => `${n} soft landings`, sizes: [5, 8, 12], stat: 'soft' },
  town: { label: (n) => `Reach town ${n}`, sizes: [3, 4, 5], stat: 'town', max: true },
  brink: { label: (n) => (n > 1 ? `Leave sweating ×${n}` : 'Leave sweating'), sizes: [1, 2, 3], stat: 'brink' },
  loads: { label: (n) => `Hold ${n} loads`, sizes: [15, 25, 40], stat: 'loads' },
  cat: { label: () => 'Load the cat', sizes: [1], stat: 'cat' },
  vase: { label: () => 'Land a vase whole', sizes: [1], stat: 'vase' },
  straw: { label: (n) => `Load ${n} straws`, sizes: [4, 6], stat: 'straw' },
  daily: { label: () => 'Play the Daily cart', sizes: [1], stat: 'daily' },
  match: { label: (n) => (n > 1 ? `Play ${n} matches` : 'Play a match'), sizes: [1, 2], stat: 'match' },
};
const GOAL_KEYS = Object.keys(GOALS);
export const STATS = [...new Set(GOAL_KEYS.map((k) => GOALS[k].stat))];

/** Today's three goals (the same for everyone on that day), with growing sizes. */
export function goalsFor(day) {
  const rng = createRng(`goals:${day}`);
  const pool = GOAL_KEYS.slice();
  const out = [];
  while (out.length < 3) {
    const k = pool.splice(rng.int(pool.length), 1)[0];
    const g = GOALS[k];
    const n = g.sizes[Math.min(g.sizes.length - 1, out.length === 0 ? 0 : rng.int(g.sizes.length))];
    out.push({ id: k, n, have: 0, done: false });
  }
  return out;
}

/** The profile's goals for `day` (a new day: new goals). Returns p.goals. */
export function goalsToday(p, day) {
  if (!p.goals || p.goals.day !== day || !Array.isArray(p.goals.list) || p.goals.list.length !== 3) p.goals = { day, list: goalsFor(day) };
  return p.goals;
}

export const goalLabel = (g) => GOALS[g.id]?.label(g.n) ?? '';

/**
 * Something happened (`stat` by `amount`, or reached `amount` for a 'max' goal) on `day`. Moves today's goals, the streak and
 * XP. Returns { done: [goals just finished], xp: xp added }.
 */
export function track(p, stat, amount, day) {
  const goals = goalsToday(p, day);
  const done = [];
  let xp = 0;
  for (const g of goals.list) {
    const def = GOALS[g.id];
    if (!def || def.stat !== stat || g.done) continue;
    g.have = def.max ? Math.max(g.have, amount) : g.have + amount;
    if (g.have >= g.n) {
      g.have = g.n;
      g.done = true;
      done.push(g);
    }
  }
  if (done.length) {
    streakDay(p, day);
    xp += addXp(p, XP.goal * done.length * streakBonus(p));
  }
  return { done, xp };
}

/** A goal done today keeps the streak (yesterday too: it grows; earlier: it starts again). */
export function streakDay(p, day) {
  const s = p.streak && typeof p.streak === 'object' ? p.streak : { day: -9, n: 0 };
  if (s.day === day) return s.n;
  s.n = s.day === day - 1 ? s.n + 1 : 1;
  s.day = day;
  p.streak = s;
  p.streakBest = Math.max(p.streakBest ?? 0, s.n);
  return s.n;
}

/** The streak as it stands on `day` (0 once a day has been missed). */
export function streakNow(p, day) {
  const s = p.streak;
  if (!s || typeof s !== 'object') return 0;
  return s.day === day || s.day === day - 1 ? s.n : 0;
}

/** Goal XP grows 10% for each day of the streak, up to a week. */
export const streakBonus = (p) => 1 + 0.1 * Math.min(7, Math.max(0, (p.streak?.n ?? 1) - 1));

/** Add XP (whole numbers). Returns what was added. */
export function addXp(p, n) {
  const add = Math.max(0, Math.round(n));
  p.xp = Math.max(0, Math.floor(Number(p.xp) || 0)) + add;
  return add;
}

/** A saved profile cleaned up: numbers that are numbers, goals and streak shaped right. */
export function cleanProgress(p) {
  p.xp = Number.isFinite(p.xp) && p.xp >= 0 ? Math.floor(p.xp) : 0;
  p.streakBest = Number.isFinite(p.streakBest) && p.streakBest >= 0 ? Math.floor(p.streakBest) : 0;
  if (!p.streak || typeof p.streak !== 'object' || !Number.isInteger(p.streak.day) || !Number.isInteger(p.streak.n)) p.streak = { day: -9, n: 0 };
  if (p.goals && (typeof p.goals !== 'object' || !Array.isArray(p.goals.list) || !p.goals.list.every((g) => g && GOALS[g.id] && Number.isFinite(g.n) && Number.isFinite(g.have)))) p.goals = null;
  if (!p.look || typeof p.look !== 'object') p.look = {};
  return p;
}

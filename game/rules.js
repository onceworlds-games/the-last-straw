// The rules: the cart, the hidden breaking point, the camel's mood, turns inside a round, scoring, and Caravan's legs.
// Pure: the host's page runs these on `match.data`; node tests run whole matches through them.

import { ITEMS, RARITY, STRAW, isItem } from './items.js';
import { createRng } from './rng.js';
import { BAND, CAMEL, Q, checkSnap, loadTop, HOVER } from './physics.js';

export const TURN_OPTIONS = [10, 15, 25];
export const ROUNDS_OPTIONS = [3, 5];
export const BOTS_OPTIONS = [0, 4, 6];
export const CART_MS = 600; // the cart rolls in before the hourglass starts
export const MAX_TURNS = 40; // a round never runs longer than this (nobody loses then)
export const EASY_TURNS = 3; // round 1: the first new items are common ones

/** The hidden breaking point, always inside the red band the dial shows. Round 1 is sturdier. */
export function drawThreshold(rng, firstRound = false) {
  return firstRound ? rng.range(85, BAND[1]) : rng.range(BAND[0], BAND[1]);
}

/** The camel's face: 0 bored, 1 uneasy, 2 sweating, 3 alarmed (an honest tell of the hidden limit). */
export function moodOf(S, T) {
  if (!(T > 0)) return 0;
  const r = S / T;
  return r < 0.6 ? 0 : r < 0.8 ? 1 : r < 0.93 ? 2 : 3;
}

const COMMON = ITEMS.map((it, i) => (it.rarity === 'common' ? i : -1)).filter((i) => i >= 0);

/** The straw's draw weight: rare on a fresh camel, about a quarter of the cart deep in the red. */
export const strawWeight = (S) => 4 + 60 * Math.min(1, Math.max(0, (S - 40) / 45));

/** One new item from the cart. `easy`: common items only. `avoid`: not this one (no identical pair). */
export function drawItem(rng, S, easy = false, avoid = -1) {
  for (let tries = 0; tries < 2; tries++) {
    let pick = -1;
    if (easy) pick = COMMON[rng.int(COMMON.length)];
    else {
      let total = 0;
      const weights = ITEMS.map((it) => (it.rarity === 'straw' ? strawWeight(S) : RARITY[it.rarity]));
      for (const w of weights) total += w;
      let r = rng.next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r < 0) {
          pick = i;
          break;
        }
      }
      if (pick < 0) pick = weights.length - 1;
    }
    if (pick !== avoid || tries === 1) return pick;
  }
  return 0;
}

export const cartRng = (seed, rid, tn) => createRng(`${seed}:cart:${rid}:${tn}`);

// ---------------------------------------------------------------- a round's record (match.data)

/**
 * A new round. `order`: seat ids in turn order (already rotated). The load starts empty.
 * The record holds everything a page draws and everything a new host needs.
 */
export function newRound({ order, rid, round = 1 }) {
  return {
    v: 1,
    rid,
    round,
    order: order.slice(),
    ti: 0,
    tn: 0,
    step: 'pick',
    until: 0,
    offer: [-1, -1],
    pick: -1,
    carry: -1,
    keep: false,
    snap: [],
    top: Math.round(CAMEL.lipTop * 1000),
    S: 0,
    mood: 0,
    kg: Object.fromEntries(order.map((id) => [id, 0])),
    drop: null,
    t0: 0,
    verdict: null,
    final: null,
    last: null,
    path: null,
    by: '',
  };
}

/** Rotate the seats so round r starts with the next player. */
export const roundOrder = (ids, round) => {
  if (!ids.length) return [];
  const k = (round - 1) % ids.length;
  return ids.slice(k).concat(ids.slice(0, k));
};

export const turnKey = (d) => `${d.rid}.${d.tn}`;
export const placer = (d) => d.order[d.ti] ?? '';

/** Start the next turn (or the first): the offer, the hourglass. */
export function beginTurn(d, { seed, now, turnMs }) {
  d.tn += 1;
  const rng = cartRng(seed, d.rid, d.tn);
  const easy = d.round === 1 && d.tn <= EASY_TURNS;
  const S = d.S / 10;
  if (d.keep && isItem(d.offer[0]) && isItem(d.offer[1])) {
    // the last player was skipped: the same pair passes on
  } else if (isItem(d.carry)) {
    d.offer = [d.carry, drawItem(rng, S, easy, d.carry)];
  } else {
    const a = drawItem(rng, S, easy);
    d.offer = [a, drawItem(rng, S, easy, a)];
  }
  // a camel that looks alarmed always gets offered a straw (the last straw is never far)
  if (d.mood >= 3 && d.offer[0] !== STRAW && d.offer[1] !== STRAW) d.offer[1] = STRAW;
  d.keep = false;
  d.pick = -1;
  d.carry = -1;
  d.step = 'pick';
  d.until = now + CART_MS + turnMs;
  d.drop = null;
  d.t0 = 0;
  d.verdict = null;
  d.final = null;
  d.path = null;
  return d;
}

export function applyPick(d, i) {
  if (d.step !== 'pick' || (i !== 0 && i !== 1)) return false;
  d.pick = i;
  d.carry = d.offer[1 - i];
  d.step = 'place';
  return true;
}

/** The held item (during 'place' and 'settle'). */
export const heldItem = (d) => (d.pick === 0 || d.pick === 1 ? d.offer[d.pick] : -1);

/** The hover box the drop is clamped to (origin y range), for this record's load. */
export function dropBox(d, a) {
  const it = heldItem(d);
  if (!isItem(it)) return null;
  return { item: it, top: d.top / 1000 };
}

export function applyDrop(d, by, drop, now) {
  if (d.step !== 'place') return false;
  d.step = 'settle';
  d.drop = { item: heldItem(d), x: drop.x, y: drop.y, a: drop.a, by };
  d.by = by;
  d.t0 = now;
  d.verdict = null;
  d.final = null;
  return true;
}

/**
 * The host computed the drop: store the verdict and the load as it ends. Applied (`applyVerdict`) when the keyframes
 * have played (`t0 + duration`).
 */
export function storeVerdict(d, verdict, final, mood, steps) {
  d.verdict = { r: verdict.r, at: verdict.at, fi: verdict.fi, S: Math.round(verdict.S * 10), mood, top: Math.round(verdict.top * 1000), steps, impact: Math.round((verdict.impact ?? 0) * 10) };
  d.final = final;
}

/** Milliseconds the settle takes to play (the keyframes), plus a beat to read it. */
export const settleMs = (v) => Math.round(((v.steps ?? v.at) / 60) * 1000) + (v.r === 'held' ? 250 : 0);

/**
 * Apply the stored verdict. Returns 'next' (the next player's turn began) or 'over' (the round ends: `d.last` says why).
 * `alive(id)`: whether a seat still plays (a player who left doesn't).
 */
export function applyVerdict(d, { seed, now, turnMs, alive = () => true }) {
  const v = d.verdict;
  if (!v || d.step !== 'settle') return null;
  const by = d.drop?.by ?? placer(d);
  const item = d.drop?.item ?? -1;
  if (v.r === 'held') {
    d.kg[by] = (d.kg[by] ?? 0) + (ITEMS[item]?.kg ?? 0);
    d.snap = d.final ?? d.snap;
    d.S = v.S;
    d.mood = v.mood;
    d.top = v.top;
    d.last = { r: 'held', by, item };
    if (d.tn >= MAX_TURNS) {
      d.step = 'over';
      d.last = { r: 'limit', by: '', item: -1 };
      return 'over';
    }
    advance(d, alive);
    beginTurn(d, { seed, now, turnMs });
    return 'next';
  }
  const fellItem = v.fi >= 0 && d.final?.[v.fi] ? d.final[v.fi][0] : item;
  d.snap = d.final ?? d.snap;
  d.S = v.S;
  d.mood = 3;
  d.step = 'over';
  d.last = { r: v.r, by, item, fell: v.r === 'fell' ? fellItem : -1 };
  return 'over';
}

/** The placer never played (away, or gone): the same pair goes to the next player. */
export function skipTurn(d, { seed, now, turnMs, alive = () => true }) {
  if (d.step !== 'pick' && d.step !== 'place') return false;
  d.keep = true;
  d.carry = -1;
  advance(d, alive);
  beginTurn(d, { seed, now, turnMs });
  return true;
}

function advance(d, alive) {
  for (let k = 0; k < d.order.length; k++) {
    d.ti = (d.ti + 1) % d.order.length;
    if (alive(d.order[d.ti])) return;
  }
}

/** The next player after the placer (who gets the other item), or ''. */
export function nextPlayer(d, alive = () => true) {
  for (let k = 1; k <= d.order.length; k++) {
    const id = d.order[(d.ti + k) % d.order.length];
    if (alive(id)) return id;
  }
  return '';
}

/** The round's points: kg that held, by seat; the player who broke it (or dropped something) gets 0. */
export function roundPoints(d) {
  const out = {};
  for (const id of d.order) out[id] = d.kg[id] ?? 0;
  if (d.last && (d.last.r === 'broke' || d.last.r === 'fell') && d.last.by) out[d.last.by] = 0;
  return out;
}

// ---------------------------------------------------------------- checking a record read from the room

const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/** Is this a well-formed round record? (A host is somebody's page: check before drawing.) */
export function checkRecord(d) {
  if (!d || typeof d !== 'object' || d.v !== 1) return false;
  if (!isStr(d.rid, 200) || !Array.isArray(d.order) || d.order.length > 30 || !d.order.every((id) => isStr(id, 128))) return false;
  if (!isInt(d.ti, 0, 29) || !isInt(d.tn, 0, 1000) || !['pick', 'place', 'settle', 'over'].includes(d.step)) return false;
  if (!Array.isArray(d.offer) || d.offer.length !== 2 || !d.offer.every((i) => i === -1 || isItem(i))) return false;
  if (!checkSnap(d.snap) || !isInt(d.S, 0, 100000) || !isInt(d.mood, 0, 3) || !isInt(d.top, 0, 100000)) return false;
  if (typeof d.kg !== 'object' || !d.kg || Object.values(d.kg).some((v) => !isInt(v, 0, 100000))) return false;
  if (d.drop !== null && (typeof d.drop !== 'object' || !isItem(d.drop.item) || ![d.drop.x, d.drop.y, d.drop.a].every(Number.isFinite))) return false;
  if (d.final !== null && !checkSnap(d.final, 61)) return false;
  return true;
}

// ---------------------------------------------------------------- Caravan

export const legLoads = (leg) => Math.min(10, 4 + leg);
export const legBand = (leg) => [BAND[0] * 0.96 ** (leg - 1), BAND[1] * 0.96 ** (leg - 1)];
/** The most kg a leg could hold (for checking shared daily entries): every load an anvil. */
export const legMaxKg = (leg) => legLoads(leg) * 18;
export function maxKgByTown(town) {
  let kg = 0;
  for (let leg = 1; leg < town; leg++) kg += legMaxKg(leg);
  return kg;
}

/** The day number (UTC) from the platform's clock, and its seed. */
export const dayNumber = (ms) => Math.floor(ms / 86400000);
export const dailySeed = (day) => `daily:${day}`;

/** A shared daily entry that can be true: today's, whole numbers, and possible for its town. */
export function checkDailyEntry(value, today) {
  if (!value || typeof value !== 'object') return false;
  const { d, kg, t } = value;
  return d === today && isInt(kg, 0, 100000) && isInt(t, 1, 60) && kg <= maxKgByTown(t);
}

/** Today's board from the shared list: valid entries, each player's best, best first. */
export function dailyBoard(list, today, limit = 10) {
  const best = new Map();
  for (const e of Array.isArray(list) ? list : []) {
    const value = e?.value;
    const by = e?.by;
    if (!checkDailyEntry(value, today) || !by || typeof by.id !== 'string' || typeof by.name !== 'string') continue;
    const prev = best.get(by.id);
    if (!prev || value.kg > prev.kg) best.set(by.id, { id: by.id, name: by.name.slice(0, 24), kg: value.kg, town: value.t });
  }
  return [...best.values()].sort((a, b) => b.kg - a.kg).slice(0, limit);
}

export { STRAW, HOVER, Q, loadTop };

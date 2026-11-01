// Caravan (and the Daily cart): a run you build. At each town you load the camel one pick at a time; when you dare, Set
// off: the camel walks the load to the next town, which pays for it (more for every extra load, double if you left with the
// camel sweating). A break or a fall loses that load and one of the camel's patience; when patience runs out the camel quits.
// Every town wants a little more, the camel is a little weaker and the road sways more; each town you reach gives you one
// of three perks. Pure: the page runs it with the physics, node tests run it with the bots.

import { ITEMS, RARITY, STRAW, FROM_TOWN } from './items.js';
import { createRng } from './rng.js';
import { legBand, moodOf, twistFor, TWISTS, heldKg, softBonus } from './rules.js';
import { CAMEL, snapStrain } from './physics.js';

export const RUN = { minLoads: 3, maxLoads: 12, patience: 3, maxPatience: 5, multStep: 0.2, brink: 2 };

/** What the camel can earn at a town. `stack`: how many times it can be taken. */
export const PERKS = {
  knees: { name: 'Strong knees', line: 'Breaks later', stack: 3 },
  rails: { name: 'Tall rails', line: 'Higher sides on the tray', stack: 2 },
  straps: { name: 'Grippy straps', line: 'Loads slide less', stack: 2 },
  gait: { name: 'Steady gait', line: 'Less sway on the road', stack: 2 },
  haggler: { name: 'Haggler', line: '+25% at every town', stack: 3 },
  paws: { name: 'Soft paws', line: 'Soft landings +2 more', stack: 2 },
  water: { name: 'Water skins', line: '+1 patience', stack: 9 },
};
const PERK_KEYS = Object.keys(PERKS);

/** The kg (before the bonus) a town wants delivered. Short of it, the camel loses patience. */
export const townOrder = (town) => 10 + 8 * (Math.max(1, town) - 1);
/** The payout multiplier for a load of `loads` items. */
export const loadMult = (loads) => 1 + RUN.multStep * Math.max(0, loads - RUN.minLoads);
/** How many times perk `k` is in the run. */
export const perkCount = (c, k) => c.perks.filter((p) => p === k).length;

/** A new run. `seed`: any text (the daily's is the day's). */
export function newCaravan(seed) {
  const c = {
    seed: String(seed),
    leg: 1, // the town the camel is loading at
    load: 0, // loads on the camel now
    snap: [],
    delivered: 0,
    kgLeg: 0,
    softLeg: 0,
    streak: 0,
    softs: 0,
    S: 0,
    mood: 0,
    T: 0,
    top: CAMEL.lipTop,
    offer: [-1, -1],
    pick: -1,
    carry: -1,
    step: 'pick',
    draws: 0,
    last: null,
    history: [], // what each town paid
    patience: RUN.patience,
    breaks: 0,
    perks: [],
    perkOffer: [],
    twist: '',
    setOffMood: 0,
    pay: null,
  };
  startTown(c);
  return c;
}

export function legThreshold(seed, leg) {
  const [lo, hi] = legBand(leg);
  return createRng(`${seed}:T:${leg}`).range(lo, hi);
}

/** The breaking point at this town with the run's perks (strong knees add 8% each). */
export const runThreshold = (c) => legThreshold(c.seed, c.leg) * (1 + 0.08 * perkCount(c, 'knees'));
/** The red band the dial shows at this town. */
export const runBand = (c) => legBand(c.leg).map((v) => v * (1 + 0.08 * perkCount(c, 'knees')));

/** The physics options this run adds to every settle and walk. */
export function runPhysics(c) {
  const out = { rails: 0.1 * perkCount(c, 'rails'), grip: 0.3 * perkCount(c, 'straps'), sway: 0.7 ** perkCount(c, 'gait') };
  const t = TWISTS[c.twist];
  if (t?.wind) out.wind = t.wind * 0.8 * (createRng(`${c.seed}:wind:${c.leg}`).next() < 0.5 ? -1 : 1);
  if (t?.wobble) out.wobble = t.wobble;
  return out;
}

function startTown(c) {
  c.load = 0;
  c.kgLeg = 0;
  c.softLeg = 0;
  c.snap = [];
  c.S = 0;
  c.mood = 0;
  c.top = CAMEL.lipTop;
  c.T = runThreshold(c);
  c.twist = c.leg >= 3 ? twistFor(c.seed, c.leg) : '';
  c.carry = -1;
  offer(c);
}

/** Whether an item is on this town's cart yet. */
const stocked = (it, leg) => (FROM_TOWN[it.key] ?? 1) <= leg;

/** A draw that doesn't depend on the player's choices (so a daily deals the same items to everyone). */
function draw(c, avoid = -1) {
  const k = c.draws++;
  const rng = createRng(`${c.seed}:d:${k}`);
  const late = Math.min(1, c.load / 8);
  const heavy = !!TWISTS[c.twist]?.heavy;
  const weights = ITEMS.map((it) => (!stocked(it, c.leg) ? 0 : it.rarity === 'straw' ? 3 + 30 * late : RARITY[it.rarity] * (heavy && it.rarity === 'rare' ? 3 : 1)));
  const total = weights.reduce((a, b) => a + b, 0);
  for (let tries = 0; tries < 2; tries++) {
    let r = rng.next() * total;
    let pick = -1;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0 && weights[i] > 0) {
        pick = i;
        break;
      }
    }
    if (pick < 0) pick = weights.findLastIndex((w) => w > 0);
    if (pick !== avoid || tries === 1) return pick;
  }
  return 0;
}

function offer(c) {
  if (c.carry >= 0) c.offer = [c.carry, draw(c, c.carry)];
  else {
    const a = draw(c);
    c.offer = [a, draw(c, a)];
  }
  if (c.mood >= 3 && c.offer[0] !== STRAW && c.offer[1] !== STRAW) c.offer[1] = STRAW;
  c.pick = -1;
  c.carry = -1;
  c.step = 'pick';
}

export function caravanPick(c, i) {
  if (c.step !== 'pick' || (i !== 0 && i !== 1)) return false;
  c.pick = i;
  c.carry = c.offer[1 - i]; // it stays on the cart for the next pick
  c.step = 'place';
  return true;
}

export const caravanHeld = (c) => (c.pick === 0 || c.pick === 1 ? c.offer[c.pick] : -1);

/** At the town the camel only shifts its weight after a load (the walking is all on the road). */
export const caravanMotion = () => 'shift';

export function caravanDrop(c) {
  if (c.step !== 'place') return false;
  c.step = 'settle';
  return true;
}

/** Lose the load on the camel and one patience. 'over' when the camel quits. */
function loseLoad(c, verdict, final, item) {
  c.patience -= 1;
  c.breaks += 1;
  c.streak = 0;
  c.snap = final;
  c.last = { r: verdict.r, item, fell: verdict.fi >= 0 && final[verdict.fi] ? final[verdict.fi][0] : item };
  if (c.patience <= 0) {
    c.step = 'over';
    return 'over';
  }
  c.step = 'lost';
  return 'lost';
}

/**
 * The settle is over. held: the item stays ('next', or 'full' when the camel can take no more and must set off);
 * fell / broke: the load is lost ('lost': play the beat, then `caravanRestart`; 'over': the camel quits).
 */
export function caravanResolve(c, verdict, final) {
  const item = caravanHeld(c);
  if (verdict.r !== 'held') return loseLoad(c, verdict, final, item);
  const smashed = verdict.smash >= 0;
  c.snap = final;
  c.kgLeg += heldKg(item, c.twist, smashed);
  let bonus = 0;
  if (verdict.soft && ITEMS[item].kg > 0) {
    c.streak = Math.min(3, c.streak + 1);
    bonus = softBonus(c.streak) + 2 * perkCount(c, 'paws');
    c.softLeg += bonus;
    c.softs += 1;
  } else c.streak = 0;
  if (!smashed) c.load += 1;
  c.S = verdict.S;
  c.top = verdict.top;
  c.mood = moodOf(c.S, c.T);
  c.last = { r: 'held', item, soft: verdict.soft ? 1 : 0, bonus, smash: smashed ? 1 : 0 };
  if (c.load >= RUN.maxLoads) {
    c.step = 'full';
    return 'full';
  }
  offer(c);
  return 'next';
}

/** After a lost load: the camel gets up, the same town, an empty tray. */
export function caravanRestart(c) {
  if (c.step !== 'lost') return false;
  startTown(c);
  return true;
}

export const canSetOff = (c) => (c.step === 'pick' || c.step === 'full') && c.load >= RUN.minLoads;

/** Leave for the next town with the load on. */
export function caravanSetOff(c) {
  if (!canSetOff(c)) return false;
  c.setOffMood = c.mood;
  c.step = 'road';
  return true;
}

/** What this load pays at the next town. */
export function payout(c, mood = c.setOffMood) {
  const base = c.kgLeg;
  const mult = loadMult(c.load);
  const brink = mood >= 2 ? RUN.brink : 1;
  const haggle = 1 + 0.25 * perkCount(c, 'haggler');
  const total = Math.round((base * mult * brink + c.softLeg) * haggle);
  return { base, soft: c.softLeg, mult, brink, haggle, total, order: townOrder(c.leg), short: base < townOrder(c.leg) };
}

/** The road is over: held → 'town' (deliver next); fell / broke → 'lost' or 'over'. */
export function caravanArrive(c, verdict, final) {
  if (c.step !== 'road') return null;
  if (verdict.r !== 'held') return loseLoad(c, verdict, final, -1);
  c.snap = final;
  c.S = verdict.S;
  c.top = verdict.top;
  c.pay = payout(c);
  c.step = 'deliver';
  return 'town';
}

/** The load is unloaded at the town: count it, check the order, offer three perks (or 'over' when patience ran out). */
export function caravanDeliver(c) {
  if (c.step !== 'deliver') return 0;
  const pay = c.pay ?? payout(c);
  c.delivered += pay.total;
  c.history.push(pay.total);
  c.snap = [];
  if (pay.short) {
    c.patience -= 1;
    if (c.patience <= 0) {
      c.step = 'over';
      c.last = { r: 'short', item: -1 };
      return pay.total;
    }
  }
  c.perkOffer = drawPerks(c);
  c.step = 'perk';
  return pay.total;
}

/** Three perks for this town (the same for everyone on a daily), never one already taken as often as it can be. */
export function drawPerks(c) {
  const rng = createRng(`${c.seed}:perk:${c.leg}`);
  const pool = PERK_KEYS.filter((k) => perkCount(c, k) < PERKS[k].stack && !(k === 'water' && c.patience >= RUN.maxPatience));
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(rng.int(pool.length), 1)[0]);
  return out;
}

/** Take perk i of the offer and head on: the next town's loading begins. */
export function caravanPerk(c, i) {
  if (c.step !== 'perk' || !c.perkOffer[i]) return false;
  const k = c.perkOffer[i];
  c.perks.push(k);
  if (k === 'water') c.patience = Math.min(RUN.maxPatience, c.patience + 1);
  c.perkOffer = [];
  c.leg += 1;
  c.pay = null;
  startTown(c);
  return true;
}

/** The town the camel is at (1 = the first). */
export const caravanTown = (c) => c.leg;
/** Loads still needed before the camel may set off. */
export const loadsLeft = (c) => Math.max(0, RUN.minLoads - c.load);

export { snapStrain };

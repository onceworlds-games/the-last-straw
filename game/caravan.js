// Caravan (and the Daily cart): one camel, leg after leg. Load it, it walks a few steps after every load, walks into a town
// at the end of a leg and the load is delivered; each town the camel is a little weaker. One break or fall ends the run.
// Pure: the page runs it with the physics, node tests run it with the bots.

import { ITEMS, RARITY, STRAW } from './items.js';
import { createRng } from './rng.js';
import { legLoads, legBand, moodOf } from './rules.js';
import { CAMEL, snapStrain } from './physics.js';

/** A new run. `seed`: any text (the daily's is the day's). */
export function newCaravan(seed) {
  const c = {
    seed: String(seed),
    leg: 1,
    load: 0, // loads set down this leg
    snap: [],
    delivered: 0,
    kgLeg: 0,
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
    history: [], // kg delivered per town
  };
  c.T = legThreshold(c.seed, 1);
  offer(c);
  return c;
}

export function legThreshold(seed, leg) {
  const [lo, hi] = legBand(leg);
  return createRng(`${seed}:T:${leg}`).range(lo, hi);
}

/** A draw that doesn't depend on the player's choices (so a daily deals the same items to everyone). */
function draw(c, avoid = -1) {
  const k = c.draws++;
  const rng = createRng(`${c.seed}:d:${k}`);
  const late = Math.min(1, c.load / Math.max(1, legLoads(c.leg) - 1));
  const weights = ITEMS.map((it) => (it.rarity === 'straw' ? 3 + 30 * late : RARITY[it.rarity]));
  let total = weights.reduce((a, b) => a + b, 0);
  for (let tries = 0; tries < 2; tries++) {
    let r = rng.next() * total;
    let pick = weights.length - 1;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) {
        pick = i;
        break;
      }
    }
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

/** The motion after this load: the walk, or the walk into town after the leg's last load. */
export const caravanMotion = (c) => (c.load + 1 >= legLoads(c.leg) ? 'town' : 'walk');

export function caravanDrop(c) {
  if (c.step !== 'place') return false;
  c.step = 'settle';
  return true;
}

/**
 * The settle is over. held: the load stays (or, at the end of a leg, is delivered: returns 'town');
 * fell / broke: the run is over ('over').
 */
export function caravanResolve(c, verdict, final) {
  const item = caravanHeld(c);
  if (verdict.r !== 'held') {
    c.step = 'over';
    c.snap = final;
    c.last = { r: verdict.r, item, fell: verdict.fi >= 0 && final[verdict.fi] ? final[verdict.fi][0] : item };
    return 'over';
  }
  c.snap = final;
  c.kgLeg += ITEMS[item].kg;
  c.load += 1;
  c.S = verdict.S;
  c.top = verdict.top;
  c.mood = moodOf(c.S, c.T);
  c.last = { r: 'held', item };
  if (c.load >= legLoads(c.leg)) {
    c.step = 'deliver';
    return 'town';
  }
  offer(c);
  return 'next';
}

/** The load reached the town: deliver it, rest the camel a little less than before, start the next leg. */
export function caravanDeliver(c) {
  if (c.step !== 'deliver') return 0;
  const kg = c.kgLeg;
  c.delivered += kg;
  c.history.push(kg);
  c.leg += 1;
  c.load = 0;
  c.kgLeg = 0;
  c.snap = [];
  c.S = 0;
  c.mood = 0;
  c.top = CAMEL.lipTop;
  c.T = legThreshold(c.seed, c.leg);
  offer(c);
  return kg;
}

/** The town the camel is heading for (1 = the first). */
export const caravanTown = (c) => c.leg;
export const loadsLeft = (c) => legLoads(c.leg) - c.load;

export { snapStrain };

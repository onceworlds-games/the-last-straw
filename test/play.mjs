// Whole rounds and matches played through the pure modules, for the tests and the balance numbers.
import { newRound, beginTurn, applyPick, applyDrop, storeVerdict, applyVerdict, roundPoints, roundOrder, drawThreshold, moodOf, heldItem, settleMs } from '../game/rules.js';
import { createSettle } from '../game/physics.js';
import { createPlanner, botPick, personaOf } from '../game/bots.js';
import { createRng } from '../game/rng.js';
import { ITEMS, STRAW } from '../game/items.js';

/**
 * Play one round. seats: [{ id, persona (name), skill, policy? }] where policy(view) can replace the bot's pick/plan.
 * Returns { d, placements, verdict, ms, strawBreak }.
 */
export function playRound({ seats, seed = 'seed', round = 1, turnMs = 15000 }) {
  const rng = createRng(`${seed}:${round}:play`);
  const T = drawThreshold(createRng(`${seed}:${round}:T`), round === 1);
  const d = newRound({ order: roundOrder(seats.map((s) => s.id), round), rid: `${seed}.${round}`, round });
  let now = 1000;
  beginTurn(d, { seed, now, turnMs });
  let placements = 0;
  let ms = 0;
  for (let guard = 0; guard < 60; guard++) {
    const id = d.order[d.ti];
    const seat = seats.find((s) => s.id === id);
    const persona = personaOf(seat.persona);
    const pick = seat.policy?.pick ? seat.policy.pick(d) : botPick({ persona, skill: seat.skill, offer: d.offer, S: d.S / 10, mood: d.mood, rng });
    applyPick(d, pick);
    const item = heldItem(d);
    const planner = createPlanner({ snap: d.snap, item, persona, skill: seat.skill, rng });
    const plan = seat.policy?.plan ? seat.policy.plan(d, item) : planner.finish();
    let drop = { x: plan.x, y: plan.y, a: plan.a };
    if (persona.jitter && rng.chance(persona.jitter)) drop = { x: plan.x + rng.gauss() * 0.15, y: plan.y + 0.25, a: plan.a + rng.gauss() * 0.1 };
    applyDrop(d, id, drop, now);
    const settle = createSettle(d.snap, { item, ...drop }, { T });
    settle.run();
    const v = settle.verdict;
    storeVerdict(d, v, settle.final(), moodOf(v.S, T), settle.frames.length ? settle.frames[settle.frames.length - 1].s : v.at);
    placements++;
    ms += 1500 + 1800 * persona.pace + settleMs(d.verdict);
    now += 5000;
    const r = applyVerdict(d, { seed, now, turnMs });
    if (r === 'over') {
      return { d, placements, verdict: d.last.r, ms, strawBreak: d.last.r === 'broke' && item === STRAW, T, points: roundPoints(d) };
    }
  }
  return { d, placements, verdict: 'limit', ms, strawBreak: false, T, points: roundPoints(d) };
}

/** A whole match: totals by seat. */
export function playMatch({ seats, seed = 'm', rounds = 3 }) {
  const totals = Object.fromEntries(seats.map((s) => [s.id, 0]));
  const log = [];
  for (let r = 1; r <= rounds; r++) {
    const res = playRound({ seats, seed, round: r });
    for (const [id, p] of Object.entries(res.points)) totals[id] += p;
    log.push(res);
  }
  return { totals, log };
}

export const ANIMALS = ['Fennec', 'Tortoise', 'Vulture', 'Gecko', 'Jerboa'];
export const botSeats = (n, seed = 's') => {
  const rng = createRng(`${seed}:seats`);
  return Array.from({ length: n }, (_, i) => ({ id: `bot:${i + 1}`, persona: ANIMALS[i % ANIMALS.length], skill: 0.35 + rng.next() * 0.5 }));
};

export { ITEMS };

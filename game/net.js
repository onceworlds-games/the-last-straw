// The match over the room: the SDK's helpers run the lobby, rounds and results; the host's page runs the turns, the bots and
// every settle's physics, and sends the motion as keyframes. Every other page draws what the host decided.

import { newRound, beginTurn, applyPick, applyDrop, storeVerdict, applyVerdict, skipTurn, roundPoints, roundOrder, drawThreshold, moodOf, heldItem, settleMs, checkRecord, turnKey, placer } from './rules.js';
import { createSettle, encodeFrames, decodeFrames, clampHover, quantDrop, hoverBox, wrapAngle } from './physics.js';
import { createPlanner, botPick, personaOf, carryPath, BOT_NAMES, checkPath } from './bots.js';
import { createRng } from './rng.js';
import { isItem } from './items.js';

export const SETTINGS = [
  { id: 'rounds', label: 'Rounds', options: [3, 5], default: 3 },
  { id: 'turn', label: 'Turn', options: [{ value: 10, label: '10 s' }, { value: 15, label: '15 s' }, { value: 25, label: '25 s' }], default: 15 },
  { id: 'bots', label: 'Bots', options: [{ value: 0, label: 'Off' }, { value: 4, label: 'To 4' }, { value: 6, label: 'To 6' }], default: 4 },
];
export const JOIN = { maxPlayers: 6, minPlayers: 1, lobby: 'bar', ownCountdown: true, settings: SETTINGS };

const optionValues = (s) => s.options.map((o) => (typeof o === 'object' ? o.value : o));
/** The lobby's settings, each one a value the game offers (anything else is its default). */
export function readSettings(raw) {
  const out = {};
  for (const s of SETTINGS) {
    const v = Number(raw?.[s.id]);
    out[s.id] = optionValues(s).includes(v) ? v : s.default;
  }
  return out;
}
export function nextSettingValue(id, current) {
  const s = SETTINGS.find((x) => x.id === id);
  const values = optionValues(s);
  const i = values.indexOf(current);
  return values[(i + 1) % values.length];
}
/** Seats bots fill up to: the setting, but never a lonely match. */
export const botFill = (setting, humans) => (setting > 0 ? setting : humans < 2 ? 2 : 0);

const KF = 'kf';
const isNum = (v, lim = 1e6) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;

/**
 * Wire the match. `lib`: the helpers ({ createMatch, createHost, t, createBots }). `hooks`: onResults(standings, mine),
 * onClose(reason), onFrames(k).
 */
export function createNet(room, lib, hooks = {}) {
  const { createMatch, createHost, t, createBots } = lib;
  const host = createHost(room);
  const me = () => room.me?.id ?? '';
  const seed = () => room.match?.seed ?? 0;
  const turnMs = () => readSettings(room.settings).turn * 1000;
  const frames = new Map(); // turn key → raw keyframe rows by index
  const runners = new Map(); // host: turn key → { runner, sent }
  const botMem = new Map(); // host: turn key → a bot's progress
  let Tmem = { rid: '', T: 0 };
  let lastPresence = '';

  const match = createMatch(room, {
    rounds: 'rounds',
    introSeconds: 2.2,
    roundEndSeconds: 5,
    resultsSeconds: room.kind === 'public' ? 25 : 0,
    admit: 'round',
    tick: 50,
    data: (v) => v === null || checkRecord(v) || 'not a round record',
    startRound(m) {
      const ids = m.seats.filter((s) => !s.left).map((s) => s.id);
      const d = newRound({ order: roundOrder(ids, m.round), rid: m.roundId, round: m.round });
      const T = drawThreshold(createRng(`${seed()}:T:${m.roundId}:${Math.random()}`), m.round === 1);
      Tmem = { rid: d.rid, T };
      try {
        room.setPrivate('tls.T', { rid: d.rid, T });
      } catch {}
      d.th = me();
      beginTurn(d, { seed: seed(), now: room.matchNow(), turnMs: turnMs() });
      return d;
    },
    onTick(m) {
      hostTick(m);
    },
    score: (m) => (checkRecord(m.data) ? roundPoints(m.data) : {}),
    resume() {
      runners.clear();
      botMem.clear();
    },
  });

  const bots = createBots(match, { host, fill: 4, names: BOT_NAMES, skill: [0.35, 0.85], every: 1000, think: () => null });

  function syncFill() {
    if (room.match?.phase !== 'lobby') return;
    const humans = room.online?.length ?? 1;
    bots.setFill(botFill(readSettings(room.settings).bots, humans));
  }
  syncFill();

  // ------------------------------------------------------------ the hidden breaking point (host only)

  function hostT(d) {
    if (Tmem.rid === d.rid) return Tmem.T;
    const mine = room.private?.['tls.T'];
    if (mine && mine.rid === d.rid && isNum(mine.T, 200)) return (Tmem = { rid: d.rid, T: mine.T }).T;
    let theirs = null;
    try {
      theirs = d.th && room.privateOf ? room.privateOf(d.th)?.['tls.T'] : null;
    } catch {}
    let T;
    if (theirs && theirs.rid === d.rid && isNum(theirs.T, 200)) T = theirs.T;
    else T = Math.max(d.S / 10 + 3, drawThreshold(createRng(`${seed()}:T2:${d.rid}:${Math.random()}`), d.round === 1));
    Tmem = { rid: d.rid, T };
    try {
      room.setPrivate('tls.T', { rid: d.rid, T });
    } catch {}
    return T;
  }

  // ------------------------------------------------------------ rpcs

  const pickCall = host.rpc('pick', {
    args: { k: t.string(240), i: t.int(0, 1) },
    rate: 4,
    validate: (from, a) => {
      const d = match.data;
      if (match.phase !== 'round' || !checkRecord(d)) return 'not now';
      if (d.step !== 'pick' || turnKey(d) !== a.k || placer(d) !== from.id) return 'not your pick';
      return true;
    },
    run: (from, a) => {
      match.setData((d) => {
        applyPick(d, a.i);
      });
    },
  });

  const dropCall = host.rpc('drop', {
    args: { k: t.string(240), x: t.number(-100, 100), y: t.number(-100, 100), a: t.number(-100, 100) },
    rate: 4,
    validate: (from, a) => {
      const d = match.data;
      if (match.phase !== 'round' || !checkRecord(d)) return 'not now';
      if (d.step !== 'place' || turnKey(d) !== a.k || placer(d) !== from.id) return 'not your drop';
      if (![a.x, a.y, a.a].every((v) => isNum(v, 100))) return 'bad drop';
      return true;
    },
    run: (from, a) => startSettle(from.id, { x: a.x, y: a.y, a: a.a }),
  });

  // ------------------------------------------------------------ the host's turns

  function startSettle(by, raw) {
    const d = structuredClone(match.data);
    const item = heldItem(d);
    if (!isItem(item)) return;
    const c = clampHover(item, raw.x, raw.y, wrapAngle(raw.a), d.top / 1000);
    const q = quantDrop(c);
    if (!applyDrop(d, by, q, room.matchNow())) return;
    match.setData(d);
    const runner = createSettle(d.snap, { item, ...q }, { T: hostT(d) });
    runners.set(turnKey(d), { runner, sent: 0, k: turnKey(d) });
    pump(d);
  }

  function pump(d) {
    const k = turnKey(d);
    let r = runners.get(k);
    if (!r) {
      // a new host mid-settle: simulate the same drop again
      if (!d.drop) return;
      r = { runner: createSettle(d.snap, { item: d.drop.item, x: d.drop.x, y: d.drop.y, a: d.drop.a }, { T: hostT(d) }), sent: 0, k };
      runners.set(k, r);
    }
    const done = r.runner.runFor(6);
    const fr = r.runner.frames;
    if (fr.length - r.sent >= 12 || (done && fr.length > r.sent)) {
      const batch = fr.slice(r.sent);
      room.send({ tls: KF, k, i: r.sent, f: encodeFrames(batch) });
      storeFrames(k, r.sent, batch, true);
      r.sent = fr.length;
    }
    if (done) {
      const v = r.runner.verdict;
      const last = fr.length ? fr[fr.length - 1].s : v.at;
      match.setData((x) => {
        if (turnKey(x) !== k || x.step !== 'settle') return;
        storeVerdict(x, v, r.runner.final(), v.r === 'held' ? moodOf(v.S, hostT(x)) : 3, last);
      });
      runners.delete(k);
    }
  }

  function hostTick(m) {
    const d0 = m.data;
    if (!checkRecord(d0)) return;
    const now = room.matchNow();
    const k = turnKey(d0);
    const pid = placer(d0);
    const seat = m.seats.find((s) => s.id === pid);
    const alive = (id) => {
      const s = m.seats.find((x) => x.id === id);
      return !!s && !s.left;
    };
    const ctx = { seed: seed(), now, turnMs: turnMs(), alive };
    if (d0.step === 'over') return;
    if ((!seat || seat.left) && d0.step !== 'settle') {
      m.setData((d) => void skipTurn(d, ctx));
      return;
    }
    if (d0.step === 'pick' || d0.step === 'place') {
      if (seat.bot) return botDrive(m, d0, seat, now);
      if (now >= d0.until) {
        if (seat.away) return m.setData((d) => void skipTurn(d, ctx));
        // out of time: the cart picks the left one, and the hands open where they are
        if (d0.step === 'pick') m.setData((d) => void applyPick(d, 0));
        const d = m.data;
        const item = heldItem(d);
        const p = room.players.get(pid)?.presence;
        const box = hoverBox(item, 0, d.top / 1000);
        const h = p && p.k === k && isNum(p.x) && isNum(p.y) && isNum(p.a) ? { x: p.x / 1000, y: p.y / 1000, a: p.a / 1000 } : { x: 0, y: box.yDef, a: 0 };
        startSettle(pid, h);
      }
      return;
    }
    if (d0.step === 'settle') {
      if (!d0.verdict) return pump(d0);
      if (now >= d0.t0 + settleMs(d0.verdict)) {
        let result = null;
        m.setData((d) => {
          result = applyVerdict(d, ctx);
        });
        if (result === 'over') m.endRound(roundPoints(m.data));
      }
    }
  }

  function botDrive(m, d, seat, now) {
    const k = turnKey(d);
    const persona = personaOf(seat.name);
    let b = botMem.get(k);
    if (!b) {
      const rng = createRng(`${seed()}:bot:${k}`);
      b = { rng, pickAt: now + (900 + rng.next() * 1300) * persona.pace, planner: null, plan: null, dropAt: 0, drop: null, early: rng.chance(persona.jitter) };
      botMem.set(k, b);
      for (const key of botMem.keys()) if (key !== k) botMem.delete(key);
    }
    if (d.step === 'pick') {
      if (now >= b.pickAt) host.callAs({ id: seat.id, name: seat.name }, 'pick', { k, i: botPick({ persona, skill: seat.skill, offer: d.offer, S: d.S / 10, mood: d.mood, rng: b.rng }) });
      return;
    }
    // place: plan (spread over ticks), then carry, then let go
    if (!b.plan) {
      if (!b.planner) b.planner = createPlanner({ snap: d.snap, item: heldItem(d), persona, skill: seat.skill, rng: b.rng });
      const end = performance.now() + 7;
      while (!b.plan && performance.now() < end) b.plan = b.planner.work(1);
      if (!b.plan && now >= d.until - 2500) b.plan = b.planner.finish();
      return;
    }
    if (!b.drop) {
      if (d.path && checkPath(d.path)) {
        // a new host carries on the path the last one wrote
        const l = d.path[d.path.length - 1];
        b.drop = { x: l[1], y: l[2], a: l[3] };
        b.dropAt = l[0];
        return;
      }
      const item = heldItem(d);
      const box = hoverBox(item, 0, d.top / 1000);
      const c = carryPath({ from: { x: 0, y: box.yDef, a: 0 }, to: b.plan, persona, rng: b.rng, t0: now + 150, early: b.early });
      b.drop = c.drop;
      b.dropAt = Math.min(c.dropAt, d.until - 300);
      match.setData((x) => {
        if (turnKey(x) === k) x.path = c.path;
      });
      return;
    }
    if (now >= b.dropAt) host.callAs({ id: seat.id, name: seat.name }, 'drop', { k, x: b.drop.x, y: b.drop.y, a: b.drop.a });
  }

  // ------------------------------------------------------------ keyframes (every page)

  function storeFrames(k, i, rows, decoded = false) {
    let list = frames.get(k);
    if (!list) {
      list = [];
      frames.set(k, list);
      if (frames.size > 4) frames.delete(frames.keys().next().value);
    }
    for (let j = 0; j < rows.length; j++) list[i + j] = decoded ? rows[j] : rows[j];
    hooks.onFrames?.(k);
  }

  const offMsg = room.on('message', (data, from) => {
    if (!data || data.tls !== KF || !from || from.id !== room.host) return;
    if (typeof data.k !== 'string' || data.k.length > 240 || !Number.isInteger(data.i) || data.i < 0 || data.i > 400 || !Array.isArray(data.f)) return;
    const first = data.f[0];
    if (!Array.isArray(first)) return;
    const n = (first.length - 4) / 3;
    if (!Number.isInteger(n) || n < 1 || n > 61) return;
    const dec = decodeFrames(data.f, n);
    if (dec) storeFrames(data.k, data.i, dec, true);
  });

  /** The host's keyframes for a turn, in order (gaps skipped). */
  const keyframes = (k) => (frames.get(k) ?? []).filter(Boolean);

  // ------------------------------------------------------------ presence: where the placer's hands are

  function setHover(k, h, sleeve = 0) {
    const p = h ? { k, x: Math.round(h.x * 1000), y: Math.round(h.y * 1000), a: Math.round(h.a * 1000), sl: sleeve } : { sl: sleeve };
    const key = JSON.stringify(p);
    if (key === lastPresence) return;
    lastPresence = key;
    try {
      room.setPresence(p);
    } catch {}
  }

  function hoverOf(id, k) {
    let p = null;
    try {
      p = room.presenceAt ? room.presenceAt(id, { angles: ['a'] }) : room.players.get(id)?.presence;
    } catch {}
    if (!p || p.k !== k || !isNum(p.x, 20000) || !isNum(p.y, 30000) || !isNum(p.a, 100000)) return null;
    return { x: p.x / 1000, y: p.y / 1000, a: p.a / 1000 };
  }

  function sleeveOf(id) {
    const s = room.players.get(id)?.presence?.sl;
    return Number.isInteger(s) && s >= 0 && s < 8 ? s : 0;
  }

  const offs = [
    offMsg,
    room.on('settings', syncFill),
    room.on('join', syncFill),
    room.on('leave', syncFill),
    room.on('starting', syncFill),
    room.on('close', (reason) => hooks.onClose?.(reason)),
  ];
  const offResults = match.on('results', (standings, mine) => hooks.onResults?.(standings, mine));

  return {
    room,
    match,
    host,
    bots,
    get data() {
      const d = match.data;
      return checkRecord(d) ? d : null;
    },
    get isHost() {
      return room.isHost;
    },
    settings: () => readSettings(room.settings),
    setSetting(id, value) {
      try {
        room.setSetting(id, value);
        room.clearReady?.();
      } catch {}
      syncFill();
    },
    pick(k, i) {
      pickCall({ k, i });
    },
    drop(k, h) {
      const q = quantDrop(h);
      dropCall({ k, x: q.x, y: q.y, a: q.a });
    },
    setHover,
    hoverOf,
    sleeveOf,
    keyframes,
    syncFill,
    dispose() {
      for (const off of offs) off?.();
      offResults?.();
      bots.dispose();
      match.dispose();
    },
  };
}

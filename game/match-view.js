// The room's screens: the lobby, the countdown, each round (the turn, the hands, the settle as the host's keyframes, the
// break and the fall), the round's end and the results. Built by main.js with the page's shared state (`app`).

import { ITEMS, STRAW, ANVIL, isItem } from './items.js';
import { hoverBox, clampHover, snapPose, poseAt, wrapAngle, Sim, CAMEL } from './physics.js';
import { turnKey, placer, heldItem, nextPlayer, CART_MS, TWISTS, heldKg } from './rules.js';
import { BIOMES } from './look.js';
import { personaOf, botPick, BOT_NAMES, pathAt, checkPath } from './bots.js';
import { createRng } from './rng.js';
import { SETTINGS, readSettings } from './net.js';
import { createAutoHand, foldAt } from './solo.js';
import { toScreen } from './render.js';
import { buildHeap } from './scene.js';
import { foldPose } from './camel.js';
import { PAL } from './art.js';
import { text, slab, drawSign, drawHint, signpost } from './ui.js';
import { drawDayBoard, rankEmblem, drawRankCard } from './stable.js';
import { goalsToday, levelOf, rankOf } from './progress.js';
import * as audio from './audio.js';

const ow = window.onceworlds;
const STEP_MS = 1000 / 60;
const PLAY_DELAY = 150; // ms the pages play the host's keyframes behind it
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const safe = (fn, fallback) => {
  try {
    return fn();
  } catch (err) {
    console.warn('[the-last-straw]', err);
    return fallback;
  }
};

/** app: { S, fx, hits, autoplay, L (the frame's layout), and the page's helpers }. Returns { roomScene, onResults }. */
export function createMatchView(app) {
  const { S, fx, hits, autoplay, hint, hintDone, award, saveProfile, mySleeve, avatarOf, beginHand, clampHand, ghostOf, doPick, doDrop, landJuice, placeHints, baseScene, today } = app;

  // ------------------------------------------------ the room: lobby, countdown, rounds, results

  const myRank = () => rankOf(S.profile.stars).rank;
  /** A small rank emblem for a player's tag (what they show; nothing for the animals). */
  const emblemOf = (id, me) => {
    const r = me ? myRank() : S.net?.rankOf?.(id);
    return Number.isInteger(r) ? (ctx, x, y, size) => rankEmblem(ctx, x, y, size, r, S.t) : null;
  };

  function seatTags(m, d, phase) {
    const room = S.room;
    const seats = m.seats ?? [];
    const scores = m.scores ?? {};
    const alive = (id) => !!seats.find((s) => s.id === id && !s.left);
    const nextId = d && (d.step === 'place' || d.step === 'settle') ? nextPlayer(d, alive) : '';
    const carry = d && (d.pick === 0 || d.pick === 1) ? d.offer[1 - d.pick] : -1;
    return seats.map((s, i) => {
      let kg = Number(scores[s.id]) || 0;
      if (phase === 'round' && d) kg += d.kg?.[s.id] ?? 0;
      const zero = phase === 'roundEnd' && d?.last && (d.last.r === 'broke' || d.last.r === 'fell') && d.last.by === s.id;
      return {
        id: s.id,
        name: s.name,
        seat: i,
        bot: !!s.bot,
        me: !!s.me,
        host: !s.bot && s.id === room?.host,
        kg,
        active: phase === 'round' && d && d.step !== 'over' && placer(d) === s.id,
        next: s.id === nextId && carry >= 0 ? carry : undefined,
        faded: !!s.left || !!s.away,
        zero,
        avatar: s.bot ? null : avatarOf(s.id),
        emblem: s.bot ? null : emblemOf(s.id, s.me),
      };
    });
  }

  function roomScene(dt, wdt) {
    const net = S.net;
    const room = S.room;
    if (!room || !net) return lobbyScene(null, dt);
    const m = net.match;
    const phase = m.phase;
    if (phase === 'lobby') return lobbyScene(m, dt);
    if (phase === 'countdown') return countdownScene(m);
    if (phase === 'intro') return introScene(m, wdt);
    if (phase === 'results') return resultsScene(m);
    return roundScene(m, dt, wdt);
  }

  function lobbyScene(m, dt) {
    const sc = baseScene();
    const room = S.room;
    audio.setMusic('menu', 0);
    S.camel.stand = Math.max(0, S.camel.stand - dt / 1.6);
    sc.camel.fold = S.camel.stand;
    sc.needle = null;
    // tags: who's here, and the animals that will sit in the empty seats (faded)
    const tags = [];
    if (m && room) {
      const lob = m.lobby;
      const results = m.results;
      lob.players.forEach((p, i) => {
        const res = results?.find?.((r) => r.id === p.id);
        tags.push({ id: p.id, name: p.name, seat: i, me: p.me, host: p.host, kg: res ? Number(res.points) || 0 : 0, label: res ? undefined : p.me ? 'You' : p.ready ? 'Ready' : '·', place: res?.place, avatar: avatarOf(p.id), faded: p.away, emblem: emblemOf(p.id, p.me) });
      });
      const nb = clamp(lob.bots ?? 0, 0, 6 - tags.length);
      for (let i = 0; i < nb; i++) tags.push({ id: `bot:${i}`, name: BOT_NAMES[i % BOT_NAMES.length], seat: tags.length, bot: true, kg: 0, label: '', faded: true, invite: true });
    } else tags.push({ id: S.me.id, name: S.me.name, seat: 0, me: true, kg: 0, label: 'You', avatar: avatarOf(S.me.id), emblem: emblemOf(S.me.id, true) });
    sc.tags = tags;
    // tell the room my sleeves and rank (what my tag shows on their screens)
    safe(() => S.net?.setHover?.(null, null, mySleeve(), myRank()));
    // the cart carries the host's board
    const set = net0settings();
    const can = !!room?.isHost && m?.phase === 'lobby';
    if (m) {
      sc.cart = {
        settings: SETTINGS.map((s) => ({ id: s.id, label: s.label, value: labelOf(s, set[s.id]), can })),
      };
    } else sc.cart = { offer: [-1, -1] };
    // the signposts (solo runs), unless a private server's host has friends waiting
    const friendsWaiting = room && room.kind !== 'public' && room.isHost && (room.online?.length ?? 1) > 1;
    sc.hud.push((ctx) => {
      if (!friendsWaiting) {
        const P = app.L.posts;
        const day = today();
        const dkg = S.daily && S.daily.day === day ? `${S.daily.kg} kg today` : 'New';
        const prof = S.profile;
        const goals = goalsToday(prof, day);
        const doneN = goals.list.filter((g) => g.done).length;
        if (P.board) drawDayBoard(ctx, P.board, { profile: prof, day, t: S.t, hang: true, popId: S.goalPop?.i, popAge: S.goalPop ? S.t - S.goalPop.at : null });
        signpost(ctx, P.stable, 'Stable', P.board ? (S.fresh.size ? 'New look' : `Level ${levelOf(prof.xp).level}`) : `Lv ${levelOf(prof.xp).level} · ${doneN}/3 goals`, { post: 0, color: S.fresh.size ? '#FFE7A3' : undefined });
        signpost(ctx, P.caravan, 'Caravan', prof.best > 0 ? `Best ${prof.best} kg` : 'Go solo', { post: 0 });
        signpost(ctx, P.daily, 'Daily cart', dkg, { post: app.L.portrait ? 0 : Math.max(0, app.L.gy - P.daily.y - P.daily.h) });
        if (P.board) hits.add(P.board, 'stable');
        hits.add(P.stable, 'stable');
        hits.add(P.caravan, 'caravan');
        hits.add(P.daily, 'daily');
      }
      if (m && room?.spectating) drawHint(ctx, 'Next match', app.L.center.x, app.L.rope.y + app.L.rope.h + 30, S.t);
    });
    return sc;
  }

  const labelOf = (s, v) => {
    const o = s.options.find((x) => (typeof x === 'object' ? x.value : x) === v);
    return o === undefined ? String(v) : typeof o === 'object' ? o.label : String(o);
  };
  const net0settings = () => (S.net ? S.net.settings() : readSettings(null));

  function countdownScene(m) {
    const sc = baseScene();
    audio.setMusic('menu', 0);
    sc.tags = seatTags(m, null, 'countdown');
    sc.needle = 0;
    const left = m.countdown ?? 0;
    const n = Math.ceil(left);
    if (n !== S.countdownN && n > 0 && n <= 3) {
      S.countdownN = n;
      audio.drum(n === 1);
    }
    sc.onSun = (ctx, x, y, r) => {
      if (n <= 0 || n > 3) return;
      const k = 1 - (n - left);
      text(ctx, String(n), x, y + r * 0.04, { size: r * (1.2 + k * 0.15), display: true, weight: 900, color: PAL.ink, outline: false });
    };
    sc.lanterns = { n: readSettings(S.room?.settings).rounds, lit: 0 };
    return sc;
  }

  function introScene(m, wdt) {
    const sc = baseScene();
    audio.setMusic('play', 0);
    sc.tags = seatTags(m, null, 'intro');
    sc.needle = 0;
    const key = `${m.roundId}`;
    if (S.introKey !== key) {
      S.introKey = key;
      S.introAt = S.t;
      S.camel.stand = S.lastRoundEnd === 'broke' ? 1 : 0;
      if (m.round === 1) audio.brass([293.7, 440]);
      else audio.drum(true);
      S.beat = null;
      S.pred = null;
      S.rankRes = null;
      fx.clear();
    }
    S.camel.stand = Math.max(0, S.camel.stand - wdt / 1.5);
    sc.camel.fold = S.camel.stand;
    const d = S.net?.data;
    const twist = d && d.round === m.round ? d.twist : '';
    setLight(sc, m, twist);
    sc.lanterns = { n: m.rounds, lit: m.round };
    const age = S.t - S.introAt;
    const big = app.L.phone ? 48 : 64;
    const tw = TWISTS[twist];
    sc.sign = {
      lines: m.round === 1 ? [{ s: 'Load!', size: app.L.phone ? 56 : 80 }] : tw ? [{ s: `Round ${m.round}`, size: big * 0.6, color: PAL.violet }, { s: tw.name, size: big, color: PAL.roseDark }, { s: tw.line, size: 22, display: false }] : [{ s: `Round ${m.round}`, size: big }],
      drop: clamp(age / 0.35, 0, 1),
    };
    if (tw && S.twistSaid !== m.roundId) {
      S.twistSaid = m.roundId;
      audio.brass([392, 523.3]);
    }
    return sc;
  }

  const sunFor = (m) => clamp(((m.round || 1) - 1) / Math.max(1, (m.rounds || 3) - 1), 0, 1) * 0.75;
  const nightFor = (m) => clamp(((m.round || 1) - 2) / Math.max(1, (m.rounds || 3) - 1), 0, 1) * 0.7;
  /** The match's place (from its seed) and the hour (gold hour in round 1 to dusk; the night market is at night). */
  const LANDS = ['market', 'oasis', 'canyon', 'salt', 'ruins'];
  function setLight(sc, m, twist) {
    const seed = String(m.seed ?? S.room?.match?.seed ?? '0');
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    sc.biome = twist === 'night' ? 'night' : LANDS[h % LANDS.length];
    sc.tod = twist === 'night' ? 0.95 : clamp(((m.round || 1) - 1) / Math.max(1, (m.rounds || 3) - 1), 0, 1) * 0.6;
  }

  function roundScene(m, dt, wdt) {
    const net = S.net;
    const room = S.room;
    const sc = baseScene();
    const d = net.data;
    const phase = m.phase;
    sc.tags = seatTags(m, d, phase);
    setLight(sc, m, d?.twist ?? '');
    sc.twist = d?.twist ?? '';
    sc.lanterns = { n: m.rounds, lit: m.round };
    if (!d) {
      sc.needle = 0;
      return sc;
    }
    const now = room.matchNow();
    const k = turnKey(d);
    noticeChanges(m, d);
    const seats = m.seats ?? [];
    const pid = placer(d);
    const seat = seats.find((s) => s.id === pid);
    const seatIx = Math.max(0, seats.findIndex((s) => s.id === pid));
    const mine = pid === S.me.id && !room.spectating;
    const whoOf = (s, i) => (s?.bot ? { kind: 'bot', fur: personaOf(s.name).fur } : { kind: 'player', seat: i, sleeve: s?.me ? mySleeve() : net.sleeveOf(s?.id) });

    let view = null; // { items, saddle, S }
    const snapItems = () => {
      const p = snapPose(d.snap);
      return d.snap.map((r, i) => ({ item: r[0], x: p[i * 3], y: p[i * 3 + 1], a: p[i * 3 + 2] }));
    };

    if ((d.step === 'settle' || d.step === 'over' || (S.pred && S.pred.k === k)) && (d.drop || (S.pred && S.pred.k === k))) view = settleView(d, now, dt, wdt);
    if (!view) view = { items: snapItems(), saddle: { y: 0, a: 0 }, S: d.S / 10 };

    sc.items = view.items;
    sc.saddle = view.saddle;
    sc.needle = view.S;
    sc.crack = view.crack ?? 0;
    sc.camel.fold = view.fold ?? 0;
    sc.camel.knocked = !!view.knocked;
    sc.camel.mood = view.mood ?? d.mood;
    const top = d.top / 1000;
    // the hover zone stays in the picture all round, so the camera only eases out as the load grows (never pumps each turn)
    sc.box.y1 = Math.max(3.0, top + 1.0);

    // hands
    if (d.step === 'place' && !(S.pred && S.pred.k === k)) {
      const item = heldItem(d);
      if (mine && S.hand && S.hand.key === k) {
        sc.hands = { item, x: S.hand.x, y: S.hand.y, a: S.hand.a, who: whoOf(seat, seatIx), open: 0, visible: true };
        sc.ghost = ghostOf(d.snap, k);
        // presence: where my hands are
        net.setHover(k, S.hand, mySleeve(), myRank());
      } else {
        let h = null;
        if (seat?.bot && checkPath(d.path)) h = pathAt(d.path, now);
        else if (!seat?.bot) h = net.hoverOf(pid, k);
        if (!h) {
          const box = hoverBox(item, 0, top);
          h = { x: Math.sin(S.t * 1.3) * 0.05, y: box.yDef + Math.sin(S.t * 2) * 0.03, a: 0 };
        }
        const c = clampHover(item, h.x, h.y, h.a, top);
        sc.hands = { item, x: c.x, y: c.y, a: h.a, who: whoOf(seat, seatIx), open: 0, visible: true };
      }
    }
    if (view.handsAfter) sc.handsAfter = { ...view.handsAfter, who: whoOf(seats.find((s) => s.id === (d.drop?.by ?? pid)), seats.findIndex((s) => s.id === (d.drop?.by ?? pid))) };

    // my turn: pick, then place
    if (mine && phase === 'round') {
      if (d.step === 'pick') {
        S.hand = null;
        if (autoplay) autoPick(d, now);
        hint('pick', 'Pick one', 'cart');
      } else if (d.step === 'place' && !(S.pred && S.pred.k === k)) {
        if (!S.hand || S.hand.key !== k) beginHand(d.snap, heldItem(d), top, k);
        if (autoplay) autoPlace(d, now);
        else placeHints();
        if (S.pickedAt && S.t - S.pickedAt < 2.5) {
          const nx = nextPlayer(d, (id) => !!seats.find((s) => s.id === id && !s.left));
          const ns = seats.find((s) => s.id === nx);
          if (ns && ns.id !== S.me.id) hint('next', `${ns.name.slice(0, 14)} gets the other`, `tag:${ns.id}`);
        }
      }
    } else if (S.hand && !S.pred) S.hand = null;

    // the cart: the offer, the hourglass
    const left = Math.max(0, d.until - now);
    const turnMs = readSettings(room.settings).turn * 1000;
    sc.cart = {
      offer: d.offer.slice(),
      hide: d.step === 'pick' ? -1 : d.pick,
      big: mine && d.step === 'pick',
      sel: mine ? S.cartSel : -1,
      keys: mine && !S.touch,
      hourglass: d.step === 'pick' || d.step === 'place' ? clamp(left / (turnMs + CART_MS), 0, 1) : null,
      secs: d.step === 'pick' || d.step === 'place' ? Math.ceil(left / 1000) : undefined,
      roll: d.step === 'pick' ? Math.max(0, 1 - (turnMs + CART_MS - left) / CART_MS) : 0,
    };
    if ((d.step === 'pick' || d.step === 'place') && left < 5000 && left > 0) {
      const sec = Math.ceil(left / 1000);
      if (sec !== S.lastTick) {
        S.lastTick = sec;
        if (mine) audio.tick(sec <= 3);
      }
    }
    // the needle's hints
    if (mine || S.screen === 'game') {
      const SS = view.S;
      // (only between drops: never over a load coming down)
      const calm = d.step === 'pick' || d.step === 'place';
      if (SS >= 50 && SS < 70 && calm) hint('needle', 'Watch the needle', 'dial');
      else if (SS >= 70 && calm) hint('red', 'Every item counts', 'dial');
      if (SS >= 70) hintDone('needle');
    }
    // the round's end: the sign
    if (phase === 'roundEnd' || d.step === 'over') roundEndSign(m, d, sc);
    // music speeds up with the strain
    audio.setMusic('play', clamp(view.S / 90, 0, 1));
    if (room.spectating) sc.hud.push((ctx) => drawHint(ctx, 'Next round', app.L.cart.x + app.L.cart.w / 2, app.L.cart.y - 18, S.t));
    return sc;
  }

  /** The settle as this page shows it: my own prediction blending into the host's keyframes, or the host's keyframes. */
  function settleView(d, now, dt, wdt) {
    const net = S.net;
    const k = turnKey(d);
    const v = d.verdict;
    const pred = S.pred && S.pred.k === k ? S.pred : null;
    if (S.play.k !== k) S.play = { k, s: 0, lastS: null, contact: false };
    const P = S.play;
    const frames = net.keyframes(k);
    const n = (d.drop ? d.snap.length + 1 : pred ? pred.runner.sim.items.length : 0) || 1;
    const good = frames.length && frames[0].pose.length === n * 3 ? frames : [];
    const lastS = good.length ? good[good.length - 1].s : -1;
    const ids = d.drop ? d.snap.map((r) => r[0]).concat([d.drop.item]) : pred.runner.sim.items.map((it) => it.item);

    // the playback clock: real time, slowed for a fall, never ahead of the host (unless it's my own drop)
    let rate = 1;
    if (v && v.r === 'fell' && P.s >= v.at - 40) rate = 0.35;
    if (S.beat && S.beat.k === k) rate = 0;
    let s = P.s + dt * 60 * rate;
    if (!pred) {
      const sNet = d.t0 ? (now - d.t0 - PLAY_DELAY) / STEP_MS : 0;
      if (s > sNet) s = Math.max(P.s, sNet);
      if (sNet - s > 70 && !(v && v.r === 'fell')) s = sNet - 8;
      if (lastS >= 0 && s > lastS && v) s = Math.max(P.s, Math.min(s, lastS + 1));
    }
    P.s = Math.max(0, s);

    let pose = null;
    let SS = d.S / 10;
    let saddle = { y: 0, a: 0 };
    if (pred) {
      // run my own world up to the same step
      const target = Math.floor(P.s);
      let g = 0;
      while (pred.runner.sim.steps < target && !pred.runner.done && g++ < 10) pred.runner.run(1);
      pose = pred.runner.sim.pose();
      saddle = pred.runner.sim.saddlePose();
      SS = pred.runner.strain;
      if (good.length && lastS >= pred.runner.sim.steps - 2) {
        if (pred.wStart === null) pred.wStart = S.t;
      }
      if (good.length && v && lastS < P.s) pred.wStart ??= S.t;
      if (pred.wStart !== null) {
        const w = clamp((S.t - pred.wStart) / 0.3, 0, 1);
        const h = poseAt(good, Math.min(P.s, lastS));
        if (h && h.pose.length === pose.length) {
          const out = new Float64Array(pose.length);
          for (let i = 0; i < pose.length; i++) out[i] = i % 3 === 2 ? pose[i] + wrapAngle(h.pose[i] - pose[i]) * w : pose[i] + (h.pose[i] - pose[i]) * w;
          pose = out;
          saddle = { y: saddle.y + (h.saddle.y - saddle.y) * w, a: saddle.a + (h.saddle.a - saddle.a) * w };
          SS = SS + (h.S - SS) * w;
        }
      }
      // the host refused it (or never heard it): let it go after a while
      if (d.step === 'place' && S.t - pred.at > 2.5) S.pred = null;
    } else if (good.length) {
      const h = poseAt(good, P.s);
      pose = h.pose;
      saddle = h.saddle;
      SS = h.S;
    } else if (d.drop) {
      // nothing from the host yet: the item hangs where it was let go
      const p = snapPose(d.snap);
      pose = new Float64Array(p.length + 3);
      pose.set(p);
      pose[p.length] = d.drop.x;
      pose[p.length + 1] = d.drop.y;
      pose[p.length + 2] = d.drop.a;
    }
    if (!pose) return null;

    // the landing: the strain jumps as the item first touches
    if (P.lastS !== null && !P.contact && SS > P.lastS + 1.5) {
      P.contact = true;
      const ni = ids.length - 1;
      landJuice(ids[ni], pose[ni * 3], pose[ni * 3 + 1], (ITEMS[ids[ni]]?.kg ?? 0) * 0.6 + (SS - P.lastS));
    }
    P.lastS = SS;

    let items = ids.map((item, i) => ({ item, x: pose[i * 3], y: pose[i * 3 + 1], a: pose[i * 3 + 2] }));
    const ni = ids.length - 1;
    const smashAt = v && v.smash >= 0 ? v.smash : pred && pred.runner.smashAt >= 0 ? pred.runner.smashAt : -1;
    if (smashAt >= 0 && P.s >= smashAt) {
      if (!P.smashSeen) {
        P.smashSeen = true;
        const it = items[ni];
        app.smashJuice?.(ids[ni], it?.y > -1 ? it.x : d.drop?.x ?? 0, it?.y > -1 ? it.y : (d.top ?? 2400) / 1000);
      }
      items[ni] = null;
    }
    // a strolling cat: legs move while it walks
    const cat = items[ni];
    if (cat && ITEMS[cat.item]?.walks && P.contact) {
      const dx = cat.x - (P.catX ?? cat.x);
      P.catX = cat.x;
      if (Math.abs(dx) > 0.0015) {
        cat.walking = true;
        cat.dir = dx > 0 ? 1 : -1;
        P.catDir = cat.dir;
        P.catWalkT = S.t;
      } else if (S.t - (P.catWalkT ?? -9) < 0.12) {
        cat.walking = true;
        cat.dir = P.catDir;
      }
    }
    items = items.filter((it) => it && it.y > -1);
    const out = { items, saddle, S: SS, mood: d.step === 'over' ? 3 : d.mood };
    // the hands opening and rising away
    const steps = P.s;
    if (steps < 24 && d.drop) out.handsAfter = { item: d.drop.item, x: d.drop.x, y: d.drop.y + (steps / 24) * 0.4, a: d.drop.a, open: 1, visible: true, alpha: 1 - steps / 24 };

    // a fall: the item that fell, outlined, in slow motion; a puff where it lands
    if (v && v.r === 'fell' && P.s >= v.at - 24) {
      if (items[v.fi]) items[v.fi].outline = PAL.rose;
      if (!P.fallSeen && P.s >= v.at) {
        P.fallSeen = true;
        const it = items[v.fi];
        fx.puff(it ? it.x : 0, 0.02, 18, 1.3);
        audio.snort();
        audio.thud();
      }
    }
    // a break: freeze, the crack, the deckchair fold
    if (v && v.r === 'broke' && P.s >= v.at - 0.5 && d.final) {
      if (!S.beat || S.beat.k !== k) startCollapse(k, d.final);
    }
    if (S.beat && S.beat.k === k) {
      const b = S.beat;
      b.t += wdt;
      b.acc += wdt * 60;
      let g = 0;
      while (b.acc >= 1 && g++ < 6) {
        b.sim.step();
        b.acc -= 1;
        if (!b.collapsed && foldAt(b.sim.motionT) >= 0.98) {
          b.collapsed = true;
          audio.clatter();
          fx.shake(0.6);
          fx.puff(-0.8, 0.02, 14, 1.4);
          fx.puff(0.9, 0.02, 14, 1.4);
        }
      }
      const p = b.sim.pose();
      out.items = b.sim.items.map((it, i) => ({ item: it.item, x: p[i * 3], y: p[i * 3 + 1], a: p[i * 3 + 2] }));
      out.saddle = { y: 0, a: 0 };
      out.fold = foldAt(b.sim.motionT);
      out.crack = clamp(b.t / 0.25, 0, 1);
      out.knocked = out.fold > 0.55;
      out.S = 100;
      out.mood = 3;
    }
    return out;
  }

  function startCollapse(k, final) {
    const sim = new Sim(final, { broken: true });
    sim.motion = (t) => foldPose(foldAt(t));
    S.beat = { k, t: 0, acc: 0, sim, collapsed: false };
    S.lastRoundEnd = 'broke';
    fx.hitStop(0.08, 0.8, 0.3);
    fx.shake(0.8);
    fx.splinters(0, CAMEL.trayTop, 18);
    audio.crack();
    audio.whoosh();
  }


  /** Things that happened since the last frame: the cart's new pair, a pick, a placement that held, the round's end. */
  function noticeChanges(m, d) {
    const seen = S.seen;
    const k = turnKey(d);
    if (seen.rid !== d.rid) {
      seen.rid = d.rid;
      seen.k = '';
      S.pred = null;
      S.beat = null;
      S.play = { k: '', s: 0, lastS: null, contact: false };
      S.cartSel = -1;
    }
    if (seen.k !== k) {
      // the turn before this one ended
      if (seen.k && d.last && d.last.r === 'held' && isItem(d.last.item)) {
        const kg = heldKg(d.last.item, d.twist, !!d.last.smash);
        const tag = S.tagPos?.get(d.last.by);
        const it = d.last.smash ? null : d.snap[d.snap.length - 1];
        if (S.cam) {
          const p = it ? toScreen(S.cam, it[1] / 10000, it[2] / 10000) : toScreen(S.cam, d.drop?.x ?? 0, (d.top ?? 2400) / 1000);
          if (d.last.smash) fx.floater('Smashed', p.x, p.y - 10, null, PAL.rose);
          else fx.floater(kg > 0 ? `+${kg}` : '+0', p.x, p.y, tag ? { x: tag.x, y: tag.y } : null, PAL.turq);
          if (d.last.soft && d.last.bonus > 0) {
            const n = d.streak?.[d.last.by] ?? 1;
            fx.floater(n > 1 ? `Soft ×${n} +${d.last.bonus}` : `Soft +${d.last.bonus}`, p.x, p.y - 34, tag ? { x: tag.x, y: tag.y } : null, PAL.gold, 0.25);
            audio.soft?.(n);
          }
        }
        audio.grumble(d.mood);
        if (d.last.by === S.me.id && S.lastDrop) {
          award('first-load');
          if (d.S >= 850) {
            award('steady-hand');
            if (!S.profile.steady) {
              S.profile.steady = true;
              saveProfile();
            }
          }
          if (d.top >= (CAMEL.trayTop + 3) * 1000) award('high-rise');
          app.myLoadHeld?.({ item: d.last.item, soft: !!d.last.soft && d.last.bonus > 0, smash: !!d.last.smash });
        }
      }
      seen.k = k;
      seen.step = d.step;
      S.pred = S.pred && S.pred.k === k ? S.pred : null;
      S.cartSel = -1;
      S.lastTick = -1;
      if (d.step === 'pick') audio.scrape();
    } else if (seen.step !== d.step) {
      if (d.step === 'place' && placer(d) !== S.me.id) audio.tok();
      if (d.step === 'settle' && placer(d) !== S.me.id) {
        audio.whup();
        audio.whistle(ITEMS[d.drop?.item]?.kg ?? 0);
        S.camel.lookT = 1.6;
      }
      if (d.step === 'over') {
        if (d.last?.r === 'fell') S.lastRoundEnd = 'fell';
        if (d.last && (d.last.r === 'broke' || d.last.r === 'fell')) {
          if (d.last.by === S.me.id && d.last.r === 'broke' && d.last.item === STRAW) award('last-straw');
          const g = S.gift;
          if (g && g.rid === d.rid && g.tn === d.tn && g.to === d.last.by && d.last.item === ANVIL) award('anvil-gift');
        }
      }
      seen.step = d.step;
    }
    // remember each round's load for the results' heap
    if (d.step === 'over' && !S.roundsSeen.has(d.rid)) {
      S.roundsSeen.add(d.rid);
      const rows = (d.final ?? d.snap).map((r) => r[0]);
      S.roundItems.push(...rows);
    }
  }

  function roundEndSign(m, d, sc) {
    const last = d.last;
    if (!last) return;
    const seats = m.seats ?? [];
    const name = seats.find((s) => s.id === last.by)?.name ?? 'Someone';
    let lines;
    if (last.r === 'broke' && last.item === STRAW) lines = [{ s: 'The last straw', size: app.L.phone ? 48 : 72, color: PAL.roseDark }, { s: `${name} broke its back`, size: 26 }];
    else if (last.r === 'broke') lines = [{ s: `${name} broke its back`, size: app.L.phone ? 34 : 50 }, { s: `with the ${ITEMS[last.item]?.name ?? 'load'}`, size: 24, color: PAL.violet }];
    else if (last.r === 'fell') lines = [{ s: `${name} dropped the ${ITEMS[last.fell >= 0 ? last.fell : last.item]?.name ?? 'load'}`, size: app.L.phone ? 30 : 46 }];
    else lines = [{ s: 'The camel held!', size: app.L.phone ? 40 : 56 }];
    // wait for the moment to play out
    const key = `${d.rid}`;
    if (S.signKey !== key) {
      const ready = last.r === 'broke' ? S.beat && S.beat.k === turnKey(d) && S.beat.t > 1.3 : last.r === 'fell' ? S.play.k === turnKey(d) && S.play.s >= (d.verdict?.at ?? 0) + 10 : true;
      if (m.phase === 'roundEnd' && S.roundEndKey !== key) {
        S.roundEndKey = key;
        S.roundEndSeen = S.t;
      }
      // only this round's end counts (an earlier round's time would drop the sign before the collapse plays)
      const late = m.phase === 'roundEnd' && S.roundEndKey === key && S.t - S.roundEndSeen > 2.6;
      if (!ready && !late) return;
      S.signKey = key;
      S.signAt = S.t;
      audio.thud();
    }
    sc.sign = { lines, drop: clamp((S.t - S.signAt) / 0.35, 0, 1) };
  }

  function resultsScene(m) {
    const sc = baseScene();
    audio.setMusic('menu', 0);
    const res = m.results ?? m.standings ?? [];
    const key = m.roundId ?? 'r';
    if (S.resultsKey !== key) {
      S.resultsKey = key;
      S.resultsAt = S.t;
      audio.fanfare();
      fx.confetti(app.L.W, 80);
    }
    sc.camel.fold = 1;
    sc.camel.knocked = false;
    sc.camel.chew = true;
    sc.tod = 0.9;
    sc.biome = 'night';
    sc.needle = null;
    // the heap of the match's junk, the winner's last item on top
    const items = S.roundItems.length ? S.roundItems : [ANVIL, 13, 8, 5, 11, 2];
    const winner = res[0];
    const heapKey = `${m.roundId}:${items.length}`;
    if (S.heapKey !== heapKey) {
      S.heapKey = heapKey;
      S.heap = buildHeap(items, `${m.roundId}`);
    }
    sc.heap = S.heap;
    const topIt = sc.heap[sc.heap.length - 1];
    sc.crownAt = topIt ? { x: topIt.x, y: topIt.top + 0.05, id: winner?.id, name: winner?.name, bot: !!m.seats?.find((s) => s.id === winner?.id)?.bot } : null;
    // room above the peak for the winner's portrait, clear of the sign
    sc.box = { x0: -2.6, x1: 2.9, y1: Math.max(3.6, (topIt?.top ?? 2) + 2.0) };
    sc.tags = (m.seats ?? []).map((s, i) => {
      const r = res.find((x) => x.id === s.id);
      return { id: s.id, name: s.name, seat: i, bot: !!s.bot, me: !!s.me, kg: Number(r?.points) || 0, place: r?.place, avatar: s.bot ? null : avatarOf(s.id), emblem: s.bot ? null : emblemOf(s.id, s.me) };
    });
    sc.tags.sort((a, b) => (a.place ?? 9) - (b.place ?? 9));
    const room = S.room;
    sc.hud.push((ctx) => {
      rankCard(ctx);
      const w = winner ? `${winner.name} wins` : 'Results';
      const age = S.t - S.resultsAt;
      drawSign(ctx, app.L.center.x, app.L.rope.y + app.L.rope.h + (app.L.phone ? 50 : 70), [{ s: w, size: app.L.phone ? 36 : 54 }], clamp(age / 0.4, 0, 1));
      const left = m.secondsLeft;
      if (room?.kind === 'public' && left != null) {
        // a sand bar runs back to the lobby
        const bw = Math.min(360, app.L.W * 0.6), bx = app.L.W / 2 - bw / 2, by = app.L.H - 30;
        ctx.fillStyle = 'rgba(28,15,46,0.5)';
        ctx.fillRect(bx, by, bw, 10);
        ctx.fillStyle = PAL.gold;
        ctx.fillRect(bx, by, bw * clamp(left / 25, 0, 1), 10);
        ctx.strokeStyle = PAL.ink;
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, 10);
      } else if (room?.isHost) {
        const bw = 240, bh = 62;
        const r = slab(ctx, { x: app.L.W / 2 - bw / 2, y: app.L.H - bh - 24, w: bw, h: bh }, 'Back to lobby', { primary: true, size: 28 });
        hits.add(r, 'backlobby');
      } else {
        const h = room?.players?.get?.(room.host)?.name ?? 'the host';
        drawHint(ctx, `Waiting for ${String(h).slice(0, 16)}`, app.L.W / 2, app.L.H - 50, S.t);
      }
    });
    return sc;
  }

  function onResults(standings, mine) {
    const p = S.profile;
    p.matches += 1;
    if (mine?.place === 1) {
      p.wins += 1;
      award('survivor');
      safe(() => ow?.leaderboards?.submit('wins', p.wins)?.catch?.(() => {}));
    }
    app.matchPlayed?.(mine?.place === 1, mine?.place, Array.isArray(standings) ? standings.length : 0);
    saveProfile();
  }

  /**
   * The trade rank's card on the sand after a match: the stars this match moved light (or drop) one by one, and a new
   * rank turns the emblem over.
   */
  function rankCard(ctx) {
    const R = S.rankRes;
    if (!R) return;
    const L = app.L;
    const age = S.t - Math.max(R.at, S.resultsAt ?? 0) - 0.9;
    if (age < 0) return;
    // the steps: one star at a time, with a pause and the turn-over where a rank fills
    if (!R.steps) {
      R.steps = [];
      let at = 0.55;
      const sign = Math.sign(R.delta);
      for (let k = 1; k <= Math.abs(R.delta); k++) {
        const total = R.before.total + sign * k;
        R.steps.push({ at, total });
        at += 0.32;
        if (rankOf(total).rank > rankOf(total - sign).rank) {
          R.flipAt = at + 0.25;
          at += 1.0;
        }
      }
    }
    let shown = R.before.total;
    let lit = -1;
    for (let i = 0; i < R.steps.length; i++) {
      const st = R.steps[i];
      if (age >= st.at) {
        shown = st.total;
        lit = i;
      }
    }
    if (lit > (R.played ?? -1)) {
      R.played = lit;
      if (R.delta > 0) audio.soft(Math.min(3, lit + 1));
      else audio.thud();
    }
    const flipping = R.flipAt != null;
    const flipped = flipping && age >= R.flipAt;
    if (flipping && flipped && !R.flipDone) {
      R.flipDone = true;
      audio.fanfare();
      fx.confetti(L.W, 50);
      app.toast?.({ kind: 'rank', title: R.after.name, line: 'New rank', rank: R.after.rank });
    }
    // what the card shows: the old rank filled to the top until it turns over
    let V = rankOf(shown);
    if (flipping && !flipped && V.rank > R.before.rank) V = { ...R.before, stars: R.before.need };
    const prevLit = R.steps[lit]?.total ?? null;
    // the card: on the sand, beside the button when the screen is wide, else above it
    // (the slab is 240 wide in the middle, the public room's sand bar up to 360)
    const roomLeft = (L.W - 260) / 2 - 16;
    const side = roomLeft >= 240;
    const cw = side ? Math.min(L.phone ? 300 : 340, roomLeft) : Math.min(300, L.W - 24), ch = L.phone ? 62 : 70;
    const x = side ? 16 : L.W / 2 - cw / 2;
    const overBar = x + cw > L.W / 2 - Math.min(360, L.W * 0.6) / 2;
    const y0 = side ? L.H - ch - (overBar ? 44 : 18) : clamp(L.gy + 14, L.H * 0.5, L.H - 100 - ch);
    const rise = 1 - (1 - clamp(age / 0.35, 0, 1)) ** 3;
    const y = y0 + (1 - rise) * (ch + 40);
    let flipX = 1;
    if (flipping && Math.abs(age - R.flipAt) < 0.22) flipX = Math.max(0.04, Math.abs(age - R.flipAt) / 0.22);
    const stepAge = lit >= 0 ? age - R.steps[lit].at : 9;
    const popIdx = R.delta > 0 && prevLit != null ? (V.rank === R.before.rank && rankOf(prevLit).rank > R.before.rank ? V.need - 1 : rankOf(prevLit).stars - 1) : -1;
    ctx.save();
    ctx.globalAlpha = rise;
    drawRankCard(ctx, { x, y, w: cw, h: ch }, {
      rank: V.rank,
      name: V.name,
      stars: V.stars,
      need: V.need,
      delta: R.delta,
      flipX,
      bulge: flipped ? Math.max(0, 0.25 - (age - R.flipAt)) : 0,
      pop: (i) => (i === popIdx ? Math.max(0, 1 - stepAge / 0.35) : 0),
      fall: (i) => (R.delta < 0 && i === V.stars && stepAge < 0.7 ? Math.max(0.01, stepAge / 0.7) : 0),
      small: L.phone,
      t: S.t,
    });
    ctx.restore();
  }

  // ------------------------------------------------ the autoplay (captures only): this page's turns played by the animals' brain

  function autoPick(d, now) {
    const k = turnKey(d);
    if (S.autoPickKey !== k) {
      S.autoPickKey = k;
      S.autoPickAt = S.t + 0.9 + Math.random() * 0.6;
    }
    if (S.t >= S.autoPickAt) {
      S.autoPickAt = Infinity;
      const i = botPick({ persona: personaOf('Tortoise'), skill: 0.95, offer: d.offer, S: d.S / 10, mood: d.mood, rng: createRng(k) });
      doPick(i);
    }
  }

  function autoPlace(d, now) {
    const k = turnKey(d);
    if (!S.autoHand || S.autoHand.k !== k) S.autoHand = { k, hand: createAutoHand({ snap: d.snap, item: heldItem(d), top: d.top / 1000, persona: personaOf('Gecko'), skill: 0.95, seed: k, now: S.t * 1000 }) };
    const h = S.autoHand.hand.update(S.t * 1000);
    S.hand.x = h.x;
    S.hand.y = h.y;
    S.hand.a = h.a;
    clampHand();
    if (h.drop) {
      S.handSince = -1;
      doDrop();
    }
  }

  return { roomScene, onResults };
}

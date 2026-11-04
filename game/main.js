// Boot, the screens, input, and the glue between the room (or a local run) and the picture.

import { ITEMS, STRAW, ANVIL } from './items.js';
import { createSettle, hoverBox, clampHover, quantDrop, wrapAngle, landing, extents, Sim, BAND, CAMEL, LANDING } from './physics.js';
import { turnKey, placer, heldItem, nextPlayer, moodOf, dayNumber, dailySeed, dailyBoard, twistPhysics, TWISTS, heldKg } from './rules.js';
import { RUN, payout, townOrder, runBand, runPhysics, perkCount } from './caravan.js';
import { biomeFor, BIOMES } from './look.js';
import { drawTownPost, drawTwistTag, drawPatience, drawSetOff, perkRects, drawPerkCards } from './runhud.js';
import { XP, levelOf, addXp, track, goalsToday, goalLabel, streakBonus, newUnlocks, unlocksOf, lookOf, cleanProgress, isUnlocked, unlockLabel, rankMatch } from './progress.js';
import { drawDayBoard, drawWardrobe, levelBadge, xpBar, rankEmblem } from './stable.js';
import { createNet, JOIN, nextSettingValue } from './net.js';
import { createSolo } from './solo.js';
import { createMatchView } from './match-view.js';
import { createRenderer, fitCamera, toScreen, toWorld } from './render.js';
import { paint } from './scene.js';
import { headPoint, createCamelActor } from './camel.js';
import { PAL, rr } from './art.js';
import { layout, createHits, text, slab, turnIcon, drawSign, drawHint, signpost, goldenStraw, textWidth } from './ui.js';
import { createFx } from './fx.js';
import * as audio from './audio.js';

const ow = window.onceworlds;
const params = new URLSearchParams(location.search);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const safe = (fn, fallback) => {
  try {
    return fn();
  } catch (err) {
    console.warn('[the-last-straw]', err);
    return fallback;
  }
};

async function joinRoom() {
  if (!ow?.rooms) return null;
  try {
    return await ow.rooms.join(JOIN);
  } catch (err) {
    console.warn('[the-last-straw] could not join a room', err);
    return null;
  }
}

async function loadLib() {
  try {
    const [m, h, b] = await Promise.all([import('/__onceworlds/v1/match.js'), import('/__onceworlds/v1/host.js'), import('/__onceworlds/v1/bots.js')]);
    return { createMatch: m.createMatch, createHost: h.createHost, t: h.t, createBots: b.createBots };
  } catch (err) {
    console.warn('[the-last-straw] the match helpers are not available', err);
    return null;
  }
}

const DEFAULT_PROFILE = { v: 1, wins: 0, matches: 0, best: 0, bestTown: 1, lifetime: 0, dailies: 0, steady: false, hints: {}, sleeve: 0, xp: 0, streakBest: 0, streak: null, goals: null, look: null, softs: 0, stars: 0, rankBest: 0 };

async function boot() {
  const roomPromise = joinRoom(); // join first, before anything heavy
  const canvas = document.getElementById('cv');
  const R = createRenderer(canvas);
  const fx = createFx();
  const actor = createCamelActor();
  const hits = createHits();
  const tagAnim = new Map();
  const autoplay = params.get('autoplay') && safe(() => ow?.mode !== 'production', false) ? params.get('autoplay') : null;

  safe(() => ow?.ui?.setLook?.({ accent: '#FFC845', panel: '#3B2160', text: '#FFF0D9' }));
  safe(() => ow?.controls?.set?.(null));
  safe(() => document.fonts?.load?.(`900 40px "Big Shoulders Display"`)?.catch?.(() => {}));
  safe(() => document.fonts?.load?.(`800 18px Archivo`)?.catch?.(() => {}));

  const S = {
    screen: 'game',
    t: 0,
    room: null,
    net: null,
    me: { id: 'me', name: 'You' },
    profile: { ...DEFAULT_PROFILE, hints: {} },
    daily: null,
    touch: false,
    hand: null, // my hover { x, y, a } while placing
    handKey: '',
    handSince: 0,
    keys: new Set(),
    pointer: { x: 0, y: 0, id: null, down: false, drag: false, sx: 0, sy: 0, type: 'mouse' },
    cam: null,
    needle: { v: 0, vel: 0 },
    camel: { bow: 0, squash: 0, look: 0, lookT: 0, mood: 0, stand: 0 },
    pred: null,
    play: { k: '', s: 0, lastS: null, contact: false },
    beat: null,
    seen: { k: '', rid: '', step: '', last: '' },
    roundItems: [], // every load that ended a round this match (the results' heap)
    roundsSeen: new Set(),
    lastRoundEnd: null, // { kind } how the previous round ended (to stand up)
    introAt: 0,
    sign: null, // { lines, at }
    hint: null, // { id, s, at, arrow }
    hintsShown: new Set(),
    solo: null,
    soloPaused: false,
    soloOver: null,
    soloBoard: null,
    closed: null,
    autoHand: null,
    autoPickAt: 0,
    gift: null, // the anvil handed on: { rid, tn, to }
    results: null,
    resultsAt: 0,
    countdownN: -1,
    lastTick: -1,
    avatars: new Map(),
    reserved: null,
    hostStartAt: 0,
    toasts: [],
    fresh: new Set(), // Stable items earned since it was last opened
    runXp: null,
    stableFrom: 'game',
  };

  // ---------------------------------------------------------------- saves

  async function loadSave() {
    if (!ow?.save) return;
    const p = await safe(() => ow.save.get('profile'), null)?.catch?.(() => null);
    if (p && typeof p === 'object') {
      const out = { ...DEFAULT_PROFILE, hints: {} };
      for (const k of Object.keys(DEFAULT_PROFILE)) {
        if (k === 'hints') out.hints = p.hints && typeof p.hints === 'object' ? { ...p.hints } : {};
        else if (DEFAULT_PROFILE[k] === null) out[k] = p[k] && typeof p[k] === 'object' ? JSON.parse(JSON.stringify(p[k])) : null;
        else if (typeof p[k] === typeof DEFAULT_PROFILE[k]) out[k] = p[k];
      }
      S.profile = cleanProgress(out);
    }
    const d = await safe(() => ow.save.get('daily'), null)?.catch?.(() => null);
    if (d && typeof d === 'object' && Number.isInteger(d.day)) S.daily = d;
  }
  const saveProfile = () => safe(() => ow?.save?.set('profile', S.profile)?.catch?.(() => {}));
  loadSave();

  cleanProgress(S.profile);
  const unlocked = () => unlocksOf(S.profile, 'sleeve').map((u) => u.id);
  const mySleeve = () => (unlocked().includes(S.profile.sleeve) ? S.profile.sleeve : 0);
  let saveTimer = 0;
  const saveSoon = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveProfile, 700);
  };

  // ---------------------------------------------------------------- progress: XP, today's goals, the streak, unlocks

  const unlockState = (p) => ({ xp: p.xp, bestTown: p.bestTown, streakBest: p.streakBest, wins: p.wins, dailies: p.dailies, steady: p.steady, rankBest: p.rankBest });
  function afterGain(before) {
    const p = S.profile;
    const lb = levelOf(before.xp).level, la = levelOf(p.xp).level;
    if (la > lb) {
      toast({ kind: 'level', title: `Level ${la}`, line: 'Level up', level: la });
      audio.fanfare();
    }
    if (la >= 10) award('level-10');
    if ((p.streakBest ?? 0) >= 7) award('week-streak');
    for (const u of newUnlocks(before, p)) {
      S.fresh.add(`${u.kind}:${u.id}`);
      toast({ kind: 'unlock', title: u.name, line: 'New in the Stable' });
    }
    saveSoon();
  }
  function gainXp(n) {
    const before = unlockState(S.profile);
    const add = addXp(S.profile, n);
    if (S.runXp) S.runXp.xp += add;
    afterGain(before);
  }
  function progress(stat, amount = 1) {
    const before = unlockState(S.profile);
    const r = track(S.profile, stat, amount, today());
    if (S.runXp) S.runXp.xp += r.xp;
    for (const g of r.done) {
      toast({ kind: 'goal', title: goalLabel(g), line: `+${Math.round(XP.goal * streakBonus(S.profile))} XP` });
      S.goalPop = { i: S.profile.goals.list.indexOf(g), at: S.t };
    }
    if (r.done.length) audio.soft(3);
    afterGain(before);
  }
  /** One of my loads held, in any mode. */
  function myLoadHeld({ item, soft, smash }) {
    gainXp(XP.load + (soft ? XP.soft : 0));
    progress('loads');
    // the soft-landing hint goes once you've done one (or after a few loads without)
    if (soft || (S.softMiss = (S.softMiss ?? 0) + 1) >= 4) hintDone('soft');
    if (soft) {
      progress('soft');
      S.profile.softs = (S.profile.softs ?? 0) + 1;
      S.softRun = (S.softRun ?? 0) + 1;
      if (S.softRun >= 5) award('soft-touch');
    } else if ((ITEMS[item]?.kg ?? 0) > 0) S.softRun = 0;
    const key = ITEMS[item]?.key;
    if (!smash && key === 'cat') progress('cat');
    if (!smash && key === 'vase') progress('vase');
    if (item === STRAW) progress('straw');
  }
  /** A match ended for me at `place` of `n` seats (no place: I was watching). */
  function matchPlayed(win, place, n) {
    if (Number.isFinite(place) && place >= 1 && n >= 2) {
      const before = unlockState(S.profile);
      const r = rankMatch(S.profile, place, n);
      // the results' card plays it out (and says a new rank when the emblem turns over)
      S.rankRes = { ...r, at: S.t };
      if (r.after.rank >= 4) award('sultan');
      safe(() => ow?.leaderboards?.submit('trade-rank', S.profile.stars)?.catch?.(() => {}));
      afterGain(before);
    }
    gainXp(XP.match + (win ? XP.win : 0));
    progress('match');
  }

  // toasts: one at a time, sliding out from under the rope
  function toast(t) {
    if (S.toasts.length > 5) return;
    S.toasts.push({ ...t, at: null });
  }
  function drawToasts(ctx) {
    const q = S.toasts;
    if (!q.length) return;
    const t = q[0];
    if (t.at === null) t.at = S.t;
    const age = S.t - t.at;
    const dur = 2.4;
    if (age > dur) {
      q.shift();
      return;
    }
    const k = age < 0.3 ? 1 - (1 - age / 0.3) ** 3 : age > dur - 0.3 ? 1 - ((age - (dur - 0.3)) / 0.3) ** 2 : 1;
    const big = L.phone ? 20 : 24;
    const w = Math.max(textWidth(ctx, t.title, big, { display: true, weight: 900 }), textWidth(ctx, t.line, 14, { weight: 800 })) + 84;
    const h = big + 34;
    const x = L.W / 2 - w / 2;
    const y = L.rope.y + L.rope.h + 6 - (1 - k) * (h + 30);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.5));
    ctx.fillStyle = 'rgba(28,15,46,0.35)';
    ctx.fill(rr(new Path2D(), x + 3, y + 5, w, h, 10));
    const tp = rr(new Path2D(), x, y, w, h, 10);
    ctx.fillStyle = t.kind === 'goal' ? '#E8FFF8' : '#FFF6E2';
    ctx.fill(tp);
    ctx.lineWidth = 3;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke(tp);
    ctx.fillStyle = t.kind === 'goal' ? PAL.turq : t.kind === 'level' || t.kind === 'rank' ? PAL.gold : PAL.rose;
    ctx.fillRect(x + 3, y + 3, w - 6, 5);
    const ix = x + 34, iy = y + h / 2 + 2;
    if (t.kind === 'level') levelBadge(ctx, ix, iy, 18, t.level, S.t);
    else if (t.kind === 'rank') rankEmblem(ctx, ix, iy, 19, t.rank, S.t);
    else {
      ctx.beginPath();
      ctx.arc(ix, iy, 16, 0, Math.PI * 2);
      ctx.fillStyle = t.kind === 'goal' ? PAL.turq : PAL.rose;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      if (t.kind === 'goal') {
        ctx.moveTo(ix - 7, iy);
        ctx.lineTo(ix - 2, iy + 6);
        ctx.lineTo(ix + 8, iy - 7);
      } else {
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 4.5 : 10;
          ctx.lineTo(ix + Math.cos(a) * r, iy + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fillStyle = PAL.bone;
        ctx.fill();
      }
      ctx.strokeStyle = t.kind === 'goal' ? PAL.bone : PAL.ink;
      ctx.lineWidth = t.kind === 'goal' ? 3.5 : 2;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    text(ctx, t.title, x + 62, y + h * 0.4, { size: big, align: 'left', display: true, weight: 900, color: PAL.ink, outline: false });
    text(ctx, t.line, x + 62, y + h * 0.76, { size: 14, align: 'left', weight: 800, color: PAL.violet, outline: false });
    ctx.restore();
  }
  // each badge is asked for once a visit (the platform keeps it; no need to ask on every load)
  const awarded = new Set();
  const award = (id) => {
    if (awarded.has(id)) return;
    awarded.add(id);
    safe(() => ow?.badges?.award(id)?.catch?.(() => {}));
  };
  const today = () => dayNumber(safe(() => ow?.now?.(), null) ?? Date.now());

  // ---------------------------------------------------------------- the room

  function wireRoom(room) {
    S.room = room;
    S.closed = null;
    if (!room) return;
    S.me = { id: room.me?.id ?? 'me', name: room.me?.name ?? 'You' };
    loadLib().then((lib) => {
      if (!lib || S.room !== room) return;
      try {
        S.net = createNet(room, lib, {
          onResults: (standings, mine) => onResults(standings, mine),
          onClose: () => {},
          // captures only (the autoplay, never in production): a shorter match, `&rounds=1`
          rounds: autoplay ? Number(params.get('rounds')) || undefined : undefined,
        });
      } catch (err) {
        console.warn('[the-last-straw] could not start the match', err);
      }
    });
    room.on('close', (reason) => {
      S.closed = String(reason || 'disconnected');
      if (S.screen === 'solo') endSolo(false);
    });
    room.on('starting', () => {
      // a match is starting for this page: a solo run ends (kg so far counts in Caravan)
      if (room.spectating) return;
      closeMenus();
    });
    room.on('matchstart', () => {
      S.roundItems = [];
      S.roundsSeen.clear();
      S.results = null;
      S.lastRoundEnd = null;
      closeMenus();
    });
    room.on('rename', () => {
      S.me.name = room.me?.name ?? S.me.name;
    });
    if (autoplay === '1' || autoplay === 'match') S.autoStart = true;
  }
  roomPromise.then((room) => wireRoom(room));

  async function rejoin() {
    S.closed = null;
    try {
      S.net?.dispose();
    } catch {}
    S.net = null;
    S.room = null;
    wireRoom(await joinRoom());
  }

  // ---------------------------------------------------------------- avatars

  function avatarOf(id) {
    let a = S.avatars.get(id);
    if (a !== undefined) return a;
    S.avatars.set(id, null);
    safe(() =>
      ow?.player
        ?.avatarUrl(id, 'head')
        ?.then((url) => {
          if (!url) return;
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = url;
          S.avatars.set(id, img);
        })
        ?.catch?.(() => {}),
    );
    return null;
  }

  /** Readying, or a match starting for this page, closes a solo run (kg so far counts in Caravan) or the Stable. */
  function closeMenus() {
    if (S.screen === 'solo') endSolo(true);
    else if (S.screen === 'stable') closeStable();
    audio.init();
  }

  // ---------------------------------------------------------------- hints

  function hint(id, s, arrow = null, once = true) {
    if (once && S.profile.hints[id]) return;
    if (S.hint && S.hint.id === id) {
      S.hint.arrow = arrow;
      S.hint.s = s;
      return;
    }
    if (S.hint && S.t - S.hint.at < 1.2) return;
    S.hint = { id, s, at: S.t, arrow };
  }
  function hintDone(id) {
    if (S.hint && S.hint.id === id) S.hint = null;
    if (!S.profile.hints[id]) {
      S.profile.hints[id] = 1;
      saveProfile();
    }
  }

  // ---------------------------------------------------------------- local runs (Caravan, Daily)

  function startSolo(kind) {
    audio.init();
    const day = today();
    const scored = kind === 'daily' ? !(S.daily && S.daily.day === day) : true;
    const auto = autoplay === 'caravan';
    // captures only (the autoplay, never in production): `&seed=` replays one run
    const capSeed = auto ? params.get('seed') : null;
    const seed = kind === 'daily' ? dailySeed(day) : capSeed ? capSeed.slice(0, 40) : `caravan:${Math.floor(Math.random() * 1e9)}`;
    S.solo = createSolo({ seed, kind, auto, onEvent: (type, d) => onSoloEvent(type, d) });
    S.solo.scored = scored;
    S.solo.day = day;
    S.soloPaused = false;
    S.soloOver = null;
    S.soloBoard = null;
    S.screen = 'solo';
    S.camel.stand = 0;
    S.hand = null;
    S.receipt = null;
    S.receiptAt = null;
    S.receiptBottom = null;
    S.lostSign = null;
    S.patienceLostAt = null;
    S.patienceGainAt = null;
    S.goSince = 0;
    S.perkShowAt = 0;
    fx.clear();
    audio.tok();
    townSign(S.solo, S.t + 0.2);
    S.runXp = { xp: 0, xp0: S.profile.xp };
    if (kind === 'daily') progress('daily');
  }

  function endSolo(score) {
    const so = S.solo;
    if (!so) return;
    if (score && !S.soloOver && so.kind === 'caravan') finishRun(so, false);
    S.solo = null;
    S.soloOver = null;
    S.soloBoard = null;
    S.hand = null;
    S.screen = 'game';
  }

  function finishRun(so, complete) {
    const c = so.c;
    const kg = c.delivered;
    const town = c.leg;
    const p = S.profile;
    const board = { kg, town, kind: so.kind, best: p.best, list: null, scored: so.scored };
    if (so.kind === 'caravan' || (so.kind === 'daily' && complete)) {
      p.lifetime += kg;
      if (kg > p.best) {
        p.best = kg;
        board.newBest = true;
      }
      p.bestTown = Math.max(p.bestTown, town);
      board.best = p.best;
      safe(() => ow?.leaderboards?.submit('caravan', kg)?.catch?.(() => {}));
      if (town >= 6) award('six-towns');
      if (p.lifetime >= 1000) award('heavy-lifter');
    }
    if (so.kind === 'daily' && complete) {
      award('daily-cart');
      if (so.scored) {
        p.dailies += 1;
        const prev = S.daily && S.daily.day === so.day ? S.daily.kg : -1;
        S.daily = { day: so.day, kg: Math.max(kg, prev), town };
        safe(() => ow?.save?.set('daily', S.daily)?.catch?.(() => {}));
        if (kg > prev) safe(() => ow?.data?.game?.push('daily', { d: so.day, kg, t: town })?.catch?.(() => {}));
      }
    }
    saveProfile();
    // the board: today's top or the all-time Caravan top
    if (so.kind === 'daily') {
      safe(() =>
        ow?.data?.game
          ?.get('daily')
          ?.then((list) => {
            board.list = dailyBoard(list, so.day, 5).map((e) => ({ name: e.name, kg: e.kg, me: e.id === S.me.id }));
          })
          ?.catch?.(() => {}),
      );
    } else {
      safe(() =>
        ow?.leaderboards
          ?.top('caravan', { limit: 5 })
          ?.then((r) => {
            board.list = (r?.entries ?? []).slice(0, 5).map((e) => ({ name: String(e.player?.name ?? '').slice(0, 24), kg: Number(e.score) || 0, me: e.player?.id === S.me.id }));
          })
          ?.catch?.(() => {}),
      );
    }
    S.soloBoard = board;
    return board;
  }

  function onSoloEvent(type, d) {
    const so = S.solo;
    if (!so) return;
    const cam = S.cam;
    switch (type) {
      case 'offer':
        audio.scrape();
        break;
      case 'pick':
        audio.grab();
        hintDone('pick');
        beginHand(so.c.snap, d.item, so.c.top, `solo:${so.c.draws}:${so.c.load}`);
        break;
      case 'drop':
        audio.whup();
        audio.whistle(ITEMS[d.item].kg);
        S.camel.lookT = 1.6;
        break;
      case 'land':
        landJuice(d.item, d.x, d.y, d.energy);
        break;
      case 'smash':
        smashJuice(d.item, d.px ?? d.x, d.y);
        if (cam) {
          const p = toScreen(cam, d.px ?? d.x, d.y + 0.4);
          fx.floater('Smashed', p.x, p.y, null, PAL.rose);
        }
        break;
      case 'held':
        audio.grumble(d.mood);
        award('first-load');
        if (d.S >= 85) {
          award('steady-hand');
          if (!S.profile.steady) {
            S.profile.steady = true;
            saveProfile();
          }
        }
        if (d.top >= CAMEL.trayTop + 3) award('high-rise');
        myLoadHeld({ item: d.item, soft: d.soft && d.bonus > 0, smash: d.smash });
        if (cam && !d.smash) {
          const p = toScreen(cam, d.x, d.top + 0.2);
          const post = S.runSpots?.post;
          const to = post ? { x: post.x + post.w * 0.45, y: post.y + post.h * 0.7 } : null;
          const kg = heldKg(d.item, so.c.twist, false);
          fx.floater(`+${kg}`, p.x, p.y, to, PAL.turq);
          S.postBumpAt = S.t + 1.0;
          if (d.soft && d.bonus > 0) {
            fx.floater(d.streak > 1 ? `Soft ×${d.streak} +${d.bonus}` : `Soft +${d.bonus}`, p.x, p.y - 34, to, PAL.gold, 0.25);
            audio.soft?.(d.streak);
            fx.ring(d.x, d.top - 0.3, 0.9, PAL.gold);
          }
        }
        break;
      case 'setoff':
        audio.brass(d.mood >= 2 ? [392, 523.3, 659.3] : [293.7, 392]);
        audio.strap();
        audio.whoosh();
        if (d.mood >= 2 && cam) {
          const p = toScreen(cam, -0.4, so.c.top + 0.6);
          fx.floater('Sweat ×2', p.x, p.y, null, PAL.rose);
          award('on-the-brink');
          progress('brink');
        }
        S.goSince = 0;
        break;
      case 'road':
        audio.bell(0);
        break;
      case 'arrive':
        audio.brass([293.7, 440, 587.3]);
        audio.gong();
        const on = so.c.snap.map((r) => ITEMS[r[0]]?.key);
        if (on.includes('cat')) award('cat-nap');
        if (on.filter((k) => k === 'vase').length >= 3) award('fine-china');
        S.receipt = { at: S.t, town: d.leg + 1, pay: d.pay, done: false, shown: 0 };
        break;
      case 'deliver': {
        if (cam) {
          const p = toScreen(cam, d.x, d.y);
          fx.floater(`+${d.kg}`, p.x, p.y, S.receiptAt ?? null, PAL.turq);
          audio.deliver(d.i);
        }
        break;
      }
      case 'leg':
        if (S.receipt) S.receipt.done = true;
        const at = S.receiptAt ?? L?.center;
        if (at) fx.floater(`+${d.kg}`, at.x, (S.receiptBottom ?? at.y) + 26, S.myTagPos ?? null, PAL.gold, 0.1);
        audio.fanfare();
        audio.coins(Math.min(14, 4 + Math.round(d.kg / 8)));
        S.perkShowAt = S.t + 1.1;
        S.perkSel = null;
        if (d.pay?.short) {
          S.patienceLostAt = S.t;
          audio.snort();
        }
        if (d.leg + 1 >= 6) award('six-towns');
        if (d.leg + 1 >= 10) award('ten-towns');
        S.profile.bestTown = Math.max(S.profile.bestTown, d.leg + 1);
        gainXp(d.kg * XP.kg);
        progress('kg', d.kg);
        progress('town', d.leg + 1);
        break;
      case 'perk':
        townSign(so, S.t + VEIL * 0.55);
        audio.select();
        if (d.perk === 'water') S.patienceGainAt = S.t;
        S.receipt = null;
        S.receiptAt = null;
        S.receiptBottom = null;
        break;
      case 'fall':
        fx.hitStop(0, 1.1, 0.35);
        audio.snort();
        audio.whoosh();
        fx.puff(d.x, 0.02, 18, 1.3);
        break;
      case 'over':
        if (d.r === 'broke') {
          fx.hitStop(0.1, 0.9, 0.28);
          fx.shake(0.85, { x: 0.2, y: 1 });
          fx.punch(0.05);
          audio.crack();
          audio.whoosh();
          fx.splinters(0, CAMEL.trayTop, 18);
          if (d.item === STRAW) award('last-straw');
        } else audio.thud();
        S.softRun = 0;
        S.patienceLostAt = S.t + 0.6;
        if (d.result === 'lost') S.lostSign = { at: S.t + 0.5, road: d.road };
        break;
      case 'collapse':
        audio.clatter();
        fx.shake(0.6, { x: 0.1, y: 1 });
        fx.puff(-0.8, 0.02, 14, 1.4);
        fx.puff(0.9, 0.02, 14, 1.4);
        break;
      case 'lost':
        S.lostSign = null;
        break;
      case 'done':
        S.soloOver = { at: S.t, kind: d.kind };
        finishRun(so, true);
        break;
    }
  }

  function landJuice(item, x, y, energy) {
    const def = ITEMS[item];
    const kg = def?.kg ?? 0;
    audio.land(def?.mat, energy, kg, def?.key);
    S.camel.squash = Math.min(1, S.camel.squash + 0.2 + kg / 30);
    actor.impulse(kg, energy);
    fx.shake(Math.min(0.55, kg / 36 + energy * 0.01), { x: 0.15, y: 1 });
    const e = def ? extents(item, 0) : null;
    const w = e ? (e.maxX - e.minX) / 2 : 0.3;
    const by = Math.max(0.02, e ? y + e.minY : y - 0.25);
    fx.puff(x, by, Math.round(3 + kg / 3), 0.4 + kg / 40);
    fx.debris(def?.mat, x, by, energy, w);
    fx.ring(x, by, 0.3 + w * 0.9, kg >= 12 ? '#FFE7A3' : '#FFF0D9');
    if (kg >= 14) {
      fx.punch(0.01 + kg / 2400);
      fx.hitStop(0.04, 0, 1);
    }
    if (kg >= 8) audio.creak(0.12);
  }

  function smashJuice(item, x, y) {
    fx.shatter(x, y);
    fx.shake(0.45, { x: 0.3, y: 1 });
    fx.hitStop(0.06, 0.3, 0.4);
    audio.smash?.();
  }

  // ---------------------------------------------------------------- my hands

  function beginHand(snap, item, top, key) {
    const a = ITEMS[item].rest[0] ?? 0;
    const b2 = hoverBox(item, a, top);
    S.hand = { x: 0, y: b2.yDef, a, item, top, key, sim: safe(() => new Sim(snap), null), floor: null };
    S.handKey = key;
    S.handSince = S.t;
    S.ghost = null;
  }

  /** The lowest my hands may go here: just above where the item would first touch (a gentle set-down). */
  function handFloor(h) {
    if (!h.sim) return null;
    const b = hoverBox(h.item, h.a, h.top);
    const land = safe(() => landing(h.sim, h.item, clamp(h.x, b.xMin, b.xMax), b.yMax, h.a), null);
    h.land = land;
    return land ? land.y : null;
  }

  function clampHand() {
    const h = S.hand;
    if (!h) return;
    h.floor = handFloor(h);
    const c = clampHover(h.item, h.x, h.y, h.a, h.top, h.floor);
    h.x = c.x;
    h.y = c.y;
  }

  /** Where my held item would first touch, and how gently (the line turns gold when it would be a soft landing). */
  function ghostOf() {
    const h = S.hand;
    if (!h || !h.sim) return null;
    if (h.floor === null || h.landX !== h.x || h.landA !== h.a) {
      h.floor = handFloor(h);
      h.landX = h.x;
      h.landA = h.a;
    }
    const land = h.land;
    if (!land) return null;
    if (S.lastGhostWhat && S.lastGhostWhat !== land.what) audio.blip();
    S.lastGhostWhat = land.what;
    const fall = Math.max(0, h.y - land.y);
    const soft = land.what !== 'ground' && Math.sqrt(2 * 10 * fall) < LANDING.soft - 0.15 && !!ITEMS[h.item]?.kg;
    if (soft && !S.wasSoft) audio.select?.();
    S.wasSoft = soft;
    return { item: h.item, x: h.x, y: land.y, a: h.a, fromY: h.y, color: land.what === 'ground' ? PAL.rose : soft ? PAL.gold : PAL.turq, soft, fragile: !!ITEMS[h.item]?.fragile };
  }

  function turnHand(dir) {
    if (!S.hand) return;
    S.hand.a = wrapAngle(S.hand.a + dir * (Math.PI / 12));
    clampHand();
    audio.ratchet();
    hintDone('turn');
  }

  // ---------------------------------------------------------------- what's mine to do right now

  function myPlace() {
    if (S.screen === 'solo') {
      const so = S.solo;
      if (!so || so.st.auto || S.soloPaused || so.step !== 'place' || !S.hand) return null;
      return { kind: 'solo' };
    }
    const d = S.net?.data;
    if (!d || S.net.match.phase !== 'round' || d.step !== 'place' || placer(d) !== S.me.id || !S.hand || S.pred) return null;
    if (S.hand.key !== turnKey(d)) return null;
    return { kind: 'match', d };
  }

  function myPick() {
    if (S.screen === 'solo') {
      const so = S.solo;
      if (!so || so.st.auto || S.soloPaused || so.step !== 'pick') return null;
      return { kind: 'solo', offer: so.c.offer };
    }
    const d = S.net?.data;
    if (!d || S.net.match.phase !== 'round' || d.step !== 'pick' || placer(d) !== S.me.id) return null;
    return { kind: 'match', d, offer: d.offer };
  }

  function doPick(i) {
    const p = myPick();
    if (!p) return;
    audio.init();
    if (p.kind === 'solo') S.solo.pick(i);
    else {
      S.net.pick(turnKey(p.d), i);
      audio.grab();
      hintDone('pick');
      S.pickedAt = S.t;
      // the anvil handed on (a badge if they break it with it)
      if (p.d.offer[1 - i] === ANVIL) S.gift = { rid: p.d.rid, tn: p.d.tn + 1, to: nextPlayer(p.d, (id) => !!S.net.match.seats.find((s) => s.id === id && !s.left)) };
    }
  }

  function doDrop() {
    const p = myPlace();
    if (!p) return;
    if (S.t - S.handSince < 0.25) return;
    const h = S.hand;
    audio.init();
    if (p.kind === 'solo') {
      S.solo.drop(h);
      S.hand = null;
    } else {
      const d = p.d;
      const item = heldItem(d);
      const q = quantDrop(clampHover(item, h.x, h.y, wrapAngle(h.a), d.top / 1000, h.floor));
      S.net.drop(turnKey(d), q);
      const tw = twistPhysics(d.twist, S.net.room.match?.seed ?? 0, d.round);
      S.pred = { k: turnKey(d), runner: createSettle(d.snap, { item, ...q }, { T: Infinity, keyframes: false, ...tw }), steps: 0, wStart: null, at: S.t, item, rid: d.rid, tn: d.tn, myDrop: { ...q, item } };
      S.play = { k: turnKey(d), s: 0, lastS: null, contact: false };
      audio.whup();
      audio.whistle(ITEMS[item].kg);
      S.camel.lookT = 1.6;
      S.lastDrop = { rid: d.rid, tn: d.tn, item, top: d.top };
      S.hand = null;
    }
    hintDone('drop');
    hintDone('aim');
  }

  // ---------------------------------------------------------------- input

  function screenToWorld(x, y) {
    return S.cam ? toWorld(S.cam, x, y) : { x: 0, y: 0 };
  }

  canvas.addEventListener('pointerdown', (e) => {
    audio.init();
    S.touch = e.pointerType !== 'mouse';
    const x = e.clientX, y = e.clientY;
    S.pointer = { ...S.pointer, x, y, id: e.pointerId, down: true, drag: false, sx: x, sy: y, type: e.pointerType, onHit: null };
    safe(() => canvas.setPointerCapture(e.pointerId));
    const hit = hits.at(x, y);
    if (hit) {
      S.pointer.onHit = hit;
      press(hit);
      return;
    }
    const pl = myPlace();
    if (pl && e.pointerType === 'mouse') {
      moveHandTo(x, y);
      doDrop();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const x = e.clientX, y = e.clientY;
    const p = S.pointer;
    if (e.pointerType === 'mouse') S.touch = false;
    const dx = x - p.x, dy = y - p.y;
    p.x = x;
    p.y = y;
    const pl = myPlace();
    if (!pl) return;
    if (e.pointerType === 'mouse') moveHandTo(x, y);
    else if (p.down && p.id === e.pointerId && !p.onHit && S.cam) {
      // touch: the item moves with the finger, never under it
      S.hand.x += dx / S.cam.s;
      S.hand.y -= dy / S.cam.s;
      clampHand();
      if (Math.hypot(x - p.sx, y - p.sy) > 12) hintDone('aim');
    }
  });
  const up = (e) => {
    if (S.pointer.id === e.pointerId) S.pointer.down = false;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    if (!myPlace()) return;
    e.preventDefault();
    turnHand(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function moveHandTo(x, y) {
    if (!S.hand) return;
    const w = screenToWorld(x, y);
    const moved = Math.hypot(w.x - S.hand.x, w.y - S.hand.y);
    S.hand.x = w.x;
    S.hand.y = w.y;
    clampHand();
    if (moved > 0.05 && S.t - S.handSince > 0.3) hintDone('aim');
    if (moved > 0.25) audio.creak(0.02);
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat && !['KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) return;
    audio.init();
    S.keys.add(e.code);
    const k = e.code;
    if (S.closed) {
      if (k === 'Enter' || k === 'Space') rejoin();
      return;
    }
    // Enter is the platform's Ready key: the game binds nothing to it.
    if (S.screen === 'stable') {
      if (k === 'Escape' || k === 'Backspace') closeStable();
      return;
    }
    if (S.screen === 'solo') {
      if (S.soloOver && S.soloBoard) {
        if (k === 'Space') startSolo(S.solo.kind);
        else if (k === 'Escape') endSolo(false);
        return;
      }
      if (k === 'Escape' || k === 'KeyP') {
        S.soloPaused = !S.soloPaused;
        return;
      }
      if (S.soloPaused) {
        if (k === 'Space') S.soloPaused = false;
        return;
      }
    }
    if (S.screen === 'solo' && S.solo && !S.solo.st.auto) {
      if (S.solo.step === 'perk') {
        const i = k === 'Digit1' || k === 'Numpad1' ? 0 : k === 'Digit2' || k === 'Numpad2' ? 1 : k === 'Digit3' || k === 'Numpad3' ? 2 : -1;
        if (i >= 0) choosePerk(i);
        else if (k === 'ArrowLeft' || k === 'KeyA') S.perkSel = clamp((S.perkSel ?? 1) - 1, 0, 2);
        else if (k === 'ArrowRight' || k === 'KeyD') S.perkSel = clamp((S.perkSel ?? 1) + 1, 0, 2);
        else if (k === 'Space' && S.perkSel != null) choosePerk(S.perkSel);
        if (k.startsWith('Arrow') || k === 'Space') e.preventDefault();
        return;
      }
      if (k === 'KeyG') {
        setOff();
        return;
      }
    }
    const pk = myPick();
    if (pk) {
      if (k === 'Digit1' || k === 'Numpad1') doPick(0);
      else if (k === 'Digit2' || k === 'Numpad2') doPick(1);
      else if (k === 'ArrowLeft' || k === 'KeyA') S.cartSel = 0;
      else if (k === 'ArrowRight' || k === 'KeyD') S.cartSel = 1;
      else if (k === 'Space' && (S.cartSel === 0 || S.cartSel === 1)) doPick(S.cartSel);
      if (k.startsWith('Arrow') || k === 'Space') e.preventDefault();
      return;
    }
    if (myPlace()) {
      if (k === 'KeyQ') turnHand(1);
      else if (k === 'KeyE') turnHand(-1);
      else if (k === 'Space') doDrop();
      if (k.startsWith('Arrow') || k === 'Space') e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => S.keys.delete(e.code));
  window.addEventListener('blur', () => S.keys.clear());

  function keyMove(dt) {
    if (!myPlace() || !S.hand) return;
    const k = S.keys;
    let dx = 0, dy = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) dx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) dx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) dy += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) dy -= 1;
    if (dx || dy) {
      S.hand.x += dx * 1.6 * dt;
      S.hand.y += dy * 1.2 * dt;
      clampHand();
      hintDone('aim');
    }
  }

  function press(hit) {
    const id = hit.id;
    audio.init();
    if (id === 'pick') return doPick(hit.data);
    if (id === 'drop') return doDrop();
    if (id === 'ccw') return turnHand(1);
    if (id === 'cw') return turnHand(-1);
    if (id === 'setting') {
      const net = S.net;
      if (!net || !S.room?.isHost) return;
      const cur = net.settings()[hit.data];
      net.setSetting(hit.data, nextSettingValue(hit.data, cur));
      audio.select();
      return;
    }
    if (id === 'setoff') return setOff();
    if (id === 'perk') return choosePerk(hit.data);
    if (id === 'stable') return openStable();
    if (id === 'back') return closeStable();
    if (id === 'look') return wear(hit.data);
    if (id === 'locked') {
      S.lockedTip = { u: hit.data, at: S.t };
      audio.blip();
      return;
    }
    if (id === 'caravan') return startSolo('caravan');
    if (id === 'daily') return startSolo('daily');
    if (id === 'invite') return safe(() => ow?.ui?.showInvite?.());
    if (id === 'sleeve') {
      const list = unlocked();
      const i = list.indexOf(mySleeve());
      S.profile.sleeve = list[(i + 1) % list.length];
      saveProfile();
      audio.select();
      tagAnim.get(S.me.id) && (tagAnim.get(S.me.id).v += 3);
      return;
    }
    if (id === 'again') return startSolo(S.solo?.kind ?? 'caravan');
    if (id === 'lobby') return endSolo(false);
    if (id === 'resume') {
      S.soloPaused = false;
      return;
    }
    if (id === 'endrun') {
      if (S.solo && !S.soloOver) {
        S.soloOver = { at: S.t, kind: 'ended' };
        finishRun(S.solo, S.solo.kind === 'caravan');
      }
      S.soloPaused = false;
      return;
    }
    if (id === 'pause') {
      S.soloPaused = true;
      return;
    }
    if (id === 'rejoin') return rejoin();
  }

  // the platform's menu and touch controls: the layout reads ow.ui.reserved every frame, and resets the camera when it moves
  ow?.on?.('reserved', () => {
    S.cam = null;
  });
  ow?.on?.('pause', () => {
    if (S.screen === 'solo' && !S.soloOver) S.soloPaused = true;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (S.screen === 'solo' && !S.soloOver) S.soloPaused = true;
      audio.suspend(true);
    } else audio.suspend(false);
  });

  // ---------------------------------------------------------------- the frame

  let last = performance.now();
  let L = null;
  function frame() {
    requestAnimationFrame(frame);
    // the page's own clock, not the frame's timestamp: some hosts (headless captures, throttled frames) run that one at
    // another rate than timers and the network, and the solo runs, the match's playback and the sound must agree
    const now = performance.now();
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    safe(() => tick(dt));
  }
  requestAnimationFrame(frame);

  function tick(dt) {
    S.t += dt;
    const ws = fx.scale(dt);
    const wdt = dt * ws;
    fx.reduced = safe(() => !!ow?.settings?.reducedMotion, false);
    R.quality = safe(() => (['low', 'medium', 'high'].includes(ow?.settings?.quality) ? ow.settings.quality : 'high'), 'high');
    if (params.get('quality')) R.quality = params.get('quality');
    const W = Math.max(1, window.innerWidth);
    const H = Math.max(1, window.innerHeight);
    const pr = (ow?.settings && safe(() => ow.settings.pixelRatio(2), null)) || Math.min(2, window.devicePixelRatio || 1);
    R.resize(W, H, pr);
    S.reserved = ow && ow.ui ? safe(() => ow.ui.reserved ?? null, null) : null;
    // Readied on the platform's strip: straight back from a solo run or the Stable.
    const ready = !!S.room?.me?.ready;
    if (ready && !S.wasReady) closeMenus();
    S.wasReady = ready;
    hits.clear();
    keyMove(dt);
    autoStartMatch();

    let sc;
    if (S.closed) sc = closedScene();
    else if (S.screen === 'solo' && S.solo) sc = soloScene(dt, wdt);
    else if (S.screen === 'stable') sc = stableScene(dt, wdt);
    else sc = roomScene(dt, wdt);
    draw(sc, dt, wdt);
    fx.update(dt, wdt);
  }

  function autoStartMatch() {
    // captures (never in production): open a screen, or give the save some progress to show
    if (autoplay && !S.capSetUp && S.t > 1) {
      S.capSetUp = true;
      const xp = Number(params.get('xp'));
      if (xp > 0) {
        S.profile.xp = xp;
        S.profile.streak = { day: today(), n: Number(params.get('streak')) || 1 };
        S.profile.streakBest = Math.max(S.profile.streakBest, S.profile.streak.n);
        const g = goalsToday(S.profile, today());
        g.list[0].done = true;
        g.list[0].have = g.list[0].n;
      }
      const stars = Number(params.get('stars'));
      if (stars > 0) {
        S.profile.stars = Math.floor(stars);
        cleanProgress(S.profile);
      }
      if (autoplay === 'stable') openStable();
    }
    // captures: `&endat=<s>` ends the run then, to show the board
    const endAt = Number(params.get('endat'));
    if (autoplay === 'caravan' && endAt > 0 && S.solo && !S.soloOver && S.t > endAt) {
      S.soloOver = { at: S.t, kind: 'ended' };
      finishRun(S.solo, S.solo.kind === 'caravan');
    }
    // captures: a Caravan run played by the animals
    if (autoplay === 'caravan' && S.screen !== 'solo' && S.t > 1.2 && !S.autoRunStarted) {
      S.autoRunStarted = true;
      startSolo(params.get('daily') ? 'daily' : 'caravan');
      return;
    }
    if (!S.autoStart || !S.room || !S.net) return;
    const room = S.room;
    if (room.match?.phase !== 'lobby') return;
    if (S.t < 1.5 || S.t < S.hostStartAt) return;
    S.hostStartAt = S.t + 2;
    if (room.kind !== 'public' && room.isHost) {
      if (room.canStart) safe(() => room.startMatch());
    } else safe(() => room.setReady(true));
  }

  // ---------------------------------------------------------------- scenes

  function baseScene() {
    return {
      sun: 0,
      night: 0,
      scroll: 0,
      camel: { mood: 0, look: 0, fold: 0, knocked: false, walk: null, chew: true, straw: false },
      items: [],
      saddle: { y: 0, a: 0 },
      box: { x0: -2.75, x1: 1.7, y1: 3.0 },
      needle: null,
      band: BAND,
      tags: null,
      cart: null,
      bridge: true,
      lanterns: null,
      hud: [],
    };
  }

  function closedScene() {
    const sc = baseScene();
    const reason = S.closed;
    const [msg, btn] = reason === 'kicked' ? ['You were removed', 'Play'] : reason === 'replaced' ? ['Playing in another tab', 'Play here'] : ['Connection lost', 'Rejoin'];
    sc.hud.push((ctx) => {
      const c = L.center;
      drawSign(ctx, c.x, c.y, [{ s: msg, size: L.phone ? 30 : 40 }], 1);
      const bw = 220, bh = 64;
      const r = slab(ctx, { x: c.x - bw / 2, y: c.y + 60, w: bw, h: bh }, btn, { primary: true });
      hits.add(r, 'rejoin');
    });
    return sc;
  }

  // ------------------------------------------------ a local run as a scene

  /** The look of a town on the road: its land, and the hour (a day passes every four towns; the night market at night). */
  const townTod = (leg) => (((leg - 1) % 4) / 3) * 0.9;
  function runLookOf(so) {
    const c = so.c, st = so.st;
    return { leg: c.leg, twist: c.twist, scroll: st.scroll, townX: st.townX };
  }

  /**
   * A run's look changes all at once (a new town, the camel back at the stall after a lost load on the road): a sand gust
   * sweeps across and the change happens behind it.
   */
  function soloLook(so, dt) {
    const now = runLookOf(so);
    const prev = so.look;
    if (prev && !so.veil && (now.leg !== prev.leg || now.scroll < prev.scroll - 0.01)) {
      so.veil = { t: 0, from: prev };
      audio.whoosh();
    }
    let look = now;
    if (so.veil) {
      so.veil.t += dt;
      if (so.veil.t < VEIL / 2) look = so.veil.from;
      if (so.veil.t >= VEIL) so.veil = null;
      fx.wind(-0.8);
    }
    so.look = now;
    return look;
  }
  const VEIL = 0.8;

  function drawVeil(ctx, so) {
    if (!so.veil) return;
    const u = clamp(so.veil.t / VEIL, 0, 1);
    const a = Math.sin(Math.PI * u);
    const W = L.W, H = L.H;
    // a wall of blown sand, thick in the middle
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(240,170,110,${0.75 * a})`);
    g.addColorStop(0.6, `rgba(246,196,130,${0.95 * a})`);
    g.addColorStop(1, `rgba(232,160,100,${0.9 * a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = `rgba(255,236,200,${0.5 * a})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const y = ((i * 97.3) % 1) * H + ((i * 61) % H);
      const x = ((S.t * (900 + i * 37) + i * 211) % (W + 400)) - 200;
      ctx.moveTo(W - x, y % H);
      ctx.lineTo(W - x + 60 + (i % 5) * 30, (y % H) + 2);
    }
    ctx.stroke();
  }

  /** The sign as a town comes into view: where it is, and its twist. */
  function townSign(so, at) {
    const c = so.c;
    const big = L?.phone ? 46 : 64;
    const place = BIOMES[c.twist === 'night' ? 'night' : biomeFor(c.leg)]?.name ?? '';
    const lines = [{ s: `Town ${c.leg}`, size: big * 0.45, color: PAL.violet }, { s: place, size: big }];
    const tw = TWISTS[c.twist];
    // the night market is both the place and its twist: its name once
    if (tw && tw.name !== place) lines.push({ s: tw.name, size: big * 0.6, color: PAL.roseDark });
    if (tw) lines.push({ s: tw.line, size: 20, display: false });
    S.townSign = { at, lines, hold: tw ? 2.2 : 1.4 };
    if (tw) setTimeout(() => audio.brass([392, 523.3]), Math.max(0, (at - S.t) * 1000));
  }

  function soloWorld(so, wdt) {
    const sc = baseScene();
    const st = so.st;
    const v = so.view();
    const c = so.c;
    const look = soloLook(so, wdt);
    sc.items = v.items;
    sc.saddle = v.saddle;
    sc.crack = v.crack;
    sc.camel.fold = v.fold;
    sc.camel.knocked = v.knocked;
    // the camel faces left: walking, the land slides right
    sc.scroll = -look.scroll;
    sc.camel.walk = st.walking ? st.walkPhase : null;
    // a footfall each time a pair of feet comes down (the pace gait plants both feet of a side at once)
    const pace = sc.camel.walk == null ? null : Math.floor(sc.camel.walk / Math.PI);
    if (pace != null && so.lastPace != null && pace !== so.lastPace) audio.step(pace, 1);
    so.lastPace = pace;
    sc.town = look.townX;
    sc.bridge = false;
    sc.needle = v.S;
    sc.band = runBand(c);
    sc.camel.mood = st.beat ? 3 : c.step === 'settle' ? Math.max(c.mood, moodOf(v.S, c.T)) : c.mood;
    if (st.beat) sc.camel.mood = st.beat.kind === 'broke' ? 3 : 2;
    sc.biome = look.twist === 'night' ? 'night' : biomeFor(look.leg);
    sc.tod = look.twist === 'night' ? 0.95 : townTod(look.leg);
    const tw = TWISTS[look.twist];
    if (tw?.wind && (c.step === 'settle' || c.step === 'road' || c.step === 'place')) fx.wind(Math.sign(runPhysics(c).wind ?? 1) * 0.55);
    const top = c.top;
    sc.box.y1 = Math.max(3.0, top + 1.0);
    // a cat strolling along the load
    if (v.walkingCat >= 0 && sc.items[v.walkingCat]) {
      const cat = sc.items[v.walkingCat];
      const dx = cat.x - (so.catX ?? cat.x);
      so.catX = cat.x;
      if (Math.abs(dx) > 0.0012) {
        so.catDir = dx > 0 ? 1 : -1;
        so.catWalkT = S.t;
      }
      if (S.t - (so.catWalkT ?? -9) < 0.12) sc.items[v.walkingCat] = { ...cat, walking: true, dir: so.catDir };
    } else so.catX = undefined;
    // the hands
    if (c.step === 'place') {
      const item = so.held;
      if (st.auto) {
        const h = st.handPos ?? { x: 0, y: hoverBox(item, 0, top).yDef, a: 0 };
        sc.hands = { item, x: h.x, y: h.y, a: h.a, who: autoplay === 'caravan' ? { kind: 'player', seat: 0, sleeve: mySleeve() } : st.who, open: 0, visible: true };
      } else if (S.hand) {
        sc.hands = { item, x: S.hand.x, y: S.hand.y, a: S.hand.a, who: { kind: 'player', seat: 0, sleeve: mySleeve() }, open: 0, visible: true };
        sc.ghost = ghostOf(c.snap, `solo:${c.draws}:${c.load}:${c.leg}`);
      }
    }
    if (c.step === 'settle' && st.drop && st.runner && st.runner.sim.steps < 24) {
      const open = Math.min(1, st.runner.sim.steps / 14);
      const who = st.auto && autoplay !== 'caravan' ? st.who : { kind: 'player', seat: 0, sleeve: mySleeve() };
      sc.handsAfter = { item: st.drop.item, x: st.drop.x, y: st.drop.y + open * 0.4, a: st.drop.a, who, open: 1, visible: true, alpha: 1 - open };
    }
    // the cart (it waits at the town while the camel is on the road)
    const away = c.step === 'road' || c.step === 'deliver' || c.step === 'perk';
    sc.cart = away ? null : { offer: c.offer.slice(), hide: c.step === 'pick' ? -1 : c.pick, big: c.step === 'pick' && !st.auto, sel: S.cartSel, keys: !S.touch };
    return sc;
  }

  /** Where the run's boards go on this screen. */
  function runSpots() {
    const ph = L.phone;
    const post = { w: ph ? 156 : 200, h: ph ? 56 : 66 };
    const go = { w: ph ? 150 : 196, h: ph ? 58 : 70 };
    if (L.portrait) {
      post.x = 12;
      post.y = L.rope.y + L.rope.h + 12;
      go.x = L.W - go.w - 12;
      go.y = L.cart.y - go.h - 12;
    } else {
      post.x = L.W - post.w - 12;
      post.y = L.dial.y + L.dial.r + 22;
      const B = L.buttons.drop;
      go.x = Math.min(L.W - go.w - 14, B.x + B.w - go.w);
      go.y = B.y + B.h - go.h;
      // a short screen: the post goes left of the dial
      if (post.y + post.h > go.y - 70) {
        post.x = L.dial.x - L.dial.r - post.w - 16;
        post.y = L.dial.y - post.h / 2;
      }
    }
    return { post, go };
  }

  function soloScene(dt, wdt) {
    const so = S.solo;
    // an ended run stops where it is (the animals of a capture stop loading too)
    const halted = S.soloOver?.kind === 'ended' && so.st.auto && !so.st.beat && so.c.step !== 'settle';
    if (!S.soloPaused && !halted) so.update(wdt);
    const sc = soloWorld(so, wdt);
    if (S.soloOver) sc.hands = null;
    const c = so.c;
    const st = so.st;
    audio.setMusic(S.soloPaused ? 'menu' : c.step === 'road' ? 'road' : 'play', clamp((sc.needle ?? 0) / sc.band[1], 0, 1));
    // my tag alone: kg delivered (big)
    sc.tags = [{ id: S.me.id, name: so.kind === 'daily' ? 'Daily cart' : S.me.name, seat: 0, kg: c.delivered, me: true, avatar: avatarOf(S.me.id) }];
    const mine = (!st.auto || autoplay === 'caravan') && !S.soloOver && !S.soloPaused;
    // hints
    if (mine && !st.auto) {
      if (c.step === 'pick' && c.load === 0 && c.leg === 1) hint('pick', 'Pick one', 'cart');
      else if (c.step === 'place' && S.hand) placeHints();
      else if (so.canSetOff && c.mood >= 2 && !S.profile.hints.sweat) hint('sweat', 'Sweating pays ×2', 'setoff');
      else if (so.canSetOff && !S.profile.hints.setoff) hint('setoff', 'More load, more pay', 'setoff');
      else if (c.step === 'perk' && !S.profile.hints.perk && S.t >= (S.perkShowAt ?? 0)) hint('perk', 'Take one');
    }
    const sign = S.lostSign && S.t >= S.lostSign.at ? { lines: [{ s: 'Load lost', size: L.phone ? 44 : 60, color: PAL.roseDark }, { s: c.patience === 1 ? 'Last chance' : `Patience ${c.patience}`, size: 22, display: false }], at: S.lostSign.at, hold: 9 } : S.townSign && S.t >= S.townSign.at ? S.townSign : null;
    if (sign && !S.soloOver) {
      const age = S.t - sign.at;
      const hold = sign.hold ?? 1.6;
      if (age < hold + 0.4) sc.sign = { lines: sign.lines, drop: age < hold ? clamp(age / 0.35, 0, 1) : clamp(1 - (age - hold) / 0.35, 0, 1) };
      else if (sign === S.townSign) S.townSign = null;
    }
    sc.hud.push((ctx) => {
      drawVeil(ctx, so);
      const spots = runSpots();
      S.runSpots = spots;
      const away = c.step === 'road' || c.step === 'deliver' || c.step === 'perk';
      const B = L.buttons;
      const touchButtons = myPlace() && S.touch;
      const under = (r) => touchButtons && [B.drop, B.ccw, B.cw].some((b) => b.x < r.x + r.w && r.x < b.x + b.w && b.y < r.y + r.h && r.y < b.y + b.h);
      // the town's post: its order filling up, the twist, the camel's patience
      if (!S.soloOver && !under(spots.post) && c.step !== 'deliver' && c.step !== 'perk') {
        const r = spots.post;
        const order = townOrder(c.leg);
        const bump = clamp(1 - (S.t - (S.postBumpAt ?? -9)) / 0.35, 0, 1);
        drawTownPost(ctx, r, { town: c.leg + 1, kg: c.kgLeg, order, t: S.t, bump });
        const tw = TWISTS[c.twist];
        const lostAge = S.patienceLostAt != null ? S.t - S.patienceLostAt : null;
        const shown = c.patience + (lostAge !== null && lostAge < 0 ? 1 : 0);
        so.maxPatienceSeen = Math.max(so.maxPatienceSeen ?? 0, shown, RUN.patience);
        drawPatience(ctx, r.x + r.w - 18, r.y + r.h + 26, shown, so.maxPatienceSeen, { t: S.t, lostAge: lostAge !== null && lostAge >= 0 ? lostAge : null, gainAge: S.patienceGainAt != null ? S.t - S.patienceGainAt : null, size: L.phone ? 18 : 22 });
        if (tw && !away) drawTwistTag(ctx, r.x + 40, r.y + r.h + 14, tw.name, S.t);
      }
      // Set off
      if (mine && (c.step === 'pick' || c.step === 'full') && c.load >= 1 && !under(spots.go)) {
        const can = so.canSetOff;
        if (can && !S.goSince) S.goSince = S.t;
        if (!can) S.goSince = 0;
        const r = drawSetOff(ctx, spots.go, { can, left: so.loadsLeft, pay: can ? payout(c, c.mood) : null, t: S.t, keys: !S.touch, appear: can ? (S.t - S.goSince) / 0.35 : 1 });
        if (can) hits.add(r, 'setoff');
      }
      // a town: the receipt, then the gifts
      if (c.step === 'perk' && !S.soloOver && S.perkSince) {
        ctx.fillStyle = `rgba(28,15,46,${0.32 * clamp((S.t - S.perkSince) / 0.4, 0, 1)})`;
        ctx.fillRect(0, 0, L.W, L.H);
      }
      if (S.receipt && (c.step === 'deliver' || c.step === 'perk') && !S.soloOver) drawReceipt(ctx, so);
      if (c.step === 'perk' && !S.soloOver && S.t >= (S.perkShowAt ?? 0)) {
        const top = S.receiptBottom ?? L.rope.y + L.rope.h + 90;
        const rects = perkRects(L.W, top + 14, Math.min(L.gy + 40, L.H - 20));

        const keys = c.perkOffer;
        if (!S.perkSince) S.perkSince = S.t;
        drawPerkCards(ctx, rects, keys, { t: S.t, age: S.t - S.perkSince, sel: S.perkSel, keys: !S.touch && mine, have: keys.map((k) => perkCount(c, k)) });
        if (mine) rects.forEach((r, i) => hits.add(r, 'perk', i));
      } else S.perkSince = 0;
      // pause
      if (!S.soloOver) {
        const pr = { x: L.W - 66, y: L.rope.y + L.rope.h + 6, w: 54, h: 50 };
        if (L.portrait) pr.y = L.dial.y + L.dial.r + 16;
        slab(ctx, pr, 'II', { size: 22 });
        hits.add(pr, 'pause');
      }
      if (S.soloPaused && !S.soloOver) pauseBoard(ctx);
      if (S.soloOver && S.soloBoard && S.t - S.soloOver.at > 0.4) runBoard(ctx, so);
    });
    return sc;
  }

  /** At a town: the load's kg, what multiplies it, and (once unloaded) what it paid. */
  function drawReceipt(ctx, so) {
    const R0 = S.receipt;
    const pay = R0.pay;
    if (!pay) return;
    const compact = so.c.step === 'perk';
    const big = L.phone ? 34 : 46;
    const lines = [];
    const age = S.t - R0.at;
    if (compact) {
      lines.push({ s: `Town ${R0.town}  +${pay.total} kg`, size: big * 0.72 });
      if (pay.short) lines.push({ s: `Short of ${pay.order}`, size: 18, color: PAL.roseDark });
    } else {
      lines.push({ s: `Town ${R0.town}`, size: big * 0.62, color: PAL.violet });
      const rows = [{ s: `${pay.base} kg${pay.mult > 1.001 ? `  ×${pay.mult.toFixed(1)}` : ''}`, size: big * 0.62 }];
      if (pay.brink > 1) rows.push({ s: `Sweat ×${pay.brink}`, size: big * 0.5, color: PAL.roseDark });
      if (pay.soft > 0) rows.push({ s: `Soft +${pay.soft}`, size: big * 0.5, color: PAL.goldDark });
      if (pay.haggle > 1) rows.push({ s: `Haggle ×${pay.haggle.toFixed(2)}`, size: big * 0.5, color: PAL.turqDark });
      const n = Math.min(rows.length, 1 + Math.floor(age / 0.32));
      lines.push(...rows.slice(0, n));
      if (R0.done) lines.push({ s: `+${pay.total} kg`, size: big, color: PAL.ink });
      if (R0.done && pay.short) lines.push({ s: `Short of ${pay.order}`, size: 18, color: PAL.roseDark });
      if (n > (R0.shown ?? 0)) {
        R0.shown = n;
        audio.tick(false);
      }
    }
    const cy = L.rope.y + L.rope.h + 24;
    const r = drawSign(ctx, L.W / 2, cy + 60, lines, clamp(age / 0.35, 0, 1), { minW: L.phone ? 200 : 260 });
    S.receiptAt = { x: L.W / 2, y: r.y + r.h * 0.5 };
    S.receiptBottom = r.y + r.h;
  }

  function choosePerk(i) {
    const so = S.solo;
    if (!so || so.st.auto || so.step !== 'perk' || S.t < (S.perkShowAt ?? 0) + 0.25) return;
    if (so.choosePerk(i)) hintDone('perk');
  }

  function setOff() {
    const so = S.solo;
    if (!so || so.st.auto || S.soloPaused || S.soloOver || !so.canSetOff) return;
    if (so.setOff()) hintDone('setoff');
  }

  // ------------------------------------------------ the Stable: dress the camel, see the day's goals

  function openStable() {
    audio.select();
    if (S.screen === 'solo') endSolo(false);
    S.screen = 'stable';
    S.stableAt = S.t;
    S.lockedTip = null;
    goalsToday(S.profile, today());
  }
  function closeStable() {
    audio.tok();
    S.fresh.clear();
    S.screen = 'game';
    S.cam = null;
    saveProfile();
  }
  function wear(u) {
    const p = S.profile;
    if (!isUnlocked(p, u)) return;
    if (u.kind === 'sleeve') p.sleeve = u.id;
    else p.look = { ...(p.look ?? {}), [u.kind]: u.id };
    S.fresh.delete(`${u.kind}:${u.id}`);
    saveSoon();
    audio.select();
    audio.grumble(0);
    actor.impulse(6, 3);
    S.camel.lookT = 1.2;
    const hp = headPoint({ t: S.t, saddle: { y: 0, a: 0 } });
    if (S.cam) for (let i = 0; i < 3; i++) fx.debris(u.kind === 'coat' ? 'straw' : 'cloth', hp.x + 0.6, hp.y - 0.3 - i * 0.3, 6, 0.3);
  }

  /** Where the camel stands and where the panel goes. */
  function stableSpots() {
    const W = L.W, H = L.H;
    const top = L.rope.y + L.rope.h + 10;
    if (L.portrait) {
      const ph = Math.min(H * 0.66, 620);
      const panel = { x: 10, y: H - ph - 10, w: W - 20, h: ph };
      // the camel stands on the panel's top edge, above the wardrobe, so what it wears stays in sight
      const y0 = L.rope.y + 4;
      const ground = panel.y - 8;
      return { panel, ground, stage: { x: 10, y: y0 + 50, w: W - 20, h: Math.max(80, ground - y0 - 50) }, back: { x: 12, y: y0, w: 110, h: 50 } };
    }
    const pw = Math.min(W * 0.56, 640);
    const panel = { x: W - pw - 14, y: top, w: pw, h: H - top - 14 };
    return { panel, stage: { x: 20, y: top + 50, w: panel.x - 40, h: Math.max(80, L.gy - top - 60) }, back: { x: 14, y: top, w: 120, h: 54 } };
  }

  function stableScene(dt, wdt) {
    const sc = baseScene();
    sc.needle = null;
    sc.cart = null;
    sc.bridge = true;
    sc.tod = 0.18;
    sc.biome = 'oasis';
    sc.camel.chew = true;
    sc.box = { x0: -3.1, x1: 1.8, y1: 3.2 };
    sc.stage = () => stableSpots().stage;
    sc.ground = () => stableSpots().ground;
    audio.setMusic('menu', 0);
    const p = S.profile;
    goalsToday(p, today());
    sc.hud.push((ctx) => {
      const sp = stableSpots();
      const age = S.t - (S.stableAt ?? 0);
      const k = 1 - (1 - clamp(age / 0.35, 0, 1)) ** 3;
      ctx.save();
      ctx.translate((1 - k) * (L.portrait ? 0 : 80), (1 - k) * (L.portrait ? 80 : 0));
      ctx.globalAlpha = k;
      const P = sp.panel;
      const dayH = L.portrait ? clamp(P.h * 0.3, 176, 196) : clamp(P.h * 0.4, 180, 240);
      drawDayBoard(ctx, { x: P.x, y: P.y, w: P.w, h: dayH }, { profile: p, day: today(), t: S.t, popId: S.goalPop?.i, popAge: S.goalPop ? S.t - S.goalPop.at : null });
      const W0 = { x: P.x, y: P.y + dayH + 6, w: P.w, h: P.h - dayH - 6 };
      const list = drawWardrobe(ctx, W0, { profile: p, look: lookOf(p), sleeve: mySleeve(), t: S.t, fresh: S.fresh });
      ctx.restore();
      for (const h of list) hits.add(h.rect, h.open ? 'look' : 'locked', h.u);
      const r = slab(ctx, sp.back, 'Back', { key: S.touch ? '' : 'Esc', size: 22 });
      hits.add(r, 'back');
      const tip = S.lockedTip;
      if (tip && S.t - tip.at < 1.6) {
        const h = list.find((x) => x.u === tip.u);
        if (h) drawHint(ctx, unlockLabel(tip.u), h.rect.x + h.rect.w / 2, h.rect.y - 18, S.t, null, clamp((1.6 - (S.t - tip.at)) / 0.3, 0, 1));
      }
    });
    return sc;
  }

  function pauseBoard(ctx) {
    const c = L.center;
    drawSign(ctx, c.x, c.y, [{ s: 'Paused', size: 44 }], 1);
    const bw = 200, bh = 60;
    const r1 = slab(ctx, { x: c.x - bw - 8, y: c.y + 60, w: bw, h: bh }, 'Resume', { primary: true });
    const r2 = slab(ctx, { x: c.x + 8, y: c.y + 60, w: bw, h: bh }, 'End run');
    hits.add(r1, 'resume');
    hits.add(r2, 'endrun');
  }

  function runBoard(ctx, so) {
    const b = S.soloBoard;
    const age = S.t - S.soloOver.at - 0.4;
    const drop = clamp(age / 0.5, 0, 1);
    const e = 1 - (1 - drop) ** 3;
    const lines = [{ s: `${b.kg} kg`, size: L.phone ? 56 : 72 }, { s: b.kind === 'daily' ? `Daily cart · town ${b.town}` : `Reached town ${b.town}`, size: 24 }];
    if (b.newBest) lines.push({ s: 'New best', size: 26, color: PAL.roseDark });
    else lines.push({ s: `Best ${b.best} kg`, size: 22, color: PAL.violet });
    if (b.kind === 'daily' && !b.scored) lines.push({ s: 'Practice', size: 20, color: PAL.violet });
    const list = (b.list ?? []).slice(0, 5).map((e2, i) => ({ s: `${i + 1}. ${e2.name.slice(0, 16)}  ${e2.kg} kg`, size: 18, display: false, color: e2.me ? PAL.roseDark : PAL.ink }));
    const side = list.length && L.W >= 900;
    if (list.length && !side && L.H >= 640) lines.push(...list);
    const c = L.center;
    const cx = side ? c.x - 160 : c.x;
    const r = drawSign(ctx, cx, Math.max(L.rope.y + L.rope.h + 120, c.y + 10), lines, e, { minW: 270 });
    if (side) drawSign(ctx, c.x + 170, r.y + r.h / 2, [{ s: b.kind === 'daily' ? 'Today' : 'Top caravans', size: 26, color: PAL.violet }, ...list], clamp((age - 0.25) / 0.5, 0, 1), { minW: 240 });
    // the XP this run earned, filling the level bar
    let y = r.y + r.h + 16;
    if (S.runXp && drop >= 1) {
      const xp1 = S.profile.xp, xp0 = S.runXp.xp0 ?? xp1;
      const f = clamp((age - 0.5) / 1.2, 0, 1);
      const shown = Math.round(xp0 + (xp1 - xp0) * (1 - (1 - f) ** 2));
      const lv = levelOf(shown);
      const w = Math.min(340, L.W - 40), h = 46;
      const x = cx - w / 2;
      const p = rr(new Path2D(), x, y, w, h, 10);
      ctx.fillStyle = 'rgba(28,15,46,0.55)';
      ctx.fill(p);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = PAL.ink;
      ctx.stroke(p);
      levelBadge(ctx, x + 26, y + h / 2, 17, lv.level, S.t);
      xpBar(ctx, { x: x + 52, y: y + h / 2 - 8, w: w - 140, h: 16 }, lv.frac, '');
      text(ctx, `+${S.runXp.xp} XP`, x + w - 12, y + h / 2 + 1, { size: 18, align: 'right', display: true, weight: 900, color: PAL.gold, lw: 4 });
      if (f < 1 && Math.floor(S.t * 12) !== S.xpTickAt) {
        S.xpTickAt = Math.floor(S.t * 12);
        audio.tick(false);
      }
      y += h + 14;
    }
    if (drop >= 1) {
      const bw = Math.min(180, (L.W - 40) / 2 - 8), bh = 60;
      y = Math.min(L.H - bh - 12, y);
      const r1 = slab(ctx, { x: cx - bw - 8, y, w: bw, h: bh }, 'Again', { primary: true, key: S.touch ? '' : 'Space' });
      const r2 = slab(ctx, { x: cx + 8, y, w: bw, h: bh }, 'Lobby', { key: S.touch ? '' : 'Esc' });
      hits.add(r1, 'again');
      hits.add(r2, 'lobby');
    }
  }

  function placeHints() {
    const touch = S.touch;
    if (!S.profile.hints.aim) hint('aim', touch ? 'Drag to aim' : 'Move to aim');
    else if (!S.profile.hints.turn) hint('turn', touch ? 'Turn it' : 'Q E turn', touch ? 'turn' : null);
    else if (!S.profile.hints.drop) hint('drop', touch ? 'Tap Drop' : 'Click to drop', touch ? 'drop' : null);
    else if (!S.profile.hints.soft) hint('soft', 'Lower it: soft bonus');
  }

  const view = createMatchView({
    S,
    fx,
    hits,
    autoplay,
    get L() {
      return L;
    },
    hint,
    hintDone,
    award,
    saveProfile,
    mySleeve,
    avatarOf,
    beginHand,
    clampHand,
    ghostOf,
    doPick,
    doDrop,
    landJuice,
    smashJuice,
    myLoadHeld,
    matchPlayed,
    toast,
    placeHints,
    baseScene,
    today,
  });
  const { roomScene, onResults } = view;

  // ---------------------------------------------------------------- drawing

  function draw(sc, dt, wdt) {
    const ctx = R.ctx;
    const tagsN = sc.tags ? sc.tags.length : 1;
    const inLobby = S.room?.match?.phase === 'lobby' && S.screen === 'game';
    L = layout(R.W, R.H, S.reserved, { lobby: inLobby, tags: tagsN });
    if (sc.stage) L.stage = sc.stage(L);
    if (sc.ground) L.gy = sc.ground(L) ?? L.gy;

    // the camel's own animation: squash, side-eye, knees
    const A = S.camel;
    A.squash = Math.max(0, A.squash - dt * 2.2);
    A.lookT = Math.max(0, A.lookT - dt);
    A.look += ((A.lookT > 0 ? 1 : 0) - A.look) * Math.min(1, dt * 6);
    const needleT = sc.needle ?? 0;
    const nd = S.needle;
    const prev = nd.v;
    nd.vel += ((needleT - nd.v) * 90 - nd.vel * 11) * dt;
    nd.v += nd.vel * dt;
    if (Math.abs(nd.v - prev) > 0.5 && Math.abs(nd.vel) > 60 && S.t - (S.boingAt ?? 0) > 0.6) {
      S.boingAt = S.t;
      audio.boing();
    }
    const strain01 = clamp(needleT / 100, 0, 1.1);
    const lookAt = sc.hands && sc.hands.visible ? { x: sc.hands.x, y: sc.hands.y } : sc.lookAt ?? null;
    actor.update(wdt, { mood: sc.camel.mood, strain01, fold: sc.camel.fold, walk: sc.camel.walk, saddle: sc.saddle, knocked: sc.camel.knocked, look: A.look, lookAt, chew: sc.camel.chew });
    const camel = {
      ...sc.camel,
      t: S.t,
      saddle: sc.saddle,
      bow: clamp(strain01 * 0.7 + A.squash * 0.3, 0, 1),
      tremble: sc.camel.mood >= 2 ? (sc.camel.mood - 1) / 2 : 0,
      look: A.look,
      actor,
      ...lookOf(S.profile),
    };
    // sweat
    if (sc.camel.mood >= 2 && !sc.camel.knocked && Math.random() < dt * (sc.camel.mood === 3 ? 5 : 2)) {
      const hp = headPoint(camel);
      fx.sweat(hp.x + 0.12, hp.y + 0.1);
    }
    // a creak now and then, faster with the strain
    if (strain01 > 0.55 && Math.random() < dt * strain01 * 0.8) audio.creak(0.03 + strain01 * 0.05);

    // the camera
    // frame the load and whatever is in the hands; push in a little while the camel is in the red
    const box = { ...sc.box };
    if (sc.hands?.visible && ITEMS[sc.hands.item]) box.y1 = Math.max(box.y1, sc.hands.y + extents(sc.hands.item, sc.hands.a).maxY + 0.3);
    const danger = (sc.camel.mood ?? 0) >= 2 ? ((sc.camel.mood ?? 0) - 1) * 0.03 : 0;
    const target = fitCamera(L.stage, L.gy, box);
    if (danger) {
      target.s *= 1 + danger;
      target.ox = L.stage.x + L.stage.w / 2 - ((box.x0 + box.x1) / 2) * target.s;
    }
    if (!S.cam || S.cam.W !== L.W || S.cam.H !== L.H) S.cam = { ...target, W: L.W, H: L.H };
    else {
      const k = Math.min(1, dt * 3);
      S.cam.s += (target.s - S.cam.s) * k;
      S.cam.ox += (target.ox - S.cam.ox) * k;
      S.cam.oy = target.oy;
    }
    // the cart: a new offer rolls in; a pick lifts off. Hands reach down from above when they first appear.
    if (sc.cart && sc.cart.offer) {
      const key = sc.cart.offer.join(',');
      if (key !== S.cartKey) {
        S.cartKey = key;
        S.cartAt = S.t;
        S.cartPick = null;
      }
      sc.cart.age = S.t - S.cartAt;
      const hide = sc.cart.hide ?? -1;
      if (hide >= 0 && S.cartHide !== hide) S.cartPick = { i: hide, item: sc.cart.offer[hide], at: S.t };
      S.cartHide = hide;
      if (S.cartPick && hide === S.cartPick.i) sc.cart.pick = { ...S.cartPick, age: S.t - S.cartPick.at };
    }
    if (sc.hands?.visible) {
      const w = sc.hands.who ?? {};
      const hk = `${sc.hands.item}:${w.kind}:${w.seat ?? w.fur}`;
      if (hk !== S.handsKey) {
        S.handsKey = hk;
        S.handsAt = S.t;
      }
      const u = clamp((S.t - S.handsAt) / 0.3, 0, 1);
      if (u < 1) sc.hands = { ...sc.hands, y: sc.hands.y + (1 - u) ** 3 * 1.6 };
    } else S.handsKey = '';
    const off = fx.offset(S.t);
    // a punch-in on heavy landings, toward the middle of the stage
    const z = fx.zoom;
    const zx = L.stage.x + L.stage.w / 2, zy = L.stage.y + L.stage.h * 0.55;
    const cam = { s: S.cam.s * z, ox: zx + (S.cam.ox - zx) * z + off.x, oy: zy + (S.cam.oy - zy) * z + off.y };

    const painted = paint(R, L, sc, { t: S.t, dt, cam, needle: nd.v, camel, tagAnim, fx, avatarOf, reduced: fx.reduced });
    S.tagPos = painted.tagPos;
    if (sc.tags) {
      const mine = sc.tags.find((g) => g.me);
      S.myTagPos = mine ? S.tagPos.get(mine.id) : null;
      // taps on tags: mine changes sleeves in the lobby; an empty seat invites
      if (S.screen === 'game' && S.room?.match?.phase === 'lobby') {
        for (const g of sc.tags) {
          const p = S.tagPos.get(g.id);
          if (!p) continue;
          const r = { x: p.x - p.w / 2, y: p.top, w: p.w, h: p.h };
          if (g.me) hits.add(r, 'sleeve');
          else if (g.invite) hits.add(r, 'invite');
        }
      }
    }
    if (sc.cart) {
      const boxes = painted.cartBoxes;
      if (sc.cart.big) boxes.forEach((b) => hits.add(b, 'pick', b.i));
      if (sc.cart.settings) for (const row of sc.cart.settings) if (row.can && row.rect) hits.add(row.rect, 'setting', row.id);
    }
    // touch buttons: only while I place
    if (myPlace() && S.touch && !autoplay) {
      const B = L.buttons;
      slab(ctx, B.drop, 'Drop', { primary: true, size: 24 });
      slab(ctx, B.ccw, '', { icon: turnIcon(-1) });
      slab(ctx, B.cw, '', { icon: turnIcon(1) });
      hits.add(B.drop, 'drop');
      hits.add(B.ccw, 'ccw');
      hits.add(B.cw, 'cw');
    }
    for (const f of sc.hud) f(ctx);
    if (sc.sign) drawSign(ctx, L.center.x, L.center.y, sc.sign.lines, 1 - (1 - sc.sign.drop) ** 3);
    drawHintNow(ctx);
    fx.drawScreen(ctx);
    drawToasts(ctx);
    if (!document.body.dataset.ready && S.t > 0.3) document.body.dataset.ready = '1';
  }


  function drawHintNow(ctx) {
    const h = S.hint;
    if (!h) return;
    const age = S.t - h.at;
    if (age > 6 && h.id !== 'pick') {
      hintDone(h.id);
      return;
    }
    if ((h.id === 'needle' || h.id === 'red' || h.id === 'next') && age > 2.6) {
      hintDone(h.id);
      return;
    }
    // still relevant?
    if (h.id === 'pick' && !myPick()) {
      S.hint = null;
      return;
    }
    if ((h.id === 'aim' || h.id === 'turn' || h.id === 'drop' || h.id === 'soft') && !myPlace()) {
      S.hint = null;
      return;
    }
    if ((h.id === 'setoff' || h.id === 'sweat') && !(S.screen === 'solo' && S.solo?.canSetOff)) {
      S.hint = null;
      return;
    }
    if (h.id === 'perk' && S.solo?.step !== 'perk') {
      S.hint = null;
      return;
    }
    let arrow = null;
    let x = L.center.x, y = L.center.y;
    if (h.arrow === 'cart') {
      x = L.cart.x + L.cart.w / 2 + (L.portrait ? 0 : 40);
      y = L.cart.y - 36;
      arrow = { x: L.cart.x + L.cart.w * 0.5, y: L.cart.y + 10 };
      if (!L.portrait) {
        x = L.cart.x + L.cart.w + 110;
        y = L.cart.y + 20;
        arrow = { x: L.cart.x + L.cart.w - 10, y: L.cart.y + L.cart.h * 0.4 };
      }
    } else if (h.arrow === 'dial') {
      x = L.dial.x - L.dial.r - (L.portrait ? 60 : 110);
      y = L.dial.y + L.dial.r + 26;
      arrow = { x: L.dial.x - L.dial.r * 0.7, y: L.dial.y + L.dial.r * 0.6 };
    } else if (h.arrow === 'setoff' && S.runSpots) {
      const g = S.runSpots.go;
      x = clamp(g.x + g.w / 2 - (L.portrait ? 60 : 160), 110, L.W - 110);
      y = g.y - (L.portrait ? 110 : 40);
      arrow = { x: g.x + 10, y: g.y + 6 };
    } else if (h.arrow === 'drop' || h.arrow === 'turn') {
      const b = h.arrow === 'drop' ? L.buttons.drop : L.buttons.ccw;
      x = Math.min(L.W - 100, b.x);
      y = b.y - 60;
      arrow = { x: b.x + b.w / 2, y: b.y - 4 };
    } else if (typeof h.arrow === 'string' && h.arrow.startsWith('tag:')) {
      const p = S.tagPos?.get(h.arrow.slice(4));
      if (p) {
        x = clamp(p.x, 110, L.W - 110);
        y = p.top + p.h + 60;
        arrow = { x: p.x, y: p.top + p.h + 6 };
      }
    } else {
      y = L.rope.y + L.rope.h + 40;
    }
    const a = clamp(age / 0.2, 0, 1);
    drawHint(ctx, h.s, x, y, S.t, arrow, a);
  }
}

if (params.has('poster')) import('./poster.js').then((m) => m.runPoster(params.get('poster'))).catch((err) => console.error(err));
else boot().catch((err) => console.error(err));

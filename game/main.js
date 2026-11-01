// Boot, the screens, input, and the glue between the room (or a local run) and the picture.

import { ITEMS, STRAW, ANVIL, isItem, weightLabel } from './items.js';
import { createSettle, hoverBox, clampHover, quantDrop, wrapAngle, snapPose, poseAt, landing, Sim, BAND, CAMEL } from './physics.js';
import { turnKey, placer, heldItem, nextPlayer, moodOf, legBand, dayNumber, dailySeed, dailyBoard, CART_MS } from './rules.js';
import { personaOf, botPick, BOT_NAMES } from './bots.js';
import { createRng } from './rng.js';
import { createNet, JOIN, SETTINGS, readSettings, nextSettingValue } from './net.js';
import { createSolo, createAutoHand, foldAt, WALK_SPEED } from './solo.js';
import { createRenderer, fitCamera, toScreen, toWorld } from './render.js';
import { paint, buildHeap } from './scene.js';
import { headPoint, foldPose } from './camel.js';
import { PAL, SLEEVES, drawPortrait, drawHands } from './art.js';
import { layout, createHits, text, slab, turnIcon, drawRope, drawDial, drawCart, drawSign, drawHint, signpost, goldenStraw, itemInBox, textWidth, fitText } from './ui.js';
import { createFx } from './fx.js';
import * as audio from './audio.js';

const ow = window.onceworlds;
const params = new URLSearchParams(location.search);
const STEP_MS = 1000 / 60;
const PLAY_DELAY = 150;
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

const DEFAULT_PROFILE = { v: 1, wins: 0, matches: 0, best: 0, bestTown: 1, lifetime: 0, dailies: 0, steady: false, hints: {}, sleeve: 0 };

async function boot() {
  const roomPromise = joinRoom(); // join first, before anything heavy
  const canvas = document.getElementById('cv');
  const R = createRenderer(canvas);
  const fx = createFx();
  const hits = createHits();
  const tagAnim = new Map();
  const autoplay = params.get('autoplay') && safe(() => ow?.mode !== 'production', false) ? params.get('autoplay') : null;

  safe(() => ow?.ui?.setLook?.({ accent: '#FFC845', panel: '#3B2160', text: '#FFF0D9' }));
  safe(() => ow?.controls?.set?.(null));
  safe(() => document.fonts?.load?.(`900 40px "Big Shoulders Display"`)?.catch?.(() => {}));
  safe(() => document.fonts?.load?.(`800 18px Archivo`)?.catch?.(() => {}));

  const S = {
    screen: 'title',
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
    demo: null,
    demoWait: 0,
    closed: null,
    autoHand: null,
    autoPickAt: 0,
    gift: null, // the anvil handed on: { rid, tn, to }
    results: null,
    resultsAt: 0,
    countdownN: -1,
    lastTick: -1,
    avatars: new Map(),
    hiddenLobby: null,
    reserved: null,
    hostStartAt: 0,
  };

  // ---------------------------------------------------------------- saves

  async function loadSave() {
    if (!ow?.save) return;
    const p = await safe(() => ow.save.get('profile'), null)?.catch?.(() => null);
    if (p && typeof p === 'object') {
      const out = { ...DEFAULT_PROFILE, hints: {} };
      for (const k of Object.keys(DEFAULT_PROFILE)) {
        if (k === 'hints') out.hints = p.hints && typeof p.hints === 'object' ? { ...p.hints } : {};
        else if (typeof p[k] === typeof DEFAULT_PROFILE[k]) out[k] = p[k];
      }
      S.profile = out;
    }
    const d = await safe(() => ow.save.get('daily'), null)?.catch?.(() => null);
    if (d && typeof d === 'object' && Number.isInteger(d.day)) S.daily = d;
  }
  const saveProfile = () => safe(() => ow?.save?.set('profile', S.profile)?.catch?.(() => {}));
  loadSave();

  const unlocked = () => {
    const p = S.profile;
    return SLEEVES.filter((s) => s.id === 0 || (s.id === 1 && p.wins >= 1) || (s.id === 2 && p.bestTown >= 3) || (s.id === 3 && p.dailies >= 3) || (s.id === 4 && p.wins >= 10) || (s.id === 5 && p.steady)).map((s) => s.id);
  };
  const mySleeve = () => (unlocked().includes(S.profile.sleeve) ? S.profile.sleeve : 0);
  const award = (id) => safe(() => ow?.badges?.award(id)?.catch?.(() => {}));
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
      if (S.screen === 'solo' && !room.spectating) endSolo(true);
      if (S.screen === 'title') S.screen = 'game';
    });
    room.on('matchstart', () => {
      S.roundItems = [];
      S.roundsSeen.clear();
      S.results = null;
      S.lastRoundEnd = null;
      if (S.screen === 'solo') endSolo(true);
      if (S.screen === 'title') S.screen = 'game';
    });
    room.on('match', () => (S.hiddenLobby = null));
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

  // ---------------------------------------------------------------- the lobby strip

  function syncLobbyStrip() {
    const room = S.room;
    if (!room || !room.hideLobby) return;
    const hide = S.screen === 'title' || S.screen === 'solo';
    if (S.hiddenLobby === hide) return;
    S.hiddenLobby = hide;
    safe(() => room.hideLobby(hide));
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

  // ---------------------------------------------------------------- local runs (Caravan, Daily, the title's animals)

  function newDemo() {
    S.demo = createSolo({ seed: `demo:${Math.floor(Math.random() * 1e9)}`, kind: 'demo', auto: true, onEvent: (type, d) => onSoloEvent(type, d, true) });
    S.camel.stand = S.lastDemoBroke ? 1 : 0;
    S.lastDemoBroke = false;
  }

  function startSolo(kind) {
    audio.init();
    const day = today();
    const scored = kind === 'daily' ? !(S.daily && S.daily.day === day) : true;
    const seed = kind === 'daily' ? dailySeed(day) : `caravan:${Math.floor(Math.random() * 1e9)}`;
    const auto = autoplay === 'caravan';
    S.solo = createSolo({ seed, kind, auto, onEvent: (type, d) => onSoloEvent(type, d, false) });
    S.solo.scored = scored;
    S.solo.day = day;
    S.soloPaused = false;
    S.soloOver = null;
    S.soloBoard = null;
    S.screen = 'solo';
    S.camel.stand = 0;
    S.hand = null;
    fx.clear();
    audio.tok();
  }

  function endSolo(score) {
    const so = S.solo;
    if (!so) return;
    if (score && !S.soloOver && so.kind === 'caravan') finishRun(so, false);
    S.solo = null;
    S.soloOver = null;
    S.soloBoard = null;
    S.hand = null;
    S.screen = S.room || !ow ? 'game' : 'title';
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

  function onSoloEvent(type, d, isDemo) {
    const so = isDemo ? S.demo : S.solo;
    if (!so) return;
    const loud = !isDemo || S.screen === 'title';
    switch (type) {
      case 'offer':
        if (!isDemo) audio.scrape();
        break;
      case 'pick':
        if (loud) audio.tok();
        if (!isDemo) {
          hintDone('pick');
          beginHand(so.c.snap, d.item, so.c.top, `solo:${so.c.draws}:${so.c.load}`);
        }
        break;
      case 'drop':
        if (loud) {
          audio.whup();
          audio.whistle(ITEMS[d.item].kg);
        }
        S.camel.lookT = 1.6;
        break;
      case 'land':
        landJuice(d.item, d.x, d.y, d.energy, loud);
        break;
      case 'held':
        if (loud) audio.grumble(d.mood);
        if (!isDemo) {
          award('first-load');
          if (d.S >= 85) {
            award('steady-hand');
            if (!S.profile.steady) {
              S.profile.steady = true;
              saveProfile();
            }
          }
          if (d.top >= CAMEL.trayTop + 3) award('high-rise');
        }
        break;
      case 'walk':
        break;
      case 'town':
        if (loud) audio.brass([293.7, 440, 587.3]);
        break;
      case 'deliver': {
        if (!isDemo && S.cam) {
          const p = toScreen(S.cam, d.x, d.y);
          fx.floater(`+${d.kg}`, p.x, p.y, S.myTagPos ?? null, PAL.turq);
          audio.deliver(d.i);
        }
        break;
      }
      case 'fall':
        if (loud) {
          fx.hitStop(0, 1.1, 0.35);
          audio.snort();
          audio.whoosh();
        }
        fx.puff(d.x, 0.02, 18, 1.3);
        break;
      case 'over':
        if (d.r === 'broke') {
          if (loud) {
            fx.hitStop(0.08, 0.8, 0.3);
            fx.shake(0.8);
            audio.crack();
            audio.whoosh();
          }
          fx.splinters(0, CAMEL.trayTop, 18);
          if (isDemo) S.lastDemoBroke = true;
          if (!isDemo && d.item === STRAW) award('last-straw');
        } else if (loud) audio.thud();
        break;
      case 'collapse':
        if (loud) {
          audio.clatter();
          fx.shake(0.6);
        }
        fx.puff(-0.8, 0.02, 14, 1.4);
        fx.puff(0.9, 0.02, 14, 1.4);
        break;
      case 'done':
        if (isDemo) S.demoWait = 2.5;
        else {
          S.soloOver = { at: S.t, kind: d.kind };
          finishRun(so, true);
        }
        break;
      case 'leg':
        if (!isDemo) audio.tok();
        break;
    }
  }

  function landJuice(item, x, y, energy, loud = true) {
    const kg = ITEMS[item]?.kg ?? 0;
    if (loud) audio.land(ITEMS[item]?.mat, energy);
    S.camel.squash = Math.min(1, S.camel.squash + 0.2 + kg / 30);
    fx.shake(Math.min(0.5, kg / 40 + energy * 0.01));
    fx.puff(x, Math.max(0.02, y - 0.25), Math.round(4 + kg / 2), 0.5 + kg / 30);
    if (loud && kg >= 8) audio.creak(0.12);
  }

  // ---------------------------------------------------------------- my hands

  function beginHand(snap, item, top, key) {
    const box = hoverBox(item, 0, top);
    const a = ITEMS[item].rest[0] ?? 0;
    const b2 = hoverBox(item, a, top);
    S.hand = { x: 0, y: b2.yDef, a, item, top, key };
    S.handKey = key;
    S.handSince = S.t;
    S.ghost = null;
    S.ghostKey = '';
    void box;
  }

  function clampHand() {
    const h = S.hand;
    if (!h) return;
    const c = clampHover(h.item, h.x, h.y, h.a, h.top);
    h.x = c.x;
    h.y = c.y;
  }

  /** Where my held item would first touch: a world built from the load once per turn. */
  function ghostOf(snap, key) {
    const h = S.hand;
    if (!h) return null;
    if (S.ghostKey !== key) {
      S.ghostKey = key;
      S.ghostSim = safe(() => new Sim(snap), null);
    }
    if (!S.ghostSim) return null;
    const land = safe(() => landing(S.ghostSim, h.item, h.x, h.y, h.a), null);
    if (!land) return null;
    if (S.lastGhostWhat && S.lastGhostWhat !== land.what) audio.blip();
    S.lastGhostWhat = land.what;
    return { item: h.item, x: h.x, y: land.y, a: h.a, fromY: h.y, color: land.what === 'ground' ? PAL.rose : PAL.turq };
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
      audio.tok();
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
      const q = quantDrop(clampHover(item, h.x, h.y, wrapAngle(h.a), d.top / 1000));
      S.net.drop(turnKey(d), q);
      S.pred = { k: turnKey(d), runner: createSettle(d.snap, { item, ...q }, { T: Infinity, keyframes: false }), steps: 0, wStart: null, at: S.t, item, rid: d.rid, tn: d.tn, myDrop: { ...q, item } };
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
    if (S.screen === 'title') {
      if (k === 'Enter' || k === 'Space') pressPlay();
      return;
    }
    if (S.screen === 'solo') {
      if (S.soloOver && S.soloBoard) {
        if (k === 'Space' || k === 'Enter') startSolo(S.solo.kind);
        else if (k === 'Escape') endSolo(false);
        return;
      }
      if (k === 'Escape' || k === 'KeyP') {
        S.soloPaused = !S.soloPaused;
        return;
      }
      if (S.soloPaused) {
        if (k === 'Enter' || k === 'Space') S.soloPaused = false;
        return;
      }
    }
    const pk = myPick();
    if (pk) {
      if (k === 'Digit1' || k === 'Numpad1') doPick(0);
      else if (k === 'Digit2' || k === 'Numpad2') doPick(1);
      else if (k === 'ArrowLeft' || k === 'KeyA') S.cartSel = 0;
      else if (k === 'ArrowRight' || k === 'KeyD') S.cartSel = 1;
      else if ((k === 'Space' || k === 'Enter') && (S.cartSel === 0 || S.cartSel === 1)) doPick(S.cartSel);
      if (k.startsWith('Arrow') || k === 'Space') e.preventDefault();
      return;
    }
    if (myPlace()) {
      if (k === 'KeyQ') turnHand(1);
      else if (k === 'KeyE') turnHand(-1);
      else if (k === 'Space' || k === 'Enter') doDrop();
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
    if (id === 'play') return pressPlay();
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
    if (id === 'backlobby') return safe(() => S.net?.match?.endMatch());
  }

  function pressPlay() {
    audio.init();
    audio.tok();
    S.screen = 'game';
    S.hiddenLobby = null;
    if (!S.room && !ow) S.screen = 'game';
  }

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
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = clamp((ts - last) / 1000, 0, 0.05);
    last = ts;
    safe(() => tick(dt));
  }
  requestAnimationFrame(frame);

  function tick(dt) {
    S.t += dt;
    const ws = fx.scale(dt);
    const wdt = dt * ws;
    fx.reduced = safe(() => !!ow?.settings?.reducedMotion, false);
    const W = Math.max(1, window.innerWidth);
    const H = Math.max(1, window.innerHeight);
    const pr = (ow?.settings && safe(() => ow.settings.pixelRatio(2), null)) || Math.min(2, window.devicePixelRatio || 1);
    R.resize(W, H, pr);
    S.reserved = safe(() => ow?.ui?.reserved ?? null, null);
    syncLobbyStrip();
    hits.clear();
    keyMove(dt);
    autoStartMatch();

    let sc;
    if (S.closed) sc = closedScene();
    else if (S.screen === 'title') sc = titleScene(dt, wdt);
    else if (S.screen === 'solo' && S.solo) sc = soloScene(dt, wdt);
    else sc = roomScene(dt, wdt);
    draw(sc, dt, wdt);
    fx.update(dt, wdt);
  }

  function autoStartMatch() {
    if (!S.autoStart || !S.room || !S.net) return;
    const room = S.room;
    if (S.screen === 'title') pressPlay();
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
      box: { x0: -2.45, x1: 1.75, y1: 3.1 },
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

  // ------------------------------------------------ the title: animals loading the camel

  function titleScene(dt, wdt) {
    if (!S.demo) newDemo();
    if (S.demoWait > 0) {
      S.demoWait -= dt;
      if (S.demoWait <= 0) newDemo();
    }
    S.demo.update(wdt);
    const sc = soloWorld(S.demo, true, wdt);
    sc.title = true;
    audio.setMusic('menu', 0);
    sc.hud.push((ctx) => drawTitle(ctx));
    return sc;
  }

  function titleLayout() {
    const W = R.W, H = R.H;
    const size = Math.round(clamp(Math.min(W / 6.4, H / 5.2), 50, 132));
    const top = (S.reserved ? 14 : 10) + (W < 520 ? 70 : 0);
    const y = top + size * 0.55;
    return { size, y, bottom: y + size * 0.75 };
  }

  function drawTitle(ctx) {
    const W = L.W, H = L.H;
    const { size, y } = titleLayout();
    const s = 'The Last Straw';
    text(ctx, s, W / 2 + size * 0.05, y + size * 0.06, { size, display: true, weight: 900, color: PAL.ink, outline: false });
    text(ctx, s, W / 2, y, { size, display: true, weight: 900, color: PAL.bone, lw: Math.max(4, size * 0.06) });
    const tw = Math.min(W - 30, textWidth(ctx, s, size, { display: true, weight: 900 }));
    goldenStraw(ctx, W / 2 - tw * 0.48, y + size * 0.6, W / 2 + tw * 0.48, y + size * 0.54, Math.max(8, size * 0.1));
    // Play on the sand, in front of the weighbridge
    const bw = Math.min(300, W * 0.62), bh = 68;
    const by = clamp(L.gy + (H - L.gy) / 2 - bh / 2 + 6, L.gy + 10, H - bh - 10);
    const r = slab(ctx, { x: W / 2 - bw / 2, y: by, w: bw, h: bh }, 'Play', { primary: true, size: 38 });
    hits.add(r, 'play');
  }

  // ------------------------------------------------ a local run as a scene

  function soloWorld(so, demo, wdt) {
    const sc = baseScene();
    const st = so.st;
    const v = so.view();
    const c = so.c;
    sc.items = v.items;
    sc.saddle = v.saddle;
    sc.crack = v.crack;
    sc.camel.fold = v.fold;
    sc.camel.knocked = v.knocked;
    sc.scroll = st.scroll;
    sc.camel.walk = st.walking ? st.walkPhase : null;
    sc.town = st.townX;
    sc.bridge = demo;
    sc.needle = v.S;
    sc.band = demo ? BAND : legBand(c.leg);
    sc.camel.mood = st.beat ? 3 : c.step === 'settle' ? Math.max(c.mood, moodOf(v.S, c.T)) : c.mood;
    if (st.beat) sc.camel.mood = st.beat.kind === 'broke' ? 3 : 2;
    sc.sun = demo ? 0.15 : clamp((c.leg - 1) / 7, 0, 0.75);
    sc.night = demo ? 0 : clamp((c.leg - 4) / 4, 0, 0.8);
    const top = c.top;
    sc.box.y1 = Math.max(3.1, top + (c.step === 'place' ? 2.4 : 0.6));
    if (demo && S.camel.stand > 0) {
      S.camel.stand = Math.max(0, S.camel.stand - wdt / 1.6);
      sc.camel.fold = Math.max(sc.camel.fold, S.camel.stand);
    }
    // the hands
    if (c.step === 'place') {
      const item = so.held;
      if (st.auto) {
        const h = st.handPos ?? { x: 0, y: hoverBox(item, 0, top).yDef, a: 0 };
        sc.hands = { item, x: h.x, y: h.y, a: h.a, who: st.who, open: 0, visible: true };
      } else if (S.hand) {
        sc.hands = { item, x: S.hand.x, y: S.hand.y, a: S.hand.a, who: { kind: 'player', seat: 0, sleeve: mySleeve() }, open: 0, visible: true };
        sc.ghost = ghostOf(c.snap, `solo:${c.draws}:${c.load}:${c.leg}`);
      }
    }
    if (c.step === 'settle' && st.drop && st.runner && st.runner.sim.steps < 24) {
      const open = Math.min(1, st.runner.sim.steps / 14);
      const who = st.auto ? st.who : { kind: 'player', seat: 0, sleeve: mySleeve() };
      sc.handsAfter = { item: st.drop.item, x: st.drop.x, y: st.drop.y + open * 0.4, a: st.drop.a, who, open: 1, visible: true, alpha: 1 - open };
    }
    // the cart
    sc.cart = { offer: c.offer.slice(), hide: c.step === 'pick' ? -1 : c.pick, big: !demo && c.step === 'pick' && !st.auto, sel: S.cartSel, keys: !S.touch };
    if (c.step === 'deliver' || st.beat) sc.cart.offer = c.offer.slice();
    return sc;
  }

  function soloScene(dt, wdt) {
    const so = S.solo;
    if (!S.soloPaused) so.update(wdt);
    const sc = soloWorld(so, false, wdt);
    const c = so.c;
    audio.setMusic(S.soloPaused ? 'menu' : 'play', clamp((sc.needle ?? 0) / sc.band[1], 0, 1));
    // my tag alone: kg delivered (big)
    sc.tags = [{ id: S.me.id, name: so.kind === 'daily' ? 'Daily cart' : S.me.name, seat: 0, kg: c.delivered, me: true, avatar: avatarOf(S.me.id) }];
    // hints
    if (!so.st.auto && !S.soloOver) {
      if (c.step === 'pick') hint('pick', 'Pick one', 'cart');
      else if (c.step === 'place' && S.hand) placeHints();
    }
    sc.hud.push((ctx) => {
      // the town signpost: loads to go
      const left = so.loadsLeft;
      const r = { x: L.W - (L.phone ? 150 : 190) - 12, y: L.gy - (L.phone ? 54 : 62) - 10, w: L.phone ? 150 : 190, h: L.phone ? 54 : 62 };
      if (!L.portrait) r.y = L.dial.y + L.dial.r + 22;
      else r.y = L.cart.y - r.h - 8;
      if (c.step !== 'deliver' && !S.soloOver) signpost(ctx, r, `Town ${c.leg}`, left === 1 ? '1 to town' : `${left} to town`, { color: PAL.bone });
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
    const drop = clamp((S.t - S.soloOver.at - 0.4) / 0.5, 0, 1);
    const e = 1 - (1 - drop) ** 3;
    const lines = [{ s: `${b.kg} kg`, size: L.phone ? 56 : 72 }, { s: b.kind === 'daily' ? `Daily cart · town ${b.town}` : `Reached town ${b.town}`, size: 24 }];
    if (b.newBest) lines.push({ s: 'New best', size: 26, color: PAL.roseDark });
    else lines.push({ s: `Best ${b.best} kg`, size: 22, color: PAL.violet });
    if (b.kind === 'daily' && !b.scored) lines.push({ s: 'Practice', size: 20, color: PAL.violet });
    if (b.list && b.list.length) {
      b.list.slice(0, 5).forEach((e2, i) => lines.push({ s: `${i + 1}. ${e2.name.slice(0, 16)}  ${e2.kg} kg`, size: 18, display: false, color: e2.me ? PAL.roseDark : PAL.ink }));
    }
    const c = L.center;
    const r = drawSign(ctx, c.x, Math.max(L.rope.y + L.rope.h + 120, c.y + 20), lines, e, { minW: 260 });
    if (drop >= 1) {
      const bw = Math.min(180, (L.W - 40) / 2 - 8), bh = 60;
      const y = Math.min(L.H - bh - 12, r.y + r.h + 18);
      const r1 = slab(ctx, { x: c.x - bw - 8, y, w: bw, h: bh }, 'Again', { primary: true, key: S.touch ? '' : 'Space' });
      const r2 = slab(ctx, { x: c.x + 8, y, w: bw, h: bh }, 'Lobby', { key: S.touch ? '' : 'Esc' });
      hits.add(r1, 'again');
      hits.add(r2, 'lobby');
    }
  }

  function placeHints() {
    const touch = S.touch;
    if (!S.profile.hints.aim) hint('aim', touch ? 'Drag to aim' : 'Move to aim');
    else if (!S.profile.hints.turn) hint('turn', touch ? 'Turn it' : 'Q E turn', touch ? 'turn' : null);
    else if (!S.profile.hints.drop) hint('drop', touch ? 'Tap Drop' : 'Click to drop', touch ? 'drop' : null);
  }

  // ------------------------------------------------ the room: lobby, countdown, rounds, results

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
    sc.needle = 0;
    // tags: who's here, and the animals that will sit in the empty seats (faded)
    const tags = [];
    if (m && room) {
      const lob = m.lobby;
      const results = m.results;
      lob.players.forEach((p, i) => {
        const res = results?.find?.((r) => r.id === p.id);
        tags.push({ id: p.id, name: p.name, seat: i, me: p.me, host: p.host, kg: res ? Number(res.score) || 0 : 0, label: res ? undefined : p.me ? 'You' : p.ready ? 'Ready' : '·', place: res?.place, avatar: avatarOf(p.id), faded: p.away });
      });
      const nb = clamp(lob.bots ?? 0, 0, 6 - tags.length);
      for (let i = 0; i < nb; i++) tags.push({ id: `bot:${i}`, name: BOT_NAMES[i % BOT_NAMES.length], seat: tags.length, bot: true, kg: 0, label: '', faded: true, invite: true });
    } else tags.push({ id: S.me.id, name: S.me.name, seat: 0, me: true, kg: 0, label: 'You', avatar: avatarOf(S.me.id) });
    sc.tags = tags;
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
        const P = L.posts;
        const day = today();
        const dkg = S.daily && S.daily.day === day ? `${S.daily.kg} kg today` : 'New';
        signpost(ctx, P.caravan, 'Caravan', S.profile.best > 0 ? `Best ${S.profile.best} kg` : 'Go solo', { post: L.portrait ? 0 : 18 });
        signpost(ctx, P.daily, 'Daily cart', dkg, { post: L.portrait ? 0 : Math.max(0, L.gy - P.daily.y - P.daily.h) });
        hits.add(P.caravan, 'caravan');
        hits.add(P.daily, 'daily');
      }
      if (m && room?.spectating) drawHint(ctx, 'Next match', L.center.x, L.rope.y + L.rope.h + 30, S.t);
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
      fx.clear();
    }
    S.camel.stand = Math.max(0, S.camel.stand - wdt / 1.5);
    sc.camel.fold = S.camel.stand;
    sc.sun = sunFor(m);
    sc.night = nightFor(m);
    sc.lanterns = { n: m.rounds, lit: m.round };
    const age = S.t - S.introAt;
    sc.sign = { lines: m.round === 1 ? [{ s: 'Load!', size: L.phone ? 56 : 80 }] : [{ s: `Round ${m.round}`, size: L.phone ? 48 : 64 }], drop: clamp(age / 0.35, 0, 1) };
    return sc;
  }

  const sunFor = (m) => clamp(((m.round || 1) - 1) / Math.max(1, (m.rounds || 3) - 1), 0, 1) * 0.75;
  const nightFor = (m) => clamp(((m.round || 1) - 2) / Math.max(1, (m.rounds || 3) - 1), 0, 1) * 0.7;

  function roundScene(m, dt, wdt) {
    const net = S.net;
    const room = S.room;
    const sc = baseScene();
    const d = net.data;
    const phase = m.phase;
    sc.tags = seatTags(m, d, phase);
    sc.sun = sunFor(m);
    sc.night = nightFor(m);
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
    sc.box.y1 = Math.max(3.1, top + (d.step === 'place' || d.step === 'pick' ? 2.4 : 0.6));

    // hands
    if (d.step === 'place' && !(S.pred && S.pred.k === k)) {
      const item = heldItem(d);
      if (mine && S.hand && S.hand.key === k) {
        sc.hands = { item, x: S.hand.x, y: S.hand.y, a: S.hand.a, who: whoOf(seat, seatIx), open: 0, visible: true };
        sc.ghost = ghostOf(d.snap, k);
        // presence: where my hands are
        net.setHover(k, S.hand, mySleeve());
      } else {
        let h = null;
        if (seat?.bot && d.path) h = pathAtSafe(d.path, now);
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
      if (SS >= 50 && SS < 70) hint('needle', 'Watch the needle', 'dial');
      else if (SS >= 70 && d.step !== 'over') hint('red', 'Every item counts', 'dial');
      if (SS >= 70) hintDone('needle');
    }
    // the round's end: the sign
    if (phase === 'roundEnd' || d.step === 'over') roundEndSign(m, d, sc);
    // music speeds up with the strain
    audio.setMusic('play', clamp(view.S / 90, 0, 1));
    if (room.spectating) sc.hud.push((ctx) => drawHint(ctx, 'Next round', L.cart.x + L.cart.w / 2, L.cart.y - 18, S.t));
    return sc;
  }

  function pathAtSafe(path, t) {
    if (!Array.isArray(path) || path.length < 2) return null;
    let i = 0;
    while (i < path.length - 1 && path[i + 1][0] <= t) i++;
    const p = path[i], q = path[Math.min(path.length - 1, i + 1)];
    const u = q[0] > p[0] ? clamp((t - p[0]) / (q[0] - p[0]), 0, 1) : 1;
    const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
    return { x: p[1] + (q[1] - p[1]) * e, y: p[2] + (q[2] - p[2]) * e, a: p[3] + (q[3] - p[3]) * e };
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
    if (v && v.r === 'fell' && P.s >= v.at - 24) rate = 0.35;
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

    const items = ids.map((item, i) => ({ item, x: pose[i * 3], y: pose[i * 3 + 1], a: pose[i * 3 + 2] }));
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
        const kg = ITEMS[d.last.item].kg;
        const tag = S.tagPos?.get(d.last.by);
        const it = d.snap[d.snap.length - 1];
        if (it && S.cam) {
          const p = toScreen(S.cam, it[1] / 10000, it[2] / 10000);
          fx.floater(kg > 0 ? `+${kg}` : '+0', p.x, p.y, tag ? { x: tag.x, y: tag.y } : null, PAL.turq);
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
    if (last.r === 'broke' && last.item === STRAW) lines = [{ s: 'The last straw', size: L.phone ? 48 : 72, color: PAL.roseDark }, { s: `${name} broke its back`, size: 26 }];
    else if (last.r === 'broke') lines = [{ s: `${name} broke its back`, size: L.phone ? 34 : 50 }, { s: `with the ${ITEMS[last.item]?.name ?? 'load'}`, size: 24, color: PAL.violet }];
    else if (last.r === 'fell') lines = [{ s: `${name} dropped the ${ITEMS[last.fell >= 0 ? last.fell : last.item]?.name ?? 'load'}`, size: L.phone ? 30 : 46 }];
    else lines = [{ s: 'The camel held!', size: L.phone ? 40 : 56 }];
    // wait for the moment to play out
    const key = `${d.rid}`;
    if (S.signKey !== key) {
      const ready = last.r === 'broke' ? S.beat && S.beat.k === turnKey(d) && S.beat.t > 1.3 : last.r === 'fell' ? S.play.k === turnKey(d) && S.play.s >= (d.verdict?.at ?? 0) + 20 : true;
      const late = m.phase === 'roundEnd' && S.t - (S.roundEndSeen ?? S.t) > 2.6;
      if (m.phase === 'roundEnd' && S.roundEndKey !== key) {
        S.roundEndKey = key;
        S.roundEndSeen = S.t;
      }
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
      fx.confetti(L.W, 80);
    }
    sc.camel.fold = 1;
    sc.camel.knocked = false;
    sc.camel.chew = true;
    sc.sun = 0.85;
    sc.night = 0.75;
    sc.needle = null;
    // the heap of the match's junk, the winner's last item on top
    const items = S.roundItems.length ? S.roundItems : [ANVIL, 13, 8, 5, 11, 2];
    const winner = res[0];
    sc.heap = buildHeap(items, `${m.roundId}`);
    const topIt = sc.heap[sc.heap.length - 1];
    sc.crownAt = topIt ? { x: topIt.x, y: topIt.top + 0.05, id: winner?.id, name: winner?.name, bot: !!m.seats?.find((s) => s.id === winner?.id)?.bot } : null;
    sc.box = { x0: -2.6, x1: 2.9, y1: Math.max(3.2, (topIt?.top ?? 2) + 1.2) };
    sc.tags = (m.seats ?? []).map((s, i) => {
      const r = res.find((x) => x.id === s.id);
      return { id: s.id, name: s.name, seat: i, bot: !!s.bot, me: !!s.me, kg: Number(r?.score) || 0, place: r?.place, avatar: s.bot ? null : avatarOf(s.id) };
    });
    sc.tags.sort((a, b) => (a.place ?? 9) - (b.place ?? 9));
    const room = S.room;
    sc.hud.push((ctx) => {
      const w = winner ? `${winner.name} wins` : 'Results';
      const age = S.t - S.resultsAt;
      drawSign(ctx, L.center.x, L.rope.y + L.rope.h + (L.phone ? 50 : 70), [{ s: w, size: L.phone ? 36 : 54 }], clamp(age / 0.4, 0, 1));
      const left = m.secondsLeft;
      if (room?.kind === 'public' && left != null) {
        // a sand bar runs back to the lobby
        const bw = Math.min(360, L.W * 0.6), bx = L.W / 2 - bw / 2, by = L.H - 30;
        ctx.fillStyle = 'rgba(28,15,46,0.5)';
        ctx.fillRect(bx, by, bw, 10);
        ctx.fillStyle = PAL.gold;
        ctx.fillRect(bx, by, bw * clamp(left / 25, 0, 1), 10);
        ctx.strokeStyle = PAL.ink;
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, 10);
      } else if (room?.isHost) {
        const bw = 240, bh = 62;
        const r = slab(ctx, { x: L.W / 2 - bw / 2, y: L.H - bh - 24, w: bw, h: bh }, 'Back to lobby', { primary: true, size: 28 });
        hits.add(r, 'backlobby');
      } else {
        const h = room?.players?.get?.(room.host)?.name ?? 'the host';
        drawHint(ctx, `Waiting for ${String(h).slice(0, 16)}`, L.W / 2, L.H - 50, S.t);
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
    saveProfile();
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

  // ---------------------------------------------------------------- drawing

  function draw(sc, dt, wdt) {
    const ctx = R.ctx;
    const tagsN = sc.tags ? sc.tags.length : 1;
    const inLobby = S.room?.match?.phase === 'lobby' && S.screen === 'game';
    L = layout(R.W, R.H, S.reserved, { lobby: inLobby, tags: tagsN });
    if (sc.title) {
      const T = titleLayout();
      L.stage.y = T.bottom;
      L.stage.h = Math.max(80, L.gy - T.bottom);
    }

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
    const camel = {
      ...sc.camel,
      t: S.t,
      saddle: sc.saddle,
      bow: clamp(strain01 * 0.7 + A.squash * 0.5, 0, 1),
      tremble: sc.camel.mood >= 2 ? (sc.camel.mood - 1) / 2 : 0,
      look: A.look,
    };
    // sweat
    if (sc.camel.mood >= 2 && !sc.camel.knocked && Math.random() < dt * (sc.camel.mood === 3 ? 5 : 2)) {
      const hp = headPoint(camel);
      fx.sweat(hp.x + 0.12, hp.y + 0.1);
    }
    // a creak now and then, faster with the strain
    if (strain01 > 0.55 && S.screen !== 'title' && Math.random() < dt * strain01 * 0.8) audio.creak(0.03 + strain01 * 0.05);

    // the camera
    const target = fitCamera(L.stage, L.gy, sc.box);
    if (!S.cam || S.cam.W !== L.W || S.cam.H !== L.H) S.cam = { ...target, W: L.W, H: L.H };
    else {
      const k = Math.min(1, dt * 3);
      S.cam.s += (target.s - S.cam.s) * k;
      S.cam.ox += (target.ox - S.cam.ox) * k;
      S.cam.oy = target.oy;
    }
    const off = fx.offset(S.t);
    const cam = { s: S.cam.s, ox: S.cam.ox + off.x, oy: S.cam.oy + off.y };

    const painted = paint(R, L, sc, { t: S.t, dt, cam, needle: nd.v, camel, tagAnim, fx, avatarOf });
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
    if (sc.cart && !sc.title) {
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
    if ((h.id === 'aim' || h.id === 'turn' || h.id === 'drop') && !myPlace()) {
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

// Boot, the screens, input, and the glue between the room (or a local run) and the picture.

import { ITEMS, STRAW, ANVIL } from './items.js';
import { createSettle, hoverBox, clampHover, quantDrop, wrapAngle, landing, Sim, BAND, CAMEL } from './physics.js';
import { turnKey, placer, heldItem, nextPlayer, moodOf, legBand, dayNumber, dailySeed, dailyBoard } from './rules.js';
import { createNet, JOIN, nextSettingValue } from './net.js';
import { createSolo } from './solo.js';
import { createMatchView } from './match-view.js';
import { createRenderer, fitCamera, toScreen, toWorld } from './render.js';
import { paint } from './scene.js';
import { headPoint } from './camel.js';
import { PAL, SLEEVES } from './art.js';
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
    S.reserved = ow && ow.ui ? safe(() => ow.ui.reserved ?? null, null) : null;
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

  /** The name at the top, under the platform's menu when it would reach it. */
  function titleLayout() {
    const W = R.W, H = R.H;
    const size = Math.round(clamp(Math.min(W / 6.4, H / 5.2), 50, 132));
    const tw = Math.min(W - 30, textWidth(R.ctx, 'The Last Straw', size, { display: true, weight: 900 }));
    const menu = L?.menu;
    const top = menu && menu.y < H / 2 && W / 2 - tw / 2 < menu.x + menu.w + 8 && W / 2 + tw / 2 > menu.x - 8 ? menu.y + menu.h + 6 : 12;
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
    sc.box.y1 = Math.max(3.1, top + 2.4);
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
      const B = L.buttons;
      const underButtons = myPlace() && S.touch && [B.drop, B.ccw, B.cw].some((b) => b.x < r.x + r.w && r.x < b.x + b.w && b.y < r.y + r.h && r.y < b.y + b.h);
      if (c.step !== 'deliver' && !S.soloOver && !underButtons) signpost(ctx, r, `Town ${c.leg}`, left === 1 ? '1 to town' : `${left} to town`, { color: PAL.bone });
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

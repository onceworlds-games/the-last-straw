// Store art: ?poster=<name> draws one staged frame with the game's own renderer (no SDK, no room) and then sets
// document.body.dataset.ready = '1'. Loads are built by really dropping the items with the game's physics.

import { ITEM_BY_KEY as K, ITEMS } from './items.js';
import { Sim, createSettle, landing, hoverBox, snapPose, extents } from './physics.js';
import { createRenderer, fitCamera, toScreen } from './render.js';
import { paint, buildHeap } from './scene.js';
import { layout, text, goldenStraw, itemInBox } from './ui.js';
import { PAL, drawItem, drawPortrait } from './art.js';
import { drawCamel, foldPose, headPoint } from './camel.js';
import { createFx } from './fx.js';
import { foldAt } from './solo.js';

/** Drop items one by one, each settling before the next, and return the load. */
export function stack(list) {
  let snap = [];
  for (const s of list) {
    const item = K[s.k];
    const a = s.a ?? 0;
    const sim = new Sim(snap);
    const box = hoverBox(item, a, sim.top());
    const land = landing(sim, item, s.x, box.yMax, a);
    const r = createSettle(snap, { item, x: s.x, y: land.y + 0.02, a }, { T: Infinity, motion: 'none', keyframes: false });
    r.run(3000);
    if (r.verdict?.r === 'held') snap = r.final();
  }
  return snap;
}

const itemsOf = (snap) => {
  const p = snapPose(snap);
  return snap.map((r, i) => ({ item: r[0], x: p[i * 3], y: p[i * 3 + 1], a: p[i * 3 + 2] }));
};
const topOf = (items) => Math.max(2.4, ...items.map((it) => it.y + extents(it.item, it.a).maxY));

const COVER_LOAD = [
  { k: 'rug', x: 0 },
  { k: 'crate', x: -0.42 },
  { k: 'suitcase', x: 0.42 },
  { k: 'sofa', x: 0.0 },
  { k: 'books', x: -0.3 },
  { k: 'tuba', x: 0.35 },
  { k: 'birdcage', x: -0.2 },
  { k: 'teapot', x: 0.12 },
];

export async function runPoster(name) {
  try {
    const W = innerWidth, H = innerHeight;
    const canvas = document.getElementById('cv');
    const R = createRenderer(canvas);
    R.resize(W, H, 1);
    await Promise.race([Promise.all([document.fonts.load('900 80px "Big Shoulders Display"'), document.fonts.load('800 20px Archivo'), document.fonts.ready]), new Promise((r) => setTimeout(r, 3000))]);
    if (name.startsWith('badge-')) badge(R, name.slice(6));
    else if (name === 'icon') icon(R);
    else if (name === 'sandbox-items') itemSheet(R);
    else scene(R, name);
    document.body.dataset.ready = '1';
  } catch (err) {
    console.error(err);
  }
}

// ---------------------------------------------------------------- the scenes

function baseScene() {
  return {
    sun: 0.1,
    night: 0,
    scroll: 0,
    camel: { mood: 0, look: 0, fold: 0, knocked: false, walk: null, chew: true, straw: false },
    items: [],
    saddle: { y: 0, a: 0 },
    box: { x0: -2.45, x1: 1.75, y1: 3.1 },
    needle: null,
    tags: null,
    cart: null,
    bridge: true,
    hud: [],
  };
}

function scene(R, name) {
  const W = R.W, H = R.H;
  const sc = baseScene();
  const fx = createFx();
  const L = layout(W, H, [], { tags: 6 });
  let stage = { x: 30, y: 30, w: W - 60, h: H - 60 };
  let gy = Math.round(H * 0.86);
  const camel = { t: 0.4, bow: 0, tremble: 0, look: 0 };
  let after = null;
  const tagAnim = new Map();

  if (name === 'cover') {
    sc.items = itemsOf(stack(COVER_LOAD));
    const top = topOf(sc.items);
    sc.hands = { item: K.straw, x: 0.1, y: top + 0.2, a: -0.06, who: { kind: 'player', seat: 2, sleeve: 1 }, open: 0, visible: true };
    sc.camel.mood = 3;
    sc.camel.chew = false;
    camel.bow = 0.8;
    camel.look = 1;
    const hp = headPoint({ bow: 0.8 });
    for (let i = 0; i < 4; i++) {
      fx.sweat(hp.x + 0.1 + i * 0.05, hp.y + 0.12);
      for (let k = 0; k < 9; k++) fx.update(1 / 60, 1 / 60);
    }
    sc.sun = 0.05;
    sc.box = { x0: -2.5, x1: 1.9, y1: top + 0.9 };
    gy = H - 92;
    stage = { x: Math.round(W * 0.4), y: 16, w: Math.round(W * 0.58), h: gy - 16 };
    after = (ctx, cam) => {
      // a warm glow around the straw: the one thing to look at
      const p = toScreen(cam, sc.hands.x, sc.hands.y);
      const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 120);
      g.addColorStop(0, 'rgba(255,214,107,0.55)');
      g.addColorStop(1, 'rgba(255,214,107,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g;
      ctx.fillRect(p.x - 130, p.y - 130, 260, 260);
      ctx.restore();
      const x = W * 0.215;
      const size = Math.round(H * 0.2);
      const y1 = H * 0.3;
      const y2 = y1 + size * 1.02;
      shadowed(ctx, 'The Last', x, y1, size, PAL.bone);
      shadowed(ctx, 'Straw', x, y2, size * 1.32, PAL.gold);
      goldenStraw(ctx, x - size * 1.25, y2 + size * 0.8, x + size * 1.25, y2 + size * 0.68, Math.round(size * 0.13));
    };
  } else if (name === 'action') {
    const load = stack([
      { k: 'rug', x: 0 },
      { k: 'crate', x: -0.4 },
      { k: 'suitcase', x: 0.42 },
      { k: 'pot', x: -0.35 },
      { k: 'books', x: 0.3 },
      { k: 'melon', x: -0.05 },
    ]);
    const sim = new Sim(load, { broken: true });
    sim.motion = (t) => foldPose(foldAt(t));
    sim.addItem(K.anvil, 0.15, topOf(itemsOf(load)) + 0.3, 0.25, 0.4, -1.2, -1.2);
    for (let i = 0; i < 44; i++) sim.step();
    const p = sim.pose();
    sc.items = sim.items.map((it, i) => ({ item: it.item, x: p[i * 3], y: p[i * 3 + 1], a: p[i * 3 + 2] }));
    sc.camel.fold = foldAt(sim.motionT);
    sc.camel.knocked = true;
    sc.camel.mood = 3;
    sc.crack = 1;
    sc.sun = 0.3;
    sc.box = { x0: -2.5, x1: 2.0, y1: 3.6 };
    gy = H - 70;
    stage = { x: 40, y: 20, w: W - 80, h: gy - 20 };
    fx.splinters(0.05, 1.5, 26);
    fx.splinters(-0.7, 1.35, 18);
    fx.puff(-1.1, 0.05, 26, 1.8);
    fx.puff(1.0, 0.05, 26, 1.8);
    for (let i = 0; i < 12; i++) fx.update(1 / 60, 1 / 60);
  } else if (name === 'win') {
    const list = ['bathtub', 'sofa', 'clock', 'crate', 'rug', 'bicycle', 'suitcase', 'tuba', 'books', 'pot', 'melon', 'ladder', 'cactus', 'teapot', 'birdcage', 'duck', 'anvil'].map((k) => K[k]);
    sc.heap = buildHeap(list, 'poster');
    const topIt = sc.heap[sc.heap.length - 1];
    sc.crownAt = { x: topIt.x, y: topIt.top + 0.04, name: 'Fennec', bot: true };
    sc.camel.fold = 1;
    sc.camel.chew = true;
    camel.look = 1;
    sc.sun = 0.85;
    sc.night = 0.7;
    sc.box = { x0: -2.6, x1: 2.9, y1: Math.max(3.4, topIt.top + 1.0) };
    gy = H - 80;
    stage = { x: 40, y: 20, w: W - 80, h: gy - 20 };
    fx.confetti(W, 120);
    for (let i = 0; i < 70; i++) fx.update(1 / 60, 1 / 60);
  } else if (name === 'multi') {
    sc.items = itemsOf(stack([
      { k: 'rug', x: 0 },
      { k: 'crate', x: 0.38 },
      { k: 'suitcase', x: -0.4 },
      { k: 'books', x: 0.36 },
      { k: 'pot', x: -0.36 },
    ]));
    const top = topOf(sc.items);
    sc.hands = { item: K.melon, x: 0.05, y: top + 0.62, a: 0.2, who: { kind: 'player', seat: 2, sleeve: 2 }, open: 0, visible: true };
    sc.camel.mood = 1;
    camel.bow = 0.45;
    sc.box = { x0: -2.45, x1: 1.75, y1: top + 1.5 };
    gy = H - 80;
    stage = { x: 60, y: L.rope.y + L.rope.h + 30, w: W - 120, h: gy - L.rope.y - L.rope.h - 30 };
    sc.tags = [
      { id: 'a', name: 'Ann', seat: 0, kg: 34 },
      { id: 'b', name: 'Fennec', seat: 1, kg: 29, bot: true },
      { id: 'c', name: 'Bo', seat: 2, kg: 41, active: true },
      { id: 'd', name: 'Kit', seat: 3, kg: 22 },
      { id: 'e', name: 'Vulture', seat: 4, kg: 37, bot: true },
      { id: 'f', name: 'Tortoise', seat: 5, kg: 18, bot: true },
    ];
    tagAnim.set('c', { sw: 0, v: 0, drop: 1, kg: 41, prevKg: 41, bump: 0 });
  } else if (name === 'sandbox') {
    // the camel alone, big: for looking at the drawing
    sc.box = { x0: -2.5, x1: 1.6, y1: 3.0 };
    gy = H - 40;
    stage = { x: 10, y: 10, w: W - 20, h: gy - 10 };
  }

  const cam = fitCamera(stage, gy, sc.box, 400);
  L.gy = gy;
  paint(R, L, sc, {
    t: 0.4,
    dt: 0,
    cam,
    needle: 0,
    camel: { ...sc.camel, ...camel, saddle: sc.saddle, tremble: sc.camel.mood >= 2 ? (sc.camel.mood - 1) / 2 : 0 },
    tagAnim,
    fx,
    avatarOf: () => null,
  });
  R.screen();
  fx.drawScreen(R.ctx);
  if (after) after(R.ctx, cam);
}

function shadowed(ctx, s, x, y, size, color) {
  text(ctx, s, x + size * 0.05, y + size * 0.06, { size, display: true, weight: 900, color: PAL.ink, outline: false });
  text(ctx, s, x, y, { size, display: true, weight: 900, color, lw: Math.max(4, size * 0.06) });
}

/** Every item in a grid (for looking at the drawings). */
function itemSheet(R) {
  const { ctx } = R;
  R.screen();
  ctx.fillStyle = PAL.violet;
  ctx.fillRect(0, 0, R.W, R.H);
  const cols = 6;
  const cw = R.W / cols, ch = R.H / Math.ceil(ITEMS.length / cols);
  ITEMS.forEach((it, i) => {
    const cx = (i % cols) * cw + cw / 2;
    const cy = Math.floor(i / cols) * ch + ch / 2 - 10;
    itemInBox(ctx, i, cx, cy, cw * 0.8, ch * 0.62, {});
    text(ctx, it.name, cx, cy + ch * 0.4, { size: 18, color: PAL.bone, outline: false });
  });
}

// ---------------------------------------------------------------- the icon and the badges

function icon(R) {
  const { ctx } = R;
  const W = R.W;
  R.screen();
  // dusk bands and a big low sun
  const bands = ['#3B2160', '#5A2766', '#82305F', '#B23A64', '#D63F6E', '#E9604F', '#F27B35'];
  bands.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, (i * W) / bands.length, W, W / bands.length + 1);
  });
  ctx.beginPath();
  ctx.arc(W * 0.5, W * 0.62, W * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = PAL.gold;
  ctx.fill();
  ctx.fillStyle = '#F2B66F';
  ctx.fillRect(0, W * 0.86, W, W * 0.14);
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(0, W * 0.86, W, W * 0.012);
  // the camel's head and neck, big, side-eyeing a golden straw in its mouth
  const s = W * 0.42;
  ctx.setTransform(s, 0, 0, -s, W * 0.5 + 2.0 * s, W * 0.5 + 2.55 * s);
  drawCamel(ctx, 1 / s, { t: 0.3, mood: 1, look: 1, chew: false, straw: true, saddle: { y: 0, a: 0 } });
  R.screen();
}

const BADGE = {
  'first-load': [PAL.turq, (ctx, r) => itemDisc(ctx, K.crate, r)],
  'last-straw': [PAL.rose, (ctx, r) => goldenStraw(ctx, -r * 0.62, r * 0.42, r * 0.66, -r * 0.4, r * 0.2)],
  'steady-hand': [PAL.violet, (ctx, r) => steady(ctx, r)],
  'anvil-gift': [PAL.ember, (ctx, r) => itemDisc(ctx, K.anvil, r)],
  'high-rise': [PAL.turq, (ctx, r) => tower(ctx, r)],
  survivor: [PAL.rose, (ctx, r) => crown(ctx, r)],
  'six-towns': [PAL.ember, (ctx, r) => six(ctx, r)],
  'heavy-lifter': [PAL.violet, (ctx, r) => weight(ctx, r)],
  'daily-cart': [PAL.turq, (ctx, r) => daily(ctx, r)],
};

function badge(R, id) {
  const { ctx } = R;
  const W = R.W;
  R.screen();
  ctx.clearRect(0, 0, W, W);
  ctx.fillStyle = PAL.violetDeep ?? PAL.ink;
  ctx.fillRect(0, 0, W, W);
  const [color, draw] = BADGE[id] ?? BADGE['first-load'];
  const c = W / 2;
  const R0 = W * 0.47;
  // brass ring
  ring(ctx, c, c + 4, R0, PAL.ink);
  ring(ctx, c, c, R0, PAL.goldDark);
  ring(ctx, c, c - 3, R0 - 4, PAL.gold);
  outline(ctx, c, c, R0);
  // the coloured face with a shade on its right half
  ring(ctx, c, c, R0 * 0.8, color);
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, R0 * 0.8, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(28,15,46,0.16)';
  ctx.beginPath();
  ctx.arc(c + R0 * 0.5, c + R0 * 0.5, R0 * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  outline(ctx, c, c, R0 * 0.8);
  ctx.save();
  ctx.translate(c, c);
  draw(ctx, R0 * 0.62);
  ctx.restore();
}

function ring(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}
function outline(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke();
}

/** An item drawn to fit a disc of radius r (screen y down; the item art is y up). */
function itemDisc(ctx, item, r, dx = 0, dy = 0, fit = 1.5) {
  itemInBox(ctx, item, dx, dy, r * fit, r * fit, {});
}

function steady(ctx, r) {
  // a straw resting flat on a crate: set down, not dropped
  itemDisc(ctx, K.crate, r, 0, r * 0.25, 1.05);
  goldenStraw(ctx, -r * 0.62, -r * 0.3, r * 0.62, -r * 0.3, r * 0.17);
}

function tower(ctx, r) {
  const list = [K.suitcase, K.crate, K.books, K.teapot];
  let y = r * 0.78;
  const hs = [0.36, 0.42, 0.28, 0.32];
  list.forEach((it, i) => {
    const h = r * hs[i];
    itemInBox(ctx, it, 0, y - h / 2, r * 1.4, h, {});
    y -= h + 2;
  });
}

function crown(ctx, r) {
  const y = r * 0.12;
  ctx.beginPath();
  ctx.arc(0, y, r * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = PAL.gold;
  ctx.fill();
  ctx.save();
  ctx.clip();
  drawPortrait(ctx, 'Fennec', 0, y, r * 0.62);
  ctx.restore();
  outline(ctx, 0, y, r * 0.62);
  goldenStraw(ctx, -r * 0.72, y - r * 0.56, r * 0.76, y - r * 0.82, r * 0.16);
}

function six(ctx, r) {
  // a town gate
  ctx.beginPath();
  ctx.moveTo(-r * 0.66, r * 0.78);
  ctx.lineTo(-r * 0.66, -r * 0.1);
  ctx.quadraticCurveTo(-r * 0.66, -r * 0.82, 0, -r * 0.9);
  ctx.quadraticCurveTo(r * 0.66, -r * 0.82, r * 0.66, -r * 0.1);
  ctx.lineTo(r * 0.66, r * 0.78);
  ctx.closePath();
  ctx.fillStyle = PAL.bone;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke();
  text(ctx, '6', 0, r * 0.06, { size: r * 1.3, display: true, weight: 900, color: PAL.ember, lw: 7 });
}

function weight(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(-r * 0.46, -r * 0.34);
  ctx.lineTo(r * 0.46, -r * 0.34);
  ctx.lineTo(r * 0.7, r * 0.66);
  ctx.lineTo(-r * 0.7, r * 0.66);
  ctx.closePath();
  ctx.fillStyle = PAL.iron ?? '#4A4466';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -r * 0.42, r * 0.22, Math.PI, 0);
  ctx.lineWidth = r * 0.14;
  ctx.stroke();
  text(ctx, 'KG', 0, r * 0.2, { size: r * 0.62, display: true, weight: 900, color: PAL.gold, outline: false });
}

function daily(ctx, r) {
  const w = r * 1.3, h = r * 1.36;
  ctx.fillStyle = PAL.bone;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = PAL.rose;
  ctx.fillRect(-w / 2, -h / 2, w, h * 0.27);
  ctx.lineWidth = 5;
  ctx.strokeStyle = PAL.ink;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2 + h * 0.27);
  ctx.lineTo(w / 2, -h / 2 + h * 0.27);
  ctx.stroke();
  itemInBox(ctx, K.melon, 0, h * 0.14, w * 0.62, h * 0.52, {});
}

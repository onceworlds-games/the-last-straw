// One frame of the game's picture from a scene description: the world, then the HUD in the world's language. The game's
// screens and the store posters both draw through here.

import { PAL, drawHands, drawPortrait } from './art.js';
import { extents } from './physics.js';
import { ITEMS, isItem } from './items.js';
import { createRng } from './rng.js';
import { drawBackdrop, drawWorld, toScreen } from './render.js';
import { drawRope, drawDial, drawCart, drawSign, goldenStraw, text } from './ui.js';

/**
 * sc: the scene (see baseScene in main.js). P: { t, dt, cam, needle, camel, tagAnim, fx, avatarOf }.
 * Returns { tagPos, cartBoxes }.
 */
export function paint(R, L, sc, P) {
  const { ctx } = R;
  const cam = P.cam;
  drawBackdrop(R, cam, { t: P.t, sun: sc.sun, night: sc.night, scroll: sc.scroll, onSun: sc.onSun });
  drawWorld(R, cam, {
    t: P.t,
    camel: P.camel,
    items: sc.items,
    hands: sc.hands,
    ghost: sc.ghost,
    town: sc.town ?? null,
    heap: sc.heap,
    crack: sc.crack,
    scroll: sc.scroll,
    bridge: sc.bridge,
  });
  R.world(cam);
  if (P.fx) P.fx.drawWorld(ctx, 1 / cam.s);
  if (sc.handsAfter) drawLetGo(ctx, cam, sc.handsAfter);
  for (const h of sc.extraHands ?? []) drawLetGo(ctx, cam, h);
  if (sc.crownAt) drawCrown(R, cam, sc.crownAt, P.avatarOf);

  R.screen();
  ctx.globalAlpha = 1;
  const out = { tagPos: new Map(), cartBoxes: [] };
  if (sc.tags) out.tagPos = drawRope(ctx, L, sc.tags, P.tagAnim, P.t, P.dt);
  if (sc.lanterns) drawLanterns(ctx, L, sc.lanterns);
  if (sc.needle !== null && sc.needle !== undefined && !sc.title) drawDial(ctx, L.dial, P.needle, { band: sc.band, gy: L.gy });
  if (sc.cart && !sc.title) out.cartBoxes = drawCart(ctx, L.cart, sc.cart, P.t);
  return out;
}

/** The hands after a drop: open, rising away, fading. */
export function drawLetGo(ctx, cam, h) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, h.alpha ?? 1));
  const lw = 1 / cam.s;
  const e = extents(h.item, h.a);
  const span = Math.min(e.maxX - e.minX, 1.2);
  const cx = h.x + (e.minX + e.maxX) / 2;
  const hy = h.y + e.maxY - 0.04;
  const d = Math.max(0.12, span / 2 - 0.12);
  drawHands(ctx, lw, { x: cx - d, y: hy }, { x: cx + d, y: hy }, (cam.oy + 40) / cam.s, h.who ?? { kind: 'player', seat: 0 }, h.open ?? 1);
  ctx.restore();
}

/** The winner on top of the heap, wearing the golden straw. */
export function drawCrown(R, cam, c, avatarOf) {
  const { ctx } = R;
  const p = toScreen(cam, c.x, c.y);
  R.screen();
  const r = Math.max(24, cam.s * 0.26);
  const y = p.y - r;
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = PAL.gold;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const img = c.bot ? null : avatarOf?.(c.id);
  if (c.bot) drawPortrait(ctx, c.name, p.x, y, r);
  else if (img && img.complete && img.naturalWidth > 0) {
    try {
      ctx.drawImage(img, p.x - r, y - r * 1.05, r * 2, r * 2);
    } catch {}
  } else text(ctx, String(c.name ?? '?').slice(0, 1).toUpperCase(), p.x, y + 2, { size: r, display: true, weight: 900, color: PAL.ink, outline: false });
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = PAL.ink;
  ctx.beginPath();
  ctx.arc(p.x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  goldenStraw(ctx, p.x - r * 1.15, y - r * 0.92, p.x + r * 1.2, y - r * 1.3, Math.max(8, r * 0.24));
  ctx.restore();
}

/** One lantern per round at the rope's end, lit as rounds pass. */
export function drawLanterns(ctx, L, ln) {
  const n = Math.max(0, Math.min(5, ln.n | 0));
  if (!n) return;
  const r = L.rope;
  const x0 = L.portrait ? r.x + 8 : r.x + r.w - 14 - (n - 1) * 22;
  const y = r.y + r.h + (L.portrait ? 4 : -2);
  for (let i = 0; i < n; i++) {
    const x = x0 + i * 22;
    const lit = i < ln.lit;
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (lit) {
      ctx.fillStyle = 'rgba(255,200,69,0.3)';
      ctx.beginPath();
      ctx.arc(x, y + 9, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(x, y + 9, 6, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = lit ? PAL.gold : PAL.violet;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(x - 5, y, 10, 2.5);
    ctx.fillRect(x - 5, y + 16, 10, 2.5);
  }
}

/**
 * The match's junk in a wide heap behind the lying camel: big things first, each resting on whatever is under it (no physics
 * needed), and the last item on the peak (the winner stands on it).
 */
export function buildHeap(list, seed) {
  const rng = createRng(`heap:${seed}`);
  const order = list.filter(isItem).slice(-30);
  const lastItem = order.pop();
  order.sort((a, b) => ITEMS[b].w * ITEMS[b].h - ITEMS[a].w * ITEMS[a].h);
  const N = 88, X0 = -1.7, X1 = 2.7;
  const mid = (X0 + X1) / 2;
  const hm = new Float64Array(N + 1);
  const ix = (x) => Math.max(0, Math.min(N, Math.round(((x - X0) / (X1 - X0)) * N)));
  const baseUnder = (cx, e) => {
    let base = 0;
    for (let i = ix(cx + e.minX); i <= ix(cx + e.maxX); i++) base = Math.max(base, hm[i]);
    return base;
  };
  const out = [];
  const put = (item, a, cx) => {
    const e = extents(item, a);
    const y = baseUnder(cx, e) - e.minY - 0.03;
    for (let i = ix(cx + e.minX); i <= ix(cx + e.maxX); i++) hm[i] = Math.max(hm[i], y + e.maxY);
    out.push({ item, x: cx, y, a, top: y + e.maxY });
  };
  for (const item of order) {
    const a = (rng.next() - 0.5) * 0.4 + (ITEMS[item].key === 'clock' ? Math.PI / 2 : 0);
    const e = extents(item, a);
    const lo = X0 - e.minX, hi = Math.max(lo, X1 - e.maxX);
    let best = null;
    for (let t = 0; t < 20; t++) {
      const cx = lo + rng.next() * (hi - lo);
      const score = baseUnder(cx, e) + Math.abs(cx - mid) * 0.2 + rng.next() * 0.1;
      if (!best || score < best.score) best = { cx, score };
    }
    put(item, a, best.cx);
  }
  if (lastItem !== undefined) {
    let peak = Math.round(N / 2);
    for (let i = 0; i <= N; i++) if (hm[i] > hm[peak] + 1e-6) peak = i;
    const e = extents(lastItem, 0);
    const px = X0 + (peak / N) * (X1 - X0) - (e.minX + e.maxX) / 2;
    put(lastItem, 0, Math.max(X0 - e.minX, Math.min(X1 - e.maxX, px)));
  }
  return out;
}

export { drawSign };

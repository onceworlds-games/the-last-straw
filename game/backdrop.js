// The land behind the camel, in screen pixels: a graded sky with a sun that glows (or a moon and stars), long clouds lit
// from below, god rays, mesas in the haze with a caravan walking the far ridge, vultures circling, three ranges of dunes
// with sunlit crests, the stop's own landmarks (a town, palms, red rock, salt, ruins, lanterns), and the sand.
// Far layers are drawn once into tiles (they scroll and parallax for free); the sky, the sun and the life move every frame.

import { PAL, skyAt, BIOMES, mix, rgba } from './look.js';
import { createRng } from './rng.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Periodic value noise: n(x) for x in [0, 1) wraps at 1. `cells` control points, smooth interpolation. */
function loopNoise(seed, cells) {
  const r = createRng(seed);
  const v = Array.from({ length: cells }, () => r.next());
  return (x) => {
    const u = (((x % 1) + 1) % 1) * cells;
    const i = Math.floor(u);
    const f = u - i;
    const a = v[i % cells], b = v[(i + 1) % cells];
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
}

function canvasOf(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(Math.max(1, w), Math.max(1, h)) : Object.assign(document.createElement('canvas'), { width: Math.max(1, w), height: Math.max(1, h) });
  return c;
}

/**
 * The backdrop. draw(ctx, view, env):
 *   view: { W, H, pr, gy (the sand line), hy (the horizon), pan (px the camera is off its natural framing), s (px per metre) }
 *   env: { t, tod (0 gold, 0.5 dusk, 1 night), biome, scroll (metres walked), quality ('low'|'medium'|'high'), onSun }
 */
export function createBackdrop() {
  let key = '';
  let tiles = null; // { far, dunes, mid, tw }
  const clouds = [];
  let cloudKey = '';

  function build(view, env) {
    const { W, H, pr } = view;
    const sky = skyAt(env.tod);
    const B = BIOMES[env.biome] ?? BIOMES.market;
    const tw = Math.round(Math.max(W * 1.6, 960));
    const band = view.gy - view.hy; // horizon to sand line
    const seed = env.biome;
    const haze = sky.haze;
    // ------------------------------------------------ the far layer: mesas and buttes in the haze
    const farTop = Math.round(view.hy - Math.min(H * 0.2, 150));
    const farH = Math.round(view.hy - farTop + band * 0.5);
    const far = canvasOf(tw * pr, farH * pr);
    {
      const c = far.getContext('2d');
      c.scale(pr, pr);
      const hy = view.hy - farTop;
      const rng = createRng(`mesa:${seed}`);
      const col = mix(B.far, haze, 0.45);
      const lit = mix(col, sky.light, 0.22);
      // a low back range first (rolling), then flat-topped mesas in front of it
      const n1 = loopNoise(`range:${seed}`, 7);
      c.fillStyle = mix(B.far, haze, 0.62);
      c.beginPath();
      c.moveTo(0, farH);
      for (let x = 0; x <= tw; x += 8) c.lineTo(x, hy - (0.18 + n1(x / tw) * 0.5) * Math.min(H * 0.08, 60));
      c.lineTo(tw, farH);
      c.fill();
      const count = 5 + rng.int(3);
      for (let i = 0; i < count; i++) {
        const cx = ((i + rng.range(0.1, 0.9)) / count) * tw;
        const w = rng.range(0.025, 0.075) * tw * 0.5;
        const h = rng.range(0.45, 1) * Math.min(H * 0.19, 150);
        const lean = rng.range(-0.15, 0.15) * w;
        const draw = (dx) => {
          const x0 = cx + dx;
          c.beginPath();
          c.moveTo(x0 - w * 1.4, hy + 2);
          c.quadraticCurveTo(x0 - w * 1.05, hy - h * 0.18, x0 - w * 0.85, hy - h * 0.55);
          c.lineTo(x0 - w * 0.78 + lean, hy - h);
          c.lineTo(x0 + w * 0.7 + lean, hy - h * 0.97);
          c.lineTo(x0 + w * 0.82, hy - h * 0.5);
          c.quadraticCurveTo(x0 + w * 1.05, hy - h * 0.15, x0 + w * 1.5, hy + 2);
          c.closePath();
          c.fillStyle = col;
          c.fill();
          // the lit rim along the top and the sun-side cliff
          c.strokeStyle = rgba(lit, 0.7);
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(x0 - w * 0.85, hy - h * 0.55);
          c.lineTo(x0 - w * 0.78 + lean, hy - h);
          c.lineTo(x0 + w * 0.7 + lean, hy - h * 0.97);
          c.stroke();
          // strata
          c.strokeStyle = rgba(mix(col, '#2A1240', 0.25), 0.35);
          c.lineWidth = 1;
          for (let k = 1; k < 4; k++) {
            const y = hy - h * (0.25 + k * 0.17);
            c.beginPath();
            c.moveTo(x0 - w * 0.8, y);
            c.lineTo(x0 + w * 0.75, y + 2);
            c.stroke();
          }
        };
        draw(0);
        if (cx - w * 1.5 < 0) draw(tw);
        if (cx + w * 1.5 > tw) draw(-tw);
      }
      // haze at the foot
      const g = c.createLinearGradient(0, hy - 40, 0, hy + 6);
      g.addColorStop(0, rgba(haze, 0));
      g.addColorStop(1, rgba(haze, 0.75));
      c.fillStyle = g;
      c.fillRect(0, hy - 40, tw, farH - hy + 40);
    }
    // ------------------------------------------------ the far dunes (the caravan walks their ridge)
    const dTop = Math.round(view.hy - band * 0.55);
    const dH = Math.round(view.gy - dTop + 4);
    const dunes = canvasOf(tw * pr, dH * pr);
    const ridgeN = loopNoise(`ridge:${seed}`, 5);
    const ridge = (u) => view.hy + band * 0.08 - (0.25 + ridgeN(u) * 0.75) * band * 0.42;
    {
      const c = dunes.getContext('2d');
      c.scale(pr, pr);
      c.translate(0, -dTop);
      const col = mix(B.farDune, haze, 0.3);
      const p = new Path2D();
      p.moveTo(0, view.gy + 4);
      for (let x = 0; x <= tw; x += 6) p.lineTo(x, ridge(x / tw));
      p.lineTo(tw, view.gy + 4);
      p.closePath();
      const g = c.createLinearGradient(0, view.hy - band * 0.4, 0, view.gy);
      g.addColorStop(0, mix(col, sky.light, 0.12));
      g.addColorStop(0.6, col);
      g.addColorStop(1, mix(col, haze, 0.35));
      c.fillStyle = g;
      c.fill(p);
      // lee faces in shade: a second ridge offset, clipped
      c.save();
      c.clip(p);
      const n2 = loopNoise(`lee:${seed}`, 9);
      c.fillStyle = rgba(mix(col, '#2A1240', 0.35), 0.45);
      c.beginPath();
      for (let x = 0; x <= tw; x += 6) {
        const u = x / tw;
        const y = ridge(u) + 4 + n2(u * 2) * band * 0.12;
        if (x === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.lineTo(tw, view.gy + 4);
      c.lineTo(0, view.gy + 4);
      c.fill();
      c.restore();
      // the sunlit crest
      c.strokeStyle = rgba(sky.light, 0.55);
      c.lineWidth = 1.6;
      c.beginPath();
      for (let x = 0; x <= tw; x += 6) {
        const y = ridge(x / tw) + 0.8;
        if (x === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    // ------------------------------------------------ the middle: big dunes and the stop's landmarks
    const mTop = Math.round(view.hy - Math.min(H * 0.3, 240));
    const mH = Math.round(view.gy - mTop + 4);
    const mid = canvasOf(tw * pr, mH * pr);
    {
      const c = mid.getContext('2d');
      c.scale(pr, pr);
      c.translate(0, -mTop);
      drawMid(c, tw, view, B, sky, seed);
    }
    tiles = { far, farTop, farH, dunes, dTop, dH, mid, mTop, mH, tw, ridge, sky, B };
  }

  function buildClouds(view, env) {
    const sky = skyAt(env.tod);
    clouds.length = 0;
    const rng = createRng(`clouds:${env.biome}`);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const w = rng.range(160, 420) * Math.max(0.6, view.W / 1280);
      const h = w * rng.range(0.07, 0.12);
      const pad = 20;
      const cv = canvasOf(Math.ceil((w + pad * 2) * view.pr), Math.ceil((h * 2.6 + pad * 2) * view.pr));
      const c = cv.getContext('2d');
      c.scale(view.pr, view.pr);
      c.translate(pad, pad + h * 1.3);
      const blobs = [];
      const k = 6 + rng.int(5);
      for (let j = 0; j < k; j++) {
        const u = j / (k - 1);
        blobs.push({ x: w * (0.05 + u * 0.9) + rng.range(-10, 10), y: -Math.sin(u * Math.PI) * h * rng.range(0.3, 0.9), rx: rng.range(0.12, 0.22) * w, ry: h * rng.range(0.55, 1.0) });
      }
      const p = new Path2D();
      for (const b of blobs) {
        p.moveTo(b.x + b.rx, b.y);
        p.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, TAU);
      }
      // flat base
      c.save();
      c.beginPath();
      c.rect(-pad, -h * 2, w + pad * 2, h * 2 + h * 0.35);
      c.clip();
      const g = c.createLinearGradient(0, -h * 1.2, 0, h * 0.4);
      g.addColorStop(0, mix(sky.upper, sky.top, 0.2));
      g.addColorStop(0.55, mix(sky.mid, sky.upper, 0.3));
      g.addColorStop(1, mix(sky.light, sky.glow, 0.4));
      c.fillStyle = g;
      c.fill(p);
      c.restore();
      clouds.push({ cv, w: w + pad * 2, h: h * 2.6 + pad * 2, x: rng.next(), y: rng.range(0.12, 0.62), speed: rng.range(0.004, 0.012), alpha: rng.range(0.55, 0.9) });
    }
  }

  const stars = Array.from({ length: 90 }, (_, i) => {
    const r = createRng(`star:${i}`);
    return { x: r.next(), y: r.next() * r.next(), r: r.next() < 0.12 ? 1.6 : 0.9, ph: r.next() * TAU };
  });

  /** Where the far ridge is at screen x (for the distant caravan). */
  function ridgeAt(x, off) {
    if (!tiles) return 0;
    const u = (((x - off) / tiles.tw) % 1 + 1) % 1;
    return tiles.ridge(u);
  }

  function draw(ctx, view, env) {
    const { W, H, pr, gy, hy } = view;
    const k = `${W}x${H}@${pr}:${Math.round(hy)}:${Math.round(gy)}:${env.biome}:${Math.round(env.tod * 20)}`;
    if (k !== key) {
      key = k;
      build(view, env);
    }
    const ck = `${W}:${pr}:${env.biome}:${Math.round(env.tod * 10)}`;
    if (ck !== cloudKey) {
      cloudKey = ck;
      buildClouds(view, env);
    }
    const sky = tiles.sky;
    const t = env.t;
    const hi = env.quality !== 'low';
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    // ------------------------------------------------ the sky
    const g = ctx.createLinearGradient(0, 0, 0, hy + 2);
    g.addColorStop(0, sky.top);
    g.addColorStop(0.32, sky.upper);
    g.addColorStop(0.62, sky.mid);
    g.addColorStop(0.86, sky.low);
    g.addColorStop(1, sky.horizon);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, hy + 2);
    ctx.fillStyle = sky.horizon;
    ctx.fillRect(0, hy, W, gy - hy + 2);
    // stars and the moon
    const night = smooth(0.5, 1, env.tod);
    if (night > 0) {
      for (const s of stars) {
        const a = night * (0.55 + 0.45 * Math.sin(t * 1.7 + s.ph));
        ctx.globalAlpha = a;
        ctx.fillStyle = '#FFF4DE';
        const x = s.x * W, y = s.y * hy * 0.85;
        ctx.fillRect(x - s.r / 2, y - s.r / 2, s.r, s.r);
        if (s.r > 1.2) {
          ctx.globalAlpha = a * 0.35;
          ctx.fillRect(x - 3, y - 0.4, 6, 0.8);
          ctx.fillRect(x - 0.4, y - 3, 0.8, 6);
        }
      }
      ctx.globalAlpha = night;
      const mx = W * 0.78 - view.pan * 0.02, my = Math.max(60, hy * 0.3), mr = Math.max(14, Math.min(W, H) * 0.035);
      const mg = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4);
      mg.addColorStop(0, 'rgba(230,220,255,0.35)');
      mg.addColorStop(1, 'rgba(230,220,255,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
      ctx.fillStyle = '#F7F0DC';
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, TAU);
      ctx.fill();
      ctx.fillStyle = sky.upper;
      ctx.beginPath();
      ctx.arc(mx + mr * 0.42, my - mr * 0.18, mr * 0.88, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // ------------------------------------------------ the sun: glow, god rays, disc with a heat shimmer
    const R = Math.max(W, H) * 0.12;
    const sx = W * 0.27 - view.pan * 0.03 - (env.scroll ?? 0) * 0.4;
    const sink = clamp(env.tod / 0.62, 0, 1);
    const sy = hy - R * 0.62 + sink * R * 1.75;
    const day = 1 - smooth(0.45, 0.75, env.tod);
    if (day > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      const gg = ctx.createRadialGradient(sx, sy, R * 0.6, sx, sy, R * 5.2);
      gg.addColorStop(0, rgba(sky.glow, 0.5 * day));
      gg.addColorStop(0.3, rgba(sky.glow, 0.16 * day));
      gg.addColorStop(1, rgba(sky.glow, 0));
      ctx.fillStyle = gg;
      ctx.fillRect(0, 0, W, gy);
      if (hi && !env.reduced) {
        // god rays: long faint wedges turning slowly
        ctx.save();
        ctx.translate(sx, sy);
        for (let i = 0; i < 9; i++) {
          const a = -Math.PI * 0.95 + i * 0.24 + Math.sin(t * 0.07 + i * 1.7) * 0.05;
          const L = Math.max(W, H) * 1.3;
          const w = 0.035 + (i % 3) * 0.02;
          const rg = ctx.createLinearGradient(0, 0, Math.cos(a) * L, Math.sin(a) * L);
          rg.addColorStop(0, rgba(sky.light, 0.12 * day));
          rg.addColorStop(1, rgba(sky.light, 0));
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a - w) * L, Math.sin(a - w) * L);
          ctx.lineTo(Math.cos(a + w) * L, Math.sin(a + w) * L);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      // the disc
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, hy + 1);
      ctx.clip();
      const dg = ctx.createRadialGradient(sx - R * 0.2, sy - R * 0.25, R * 0.1, sx, sy, R);
      dg.addColorStop(0, '#FFFBEA');
      dg.addColorStop(0.55, sky.sun);
      dg.addColorStop(1, mix(sky.glow, sky.sun, 0.35));
      ctx.fillStyle = dg;
      ctx.globalAlpha = day;
      // shimmer: the lower half drawn in wobbling slices
      ctx.beginPath();
      ctx.arc(sx, sy, R, Math.PI, TAU);
      ctx.fill();
      const slices = 10;
      for (let i = 0; i < slices; i++) {
        const y0 = sy + (i / slices) * R;
        const y1 = sy + ((i + 1) / slices) * R;
        const half = Math.sqrt(Math.max(0, R * R - ((y0 + y1) / 2 - sy) ** 2));
        const wob = env.reduced ? 0 : Math.sin(t * 2.2 + i * 1.3) * (i / slices) * R * 0.025;
        ctx.fillRect(sx - half + wob, y0, half * 2, y1 - y0 + 0.6);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      if (env.onSun) env.onSun(ctx, sx, sy, R);
    } else if (env.onSun) env.onSun(ctx, W * 0.27, hy - R * 0.6, R);
    // clouds (lit from below), drifting
    for (const cl of clouds) {
      const x = ((cl.x + t * cl.speed * 0.1) % 1.3) * (W + cl.w) - cl.w - view.pan * 0.04;
      const y = cl.y * hy * 0.92 - cl.h / 2;
      ctx.globalAlpha = cl.alpha * (0.6 + 0.4 * (1 - night));
      ctx.drawImage(cl.cv, x, y, cl.w, cl.h);
    }
    ctx.globalAlpha = 1;
    // ------------------------------------------------ the far mesas
    const scroll = env.scroll ?? 0;
    const tile = (cv, top, h, off) => {
      const tw = tiles.tw;
      let x = (((off % tw) + tw) % tw) - tw;
      for (; x < W; x += tw) ctx.drawImage(cv, x, top, tw, h);
    };
    const farOff = -view.pan * 0.05 - scroll * view.s * 0.03;
    tile(tiles.far, tiles.farTop, tiles.farH, farOff);
    // birds: vultures circling far off
    if (!env.reduced || true) drawBirds(ctx, W, hy, t, sky, night);
    // ------------------------------------------------ the far dunes and the caravan on their ridge
    const dOff = -view.pan * 0.12 - scroll * view.s * 0.1;
    tile(tiles.dunes, tiles.dTop, tiles.dH, dOff);
    drawFarCaravan(ctx, W, t, (x) => ridgeAt(x, dOff), mix(tiles.B.farDune, '#2A1240', 0.45), view.s, scroll);
    // haze between ranges
    const hz = ctx.createLinearGradient(0, hy - (gy - hy) * 0.2, 0, hy + (gy - hy) * 0.45);
    hz.addColorStop(0, rgba(sky.haze, 0));
    hz.addColorStop(1, rgba(sky.haze, 0.35));
    ctx.fillStyle = hz;
    ctx.fillRect(0, hy - (gy - hy) * 0.2, W, (gy - hy) * 0.65);
    // ------------------------------------------------ the middle range and the stop's landmarks
    const mOff = -view.pan * 0.25 - scroll * view.s * 0.3;
    tile(tiles.mid, tiles.mTop, tiles.mH, mOff);
    if (tiles.B.props === 'lanterns' || night > 0.3) drawLanternGlow(ctx, tiles, mOff, W, t, Math.max(night, tiles.B.props === 'lanterns' ? 1 : 0));
  }

  return { draw };
}

// ---------------------------------------------------------------- the middle range

function drawMid(c, tw, view, B, sky, seed) {
  const { hy, gy, H } = view;
  const band = gy - hy;
  const n = loopNoise(`mid:${seed}`, 4);
  const base = gy - band * 0.18;
  const top = (u) => base - (0.35 + n(u) * 0.65) * band * 0.62;
  const col = mix(B.mid, sky.haze, 0.18);
  // landmarks behind the dunes' crest
  const rng = createRng(`props:${seed}`);
  const props = B.props;
  const far = mix(B.midShade, sky.haze, 0.35);
  if (props === 'town') drawTown(c, tw, top, rng, far, sky, band);
  if (props === 'rocks') drawRocks(c, tw, top, rng, mix(B.midShade, sky.haze, 0.2), sky, band, H);
  if (props === 'ruins') drawRuins(c, tw, top, rng, far, sky, band);
  if (props === 'lanterns') drawTents(c, tw, top, rng, far, sky, band);
  if (props === 'salt') drawPeaks(c, tw, hy, rng, mix(B.far, sky.haze, 0.3), sky, band);
  // the dunes
  const p = new Path2D();
  p.moveTo(0, gy + 4);
  for (let x = 0; x <= tw; x += 5) p.lineTo(x, top(x / tw));
  p.lineTo(tw, gy + 4);
  p.closePath();
  const g = c.createLinearGradient(0, base - band * 0.6, 0, gy);
  g.addColorStop(0, mix(col, sky.light, 0.18));
  g.addColorStop(0.55, col);
  g.addColorStop(1, mix(col, sky.haze, 0.25));
  c.fillStyle = g;
  c.fill(p);
  c.save();
  c.clip(p);
  // shaded lee slopes (down to the right of each crest, away from the low sun)
  const lee = loopNoise(`midlee:${seed}`, 7);
  c.fillStyle = rgba(B.midShade, 0.42);
  c.beginPath();
  c.moveTo(0, gy + 4);
  for (let x = 0; x <= tw; x += 5) {
    const u = x / tw;
    c.lineTo(x, top(u) + 3 + lee(u * 1.5) * band * 0.2);
  }
  c.lineTo(tw, gy + 4);
  c.fill();
  // wind ripples on the faces
  c.strokeStyle = rgba(mix(B.midShade, '#2A1240', 0.2), 0.22);
  c.lineWidth = 1;
  const rr = createRng(`rip:${seed}`);
  for (let i = 0; i < tw / 14; i++) {
    const x = rr.next() * tw;
    const y = top(x / tw) + rr.range(6, band * 0.5);
    const w = rr.range(18, 60);
    c.beginPath();
    c.moveTo(x - w / 2, y);
    c.quadraticCurveTo(x, y - 3, x + w / 2, y + 1);
    c.stroke();
  }
  c.restore();
  // crest light
  c.strokeStyle = rgba(sky.light, 0.6);
  c.lineWidth = 2;
  c.beginPath();
  for (let x = 0; x <= tw; x += 5) {
    const y = top(x / tw) + 1;
    if (x === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();
  if (props === 'palms') drawPalms(c, tw, top, rng, mix(B.midShade, '#2A1240', 0.35), sky, band, gy);
}

function wrapDraw(tw, x, w, fn) {
  fn(x);
  if (x - w < 0) fn(x + tw);
  if (x + w > tw) fn(x - tw);
}

function drawTown(c, tw, top, rng, col, sky, band) {
  // a few flat-roofed houses, a water tower and a windmill on the far crest
  for (let k = 0; k < 2; k++) {
    const cx = (k + 0.25 + rng.next() * 0.4) * tw * 0.5;
    const y = top(cx / tw) + band * 0.06;
    wrapDraw(tw, cx, 160, (x0) => {
      const houses = 5 + rng.int(3);
      for (let i = 0; i < houses; i++) {
        const w = 18 + rng.next() * 24;
        const h = 14 + rng.next() * 22;
        const x = x0 - 70 + i * 26 + rng.next() * 8;
        c.fillStyle = mix(col, sky.light, i % 2 ? 0.05 : 0.12);
        c.fillRect(x, y - h, w, h + 10);
        c.fillStyle = rgba('#2A1240', 0.35);
        for (let j = 0; j < 2; j++) c.fillRect(x + 4 + j * (w * 0.45), y - h + 5, 3, 4);
        c.fillStyle = rgba(sky.light, 0.45);
        c.fillRect(x, y - h, w, 1.5);
      }
      // water tower
      c.fillStyle = col;
      c.fillRect(x0 + 92, y - 46, 2, 46);
      c.fillRect(x0 + 108, y - 46, 2, 46);
      c.beginPath();
      c.ellipse(x0 + 101, y - 52, 14, 10, 0, 0, TAU);
      c.fill();
      // windmill
      c.fillRect(x0 - 96, y - 58, 3, 58);
      c.save();
      c.translate(x0 - 94.5, y - 58);
      for (let b = 0; b < 6; b++) {
        c.rotate(TAU / 6);
        c.fillRect(0, -1.2, 14, 2.4);
      }
      c.restore();
    });
  }
}

function drawRocks(c, tw, top, rng, col, sky, band, H) {
  for (let k = 0; k < 3; k++) {
    const cx = (k + 0.2 + rng.next() * 0.6) * tw / 3;
    const y = top(cx / tw) + band * 0.1;
    const h = band * (0.9 + rng.next() * 0.9);
    const w = 30 + rng.next() * 40;
    wrapDraw(tw, cx, w * 2.5, (x0) => {
      c.fillStyle = col;
      if (k === 1) {
        // an arch
        c.beginPath();
        c.moveTo(x0 - w * 1.6, y);
        c.lineTo(x0 - w * 1.4, y - h);
        c.quadraticCurveTo(x0, y - h * 1.18, x0 + w * 1.4, y - h * 0.95);
        c.lineTo(x0 + w * 1.6, y);
        c.lineTo(x0 + w * 0.8, y);
        c.quadraticCurveTo(x0 + w * 0.7, y - h * 0.72, x0, y - h * 0.72);
        c.quadraticCurveTo(x0 - w * 0.75, y - h * 0.72, x0 - w * 0.8, y);
        c.closePath();
        c.fill();
      } else {
        // a hoodoo / spire
        c.beginPath();
        c.moveTo(x0 - w, y);
        c.lineTo(x0 - w * 0.55, y - h * 0.6);
        c.lineTo(x0 - w * 0.75, y - h * 0.68);
        c.lineTo(x0 - w * 0.35, y - h);
        c.lineTo(x0 + w * 0.45, y - h * 0.94);
        c.lineTo(x0 + w * 0.6, y - h * 0.62);
        c.lineTo(x0 + w * 0.4, y - h * 0.55);
        c.lineTo(x0 + w * 1.1, y);
        c.closePath();
        c.fill();
      }
      c.strokeStyle = rgba(sky.light, 0.5);
      c.lineWidth = 2;
      c.stroke();
      c.strokeStyle = rgba('#2A1240', 0.2);
      c.lineWidth = 1;
      for (let s = 1; s < 6; s++) {
        c.beginPath();
        c.moveTo(x0 - w, y - (h * s) / 6);
        c.lineTo(x0 + w, y - (h * s) / 6 + 3);
        c.stroke();
      }
    });
  }
}

function drawRuins(c, tw, top, rng, col, sky, band) {
  for (let k = 0; k < 2; k++) {
    const cx = (k + 0.3 + rng.next() * 0.4) * tw / 2;
    const y = top(cx / tw) + band * 0.12;
    wrapDraw(tw, cx, 180, (x0) => {
      c.fillStyle = col;
      // columns, some broken
      for (let i = 0; i < 5; i++) {
        const h = band * (0.5 + (i % 3 === 1 ? 0.15 : 0.5) * rng.next() + 0.4);
        const x = x0 - 90 + i * 34;
        c.fillRect(x, y - h, 12, h);
        c.fillRect(x - 3, y - h - 4, 18, 5);
        c.fillStyle = rgba(sky.light, 0.4);
        c.fillRect(x, y - h, 2, h);
        c.fillStyle = col;
      }
      // a lintel over the first two
      c.fillRect(x0 - 96, y - band * 1.05, 76, 8);
      // the half-buried stone head
      const hx = x0 + 120, hyy = y + 4;
      c.beginPath();
      c.moveTo(hx - 34, hyy);
      c.quadraticCurveTo(hx - 38, hyy - 46, hx - 6, hyy - 60);
      c.quadraticCurveTo(hx + 24, hyy - 62, hx + 30, hyy - 30);
      c.lineTo(hx + 40, hyy - 26);
      c.lineTo(hx + 32, hyy - 16);
      c.lineTo(hx + 34, hyy);
      c.closePath();
      c.fill();
      c.fillStyle = rgba('#2A1240', 0.35);
      c.fillRect(hx + 10, hyy - 40, 10, 3);
      c.fillRect(hx + 22, hyy - 12, 10, 2);
    });
  }
}

function drawTents(c, tw, top, rng, col, sky, band) {
  for (let k = 0; k < 4; k++) {
    const cx = (k + 0.2 + rng.next() * 0.6) * tw / 4;
    const y = top(cx / tw) + band * 0.16;
    const w = 40 + rng.next() * 30, h = 26 + rng.next() * 18;
    wrapDraw(tw, cx, w, (x0) => {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(x0 - w, y);
      c.lineTo(x0 - w * 0.3, y - h);
      c.lineTo(x0 + w * 0.3, y - h);
      c.lineTo(x0 + w, y);
      c.closePath();
      c.fill();
      c.fillStyle = '#FFC86A';
      c.beginPath();
      c.moveTo(x0 - w * 0.18, y);
      c.lineTo(x0, y - h * 0.65);
      c.lineTo(x0 + w * 0.18, y);
      c.closePath();
      c.fill();
    });
  }
}

function drawPeaks(c, tw, hy, rng, col, sky, band) {
  c.fillStyle = col;
  const n = loopNoise('peaks', 11);
  c.beginPath();
  c.moveTo(0, hy + band * 0.3);
  for (let x = 0; x <= tw; x += 6) {
    const u = x / tw;
    const v = n(u * 3);
    c.lineTo(x, hy - band * (0.15 + Math.abs(Math.sin(u * TAU * 4 + v * 2)) * 0.5 * v));
  }
  c.lineTo(tw, hy + band * 0.3);
  c.fill();
  c.strokeStyle = rgba('#FFFFFF', 0.35);
  c.lineWidth = 1.2;
  c.stroke();
}

function drawPalms(c, tw, top, rng, col, sky, band, gy) {
  for (let k = 0; k < 7; k++) {
    const cx = (k + rng.next()) * tw / 7;
    const y = top(cx / tw) + band * (0.15 + rng.next() * 0.15);
    const h = band * (0.9 + rng.next() * 0.8);
    const lean = (rng.next() - 0.5) * 30;
    wrapDraw(tw, cx, 60, (x0) => palm(c, x0, y, h, lean, col, sky));
  }
}

export function palm(c, x0, y, h, lean, col, sky, lw = 5) {
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x0, y);
  c.quadraticCurveTo(x0 + lean * 0.2, y - h * 0.6, x0 + lean, y - h);
  c.stroke();
  c.fillStyle = col;
  const tx = x0 + lean, ty = y - h;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.48 + (i > 3 ? 0.2 : -0.2);
    const L = h * (0.36 + (i % 2) * 0.08);
    const ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.55 + L * 0.35 * Math.abs(Math.cos(a));
    c.beginPath();
    c.moveTo(tx, ty);
    c.quadraticCurveTo(tx + Math.cos(a) * L * 0.5, ty + Math.sin(a) * L * 0.6 - L * 0.2, ex, ey);
    c.quadraticCurveTo(tx + Math.cos(a) * L * 0.55, ty + Math.sin(a) * L * 0.4 - L * 0.05, tx, ty + 2);
    c.fill();
  }
  if (sky) {
    c.strokeStyle = rgba(sky.light, 0.4);
    c.lineWidth = Math.max(1, lw * 0.3);
    c.beginPath();
    c.moveTo(x0 - lw * 0.3, y);
    c.quadraticCurveTo(x0 + lean * 0.2 - lw * 0.3, y - h * 0.6, x0 + lean - lw * 0.3, y - h);
    c.stroke();
  }
}

// ---------------------------------------------------------------- life in the distance

function drawBirds(ctx, W, hy, t, sky, night) {
  ctx.strokeStyle = rgba(mix(sky.top, '#1C0F2E', 0.5), 0.75 * (1 - night * 0.7));
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a = t * (0.16 + i * 0.03) + i * 2.1;
    const cx = W * (0.66 + i * 0.05), cy = hy * (0.32 + i * 0.06);
    const rx = 50 + i * 22, ry = 14 + i * 5;
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    const flap = Math.sin(t * 5 + i) > 0.6 ? Math.sin(t * 14 + i) : 0.2;
    const s = 7 + i * 1.5;
    ctx.beginPath();
    ctx.moveTo(x - s, y - flap * s * 0.5);
    ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.25, x, y);
    ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.25, x + s, y - flap * s * 0.5);
    ctx.stroke();
  }
}

/** A caravan of six camels and two walkers on the far ridge, walking left, very slowly. */
function drawFarCaravan(ctx, W, t, ridge, col, s, scroll) {
  const speed = 6; // px per second
  const span = W * 1.8;
  const head = W * 1.25 - ((t * speed + scroll * s * 0.1) % span);
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  const scale = Math.max(0.7, Math.min(1.3, W / 1280));
  for (let i = 0; i < 7; i++) {
    const x = head + i * 26 * scale;
    if (x < -30 || x > W + 30) continue;
    const y = ridge(x) + 1;
    const ph = t * 3.2 + i * 0.9;
    if (i === 0 || i === 4) {
      // a walker
      ctx.lineWidth = 1.4 * scale;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.sin(ph) * 2 * scale, y - 6 * scale);
      ctx.moveTo(x + 2 * scale, y);
      ctx.lineTo(x + Math.sin(ph) * 2 * scale, y - 6 * scale);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + Math.sin(ph) * 2 * scale, y - 9 * scale, 2.6 * scale, 0, TAU);
      ctx.fill();
      continue;
    }
    const k = scale;
    ctx.lineWidth = 1.5 * k;
    // legs (a pace: near pair together)
    for (let l = 0; l < 4; l++) {
      const lx = x + (l < 2 ? -5 : 5) * k + (l % 2) * 1.5 * k;
      const sw = Math.sin(ph + (l % 2 ? Math.PI : 0)) * 2.2 * k;
      ctx.beginPath();
      ctx.moveTo(lx, y - 8 * k);
      ctx.lineTo(lx + sw, y);
      ctx.stroke();
    }
    // body, hump, neck, head
    ctx.beginPath();
    ctx.ellipse(x, y - 10 * k, 8 * k, 3.4 * k, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + 0.5 * k, y - 13 * k, 4.5 * k, 3.5 * k, 0, Math.PI, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 6 * k, y - 11 * k);
    ctx.quadraticCurveTo(x - 11 * k, y - 11 * k, x - 12 * k, y - 17 * k);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x - 13.5 * k, y - 17.5 * k, 2.6 * k, 1.5 * k, 0.2, 0, TAU);
    ctx.fill();
    // a load on some
    if (i % 2 === 1) ctx.fillRect(x - 3 * k, y - 19 * k, 7 * k, 4 * k);
  }
  // the rope between them
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 1; i < 6; i++) {
    const x = head + i * 26 * scale;
    ctx.moveTo(x + 8 * scale, ridge(x) - 10 * scale);
    ctx.lineTo(x + 26 * scale - 13 * scale, ridge(x + 26 * scale) - 17 * scale);
  }
  ctx.stroke();
}

function drawLanternGlow(ctx, tiles, off, W, t, a) {
  if (a <= 0.01) return;
  const rng = createRng('lglow');
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 10; i++) {
    const u = rng.next();
    let x = (u * tiles.tw + off) % tiles.tw;
    if (x < 0) x += tiles.tw;
    const y = tiles.mTop + tiles.mH * (0.55 + rng.next() * 0.2);
    for (const xx of [x, x - tiles.tw, x + tiles.tw]) {
      if (xx < -40 || xx > W + 40) continue;
      const r = 10 + 4 * Math.sin(t * 3 + i);
      const g = ctx.createRadialGradient(xx, y, 0, xx, y, r * 2.4);
      g.addColorStop(0, `rgba(255,190,90,${0.55 * a})`);
      g.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = g;
      ctx.fillRect(xx - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

// The look: the palette, every item drawn as a flat two-tone travel-poster shape with an ink outline, the animals' portraits,
// gloves and paws, sleeves. Items are drawn in metres with y up (the world transform flips the canvas).

import { ITEMS } from './items.js';

export const PAL = {
  ink: '#1C0F2E',
  violet: '#3B2160',
  violetDeep: '#2A1748',
  rose: '#D63F6E',
  roseDark: '#A32B55',
  ember: '#F27B35',
  emberDark: '#C2551F',
  gold: '#FFC845',
  goldDark: '#D99A1E',
  bone: '#FFF0D9',
  boneDark: '#EBCFA8',
  turq: '#22B8A7',
  turqDark: '#178577',
  wood: '#E39A57',
  woodDark: '#B4602C',
  camel: '#E9A866',
  camelShade: '#C47B45',
  sand: '#F7CC8A',
  iron: '#3E2C5C',
};

/** Seat colours, each with a symbol (colour is never the only cue). */
export const SEATS = [
  { color: PAL.turq, dark: PAL.turqDark, sym: 'circle' },
  { color: PAL.gold, dark: PAL.goldDark, sym: 'triangle' },
  { color: PAL.rose, dark: PAL.roseDark, sym: 'square' },
  { color: PAL.ember, dark: PAL.emberDark, sym: 'diamond' },
  { color: '#9C7BE0', dark: '#6A4CB0', sym: 'star' },
  { color: PAL.bone, dark: PAL.boneDark, sym: 'hex' },
];

export const SLEEVES = [
  { id: 0, name: 'Plain' },
  { id: 1, name: 'Stripes' },
  { id: 2, name: 'Checks' },
  { id: 3, name: 'Stars' },
  { id: 4, name: 'Zigzag' },
  { id: 5, name: 'Gold' },
];

// ---------------------------------------------------------------- path helpers (y up)

const P = () => new Path2D();
function rr(p, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.arcTo(x + w, y, x + w, y + r, r);
  p.lineTo(x + w, y + h - r);
  p.arcTo(x + w, y + h, x + w - r, y + h, r);
  p.lineTo(x + r, y + h);
  p.arcTo(x, y + h, x, y + h - r, r);
  p.lineTo(x, y + r);
  p.arcTo(x, y, x + r, y, r);
  p.closePath();
  return p;
}
function poly(p, pts) {
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath();
  return p;
}
function ell(p, cx, cy, rx, ry, rot = 0) {
  p.moveTo(cx + rx * Math.cos(rot), cy + rx * Math.sin(rot));
  p.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  p.closePath();
  return p;
}
const circ = (p, cx, cy, r) => ell(p, cx, cy, r, r);

// ---------------------------------------------------------------- items

/**
 * Each item's art: `body` (the silhouette, shaded two-tone), colours, and `deco(ctx, lw)` drawn on top (clipped to nothing).
 * Built once (Path2D), drawn many times.
 */
function build() {
  const A = {};
  A.straw = {
    base: PAL.gold, shade: PAL.goldDark,
    body: rr(P(), -0.45, -0.025, 0.9, 0.05, 0.02),
    deco(ctx, lw) {
      ctx.strokeStyle = PAL.goldDark;
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      for (let x = -0.36; x < 0.42; x += 0.13) {
        ctx.moveTo(x, -0.022);
        ctx.lineTo(x + 0.02, 0.022);
      }
      ctx.stroke();
    },
  };
  A.duck = {
    base: PAL.gold, shade: PAL.goldDark,
    body: (() => {
      const p = P();
      ell(p, 0.03, -0.08, 0.2, 0.13);
      circ(p, -0.11, 0.1, 0.11);
      poly(p, [[0.13, -0.02], [0.25, 0.09], [0.22, -0.06]]);
      return p;
    })(),
    deco(ctx, lw) {
      ctx.fillStyle = PAL.ember;
      ctx.beginPath();
      ctx.moveTo(-0.2, 0.11);
      ctx.lineTo(-0.29, 0.07);
      ctx.lineTo(-0.2, 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.fillStyle = PAL.ink;
      ctx.beginPath();
      ctx.arc(-0.12, 0.13, 0.022, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PAL.goldDark;
      ctx.lineWidth = lw * 1.2;
      ctx.beginPath();
      ctx.moveTo(-0.02, -0.06);
      ctx.quadraticCurveTo(0.08, -0.02, 0.15, -0.08);
      ctx.stroke();
    },
  };
  A.teapot = {
    base: PAL.turq, shade: PAL.turqDark,
    body: (() => {
      const p = P();
      ell(p, 0.03, -0.05, 0.2, 0.15);
      ell(p, 0.03, 0.09, 0.11, 0.05);
      circ(p, 0.03, 0.16, 0.035);
      poly(p, [[-0.13, -0.1], [-0.25, 0.09], [-0.21, 0.1], [-0.1, 0.0]]);
      return p;
    })(),
    deco(ctx, lw) {
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = lw * 2.2;
      ctx.beginPath();
      ctx.arc(0.22, -0.04, 0.08, -1.3, 1.3);
      ctx.stroke();
      ctx.fillStyle = PAL.bone;
      for (const [x, y] of [[-0.06, -0.02], [0.06, -0.1], [0.14, 0.0], [0.0, -0.13], [-0.1, -0.11]]) {
        ctx.beginPath();
        ctx.arc(x, y, 0.022, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
  A.birdcage = {
    base: PAL.violet, shade: PAL.violetDeep,
    body: rr(P(), -0.23, -0.35, 0.46, 0.08, 0.02),
    deco(ctx, lw) {
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = lw * 1.1;
      ctx.beginPath();
      for (let x = -0.18; x <= 0.181; x += 0.06) {
        const top = 0.08 + (0.23 - Math.abs(x) * 1.1) * 0.95;
        ctx.moveTo(x, -0.27);
        ctx.lineTo(x, Math.min(0.3, top));
      }
      ctx.moveTo(-0.2, -0.27);
      ctx.lineTo(-0.2, 0.08);
      ctx.quadraticCurveTo(-0.2, 0.31, 0, 0.31);
      ctx.quadraticCurveTo(0.2, 0.31, 0.2, 0.08);
      ctx.lineTo(0.2, -0.27);
      ctx.moveTo(-0.2, -0.05);
      ctx.lineTo(0.2, -0.05);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0.34, 0.035, 0, Math.PI * 2);
      ctx.stroke();
      // the bird
      ctx.fillStyle = PAL.rose;
      ctx.beginPath();
      ctx.ellipse(0.02, -0.15, 0.07, 0.05, 0.2, 0, Math.PI * 2);
      ctx.arc(-0.05, -0.1, 0.035, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.moveTo(-0.08, -0.1);
      ctx.lineTo(-0.11, -0.11);
      ctx.lineTo(-0.08, -0.12);
      ctx.fill();
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(0.0, -0.2);
      ctx.lineTo(0.0, -0.27);
      ctx.moveTo(0.04, -0.2);
      ctx.lineTo(0.04, -0.27);
      ctx.stroke();
    },
  };
  A.cactus = {
    base: PAL.turq, shade: PAL.turqDark,
    body: (() => {
      const p = P();
      rr(p, -0.085, -0.1, 0.17, 0.48, 0.085);
      rr(p, -0.19, 0.04, 0.09, 0.2, 0.045);
      rr(p, -0.19, 0.04, 0.16, 0.07, 0.035);
      return p;
    })(),
    deco(ctx, lw) {
      // the pot, drawn over the stem's foot
      const pot = poly(P(), [[-0.13, -0.38], [0.13, -0.38], [0.18, -0.1], [-0.18, -0.1]]);
      ctx.fillStyle = PAL.emberDark;
      ctx.fill(pot);
      ctx.fillStyle = PAL.ember;
      ctx.fill(poly(P(), [[-0.12, -0.36], [0.06, -0.36], [0.1, -0.1], [-0.16, -0.1]]));
      ctx.fillStyle = PAL.emberDark;
      ctx.fill(rr(P(), -0.2, -0.16, 0.4, 0.07, 0.02));
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = lw * 1.6;
      ctx.stroke(pot);
      ctx.stroke(rr(P(), -0.2, -0.16, 0.4, 0.07, 0.02));
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      for (const [x, y] of [[-0.06, 0.05], [0.05, 0.12], [-0.04, 0.22], [0.06, 0.28], [-0.15, 0.17], [0.04, -0.02]]) {
        ctx.moveTo(x - 0.02, y);
        ctx.lineTo(x + 0.02, y);
        ctx.moveTo(x, y - 0.02);
        ctx.lineTo(x, y + 0.02);
      }
      ctx.stroke();
      ctx.fillStyle = PAL.rose;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const t = (i / 5) * Math.PI * 2;
        ctx.ellipse(Math.cos(t) * 0.04, 0.39 + Math.sin(t) * 0.035, 0.03, 0.022, t, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.arc(0, 0.39, 0.02, 0, Math.PI * 2);
      ctx.fill();
    },
  };
  A.books = {
    base: PAL.rose, shade: PAL.roseDark,
    body: (() => {
      const p = P();
      rr(p, -0.3, -0.15, 0.6, 0.1, 0.015);
      rr(p, -0.27, -0.05, 0.55, 0.1, 0.015);
      rr(p, -0.3, 0.05, 0.58, 0.1, 0.015);
      return p;
    })(),
    deco(ctx, lw) {
      ctx.fillStyle = PAL.turq;
      ctx.fill(rr(P(), -0.27, -0.05, 0.55, 0.1, 0.015));
      ctx.fillStyle = PAL.bone;
      ctx.fill(rr(P(), -0.3, 0.05, 0.58, 0.1, 0.015));
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(-0.22, -0.12, 0.04, 0.04);
      ctx.fillRect(0.14, -0.02, 0.05, 0.04);
      ctx.fillStyle = PAL.violet;
      ctx.fillRect(-0.2, 0.08, 0.3, 0.025);
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(-0.3, -0.05);
      ctx.lineTo(0.3, -0.05);
      ctx.moveTo(-0.3, 0.05);
      ctx.lineTo(0.28, 0.05);
      ctx.stroke();
    },
  };
  A.pot = {
    base: PAL.ember, shade: PAL.emberDark,
    body: poly(P(), [[-0.21, -0.2], [0.21, -0.2], [0.29, 0.17], [0.31, 0.2], [-0.31, 0.2], [-0.29, 0.17]]),
    deco(ctx, lw) {
      ctx.fillStyle = PAL.emberDark;
      ctx.fillRect(-0.3, 0.12, 0.6, 0.05);
      ctx.fillStyle = PAL.gold;
      ctx.fill(poly(P(), [[-0.17, -0.14], [-0.12, -0.14], [-0.17, 0.08], [-0.22, 0.08]]));
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = lw * 2;
      ctx.beginPath();
      ctx.arc(-0.3, 0.08, 0.06, Math.PI * 0.5, Math.PI * 1.5);
      ctx.moveTo(0.3, 0.14);
      ctx.arc(0.3, 0.08, 0.06, Math.PI * 0.5, -Math.PI * 0.5, true);
      ctx.stroke();
    },
  };
  A.ladder = {
    base: PAL.wood, shade: PAL.woodDark,
    body: (() => {
      const p = P();
      rr(p, -0.9, 0.02, 1.8, 0.04, 0.01);
      rr(p, -0.9, -0.06, 1.8, 0.04, 0.01);
      for (let x = -0.8; x <= 0.81; x += 0.2) p.rect(x - 0.015, -0.03, 0.03, 0.06);
      return p;
    })(),
  };
  A.suitcase = {
    base: PAL.rose, shade: PAL.roseDark,
    body: (() => {
      const p = P();
      rr(p, -0.4, -0.25, 0.8, 0.44, 0.06);
      return p;
    })(),
    deco(ctx, lw) {
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = lw * 2.2;
      ctx.beginPath();
      ctx.moveTo(-0.1, 0.19);
      ctx.lineTo(-0.1, 0.24);
      ctx.lineTo(0.1, 0.24);
      ctx.lineTo(0.1, 0.19);
      ctx.stroke();
      ctx.fillStyle = PAL.bone;
      ctx.fillRect(-0.25, -0.25, 0.06, 0.44);
      ctx.fillRect(0.19, -0.25, 0.06, 0.44);
      ctx.fillStyle = PAL.gold;
      for (const [x, y] of [[-0.35, 0.14], [0.35, 0.14], [-0.35, -0.2], [0.35, -0.2]]) ctx.fillRect(x - 0.04, y - 0.03, 0.08, 0.06);
      ctx.fillStyle = PAL.turq;
      ctx.beginPath();
      ctx.arc(-0.02, -0.04, 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.arc(-0.02, -0.04, 0.045, 0, Math.PI * 2);
      ctx.fill();
    },
  };
  A.melon = {
    base: '#2E9E6A', shade: '#1F7350',
    body: ell(P(), 0, 0, 0.29, 0.22),
    deco(ctx, lw) {
      ctx.strokeStyle = '#155A3E';
      ctx.lineWidth = lw * 2.4;
      ctx.beginPath();
      for (const k of [-0.6, -0.2, 0.2, 0.6]) {
        ctx.moveTo(k * 0.29, -0.21);
        ctx.bezierCurveTo(k * 0.29 + 0.04, -0.07, k * 0.29 - 0.04, 0.07, k * 0.29, 0.21);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,217,0.5)';
      ctx.beginPath();
      ctx.ellipse(-0.12, 0.1, 0.08, 0.04, -0.4, 0, Math.PI * 2);
      ctx.fill();
    },
  };
  A.tuba = {
    base: PAL.gold, shade: PAL.goldDark,
    body: (() => {
      const p = P();
      // the coiled body (an upright oval of tubing), the bell flaring up and to the right
      ell(p, -0.12, -0.1, 0.15, 0.26);
      p.moveTo(-0.08, 0.06);
      p.bezierCurveTo(0.0, 0.1, 0.04, 0.12, 0.1, 0.16);
      p.bezierCurveTo(0.14, 0.2, 0.2, 0.32, 0.29, 0.35);
      p.lineTo(-0.11, 0.36);
      p.bezierCurveTo(-0.06, 0.3, -0.06, 0.2, -0.1, 0.14);
      p.closePath();
      return p;
    })(),
    deco(ctx, lw) {
      // the bell's mouth
      const g = ctx.createRadialGradient(0.1, 0.35, 0.01, 0.1, 0.35, 0.2);
      g.addColorStop(0, '#5A3A10');
      g.addColorStop(1, PAL.goldDark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0.09, 0.355, 0.2, 0.035, -0.02, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = lw * 1.5;
      ctx.stroke();
      // the inner coil of tubing
      ctx.strokeStyle = PAL.goldDark;
      ctx.lineWidth = lw * 2.4;
      ctx.beginPath();
      ctx.ellipse(-0.12, -0.12, 0.075, 0.16, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,190,0.7)';
      ctx.lineWidth = lw * 1.2;
      ctx.beginPath();
      ctx.ellipse(-0.125, -0.11, 0.06, 0.14, 0, Math.PI * 0.9, Math.PI * 1.5);
      ctx.stroke();
      // three valves with pearl caps on the left, the mouthpiece pipe
      for (const y of [0.0, 0.08, 0.16]) {
        ctx.fillStyle = PAL.goldDark;
        ctx.fillRect(-0.3, y - 0.012, 0.12, 0.024);
        ctx.strokeStyle = PAL.ink;
        ctx.lineWidth = lw;
        ctx.strokeRect(-0.3, y - 0.012, 0.12, 0.024);
        ctx.fillStyle = PAL.bone;
        ctx.beginPath();
        ctx.ellipse(-0.31, y, 0.018, 0.026, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = lw * 3.4;
      ctx.beginPath();
      ctx.moveTo(-0.2, 0.2);
      ctx.quadraticCurveTo(-0.28, 0.3, -0.2, 0.33);
      ctx.stroke();
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = lw * 1.8;
      ctx.stroke();
    },
  };
  A.rug = {
    base: PAL.rose, shade: PAL.roseDark,
    body: rr(P(), -0.8, -0.14, 1.6, 0.28, 0.14),
    deco(ctx, lw) {
      ctx.fillStyle = PAL.gold;
      for (const x of [-0.5, -0.1, 0.3]) ctx.fillRect(x, -0.14, 0.08, 0.28);
      ctx.fillStyle = PAL.violet;
      for (const x of [-0.36, 0.04, 0.44]) ctx.fillRect(x, -0.14, 0.04, 0.28);
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = lw * 1.2;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(s * 0.66, 0, 0.07, 0.13, 0, 0, Math.PI * 2);
        ctx.fillStyle = PAL.roseDark;
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s * 0.66, 0, 0.06, 0, Math.PI * 1.5);
        ctx.arc(s * 0.66, 0.01, 0.03, Math.PI * 1.5, Math.PI * 3);
        ctx.stroke();
      }
    },
  };
  A.bicycle = {
    base: PAL.violet, shade: PAL.violetDeep,
    body: null,
    deco(ctx, lw) {
      // wheels
      for (const x of [-0.4, 0.4]) {
        ctx.strokeStyle = PAL.ink;
        ctx.lineWidth = 0.055;
        ctx.beginPath();
        ctx.arc(x, -0.1, 0.27, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = PAL.bone;
        ctx.lineWidth = lw * 1.4;
        ctx.beginPath();
        ctx.arc(x, -0.1, 0.235, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = lw * 0.7;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const t = (k / 8) * Math.PI * 2;
          ctx.moveTo(x, -0.1);
          ctx.lineTo(x + Math.cos(t) * 0.23, -0.1 + Math.sin(t) * 0.23);
        }
        ctx.stroke();
      }
      // frame
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = 0.075;
      const frame = () => {
        ctx.beginPath();
        ctx.moveTo(0.4, -0.1);
        ctx.lineTo(0.12, 0.22);
        ctx.lineTo(-0.22, 0.22);
        ctx.lineTo(-0.4, -0.1);
        ctx.moveTo(0.4, -0.1);
        ctx.lineTo(0.02, -0.1);
        ctx.lineTo(0.12, 0.22);
        ctx.moveTo(0.02, -0.1);
        ctx.lineTo(-0.22, 0.22);
        ctx.lineTo(-0.27, 0.34);
        ctx.moveTo(0.12, 0.22);
        ctx.lineTo(0.14, 0.3);
        ctx.stroke();
      };
      ctx.lineCap = 'round';
      frame();
      ctx.strokeStyle = PAL.turq;
      ctx.lineWidth = 0.045;
      frame();
      ctx.lineCap = 'butt';
      ctx.fillStyle = PAL.ink;
      ctx.fill(rr(P(), 0.06, 0.3, 0.17, 0.05, 0.02));
      ctx.fill(rr(P(), -0.36, 0.32, 0.16, 0.035, 0.015));
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.arc(-0.22, 0.37, 0.03, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.ink;
      ctx.beginPath();
      ctx.arc(0.02, -0.1, 0.05, 0, Math.PI * 2);
      ctx.fill();
    },
  };
  A.crate = {
    base: PAL.wood, shade: PAL.woodDark,
    body: rr(P(), -0.35, -0.3, 0.7, 0.6, 0.02),
    deco(ctx, lw) {
      ctx.strokeStyle = PAL.woodDark;
      ctx.lineWidth = lw * 1.4;
      ctx.beginPath();
      ctx.moveTo(-0.35, -0.1);
      ctx.lineTo(0.35, -0.1);
      ctx.moveTo(-0.35, 0.1);
      ctx.lineTo(0.35, 0.1);
      ctx.stroke();
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = lw * 1.6;
      ctx.strokeRect(-0.3, -0.25, 0.6, 0.5);
      ctx.beginPath();
      ctx.moveTo(-0.3, -0.25);
      ctx.lineTo(0.3, 0.25);
      ctx.stroke();
      ctx.fillStyle = PAL.ink;
      for (const [x, y] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) {
        ctx.beginPath();
        ctx.arc(x, y, 0.018, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
  A.clock = {
    base: '#8A4A3C', shade: '#5E2E2A',
    body: (() => {
      const p = P();
      rr(p, -0.22, -0.9, 0.44, 1.6, 0.03);
      rr(p, -0.25, 0.7, 0.5, 0.2, 0.06);
      return p;
    })(),
    deco(ctx, lw) {
      ctx.fillStyle = PAL.bone;
      ctx.beginPath();
      ctx.arc(0, 0.5, 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = lw * 1.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0.5);
      ctx.lineTo(0, 0.6);
      ctx.moveTo(0, 0.5);
      ctx.lineTo(0.07, 0.46);
      ctx.stroke();
      ctx.fillStyle = PAL.ink;
      ctx.fill(rr(P(), -0.11, -0.55, 0.22, 0.75, 0.1));
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = lw * 1.4;
      ctx.beginPath();
      ctx.moveTo(0, 0.15);
      ctx.lineTo(0.03, -0.35);
      ctx.stroke();
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.arc(0.03, -0.38, 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5E2E2A';
      ctx.fillRect(-0.22, -0.9, 0.44, 0.1);
    },
  };
  A.bathtub = {
    base: PAL.bone, shade: PAL.boneDark,
    body: (() => {
      const p = P();
      p.moveTo(-0.7, 0.3);
      p.lineTo(-0.56, 0.3);
      p.quadraticCurveTo(-0.5, -0.16, -0.3, -0.16);
      p.lineTo(0.3, -0.16);
      p.quadraticCurveTo(0.5, -0.16, 0.56, 0.3);
      p.lineTo(0.7, 0.3);
      p.quadraticCurveTo(0.66, -0.3, 0.45, -0.3);
      p.lineTo(-0.45, -0.3);
      p.quadraticCurveTo(-0.66, -0.3, -0.7, 0.3);
      p.closePath();
      return p;
    })(),
    deco(ctx, lw) {
      ctx.fillStyle = 'rgba(59,33,96,0.28)';
      ctx.beginPath();
      ctx.moveTo(-0.56, 0.3);
      ctx.quadraticCurveTo(-0.5, -0.16, -0.3, -0.16);
      ctx.lineTo(0.3, -0.16);
      ctx.quadraticCurveTo(0.5, -0.16, 0.56, 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PAL.gold;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 0.5, -0.27);
        ctx.lineTo(s * 0.58, -0.3);
        ctx.lineTo(s * 0.42, -0.3);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = PAL.goldDark;
      ctx.fillRect(0.38, 0.22, 0.06, 0.08);
    },
  };
  A.sofa = {
    base: PAL.turq, shade: PAL.turqDark,
    body: (() => {
      const p = P();
      rr(p, -0.8, -0.38, 1.6, 0.42, 0.08);
      rr(p, 0.5, -0.38, 0.3, 0.76, 0.12);
      return p;
    })(),
    deco(ctx, lw) {
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = lw * 1.2;
      ctx.beginPath();
      ctx.moveTo(-0.76, -0.06);
      ctx.lineTo(0.5, -0.06);
      ctx.moveTo(-0.15, -0.06);
      ctx.lineTo(-0.15, 0.04);
      ctx.stroke();
      ctx.fillStyle = PAL.turqDark;
      for (const y of [-0.15, 0.05, 0.25]) {
        ctx.beginPath();
        ctx.arc(0.65, y, 0.022, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = PAL.woodDark;
      ctx.fillRect(-0.72, -0.38, 0.08, 0.07);
      ctx.fillRect(0.64, -0.38, 0.08, 0.07);
      ctx.fillStyle = PAL.gold;
      ctx.fill(rr(P(), -0.6, 0.04, 0.32, 0.18, 0.06));
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = lw * 1.2;
      ctx.stroke(rr(P(), -0.6, 0.04, 0.32, 0.18, 0.06));
    },
  };
  A.anvil = {
    base: PAL.iron, shade: PAL.ink,
    body: poly(P(), [[-0.36, 0.17], [-0.15, 0.21], [0.35, 0.21], [0.35, 0.09], [0.2, 0.06], [0.19, -0.09], [0.33, -0.11], [0.33, -0.21], [-0.13, -0.21], [-0.13, -0.11], [0.01, -0.09], [0.0, 0.06], [-0.15, 0.09], [-0.22, 0.13]]),
    deco(ctx, lw) {
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = lw * 1.6;
      ctx.beginPath();
      ctx.moveTo(-0.33, 0.175);
      ctx.lineTo(-0.15, 0.2);
      ctx.lineTo(0.33, 0.2);
      ctx.stroke();
    },
  };
  A.hay = {
    base: '#E9C25A', shade: '#BF9230',
    body: rr(P(), -0.45, -0.21, 0.9, 0.42, 0.07),
    deco(ctx, lw) {
      // straw ends and stalks, two twine bands
      ctx.strokeStyle = 'rgba(150,104,30,0.7)';
      ctx.lineWidth = lw * 1.2;
      ctx.beginPath();
      for (let k = 0; k < 26; k++) {
        const x = -0.42 + (k / 25) * 0.84;
        const y0 = -0.18 + ((k * 37) % 7) * 0.012;
        ctx.moveTo(x, y0);
        ctx.lineTo(x + 0.03 + ((k * 13) % 5) * 0.006, y0 + 0.3 + ((k * 7) % 4) * 0.01);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,236,160,0.75)';
      ctx.beginPath();
      for (let k = 0; k < 14; k++) {
        const x = -0.4 + (k / 13) * 0.8;
        ctx.moveTo(x, 0.12);
        ctx.lineTo(x + 0.05, 0.2);
      }
      ctx.stroke();
      for (const x of [-0.2, 0.2]) {
        ctx.fillStyle = '#A3442E';
        ctx.fillRect(x - 0.025, -0.21, 0.05, 0.42);
        ctx.strokeStyle = PAL.ink;
        ctx.lineWidth = lw;
        ctx.strokeRect(x - 0.025, -0.21, 0.05, 0.42);
      }
      // stray stalks sticking out of the top
      ctx.strokeStyle = '#BF9230';
      ctx.lineWidth = lw * 1.4;
      ctx.beginPath();
      ctx.moveTo(-0.32, 0.2);
      ctx.lineTo(-0.36, 0.27);
      ctx.moveTo(0.06, 0.21);
      ctx.lineTo(0.1, 0.29);
      ctx.moveTo(0.36, 0.2);
      ctx.lineTo(0.42, 0.25);
      ctx.stroke();
    },
  };
  A.vase = {
    base: '#F4F1FF', shade: '#C9C2E6',
    body: (() => {
      const p = P();
      p.moveTo(-0.07, 0.29);
      p.bezierCurveTo(-0.07, 0.2, -0.06, 0.12, -0.1, 0.07);
      p.bezierCurveTo(-0.22, -0.02, -0.2, -0.24, -0.1, -0.29);
      p.lineTo(-0.11, -0.33);
      p.lineTo(0.11, -0.33);
      p.lineTo(0.1, -0.29);
      p.bezierCurveTo(0.2, -0.24, 0.22, -0.02, 0.1, 0.07);
      p.bezierCurveTo(0.06, 0.12, 0.07, 0.2, 0.07, 0.29);
      p.lineTo(0.1, 0.33);
      p.lineTo(-0.1, 0.33);
      p.closePath();
      return p;
    })(),
    deco(ctx, lw) {
      // blue-and-white: a band, a vine and a flower
      ctx.strokeStyle = '#2E4FA8';
      ctx.lineWidth = lw * 2.2;
      ctx.beginPath();
      ctx.moveTo(-0.16, -0.2);
      ctx.lineTo(0.16, -0.2);
      ctx.moveTo(-0.075, 0.24);
      ctx.lineTo(0.075, 0.24);
      ctx.stroke();
      ctx.lineWidth = lw * 1.6;
      ctx.beginPath();
      ctx.moveTo(-0.17, -0.1);
      ctx.bezierCurveTo(-0.08, -0.02, -0.02, -0.16, 0.06, -0.06);
      ctx.bezierCurveTo(0.1, -0.01, 0.14, -0.05, 0.17, -0.02);
      ctx.stroke();
      ctx.fillStyle = '#2E4FA8';
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(-0.02 + Math.cos(a) * 0.035, 0.0 + Math.sin(a) * 0.035, 0.026, 0.016, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.arc(-0.02, 0.0, 0.018, 0, Math.PI * 2);
      ctx.fill();
    },
  };
  A.cat = {
    base: '#F0A04B', shade: '#C26F2A',
    // a loaf: curled up, tail around, head tucked (the walking pose is drawn by drawCat)
    body: (() => {
      const p = P();
      p.moveTo(-0.27, -0.15);
      p.lineTo(0.25, -0.15);
      p.bezierCurveTo(0.31, -0.15, 0.3, 0.06, 0.2, 0.09);
      p.bezierCurveTo(0.08, 0.12, -0.04, 0.11, -0.12, 0.08);
      // the head with two ears
      p.bezierCurveTo(-0.14, 0.12, -0.16, 0.17, -0.17, 0.19);
      p.lineTo(-0.2, 0.13);
      p.lineTo(-0.25, 0.13);
      p.lineTo(-0.29, 0.19);
      p.bezierCurveTo(-0.33, 0.12, -0.34, 0.04, -0.31, -0.02);
      p.bezierCurveTo(-0.33, -0.08, -0.31, -0.15, -0.27, -0.15);
      p.closePath();
      return p;
    })(),
    deco(ctx, lw) {
      // stripes, a white chest, closed eyes, the tail wrapped round the front
      ctx.strokeStyle = '#B85C1E';
      ctx.lineWidth = lw * 2.2;
      ctx.beginPath();
      for (const x of [-0.02, 0.07, 0.16]) {
        ctx.moveTo(x, 0.1);
        ctx.quadraticCurveTo(x + 0.03, 0.02, x + 0.01, -0.04);
      }
      ctx.stroke();
      ctx.fillStyle = '#FFF0D9';
      ctx.beginPath();
      ctx.ellipse(-0.2, -0.07, 0.08, 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = lw * 1.5;
      ctx.beginPath();
      ctx.moveTo(-0.29, 0.06);
      ctx.quadraticCurveTo(-0.275, 0.045, -0.26, 0.06);
      ctx.moveTo(-0.22, 0.06);
      ctx.quadraticCurveTo(-0.205, 0.045, -0.19, 0.06);
      ctx.stroke();
      ctx.fillStyle = '#E26B7A';
      ctx.beginPath();
      ctx.moveTo(-0.245, 0.03);
      ctx.lineTo(-0.235, 0.02);
      ctx.lineTo(-0.225, 0.03);
      ctx.fill();
      ctx.strokeStyle = '#C26F2A';
      ctx.lineWidth = lw * 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0.24, -0.12);
      ctx.quadraticCurveTo(0.05, -0.2, -0.12, -0.13);
      ctx.stroke();
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = lw * 1.2;
      ctx.stroke();
    },
  };
  return ITEMS.map((it) => A[it.key]);
}

/**
 * The cat on the move (the newest cat while it strolls): legs stepping with the distance walked, tail up.
 * Drawn at the item's transform like drawItem; `phase` advances with x.
 */
export function drawCatWalking(ctx, lw, phase, dir = 1) {
  ctx.save();
  ctx.scale(dir < 0 ? -1 : 1, 1);
  const base = '#F0A04B', shade = '#C26F2A', ink = PAL.ink;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // legs: two pairs, stepping
  for (const [hx, ph, far] of [[-0.16, 0, 1], [0.16, Math.PI, 1], [-0.12, Math.PI, 0], [0.2, 0, 0]]) {
    const sw = Math.sin(phase + ph) * 0.05;
    const lift = Math.max(0, Math.cos(phase + ph)) * 0.025;
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 7;
    ctx.beginPath();
    ctx.moveTo(hx, -0.04);
    ctx.lineTo(hx + sw, -0.15 + lift);
    ctx.stroke();
    ctx.strokeStyle = far ? shade : base;
    ctx.lineWidth = lw * 4.6;
    ctx.stroke();
  }
  // tail up with a curl
  ctx.strokeStyle = ink;
  ctx.lineWidth = lw * 6.4;
  ctx.beginPath();
  ctx.moveTo(0.24, 0.02);
  ctx.bezierCurveTo(0.34, 0.08, 0.3, 0.26 + Math.sin(phase * 0.5) * 0.02, 0.36, 0.3);
  ctx.stroke();
  ctx.strokeStyle = base;
  ctx.lineWidth = lw * 4;
  ctx.stroke();
  // body
  const b = new Path2D();
  b.moveTo(-0.22, -0.06);
  b.bezierCurveTo(-0.22, 0.08, 0.2, 0.09, 0.26, 0.03);
  b.bezierCurveTo(0.3, -0.02, 0.26, -0.08, 0.2, -0.08);
  b.lineTo(-0.18, -0.08);
  b.closePath();
  ctx.fillStyle = base;
  ctx.fill(b);
  ctx.strokeStyle = '#B85C1E';
  ctx.lineWidth = lw * 2;
  ctx.save();
  ctx.clip(b);
  ctx.beginPath();
  for (const x of [-0.05, 0.05, 0.15]) {
    ctx.moveTo(x, 0.1);
    ctx.lineTo(x + 0.02, -0.02);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = ink;
  ctx.lineWidth = lw * 2;
  ctx.stroke(b);
  // head, ears, open eyes looking ahead
  const h = new Path2D();
  h.moveTo(-0.33, 0.06);
  h.bezierCurveTo(-0.36, 0.14, -0.3, 0.17, -0.3, 0.17);
  h.lineTo(-0.28, 0.24);
  h.lineTo(-0.24, 0.18);
  h.lineTo(-0.19, 0.18);
  h.lineTo(-0.15, 0.24);
  h.lineTo(-0.14, 0.15);
  h.bezierCurveTo(-0.1, 0.1, -0.12, 0.02, -0.2, 0.01);
  h.bezierCurveTo(-0.28, 0.0, -0.32, 0.02, -0.33, 0.06);
  h.closePath();
  ctx.fillStyle = base;
  ctx.fill(h);
  ctx.stroke(h);
  ctx.fillStyle = '#FFF0D9';
  ctx.beginPath();
  ctx.ellipse(-0.24, 0.05, 0.055, 0.035, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink;
  for (const x of [-0.27, -0.2]) {
    ctx.beginPath();
    ctx.ellipse(x, 0.11, 0.014, 0.022, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

let ART = null;
const art = () => (ART ??= build());

/**
 * Draw item `i` at the current transform (metres, y up). lw: one outline in metres.
 * opts: alpha, ghost (outline only), flash (0..1 white-out), silhouette (one colour)
 */
export function drawItem(ctx, i, lw, opts = {}) {
  const a = art()[i];
  if (!a) return;
  if (opts.silhouette) {
    ctx.fillStyle = opts.silhouette;
    if (a.body) ctx.fill(a.body);
    else silhouetteParts(ctx, i);
    return;
  }
  if (opts.outline) {
    // a solid halo behind the item (the one that fell)
    ctx.strokeStyle = opts.outline;
    ctx.lineWidth = lw * 7;
    ctx.lineJoin = 'round';
    if (a.body) ctx.stroke(a.body);
    else strokeParts(ctx, i);
  }
  if (opts.ghost) {
    ctx.setLineDash([lw * 3, lw * 2.5]);
    ctx.strokeStyle = opts.ghost;
    ctx.lineWidth = lw * 1.6;
    if (a.body) ctx.stroke(a.body);
    else strokeParts(ctx, i);
    ctx.setLineDash([]);
    return;
  }
  if (a.body) {
    ctx.fillStyle = a.shade;
    ctx.fill(a.body);
    ctx.save();
    ctx.clip(a.body);
    ctx.translate(-0.035, 0.035);
    ctx.fillStyle = a.base;
    ctx.fill(a.body);
    ctx.restore();
  }
  if (a.deco) {
    ctx.save();
    a.deco(ctx, lw);
    ctx.restore();
  }
  if (a.body && !opts.flat) material(ctx, a, ITEMS[i], lw, opts.angle ?? 0);
  if (a.body) {
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = lw * 2;
    ctx.lineJoin = 'round';
    ctx.stroke(a.body);
  }
  if (opts.flash > 0) {
    ctx.globalAlpha = Math.min(1, opts.flash);
    ctx.fillStyle = PAL.bone;
    if (a.body) ctx.fill(a.body);
    else silhouetteParts(ctx, i);
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- material and light

const METAL = new Set(['copper', 'brass', 'iron', 'tin']);
const GLOSS = new Set(['enamel', 'ceramic', 'rubber', 'melon', 'clock', 'leather', 'glass', 'porcelain']);
const GRAIN = new Set(['wood', 'clock']);
const SOFT = new Set(['cloth', 'straw', 'fur', 'hay']);
const SHEEN = { copper: '#FFD9B0', brass: '#FFF6C8', iron: '#B9B4E8', tin: '#F4F0FF' };

/**
 * Light and material over an item's body (clipped to it): one sun from the upper left in world space (so a turned item
 * keeps its light where it should be), an inner bevel on the lit edges and soft occlusion on the far ones; then metal
 * streaks, a glaze highlight, wood grain or a cloth weave.
 */
function material(ctx, a, it, lw, angle) {
  const box = a.box ?? (a.box = { w: it.w, h: it.h });
  const R = Math.max(box.w, box.h) * 0.75;
  ctx.save();
  ctx.clip(a.body);
  // in world-aligned axes from here (the sun does not turn with the item)
  ctx.save();
  ctx.rotate(-angle);
  const g = ctx.createLinearGradient(-R * 0.7, R * 0.7, R * 0.7, -R * 0.7 - R * 0.4);
  g.addColorStop(0, 'rgba(255,236,190,0.28)');
  g.addColorStop(0.45, 'rgba(255,236,190,0)');
  g.addColorStop(0.62, 'rgba(42,18,64,0)');
  g.addColorStop(1, 'rgba(42,18,64,0.32)');
  ctx.fillStyle = g;
  ctx.fillRect(-R, -R, R * 2, R * 2);
  ctx.restore();
  // the bevel: the outline shifted down-right shows inside the upper-left edges, and the other way round
  const ca = Math.cos(-angle), sa = Math.sin(-angle);
  const off = (dx, dy) => [dx * ca - dy * sa, dx * sa + dy * ca];
  const d = lw * 2.2;
  let [ox, oy] = off(d, -d);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.strokeStyle = METAL.has(it.mat) ? 'rgba(255,250,225,0.75)' : 'rgba(255,244,214,0.5)';
  ctx.lineWidth = lw * 2.4;
  ctx.stroke(a.body);
  ctx.restore();
  [ox, oy] = off(-d * 1.4, d * 1.4);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.strokeStyle = 'rgba(42,18,64,0.3)';
  ctx.lineWidth = lw * 4;
  ctx.stroke(a.body);
  ctx.restore();
  const w = box.w, h = box.h;
  if (METAL.has(it.mat)) {
    // streaks run along the object (reflections move with it), a hard one and a soft one
    const sh = SHEEN[it.mat];
    const tall = h > w;
    const k1 = tall ? w : h;
    ctx.fillStyle = sh;
    ctx.globalAlpha = 0.5;
    if (tall) ctx.fillRect(-w * 0.28, -h, w * 0.07, h * 2);
    else ctx.fillRect(-w, h * 0.12, w * 2, k1 * 0.08);
    ctx.globalAlpha = 0.22;
    if (tall) ctx.fillRect(-w * 0.16, -h, w * 0.16, h * 2);
    else ctx.fillRect(-w, -h * 0.02, w * 2, k1 * 0.16);
    ctx.globalAlpha = 1;
    // a cold reflected light from below for iron
    if (it.mat === 'iron') {
      ctx.strokeStyle = 'rgba(160,150,230,0.45)';
      ctx.lineWidth = lw * 2;
      ctx.save();
      ctx.translate(...off(-d * 0.8, d * 0.8));
      ctx.stroke(a.body);
      ctx.restore();
    }
  } else if (GLOSS.has(it.mat)) {
    ctx.save();
    ctx.rotate(-angle);
    const hx = -w * 0.22, hy = h * 0.2;
    const gg = ctx.createRadialGradient(hx, hy, 0, hx, hy, Math.min(w, h) * 0.45);
    gg.addColorStop(0, 'rgba(255,255,255,0.55)');
    gg.addColorStop(0.35, 'rgba(255,255,255,0.18)');
    gg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(-R, -R, R * 2, R * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(hx - Math.min(w, h) * 0.06, hy + Math.min(w, h) * 0.06, Math.min(w, h) * 0.05, Math.min(w, h) * 0.028, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (GRAIN.has(it.mat)) {
    ctx.strokeStyle = 'rgba(90,40,20,0.22)';
    ctx.lineWidth = lw * 1.1;
    ctx.beginPath();
    const along = w >= h;
    const L = along ? w : h, S = along ? h : w;
    for (let k = 0; k < 7; k++) {
      const v = -S / 2 + ((k + 0.5) / 7) * S;
      for (let u = -L / 2; u < L / 2; u += L / 24) {
        const wob = Math.sin(u * 9 + k * 1.7) * S * 0.025 + Math.sin(u * 23 + k) * S * 0.01;
        const x = along ? u : v + wob, y = along ? v + wob : u;
        if (u === -L / 2) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  } else if (SOFT.has(it.mat)) {
    ctx.strokeStyle = 'rgba(42,18,64,0.1)';
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (let x = -w / 2; x < w / 2; x += lw * 4) {
      ctx.moveTo(x, -h / 2);
      ctx.lineTo(x + h * 0.3, h / 2);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function partsPath(i) {
  const p = new Path2D();
  for (const part of ITEMS[i].parts) {
    if (part.type === 'circle') circ(p, part.x, part.y, part.r);
    else if (part.type === 'box') {
      const c = Math.cos(part.a), s = Math.sin(part.a), hw = part.w / 2, hh = part.h / 2;
      poly(p, [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [part.x + x * c - y * s, part.y + x * s + y * c]));
    } else poly(p, part.pts);
  }
  return p;
}
const PARTS = new Map();
const partsOf = (i) => PARTS.get(i) ?? (PARTS.set(i, partsPath(i)), PARTS.get(i));
function silhouetteParts(ctx, i) {
  ctx.fill(partsOf(i));
}
function strokeParts(ctx, i) {
  ctx.stroke(partsOf(i));
}

// ---------------------------------------------------------------- the animals (portraits in a unit circle, y down, centred)

/** Draw an animal's head in a circle of radius r at (x, y) (screen space, y down). */
export function drawPortrait(ctx, name, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r, r);
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.clip();
  const kind = String(name).split(' ')[0];
  const bg = { Fennec: PAL.gold, Tortoise: PAL.turq, Vulture: PAL.rose, Gecko: PAL.ember, Jerboa: '#9C7BE0' }[kind] ?? PAL.gold;
  ctx.fillStyle = bg;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.lineWidth = 0.08;
  ctx.strokeStyle = PAL.ink;
  ctx.lineJoin = 'round';
  const shape = (fill, draw) => {
    ctx.beginPath();
    draw();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };
  const eye = (ex, ey, er = 0.11) => {
    ctx.fillStyle = PAL.ink;
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.bone;
    ctx.beginPath();
    ctx.arc(ex - er * 0.35, ey - er * 0.35, er * 0.35, 0, Math.PI * 2);
    ctx.fill();
  };
  if (kind === 'Fennec') {
    shape('#F2C27E', () => {
      ctx.moveTo(-0.62, 0.05);
      ctx.lineTo(-0.85, -0.95);
      ctx.lineTo(-0.15, -0.35);
      ctx.closePath();
      ctx.moveTo(0.62, 0.05);
      ctx.lineTo(0.85, -0.95);
      ctx.lineTo(0.15, -0.35);
      ctx.closePath();
    });
    shape('#F2C27E', () => {
      ctx.moveTo(-0.6, -0.15);
      ctx.quadraticCurveTo(0, -0.55, 0.6, -0.15);
      ctx.quadraticCurveTo(0.55, 0.45, 0, 0.75);
      ctx.quadraticCurveTo(-0.55, 0.45, -0.6, -0.15);
    });
    shape(PAL.bone, () => {
      ctx.moveTo(-0.3, 0.2);
      ctx.quadraticCurveTo(0, 0.05, 0.3, 0.2);
      ctx.quadraticCurveTo(0.2, 0.62, 0, 0.75);
      ctx.quadraticCurveTo(-0.2, 0.62, -0.3, 0.2);
    });
    eye(-0.25, 0.02);
    eye(0.25, 0.02);
    ctx.fillStyle = PAL.ink;
    ctx.beginPath();
    ctx.arc(0, 0.62, 0.09, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'Tortoise') {
    shape('#2E8F64', () => ctx.arc(0.25, 0.95, 0.85, Math.PI, Math.PI * 2));
    shape('#9BCB6A', () => ctx.ellipse(-0.1, 0.0, 0.48, 0.42, -0.2, 0, Math.PI * 2));
    eye(-0.28, -0.08, 0.1);
    ctx.strokeStyle = PAL.ink;
    ctx.beginPath();
    ctx.moveTo(-0.5, 0.18);
    ctx.quadraticCurveTo(-0.3, 0.28, -0.12, 0.2);
    ctx.stroke();
    ctx.strokeStyle = '#1F6646';
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.moveTo(-0.3, 0.75);
    ctx.lineTo(0.05, 0.5);
    ctx.lineTo(0.5, 0.55);
    ctx.lineTo(0.8, 0.8);
    ctx.stroke();
  } else if (kind === 'Vulture') {
    shape(PAL.violetDeep, () => {
      ctx.moveTo(-1, 1);
      ctx.lineTo(-0.7, 0.35);
      ctx.lineTo(-0.4, 0.55);
      ctx.lineTo(-0.15, 0.3);
      ctx.lineTo(0.15, 0.55);
      ctx.lineTo(0.4, 0.3);
      ctx.lineTo(0.7, 0.55);
      ctx.lineTo(1, 0.3);
      ctx.lineTo(1, 1);
      ctx.closePath();
    });
    shape('#F4A9A0', () => ctx.ellipse(0.05, -0.15, 0.4, 0.5, 0, 0, Math.PI * 2));
    shape(PAL.bone, () => {
      ctx.moveTo(-0.25, 0.0);
      ctx.quadraticCurveTo(-0.75, -0.02, -0.72, 0.32);
      ctx.quadraticCurveTo(-0.55, 0.15, -0.25, 0.2);
      ctx.closePath();
    });
    eye(-0.05, -0.25, 0.09);
    ctx.strokeStyle = PAL.ink;
    ctx.beginPath();
    ctx.moveTo(-0.22, -0.4);
    ctx.lineTo(0.08, -0.33);
    ctx.stroke();
  } else if (kind === 'Gecko') {
    shape('#7FD36B', () => ctx.ellipse(0, 0.1, 0.62, 0.48, 0, 0, Math.PI * 2));
    shape('#7FD36B', () => {
      ctx.arc(-0.35, -0.3, 0.26, 0, Math.PI * 2);
    });
    shape('#7FD36B', () => {
      ctx.arc(0.35, -0.3, 0.26, 0, Math.PI * 2);
    });
    shape(PAL.gold, () => ctx.arc(-0.35, -0.3, 0.17, 0, Math.PI * 2));
    shape(PAL.gold, () => ctx.arc(0.35, -0.3, 0.17, 0, Math.PI * 2));
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(-0.37, -0.42, 0.04, 0.24);
    ctx.fillRect(0.33, -0.42, 0.04, 0.24);
    ctx.strokeStyle = PAL.ink;
    ctx.beginPath();
    ctx.moveTo(-0.35, 0.3);
    ctx.quadraticCurveTo(0, 0.45, 0.35, 0.3);
    ctx.stroke();
    ctx.fillStyle = '#4FA845';
    for (const [x, y] of [[-0.1, 0.0], [0.15, 0.12], [0.3, -0.02]]) {
      ctx.beginPath();
      ctx.arc(x, y, 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Jerboa
    shape('#F3DCC0', () => ctx.ellipse(-0.45, -0.55, 0.28, 0.45, -0.35, 0, Math.PI * 2));
    shape('#F3DCC0', () => ctx.ellipse(0.45, -0.55, 0.28, 0.45, 0.35, 0, Math.PI * 2));
    shape('#F7C9C4', () => ctx.ellipse(-0.45, -0.55, 0.14, 0.28, -0.35, 0, Math.PI * 2));
    shape('#F7C9C4', () => ctx.ellipse(0.45, -0.55, 0.14, 0.28, 0.35, 0, Math.PI * 2));
    shape('#F3DCC0', () => ctx.ellipse(0, 0.2, 0.55, 0.5, 0, 0, Math.PI * 2));
    eye(-0.24, 0.1, 0.15);
    eye(0.24, 0.1, 0.15);
    ctx.fillStyle = PAL.rose;
    ctx.beginPath();
    ctx.arc(0, 0.4, 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- hands and paws (metres, y up)

const FUR = {
  fennec: { fill: '#F2C27E', dark: '#C9904A', claw: PAL.bone },
  tortoise: { fill: '#9BCB6A', dark: '#5F9A44', claw: PAL.bone },
  vulture: { fill: PAL.violetDeep, dark: PAL.ink, claw: PAL.gold },
  gecko: { fill: '#7FD36B', dark: '#4FA845', claw: '#7FD36B' },
  jerboa: { fill: '#F3DCC0', dark: '#D9B892', claw: PAL.rose },
};

export function sleevePattern(ctx, sleeve, color, dark, x0, y0, w, h, lw) {
  ctx.fillStyle = sleeve === 5 ? PAL.gold : color;
  ctx.fillRect(x0, y0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  ctx.fillStyle = sleeve === 5 ? PAL.goldDark : dark;
  ctx.strokeStyle = sleeve === 5 ? PAL.goldDark : dark;
  if (sleeve === 1) for (let y = y0; y < y0 + h; y += 0.12) ctx.fillRect(x0, y, w, 0.05);
  else if (sleeve === 2) {
    for (let y = y0, r = 0; y < y0 + h; y += 0.07, r++) for (let x = x0 + (r % 2) * 0.07; x < x0 + w; x += 0.14) ctx.fillRect(x, y, 0.07, 0.07);
  } else if (sleeve === 3) {
    for (let y = y0 + 0.06; y < y0 + h; y += 0.14) for (let x = x0 + 0.04; x < x0 + w; x += 0.09) star(ctx, x, y, 0.03);
  } else if (sleeve === 4) {
    ctx.lineWidth = lw * 2.5;
    ctx.beginPath();
    for (let y = y0 + 0.05; y < y0 + h; y += 0.12) {
      ctx.moveTo(x0, y);
      for (let x = x0; x <= x0 + w + 0.05; x += 0.05) ctx.lineTo(x, y + ((Math.round((x - x0) / 0.05) % 2) ? 0.04 : 0));
    }
    ctx.stroke();
  } else if (sleeve === 5) {
    for (let y = y0; y < y0 + h; y += 0.16) ctx.fillRect(x0, y, w, 0.03);
  }
  ctx.restore();
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const t = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rr2 = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(t) * rr2, y + Math.sin(t) * rr2);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Two hands (or paws) holding an item from above: at world points (lx, ly) and (rx, ry), arms rising to `topY`.
 * who: { kind: 'player', seat, sleeve } or { kind: 'bot', fur }. open: 0 (gripping) to 1 (let go).
 */
export function drawHands(ctx, lw, left, right, topY, who, open = 0) {
  for (const [hx, hy, side] of [[left.x, left.y, -1], [right.x, right.y, 1]]) {
    const e = open * open * (3 - 2 * open);
    const x = hx + side * e * 0.14;
    const y = hy + e * 0.12;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (who.kind === 'bot') drawPaw(ctx, lw, x, y, side, topY, FUR[who.fur] ?? FUR.fennec, e);
    else drawGlove(ctx, lw, x, y, side, topY, who, e);
    ctx.restore();
  }
}

/** One gloved hand (a swatch in the Stable): the wrist at (x, y), the arm up to topY. */
export function drawGloveAt(ctx, lw, x, y, topY, who, open = 0) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  drawGlove(ctx, lw, x, y, 1, topY, who, open);
  ctx.restore();
}

/** An arm from the wrist (x, y) up to the top of the screen, leaning out a little, with an elbow's bend. */
function armPath(x, y, side, topY, wWrist, wTop) {
  const len = Math.max(0.2, topY - y);
  const sx = x + side * Math.min(0.45, len * 0.14);
  const hw = wWrist / 2, tw = wTop / 2;
  const my = y + len * 0.42;
  const mx = x + side * 0.05;
  const p = new Path2D();
  p.moveTo(x - hw, y);
  p.quadraticCurveTo(mx - hw - 0.025, my, sx - tw, topY + 0.3);
  p.lineTo(sx + tw, topY + 0.3);
  p.quadraticCurveTo(mx + hw + 0.025, my, x + hw, y);
  p.closePath();
  return p;
}

/** The round shading over an arm: dark on the side away from the light, a glint on the other. */
function armShade(ctx, x, y, topY, w) {
  const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
  g.addColorStop(0, 'rgba(255,248,230,0.22)');
  g.addColorStop(0.35, 'rgba(255,248,230,0)');
  g.addColorStop(0.7, 'rgba(28,15,46,0.06)');
  g.addColorStop(1, 'rgba(28,15,46,0.32)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 1, y - 0.2, 2, topY - y + 1);
}

/** A finger (or toe) as a capsule from (x, y) at angle a, `len` long. */
function digit(ctx, lw, x, y, a, len, wid, fill) {
  const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = wid + lw * 3.6;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.lineWidth = wid;
  ctx.stroke();
  return { x: ex, y: ey };
}

function drawGlove(ctx, lw, x, y, side, topY, who, e) {
  const seat = SEATS[who.seat % SEATS.length];
  const arm = armPath(x, y + 0.08, side, topY, 0.15, 0.21);
  ctx.save();
  ctx.clip(arm);
  sleevePattern(ctx, who.sleeve ?? 0, seat.color, seat.dark, x - 0.7, y, 1.4, topY - y + 0.6, lw);
  armShade(ctx, x, y, topY, 0.14);
  ctx.restore();
  ctx.lineWidth = lw * 2.2;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(arm);
  // fingers wrap over the item's edge (inward), or splay down and out as the hand lets go
  const inward = side > 0 ? Math.PI : 0;
  const down = -Math.PI / 2;
  const glove = '#FFF3E0';
  for (let k = 0; k < 4; k++) {
    const fy = y + 0.035 - k * 0.032;
    const closed = inward + (side > 0 ? 1 : -1) * (0.25 + k * 0.08);
    const opened = down + side * (0.35 + k * 0.12);
    const a = closed + (opened - closed) * e;
    digit(ctx, lw, x - side * 0.045, fy, a, k === 3 ? 0.06 : 0.078, 0.034, glove);
  }
  // the back of the hand
  const palm = new Path2D();
  palm.ellipse(x, y - 0.005, 0.085, 0.078, 0, 0, Math.PI * 2);
  ctx.fillStyle = glove;
  ctx.fill(palm);
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(palm);
  ctx.save();
  ctx.clip(palm);
  ctx.fillStyle = 'rgba(28,15,46,0.12)';
  ctx.beginPath();
  ctx.ellipse(x + side * 0.05, y - 0.03, 0.08, 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // knuckle stitches
  ctx.strokeStyle = 'rgba(28,15,46,0.35)';
  ctx.lineWidth = lw * 1.2;
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const kx = x - side * 0.035, ky = y + 0.02 - k * 0.032;
    ctx.moveTo(kx, ky);
    ctx.lineTo(kx - side * 0.022, ky - 0.004);
  }
  ctx.stroke();
  // the thumb on top
  digit(ctx, lw, x - side * 0.02, y + 0.05, (side > 0 ? Math.PI : 0) + side * (-0.5 + e * 1.2), 0.07, 0.036, glove);
  // the cuff
  const cuff = new Path2D();
  cuff.moveTo(x - 0.09, y + 0.07);
  cuff.quadraticCurveTo(x, y + 0.05, x + 0.09, y + 0.07);
  cuff.lineTo(x + 0.085, y + 0.13);
  cuff.quadraticCurveTo(x, y + 0.115, x - 0.085, y + 0.13);
  cuff.closePath();
  ctx.fillStyle = seat.dark;
  ctx.fill(cuff);
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(cuff);
  ctx.strokeStyle = 'rgba(255,240,217,0.55)';
  ctx.lineWidth = lw * 1.2;
  ctx.setLineDash([lw * 3, lw * 3]);
  ctx.beginPath();
  ctx.moveTo(x - 0.075, y + 0.1);
  ctx.quadraticCurveTo(x, y + 0.085, x + 0.075, y + 0.1);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPaw(ctx, lw, x, y, side, topY, f, e) {
  const arm = armPath(x, y + 0.06, side, topY, 0.15, 0.2);
  ctx.fillStyle = f.fill;
  ctx.fill(arm);
  ctx.save();
  ctx.clip(arm);
  // fur: soft stripes down the arm
  ctx.strokeStyle = f.dark;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = lw * 2;
  ctx.beginPath();
  for (let yy = y + 0.12; yy < topY + 0.3; yy += 0.11) {
    ctx.moveTo(x - 0.2, yy);
    ctx.quadraticCurveTo(x, yy - 0.035, x + 0.2, yy + 0.01);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  armShade(ctx, x, y, topY, 0.14);
  ctx.restore();
  ctx.lineWidth = lw * 2.2;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(arm);
  // tufts at the wrist
  ctx.fillStyle = f.fill;
  ctx.beginPath();
  for (let k = -2; k <= 2; k++) {
    const tx = x + k * 0.032;
    ctx.moveTo(tx - 0.02, y + 0.075);
    ctx.lineTo(tx + side * 0.008, y + 0.03);
    ctx.lineTo(tx + 0.02, y + 0.075);
  }
  ctx.fill();
  ctx.stroke();
  // toes wrapping the edge, claws at their tips
  const inward = side > 0 ? Math.PI : 0;
  const down = -Math.PI / 2;
  for (let k = 0; k < 3; k++) {
    const fy = y + 0.02 - k * 0.04;
    const closed = inward + (side > 0 ? 1 : -1) * (0.3 + k * 0.1);
    const opened = down + side * (0.3 + k * 0.15);
    const a = closed + (opened - closed) * e;
    const tip = digit(ctx, lw, x - side * 0.04, fy, a, 0.07, 0.042, f.fill);
    ctx.fillStyle = f.claw;
    ctx.beginPath();
    ctx.moveTo(tip.x + Math.cos(a + 1.2) * 0.016, tip.y + Math.sin(a + 1.2) * 0.016);
    ctx.lineTo(tip.x + Math.cos(a) * 0.04, tip.y + Math.sin(a) * 0.04);
    ctx.lineTo(tip.x + Math.cos(a - 1.2) * 0.016, tip.y + Math.sin(a - 1.2) * 0.016);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = lw * 1.4;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke();
  }
  const paw = new Path2D();
  paw.ellipse(x, y, 0.088, 0.08, 0, 0, Math.PI * 2);
  ctx.fillStyle = f.fill;
  ctx.fill(paw);
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = PAL.ink;
  ctx.stroke(paw);
  ctx.save();
  ctx.clip(paw);
  ctx.fillStyle = f.dark;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.ellipse(x + side * 0.05, y - 0.035, 0.08, 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The seat symbol (screen space). */
export function drawSymbol(ctx, sym, x, y, r, fill, stroke = PAL.ink, lw = 2) {
  ctx.beginPath();
  if (sym === 'circle') ctx.arc(x, y, r, 0, Math.PI * 2);
  else if (sym === 'square') ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
  else if (sym === 'triangle') {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y + r * 0.8);
    ctx.lineTo(x - r, y + r * 0.8);
  } else if (sym === 'diamond') {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
  } else if (sym === 'star') {
    for (let i = 0; i < 10; i++) {
      const t = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr2 = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(t) * rr2, y + Math.sin(t) * rr2);
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const t = (i / 6) * Math.PI * 2;
      ctx.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r);
    }
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

export { rr, poly, ell, circ };

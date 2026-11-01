// The cart's junk: weights, sizes, collision parts and sounds. Pure data (no page, no physics engine).
// Units are metres and kilograms, y up, each item's origin at the middle of its bounding box when unrotated.

/** Rarity on the cart: how often a new item is drawn (the straw's weight depends on the strain, see rules.js). */
export const RARITY = { common: 10, uncommon: 6, rare: 3 };

const box = (w, h, x = 0, y = 0, a = 0) => ({ type: 'box', w, h, x, y, a });
const circle = (r, x = 0, y = 0) => ({ type: 'circle', r, x, y });
const poly = (pts) => ({ type: 'poly', pts });

function ellipse(rx, ry, n = 8, cx = 0, cy = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + Math.PI / n;
    pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
  }
  return poly(pts);
}

/**
 * Every item. `kg` is its weight on the dial and its score; `mass` is what the physics uses (the straw needs a little).
 * `rest`: the angles a careful hand would set it down at (bots try these). `mat`: the landing sound.
 */
export const ITEMS = [
  { key: 'straw', name: 'straw', label: '1 g', kg: 0, mass: 0.05, w: 0.9, h: 0.05, rarity: 'straw', mat: 'straw', friction: 0.7, restitution: 0.02, damping: 4, angularDamping: 3, rest: [0, 0.35, -0.35], parts: [box(0.9, 0.05)] },
  { key: 'duck', name: 'rubber duck', kg: 1, mass: 1, w: 0.46, h: 0.42, rarity: 'uncommon', mat: 'rubber', friction: 0.85, restitution: 0.25, rest: [0, Math.PI], parts: [ellipse(0.2, 0.13, 8, 0.03, -0.08), circle(0.11, -0.11, 0.1)] },
  { key: 'teapot', name: 'teapot', kg: 2, mass: 2, w: 0.5, h: 0.4, rarity: 'common', mat: 'ceramic', rest: [0], parts: [ellipse(0.2, 0.15, 8, 0.03, -0.05), box(0.12, 0.08, 0.03, 0.15)] },
  { key: 'birdcage', name: 'birdcage', kg: 3, mass: 3, w: 0.46, h: 0.7, rarity: 'uncommon', mat: 'tin', rest: [0, Math.PI / 2, -Math.PI / 2], parts: [box(0.46, 0.08, 0, -0.31), poly([[-0.2, -0.27], [0.2, -0.27], [0.2, 0.08], [0.12, 0.25], [0, 0.31], [-0.12, 0.25], [-0.2, 0.08]])] },
  { key: 'cactus', name: 'potted cactus', kg: 3, mass: 3, w: 0.36, h: 0.76, rarity: 'uncommon', mat: 'clay', rest: [0, Math.PI / 2, -Math.PI / 2], parts: [poly([[-0.13, -0.38], [0.13, -0.38], [0.18, -0.08], [-0.18, -0.08]]), box(0.17, 0.46, 0, 0.15)] },
  { key: 'books', name: 'books', kg: 4, mass: 4, w: 0.6, h: 0.3, rarity: 'common', mat: 'paper', rest: [0, Math.PI / 2], parts: [box(0.6, 0.3)] },
  { key: 'pot', name: 'copper pot', kg: 4, mass: 4, w: 0.62, h: 0.4, rarity: 'common', mat: 'copper', rest: [0, Math.PI], parts: [poly([[-0.21, -0.2], [0.21, -0.2], [0.3, 0.2], [-0.3, 0.2]])] },
  { key: 'ladder', name: 'ladder', kg: 4, mass: 4, w: 1.8, h: 0.12, rarity: 'uncommon', mat: 'wood', friction: 0.5, rest: [0], parts: [box(1.8, 0.12)] },
  { key: 'suitcase', name: 'suitcase', kg: 5, mass: 5, w: 0.8, h: 0.5, rarity: 'common', mat: 'leather', rest: [0, Math.PI / 2], parts: [box(0.8, 0.44, 0, -0.03), box(0.24, 0.06, 0, 0.22)] },
  { key: 'melon', name: 'watermelon', kg: 5, mass: 5, w: 0.58, h: 0.44, rarity: 'uncommon', mat: 'melon', friction: 0.55, restitution: 0.08, rest: [0, Math.PI / 2], parts: [ellipse(0.29, 0.22, 8)] },
  { key: 'tuba', name: 'tuba', kg: 6, mass: 6, w: 0.62, h: 0.72, rarity: 'uncommon', mat: 'brass', rest: [0, Math.PI / 2, -Math.PI / 2], parts: [box(0.3, 0.6, -0.12, -0.06), ellipse(0.2, 0.2, 8, 0.1, 0.16)] },
  { key: 'rug', name: 'rolled rug', kg: 6, mass: 6, w: 1.6, h: 0.28, rarity: 'common', mat: 'cloth', rest: [0], parts: [box(1.32, 0.28), circle(0.14, -0.66, 0), circle(0.14, 0.66, 0)] },
  { key: 'bicycle', name: 'bicycle', kg: 7, mass: 7, w: 1.4, h: 0.8, rarity: 'uncommon', mat: 'bike', rest: [0, Math.PI], parts: [circle(0.3, -0.4, -0.1), circle(0.3, 0.4, -0.1), poly([[-0.4, -0.1], [0.4, -0.1], [0.22, 0.34], [-0.26, 0.34]])] },
  { key: 'crate', name: 'crate', kg: 8, mass: 8, w: 0.7, h: 0.6, rarity: 'common', mat: 'wood', rest: [0, Math.PI / 2], parts: [box(0.7, 0.6)] },
  { key: 'clock', name: 'grandfather clock', kg: 12, mass: 12, w: 0.5, h: 1.8, rarity: 'rare', mat: 'clock', rest: [Math.PI / 2, -Math.PI / 2, 0], parts: [box(0.44, 1.6, 0, -0.1), box(0.5, 0.2, 0, 0.8)] },
  { key: 'bathtub', name: 'bathtub', kg: 14, mass: 14, w: 1.4, h: 0.6, rarity: 'rare', mat: 'enamel', rest: [0, Math.PI], parts: [box(1.2, 0.14, 0, -0.23), poly([[-0.7, 0.3], [-0.56, 0.3], [-0.48, -0.16], [-0.6, -0.3]]), poly([[0.56, 0.3], [0.7, 0.3], [0.6, -0.3], [0.48, -0.16]])] },
  { key: 'sofa', name: 'sofa', kg: 16, mass: 16, w: 1.6, h: 0.76, rarity: 'rare', mat: 'cloth', rest: [0, Math.PI / 2], parts: [box(1.6, 0.42, 0, -0.17), box(0.3, 0.76, 0.65, 0)] },
  { key: 'anvil', name: 'anvil', kg: 18, mass: 18, w: 0.72, h: 0.42, rarity: 'rare', mat: 'iron', rest: [0], parts: [box(0.46, 0.12, 0.1, -0.15), box(0.22, 0.14, 0.1, -0.02), box(0.5, 0.13, 0.1, 0.145), poly([[-0.15, 0.21], [-0.15, 0.08], [-0.36, 0.17]])] },
];

export const ITEM_BY_KEY = Object.fromEntries(ITEMS.map((it, i) => [it.key, i]));
export const STRAW = ITEM_BY_KEY.straw;
export const ANVIL = ITEM_BY_KEY.anvil;

/** A valid item index? */
export const isItem = (i) => Number.isInteger(i) && i >= 0 && i < ITEMS.length;

/** The area of one collision part (for density). */
export function partArea(p) {
  if (p.type === 'box') return p.w * p.h;
  if (p.type === 'circle') return Math.PI * p.r * p.r;
  let a = 0;
  const v = p.pts;
  for (let i = 0; i < v.length; i++) {
    const [x1, y1] = v[i];
    const [x2, y2] = v[(i + 1) % v.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export const itemArea = (it) => it.parts.reduce((s, p) => s + partArea(p), 0);

/** How the weight reads on a tag: "18 kg", "1 g". */
export const weightLabel = (it) => it.label ?? `${it.kg} kg`;

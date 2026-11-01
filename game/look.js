// The look: the palette, the time of day (gold → dusk → night), the stops on the road (each with its own land and colours),
// and small colour helpers. Pure data and maths: no page needed.

export const PAL = {
  ink: '#1C0F2E',
  inkSoft: '#3A1F3F',
  violet: '#3B2160',
  violetDeep: '#2A1748',
  rose: '#D63F6E',
  roseDark: '#A32B55',
  ember: '#F27B35',
  emberDark: '#C2551F',
  gold: '#FFC845',
  goldDark: '#D99A1E',
  goldLight: '#FFE7A3',
  bone: '#FFF0D9',
  boneDark: '#EBCFA8',
  turq: '#22B8A7',
  turqDark: '#178577',
  wood: '#D9904E',
  woodDark: '#9E5528',
  woodLight: '#F0B577',
  camel: '#E9A866',
  camelShade: '#C47B45',
  sand: '#F2C285',
  iron: '#3E2C5C',
  manila: '#F1D9A6',
  manilaDark: '#D7B77B',
};

// ---------------------------------------------------------------- colour maths

const hexCache = new Map();
export function rgb(hex) {
  let c = hexCache.get(hex);
  if (c) return c;
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  hexCache.set(hex, c);
  return c;
}
const to2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
export const hex = ([r, g, b]) => `#${to2(r)}${to2(g)}${to2(b)}`;
/** Mix two hex colours (t 0 → a, 1 → b). */
export function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return hex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}
export function rgba(hexc, a) {
  const [r, g, b] = rgb(hexc);
  return `rgba(${r},${g},${b},${a})`;
}
export const shadeOf = (c, k = 0.25) => mix(c, '#2A1240', k);
export const lightOf = (c, k = 0.25) => mix(c, '#FFF3D6', k);

// ---------------------------------------------------------------- time of day

/** Sky stops from the top of the sky to the horizon, at gold hour, dusk and night. */
const SKIES = [
  { top: '#4A2C7A', upper: '#8A3E86', mid: '#DA5A73', low: '#F79A5B', horizon: '#FFD786', sun: '#FFF2C4', glow: '#FFC86A', haze: '#F7A86A', shade: '#5B2C6E', light: '#FFE2A0' },
  { top: '#251A52', upper: '#55296E', mid: '#AE3E6C', low: '#EE7051', horizon: '#FFB55E', sun: '#FFE0A0', glow: '#FF9B55', haze: '#D9675E', shade: '#43205E', light: '#FFC98A' },
  { top: '#0B0B24', upper: '#16173F', mid: '#2C2659', low: '#4A3468', horizon: '#7C4A72', sun: '#F6F0DA', glow: '#9D7BC0', haze: '#4F3A6E', shade: '#1B1236', light: '#B8A6E0' },
];

/** The sky's colours for a time of day (0 gold hour, 0.5 dusk, 1 night). */
export function skyAt(tod) {
  const t = Math.max(0, Math.min(1, tod)) * 2;
  const i = Math.min(1, Math.floor(t));
  const f = t - i;
  const a = SKIES[i], b = SKIES[i + 1];
  const out = {};
  for (const k of Object.keys(a)) out[k] = mix(a[k], b[k], f);
  return out;
}

// ---------------------------------------------------------------- the stops on the road

/**
 * Each stop: its land (far, mid, ground colours), what stands in the middle distance, and the canopy over the stall.
 * `far` and `mid` are mixed toward the sky's haze by the renderer.
 */
export const BIOMES = {
  market: { name: 'Dune market', far: '#7A3E78', farDune: '#B44A72', mid: '#E0704E', midShade: '#B44C3E', ground: '#F2BE7E', groundFar: '#F6CF93', ripple: '#D99A5C', props: 'town', canopy: ['#D63F6E', '#FFF0D9'] },
  oasis: { name: 'Oasis', far: '#6C3F7C', farDune: '#9E4C78', mid: '#D9774F', midShade: '#AC5040', ground: '#EFC183', groundFar: '#F3D198', ripple: '#D49A5E', props: 'palms', canopy: ['#22B8A7', '#FFF0D9'] },
  canyon: { name: 'Red canyon', far: '#80385F', farDune: '#B0405A', mid: '#C9503F', midShade: '#8F3236', ground: '#E8A26A', groundFar: '#EFB57E', ripple: '#C9824D', props: 'rocks', canopy: ['#FFC845', '#3B2160'] },
  salt: { name: 'Salt flats', far: '#6E4C8C', farDune: '#9B6A9E', mid: '#D7A9B7', midShade: '#A9798F', ground: '#F4E6D6', groundFar: '#FBEFE2', ripple: '#D8C0B4', props: 'salt', canopy: ['#3B2160', '#FFC845'] },
  ruins: { name: 'Old ruins', far: '#6F3B70', farDune: '#A5496E', mid: '#D9824F', midShade: '#A75A3E', ground: '#EDB676', groundFar: '#F3C88F', ripple: '#CF9156', props: 'ruins', canopy: ['#F27B35', '#FFF0D9'] },
  night: { name: 'Night market', far: '#4E3474', farDune: '#7C3E73', mid: '#B9594E', midShade: '#8A3E45', ground: '#E5AE74', groundFar: '#EDBF88', ripple: '#C38750', props: 'lanterns', canopy: ['#A32B55', '#FFC845'] },
};
export const ROAD = ['market', 'oasis', 'canyon', 'salt', 'ruins', 'night'];
/** The stop for a round or a town (1 = the first). */
export const biomeFor = (n) => ROAD[(Math.max(1, n | 0) - 1) % ROAD.length];

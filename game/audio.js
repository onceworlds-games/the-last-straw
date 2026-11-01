// Every sound, synthesized: wood, metal, cloth and ceramic landings, the camel's grumbles and creaks, the crack, and a small
// percussion-first sequencer in D dorian that speeds up from 96 to 124 BPM as the camel nears its limit.

let ac = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let noiseBuf = null;
let failed = false;

const music = { on: false, mode: 'menu', tension: 0, step: 0, next: 0, timer: 0 };

/** Start (or resume) sound: call from a tap, click or key in the game. */
export function init() {
  if (failed) return;
  try {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        failed = true;
        return;
      }
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.9;
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master.connect(comp).connect(ac.destination);
      sfxBus = ac.createGain();
      sfxBus.gain.value = 0.85;
      sfxBus.connect(master);
      musicBus = ac.createGain();
      musicBus.gain.value = 0.32;
      musicBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let s = 7;
      for (let i = 0; i < d.length; i++) {
        s = (s * 16807) % 2147483647;
        d[i] = (s / 2147483647) * 2 - 1;
      }
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
  } catch {
    failed = true;
  }
}

export const ready = () => !!ac && ac.state === 'running';
export function suspend(on) {
  if (!ac) return;
  try {
    const p = on ? ac.suspend() : ac.resume();
    p?.catch?.(() => {});
  } catch {}
}

// ---------------------------------------------------------------- building blocks

function tone({ f = 440, f2 = null, type = 'sine', at = 0, a = 0.005, d = 0.2, v = 0.3, bus = sfxBus, q = null, lp = null }) {
  if (!ac) return;
  const t = ac.currentTime + at;
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  let node = o;
  if (lp) {
    const fl = ac.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = lp;
    if (q) fl.Q.value = q;
    node.connect(fl);
    node = fl;
  }
  node.connect(g).connect(bus);
  o.start(t);
  o.stop(t + a + d + 0.05);
}

function noise({ at = 0, a = 0.003, d = 0.15, v = 0.3, type = 'bandpass', f = 1200, f2 = null, q = 1, bus = sfxBus, time = null }) {
  if (!ac || !noiseBuf) return;
  const t = time ?? ac.currentTime + at;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const fl = ac.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + a + d);
  fl.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  src.connect(fl).connect(g).connect(bus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + a + d + 0.05);
}

// ---------------------------------------------------------------- the game's sounds

export function tok() {
  tone({ f: 520, f2: 300, type: 'triangle', d: 0.07, v: 0.35 });
  noise({ f: 2500, d: 0.03, v: 0.15 });
}
export function scrape() {
  noise({ f: 900, f2: 2400, q: 2, a: 0.04, d: 0.28, v: 0.12 });
}
export function ratchet() {
  noise({ f: 3200, q: 4, d: 0.025, v: 0.18 });
  tone({ f: 1800, type: 'square', d: 0.02, v: 0.04 });
}
export function blip() {
  tone({ f: 980, f2: 1300, type: 'sine', d: 0.06, v: 0.08 });
}
export function creak(v = 0.08) {
  tone({ f: 120, f2: 90, type: 'sawtooth', a: 0.05, d: 0.25, v, lp: 600, q: 8 });
}
export function whup() {
  noise({ f: 400, f2: 1400, q: 1.5, a: 0.02, d: 0.16, v: 0.25 });
}
export function whistle(kg) {
  if (kg < 10) return;
  tone({ f: 1400, f2: 600, type: 'sine', a: 0.1, d: 0.5, v: 0.05 });
}

/** A landing, by material, loud by energy (kg × speed). */
export function land(mat, energy = 1) {
  const v = Math.max(0.08, Math.min(0.9, 0.12 + energy * 0.05));
  switch (mat) {
    case 'wood':
      tone({ f: 180, f2: 110, type: 'triangle', d: 0.18, v });
      noise({ f: 700, d: 0.06, v: v * 0.5 });
      break;
    case 'iron':
      for (const [f, k] of [[392, 1], [977, 0.6], [1650, 0.4], [2410, 0.25]]) tone({ f, type: 'sine', d: 1.4, v: v * 0.4 * k });
      tone({ f: 90, f2: 50, type: 'sine', d: 0.3, v });
      break;
    case 'copper':
      for (const [f, k] of [[220, 1], [563, 0.5], [1011, 0.3]]) tone({ f, type: 'sine', d: 1.0, v: v * 0.45 * k });
      break;
    case 'enamel':
      for (const [f, k] of [[160, 1], [432, 0.6], [790, 0.3]]) tone({ f, type: 'sine', d: 1.6, v: v * 0.45 * k });
      noise({ f: 300, d: 0.1, v: v * 0.4 });
      break;
    case 'ceramic':
      tone({ f: 2100, type: 'sine', d: 0.25, v: v * 0.35 });
      tone({ f: 3150, type: 'sine', d: 0.18, v: v * 0.2 });
      break;
    case 'rubber':
      tone({ f: 900, f2: 1500, type: 'square', d: 0.12, v: v * 0.12, lp: 2500 });
      break;
    case 'brass':
      tone({ f: 110, f2: 104, type: 'sawtooth', a: 0.02, d: 0.35, v: v * 0.3, lp: 900 });
      tone({ f: 220, type: 'sawtooth', a: 0.02, d: 0.3, v: v * 0.12, lp: 1200 });
      break;
    case 'tin':
      for (const f of [1500, 2300, 3100]) tone({ f, type: 'triangle', d: 0.3, v: v * 0.12 });
      break;
    case 'clock':
      for (const [f, k] of [[330, 1], [495, 0.5]]) tone({ f, type: 'sine', d: 1.5, v: v * 0.35 * k });
      tone({ f: 140, f2: 80, type: 'triangle', d: 0.2, v });
      break;
    case 'bike':
      tone({ f: 2600, type: 'sine', d: 0.4, v: v * 0.15, at: 0.05 });
      noise({ f: 3000, q: 3, d: 0.15, v: v * 0.3 });
      break;
    case 'melon':
      tone({ f: 140, f2: 70, type: 'sine', d: 0.15, v });
      noise({ f: 500, type: 'lowpass', d: 0.08, v: v * 0.5 });
      break;
    case 'straw':
      noise({ f: 5000, q: 2, d: 0.02, v: 0.06 });
      break;
    case 'clay':
      tone({ f: 260, f2: 200, type: 'triangle', d: 0.1, v });
      noise({ f: 1500, d: 0.04, v: v * 0.3 });
      break;
    default:
      // cloth, leather, paper: a low thump
      tone({ f: 120, f2: 70, type: 'sine', d: 0.16, v });
      noise({ f: 300, type: 'lowpass', d: 0.1, v: v * 0.6 });
  }
}

export function grumble(mood) {
  const base = 80 + mood * 25;
  tone({ f: base, f2: base * 0.8, type: 'sawtooth', a: 0.06, d: 0.4 + mood * 0.08, v: 0.08 + mood * 0.03, lp: 500 + mood * 200, q: 6 });
  tone({ f: base * 1.5, f2: base * 1.1, type: 'square', a: 0.05, d: 0.3, v: 0.02, lp: 700 });
}
export function snort() {
  noise({ f: 600, f2: 200, q: 1, a: 0.01, d: 0.3, v: 0.3 });
}
export function boing() {
  tone({ f: 300, f2: 520, type: 'sine', d: 0.25, v: 0.12 });
}
export function crack() {
  noise({ f: 3000, type: 'highpass', a: 0.001, d: 0.12, v: 0.7 });
  noise({ f: 1200, q: 2, a: 0.001, d: 0.3, v: 0.5, at: 0.03 });
  tone({ f: 70, f2: 35, type: 'sine', d: 0.5, v: 0.8, at: 0.02 });
}
export function whoosh() {
  noise({ f: 300, f2: 1800, q: 1.2, a: 0.3, d: 0.6, v: 0.25 });
}
export function clatter() {
  for (let i = 0; i < 9; i++) {
    tone({ f: 160 + Math.random() * 200, f2: 90, type: 'triangle', at: i * 0.07 + Math.random() * 0.04, d: 0.12, v: 0.35 });
    noise({ f: 800 + Math.random() * 600, at: i * 0.07, d: 0.05, v: 0.2 });
  }
  tone({ f: 60, f2: 40, type: 'sine', d: 0.6, v: 0.9, at: 0.2 });
}
export function thud() {
  tone({ f: 90, f2: 55, type: 'sine', d: 0.25, v: 0.6 });
}
export function tick(urgent = false) {
  tone({ f: urgent ? 1500 : 1100, type: 'square', d: 0.03, v: urgent ? 0.07 : 0.04, lp: 3000 });
}
export function drum(hi = false) {
  tone({ f: hi ? 180 : 110, f2: hi ? 90 : 50, type: 'sine', d: 0.35, v: 0.8 });
  noise({ f: 400, type: 'lowpass', d: 0.08, v: 0.3 });
}
export function brass(notes = [293.7, 440]) {
  notes.forEach((f, i) => {
    tone({ f, type: 'sawtooth', a: 0.03, d: 0.5, v: 0.14, lp: 1400, at: i * 0.12 });
    tone({ f: f * 2, type: 'sawtooth', a: 0.03, d: 0.4, v: 0.04, lp: 2000, at: i * 0.12 });
  });
}
export function fanfare() {
  brass([293.7, 370, 440]);
  brass([587.3]);
  for (let i = 0; i < 12; i++) noise({ f: 350, type: 'lowpass', at: 0.5 + i * 0.05, d: 0.05, v: 0.25 });
  drum(true);
}
export function select() {
  tone({ f: 660, type: 'triangle', d: 0.06, v: 0.15 });
}
export function deliver(i = 0) {
  tone({ f: 523 * 2 ** ((i * 2) / 12), type: 'triangle', d: 0.18, v: 0.16 });
}

// ---------------------------------------------------------------- music

const D2 = 73.42;
const semis = (n) => D2 * 2 ** (n / 12);
// a plucked bass line in D dorian (semitones from D2), two bars
const BASS = [0, null, null, 0, null, 3, null, 5, 7, null, null, 5, null, 3, null, 2, 0, null, null, 0, null, 10, null, 9, 7, null, 5, null, 3, null, 2, null];
const MALLET = { 6: 19, 22: 24, 30: 21 };

export function setMusic(mode, tension = 0) {
  music.mode = mode; // 'off' | 'menu' | 'play'
  music.tension = Math.max(0, Math.min(1, tension));
  if (!ac || mode === 'off') return;
  if (!music.on) {
    music.on = true;
    music.next = ac.currentTime + 0.1;
    music.timer = setInterval(schedule, 30);
  }
}

function schedule() {
  if (!ac || music.mode === 'off') return;
  const bpm = 96 + 28 * music.tension;
  const stepT = 60 / bpm / 4;
  const play = music.mode === 'play';
  const vol = play ? 1 : 0.5;
  // a late timer (a busy or background page) skips the missed steps instead of playing them all at once
  if (music.next < ac.currentTime - 0.05) music.next = ac.currentTime + 0.02;
  while (music.next < ac.currentTime + 0.12) {
    const t = music.next;
    const s = music.step % 32;
    const at = t - ac.currentTime;
    if (play) {
      if (s % 8 === 0) drumHit(t, 1);
      if (s % 16 === 10) drumHit(t, 0.6);
      if (s % 8 === 4) noise({ time: t, f: 2200, q: 3, d: 0.04, v: 0.12, bus: musicBus });
    }
    const dense = music.tension > 0.6 ? 1 : 2;
    if (s % dense === 0) noise({ time: t, f: 7000, type: 'highpass', d: 0.03, v: (s % 4 === 2 ? 0.07 : 0.035) * vol, bus: musicBus });
    const b = BASS[s];
    if (b !== null && b !== undefined) tone({ f: semis(b), type: 'triangle', at: Math.max(0, at), a: 0.004, d: 0.22, v: 0.5 * vol, bus: musicBus, lp: 700 });
    if (play && MALLET[s] !== undefined && (music.step >> 5) % 2 === 1) tone({ f: semis(MALLET[s]) * 2, type: 'sine', at: Math.max(0, at), d: 0.35, v: 0.12, bus: musicBus });
    music.step++;
    music.next += stepT;
  }
}

function drumHit(time, v) {
  if (!ac) return;
  const o = ac.createOscillator();
  o.frequency.setValueAtTime(95, time);
  o.frequency.exponentialRampToValueAtTime(45, time + 0.25);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(0.9 * v, time + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
  o.connect(g).connect(musicBus);
  o.start(time);
  o.stop(time + 0.35);
}

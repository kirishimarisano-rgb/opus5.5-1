// Builds the provisional beatmap.json + click track from src/film/structure.js.
//   node tools/beatmap.mjs
// Outputs: beatmap.json, music/temp_click.wav
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../src/film/structure.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fr = (f) => ({ frame: f, time: +(f / S.FPS).toFixed(6) });

const sections = S.SECTIONS.map(([id, act, a, b, name, music]) => {
  let start = S.barFrame(a), end = S.barFrame(b);
  if (id === 'II-g') { start = S.barFrame(45) - S.FERMATA.frames; end = S.barFrame(45); }
  if (id === 'III-f') end = S.TOTAL_FRAMES;
  if (id === 'II-f') end = S.barFrame(45) - S.FERMATA.frames;
  return { id, act, name, bars: id === 'II-g' ? null : [a, b - 1], start: fr(start), end: fr(end), music };
});

const beats = [];
for (let bar = 1; bar <= S.LAST_BAR; bar++) {
  for (let beat = 1; beat <= S.BEATS_PER_BAR; beat++) {
    const f = S.posFrame(bar, beat);
    const silent = bar === 33; // vacuum bar has no audible pulse
    beats.push({ bar, beat, ...fr(f), strength: beat === 1 ? 1 : beat === 3 ? 0.6 : 0.3, audible: !silent });
  }
}

const hits = S.HITS.map(([id, bar, beat, desc]) => ({ id, bar, beat, ...fr(S.posFrame(bar, beat)), desc }));
const silences = [
  { id: 'vacuum', kind: 'near-silence (≤ −40 dBFS, no pulse)', start: fr(S.barFrame(33)), end: fr(S.barFrame(34)) },
  { id: 'silence-2', kind: 'absolute digital silence', start: fr(S.barFrame(45) - S.FERMATA.frames), end: fr(S.barFrame(45)) },
];
const subtitles = S.SUBTITLES.map(([text, b0, t0, b1, t1]) => ({ text, start: fr(S.posFrame(b0, t0)), end: fr(S.posFrame(b1, t1)) }));

const beatmap = {
  schema: 'entropy-beatmap/1',
  source: 'provisional — generated from src/film/structure.js (no score yet)',
  fps: S.FPS, bpm: S.BPM, meter: [S.BEATS_PER_BAR, 4],
  frames_per_beat: S.FRAMES_PER_BEAT,
  duration: fr(S.TOTAL_FRAMES),
  acts: [
    { act: 1, name: '秩序 Order', start: fr(0), end: fr(S.barFrame(25)) },
    { act: 2, name: '崩解 Collapse', start: fr(S.barFrame(25)), end: fr(S.barFrame(45)) },
    { act: 3, name: '重組 Reassembly', start: fr(S.barFrame(45)), end: fr(S.TOTAL_FRAMES) },
  ],
  sections, hits, silences, subtitles,
  downbeats: beats.filter((b) => b.beat === 1).map((b) => ({ bar: b.bar, frame: b.frame, time: b.time })),
  beats,
};
fs.writeFileSync(path.join(ROOT, 'beatmap.json'), JSON.stringify(beatmap, null, 1));

// ---- click track (48 kHz, 16-bit mono) ----
const SR = 48000;
const N = Math.round((S.TOTAL_FRAMES / S.FPS) * SR);
const buf = new Float32Array(N);
const add = (t0, dur, fn) => {
  const s0 = Math.round(t0 * SR);
  for (let i = 0; i < dur * SR && s0 + i < N; i++) buf[s0 + i] += fn(i / SR);
};
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
for (const b of beats) {
  if (!b.audible) continue;
  const f = b.beat === 1 ? 1760 : 1100, g = b.beat === 1 ? 0.5 : 0.28;
  add(b.time, 0.04, (t) => g * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 120));
}
for (const h of hits) {
  if (h.id === 'impact') add(h.time, 1.2, (t) => 0.8 * (rnd() * 0.5 + Math.sin(2 * Math.PI * 55 * t)) * Math.exp(-t * 4));
  else add(h.time, 0.25, (t) => 0.35 * Math.sin(2 * Math.PI * 330 * t) * Math.exp(-t * 14));
}
// enforce true silence
for (const s of silences) for (let i = Math.round(s.start.time * SR); i < Math.round(s.end.time * SR); i++) buf[i] = 0;
for (let i = Math.round(S.barFrame(S.LAST_BAR + 1) / S.FPS * SR); i < N; i++) buf[i] = 0;

const wav = Buffer.alloc(44 + N * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 2, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(SR, 24);
wav.writeUInt32LE(SR * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) wav.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(buf[i] * 32767))), 44 + i * 2);
fs.writeFileSync(path.join(ROOT, 'music/temp_click.wav'), wav);

console.log(`beatmap.json: ${beats.length} beats, ${hits.length} hits, duration ${beatmap.duration.time}s (${S.TOTAL_FRAMES} frames)`);

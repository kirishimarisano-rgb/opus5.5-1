// 《熵》temp musical structure — the single source for the provisional beatmap.
// When a real score arrives, tools/analyze_music.py replaces beatmap.json and
// this file is no longer read by the film (the film only reads beatmap.json).
//
// Grid: 72 BPM, 4/4. At 60 fps one beat = exactly 50 frames, one bar = 200
// frames, so every beat and 8th note lands on an integer frame.
// The only off-grid event is the 2.0 s fermata of total silence that ends Act II.

export const FPS = 60;
export const BPM = 72;
export const BEATS_PER_BAR = 4;
export const FRAMES_PER_BEAT = (FPS * 60) / BPM; // 50
export const FRAMES_PER_BAR = FRAMES_PER_BEAT * BEATS_PER_BAR; // 200

export const FERMATA = { afterBar: 44, frames: 120 }; // silence 2: 146.667 s → 148.667 s
export const LAST_BAR = 71;
export const TAIL_FRAMES = 80; // black tail after the last bar → total 14400 frames = 4:00.000

// frame at which a bar (1-based) begins
export function barFrame(bar) {
  const f = (bar - 1) * FRAMES_PER_BAR;
  return bar > FERMATA.afterBar ? f + FERMATA.frames : f;
}
// "bar.beat" → frame (beat may be fractional, 1-based)
export function posFrame(bar, beat = 1) {
  return barFrame(bar) + Math.round((beat - 1) * FRAMES_PER_BEAT);
}
export const TOTAL_FRAMES = barFrame(LAST_BAR + 1) + TAIL_FRAMES;

// Sections: [id, act, fromBar, toBar(exclusive), name, music]
export const SECTIONS = [
  ['I-a', 1, 1, 5, '起點 Genesis', 'Room tone; a lone music-box note at 2.1; glass harmonica drone fades in.'],
  ['I-b', 1, 5, 13, '主題 Theme A', 'Music box states the main theme (8 bars), pp–p.'],
  ['I-c', 1, 13, 21, '結晶 Theme A′', 'Music box + glass harmonica counter-line, mp. Fullest, coldest beauty.'],
  ['I-d', 1, 21, 25, '完滿 Perfection', 'Cadence and suspension; glass harmonica holds the tonic. Nothing moves.'],
  ['II-a', 2, 25, 29, '偏移 The Slip', 'Theme restarts on music box — ONE note (the 3rd degree) 30–50 cents flat. It keeps drifting further out.'],
  ['II-b', 2, 29, 33, '蔓延 Spread', 'Prepared piano (muted, metallic), cello pizzicato walking bass; accelerating unease, crescendo.'],
  ['II-c', 2, 33, 34, '抽空 Vacuum', 'SILENCE 1: everything cut at 33.1; a single inhaled breath / reversed swell may rise under −40 dBFS. No pulse.'],
  ['II-d', 2, 34, 36, '重擊 Impact', 'TAIKO + low piano cluster on 34.1 (fff), long reverb tail; the tail IS the slow motion.'],
  ['II-e', 2, 36, 42, '崩落 Collapse', 'Taiko ostinato, cello pizz, prepared piano; decrescendo from bar 40.'],
  ['II-f', 2, 42, 45, '散去 Dissolution', 'Only the detuned music box, fragments of the theme, slowing and thinning to nothing by 44.4.'],
  ['II-g', 2, 45, 45, '靜默 Silence', 'SILENCE 2: 2.0 s of absolute digital silence (fermata, off-grid).'],
  ['III-a', 3, 45, 49, '餘燼 Ember', 'A single erhu note, ppp, rising out of the silence on 45.1.'],
  ['III-b', 3, 49, 57, '逆流 Upstream', 'Erhu plays the main theme (same melody as Act I); cello arco from bar 53.'],
  ['III-c', 3, 57, 63, '生長 Growth', 'Strings enter, choir hums (closed mouth); crescendo.'],
  ['III-d', 3, 63, 64, '吸氣 Inhale', 'One-bar swell: strings & choir crescendo into 64.1 (not silence — a held breath).'],
  ['III-e', 3, 64, 70, '高潮 Climax', 'Full choir (open vowel), strings, erhu on the theme, taiko returns as a heartbeat (beats 1 & 3).'],
  ['III-f', 3, 70, 72, '尾聲 Coda', 'Orchestra drops out on 70.1; music box plays the theme\'s first phrase — in tune, except the same one note, still flat. Last note rings into black.'],
];

// Sync points the picture must hit (± 1 frame).
export const HITS = [
  ['first-light', 2, 1, 'First music-box note — a single point of light appears.'],
  ['pane-open', 3, 1, 'The 1:1 pane begins to lighten around the point.'],
  ['theme-a', 5, 1, 'Theme A begins — snowflake growth locked to melody notes.'],
  ['theme-a2', 13, 1, 'Theme A′ — camera begins the push into self-similar detail.'],
  ['perfection', 21, 1, 'Full crystal revealed; camera settles.'],
  ['slip', 25, 1, 'THE SLIP — first displaced element (seed hex) shifts on the first detuned note.'],
  ['crack-born', 26, 1, 'Orange-red crack emerges from the seed hex (the only foreign colour).'],
  ['spread', 29, 1, 'Prepared piano enters — crack branches multiply.'],
  ['vacuum', 33, 1, 'SILENCE 1 begins — time remap drops to ~0.03×.'],
  ['impact', 34, 1, 'IMPACT — the 1:1 frame itself shatters into full 16:9.'],
  ['real-time', 36, 1, 'Slow motion releases back to 1×.'],
  ['decay', 40, 1, 'Orange-red extinguished; desaturation completes by 42.1.'],
  ['dissolve', 42, 1, 'Shards have become dust; near black-and-white.'],
  ['silence-2', 44, 5, 'SILENCE 2 begins (end of bar 44).'],
  ['ember', 45, 1, 'Silence ends — erhu; the seed hex is the first thing to light (gold).'],
  ['upstream', 49, 1, 'Dust reverses and flows toward the seed.'],
  ['sprout', 53, 1, 'First gold branch leaves the seed.'],
  ['growth', 57, 1, 'Growth — cold blue returns as a second light.'],
  ['inhale', 63, 1, 'The picture draws in to a horizon line.'],
  ['climax', 64, 1, 'CLIMAX — the frame opens to 2.39:1; highest saturation.'],
  ['coda', 70, 1, 'Coda — push in to the retained crack.'],
  ['last-note', 71, 3, 'Final music-box note; fade to black over its decay.'],
];

export const SUBTITLES = [
  ['一切，從秩序開始。', 5, 1, 8, 1],
  ['萬物終將散去。', 42, 1, 44, 3],
  ['但生命，選擇逆流。', 47, 1, 50, 1],
];

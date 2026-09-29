// 《熵》colour token table — the ONLY source of colour in the film.
// Every colour that enters a shader comes from here (by name → index into uTok[]).
// Post-processing (bloom, tone curve, the per-section saturation grade, grain)
// is a documented transform of these tokens, specified in GRADE below.

export const TOKENS = [
  // name,          hex,       role
  ['void',          '#000000', 'Container black: pillarbox, letterbox, before/after.'],
  ['night',         '#05070a', 'Deep space of Acts II–III.'],
  // Act I — cold white-blue monochrome
  ['ice-0',         '#f4f8fb', 'Brightest frost, crystal highlights.'],
  ['ice-1',         '#d9e4ec', 'Frost body.'],
  ['ice-2',         '#a7bccb', 'Pane light (back-lit glass).'],
  ['ice-3',         '#6f8ba1', 'Engraved lattice, pane shadow.'],
  ['ice-4',         '#2f4658', 'Pane edge / deepest cold.'],
  ['ice-glow',      '#cfe5ff', 'Cold bloom tint.'],
  // Act II — the only foreign hue
  ['ember',         '#ff3d14', 'THE crack. Orange-red, used nowhere else in the film.'],
  ['ember-core',    '#ffb088', 'Hot core of the crack.'],
  // Act II — ash (desaturated)
  ['ash-0',         '#e4e3e0', 'Brightest ash.'],
  ['ash-1',         '#9b9a97', 'Ash dust.'],
  ['ash-2',         '#4a4948', 'Dim ash.'],
  ['ash-3',         '#161616', 'Almost gone.'],
  // Act III — warm gold
  ['gold-0',        '#ffecc8', 'Gold core (white-hot).'],
  ['gold-1',        '#f5b04a', 'Gold.'],
  ['gold-2',        '#d27a26', 'Deep gold.'],
  ['gold-3',        '#6b3a0c', 'Gold shadow.'],
  // Act III climax — cold blue that coexists with gold
  ['azure-0',       '#c6e2ff', 'Azure highlight.'],
  ['azure-1',       '#4d9dff', 'Azure.'],
  ['azure-2',       '#1a4d9e', 'Deep azure.'],
  // Typography
  ['text-ice',      '#dfe8ef', 'Subtitle 1.'],
  ['text-ash',      '#c2c1be', 'Subtitle 2.'],
  ['text-gold',     '#f6dfae', 'Subtitle 3.'],
];

export const TOKEN_INDEX = Object.fromEntries(TOKENS.map(([n], i) => [n, i]));
export const T = TOKEN_INDEX; // shorthand: T['gold-1']

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export function hexToLinear(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgbToLinear(v / 255));
}
export function tokenLinear(name) { return hexToLinear(TOKENS[TOKEN_INDEX[name]][1]); }
export function tokenCss(name) { return TOKENS[TOKEN_INDEX[name]][1]; }
// Flat Float32Array for uniform vec3 uTok[N]
export const TOKEN_UNIFORM = new Float32Array(TOKENS.flatMap(([, hex]) => hexToLinear(hex)));

// Saturation arc (anchor 3): low → spike → zero → highest.
// Global post saturation multiplier keyed to beatmap hit ids; linear-interpolated.
export const GRADE = [
  // [hit id or section boundary, saturation multiplier]
  ['start', 0.55],      // Act I: tokens are near-monochrome already; keep it hushed
  ['perfection', 0.55],
  ['slip', 0.8],
  ['vacuum', 1.25],     // spike: ember is the only chroma on screen
  ['impact', 1.35],
  ['decay', 0.35],
  ['dissolve', 0.0],    // zero: near black & white
  ['ember', 0.0],
  ['upstream', 0.6],
  ['growth', 1.1],
  ['climax', 1.6],      // highest of the film
  ['coda', 1.45],
  ['end', 1.4],
];

// Checkpoint-1: three candidate FINAL SHAPES, staged as the Act III climax frame.
// A 裂痕之樹 — the crack, stood upright on the seed, becomes the tree (crown + roots).
// B 金繼之晶 — the snowflake re-formed, every fracture joined in gold.
// C 向光螺旋 — the fragments re-grow as a phyllotaxis (golden-angle) disc.
import * as G from './geometry.js';
import { T } from './tokens.js';
import { LINES_BASIC, lineBuf } from './world.js';
import { mulberry32 } from '../engine/math.js';

const HORIZON = -0.3;

// ---- shared particle snippets ----------------------------------------------
// a0=(pos.xyz,size) a1=(tok,bright,phase,twinkle) a2=(flowSpeed, wrapHalf, band, _)
const DUST = /* glsl */ `
void particle(out vec3 pos, out float size, out vec3 col, out float alpha){
  vec3 p = a0.xyz;
  float span = a2.y;
  if(span > 0.){ p.x = mod(p.x + uTime*a2.x + span, 2.*span) - span; }
  p += vnoise3(a0.xyz*1.7 + vec3(0.,0.,uTime*0.05))*0.02*(1.+a2.z*1.5);
  pos = p; size = a0.w;
  col = TOK(a1.x);
  float edge = span > 0. ? smoothstep(span, span*0.8, abs(p.x)) : 1.;
  alpha = a1.y*(0.7 + 0.3*sin(uTime*a1.w + a1.z*6.2831))*uP0.x*edge;
}`;

// Particles that travel along a node graph (root → leaf); nodes in a data texture.
// a0=(leafIndex, phase, speed, size) a1=(tok, bright, jitter, dir) — dir>0: root→leaf
const PATHFLOW = /* glsl */ `
uniform sampler2D uNodes;
vec4 N0(int i){ return texelFetch(uNodes, ivec2(i,0), 0); }
vec4 N1(int i){ return texelFetch(uNodes, ivec2(i,1), 0); }
void particle(out vec3 pos, out float size, out vec3 col, out float alpha){
  int leaf = int(a0.x + 0.5);
  float Lmax = N1(leaf).x;
  float u = fract(a0.y + uTime*a0.z*(a1.w > 0. ? 1. : -1.));
  float d = u*Lmax;
  int i = leaf;
  for(int k=0;k<400;k++){ int p = int(N0(i).w); if(p < 0) break; if(N1(p).x <= d) break; i = p; }
  int p = int(N0(i).w);
  vec3 P = N0(i).xyz;
  if(p >= 0){ float d0 = N1(p).x, d1 = N1(i).x; P = mix(N0(p).xyz, P, clamp((d-d0)/max(d1-d0,1e-6), 0., 1.)); }
  pos = P + (hash33(vec3(a0.x, a0.y*91.7, 3.))-0.5)*a1.z;
  size = a0.w;
  col = TOK(a1.x);
  // all paths share the trunk: normalise density by the number of leaves downstream
  alpha = a1.y*pow(sin(3.14159*u), 0.6)*uP0.x/sqrt(max(N1(i).z, 1.));
}`;

function dustField(R, { n = 16000, seed = 3, toks = ['azure-0', 'azure-1', 'azure-2'], bright = 1 } = {}) {
  const rnd = mulberry32(seed), d = new Float32Array(n * 16);
  for (let i = 0; i < n; i++) {
    const z = -3.2 + 3.9 * Math.pow(rnd(), 0.8);
    const x = (rnd() * 2 - 1) * 3.4, y = (rnd() * 2 - 1) * 1.8;
    const b = Math.pow(rnd(), 9) * 1.4 + 0.025;
    const tok = T[toks[Math.floor(rnd() * toks.length)]];
    d.set([x, y, z, 0.0009 + 0.002 * rnd() * rnd(), tok, b * bright, rnd(), 0.5 + 2 * rnd(), 0, 0, 0, 0], i * 16);
  }
  return R.system('particles', { data: d, glsl: DUST });
}

// The current: a horizontal river of cold particles along the horizon.
function river(R, { n = 42000, seed = 4, y = HORIZON, speed = 0.05 } = {}) {
  const rnd = mulberry32(seed), d = new Float32Array(n * 16);
  const g = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  for (let i = 0; i < n; i++) {
    const x = (rnd() * 2 - 1) * 2.8, z = -2.2 + 2.8 * rnd();
    const w = 0.004 + 0.03 * Math.pow(rnd(), 4);
    const yy = y + g() * w + 0.012 * Math.sin(x * 3.1 + z * 2.0);
    const tok = T[['azure-0', 'azure-1', 'azure-1', 'azure-2'][Math.floor(rnd() * 4)]];
    d.set([x, yy, z, 0.0007 + 0.0016 * rnd() * rnd(), tok, 0.04 + 0.45 * Math.pow(rnd(), 5), rnd(), 1 + rnd() * 2, speed * (0.6 + 0.8 * rnd()), 2.8, 1, 0], i * 16);
  }
  return R.system('particles', { data: d, glsl: DUST });
}

// ---- A: tree ---------------------------------------------------------------
function buildTree(R, W) {
  const crk = W.crack, seed = W.flake.seed;
  let mx = 0, my = 0, n = 0;
  crk.segs.forEach((s) => { if (s.primary === 0) { mx += s.b[0] - seed.c[0]; my += s.b[1] - seed.c[1]; n++; } });
  const ang = Math.PI / 2 - Math.atan2(my / n, mx / n);
  const rotp = (p) => { const v = [p[0] - seed.c[0], p[1] - seed.c[1]]; return [v[0] * Math.cos(ang) - v[1] * Math.sin(ang), v[0] * Math.sin(ang) + v[1] * Math.cos(ang)]; };
  let top = 0, minx = 0, maxx = 0;
  crk.nodes.forEach((nd) => { const r = rotp(nd.p); top = Math.max(top, r[1]); minx = Math.min(minx, r[0]); maxx = Math.max(maxx, r[0]); });
  const sc = 0.7 / top, sx = 1.45;
  const cx = 0;
  const xf = (p) => { const r = rotp(p); const k = 1 + (sx - 1) * Math.min(1, Math.max(0, r[1] / top * 2.2)); return [r[0] * sc * k, HORIZON + r[1] * sc, 0]; };
  const nodes = crk.nodes.map((nd) => xf(nd.p));
  const maxLeaves = crk.leaves[0];
  const hexR = seed.r * sc; // (hex drawn with sc; x-stretch only applies outside it)
  // branches: pipe-model widths; inside the seed hexagon the trunk is only a hairline seam
  const segs = crk.segs.map((s) => {
    const dSeed = Math.hypot(nodes[s.i1][0], nodes[s.i1][1] - HORIZON);
    const inHex = dSeed < hexR * 1.05;
    // the seam widens into the trunk: hairline inside the hexagon, full girth a few hex-radii out
    const k = Math.min(1, Math.max(0, (dSeed - hexR) / (hexR * 5)));
    const full = 0.00045 + 0.0038 * Math.pow(s.leaves / maxLeaves, 0.6);
    const w = 0.0006 + (full - 0.0006) * k * k * (3 - 2 * k);
    return { p0: nodes[s.i0], p1: nodes[s.i1], w, g0: s.d0 / crk.maxDist, g1: s.d1 / crk.maxDist, tok: T['gold-1'], glowR: inHex ? 0.003 : 0.006, glowAmt: 0.4, gen: s.gen, rnd: s.primary };
  });
  const TREE = LINES_BASIC.replace('alpha = a3.x*vis;', 'alpha = a3.x*vis*(a3.z > 0.5 ? uP1.z : 1.);');
  const lines = R.system('lines', { data: lineBuf(segs), glsl: TREE });
  // node texture (x,y,z,parent) / (dist, gen, leaves, primary)
  const N = crk.nodes.length, tex = new Float32Array(N * 8);
  crk.nodes.forEach((nd, i) => {
    tex.set([nodes[i][0], nodes[i][1], nodes[i][2], nd.parent], i * 4);
    tex.set([nd.dist * sc, nd.gen, crk.leaves[i], 0], (N + i) * 4);
  });
  const nodeTex = R.dataTexture(tex, N, 2);
  const leaves = crk.nodes.map((_, i) => i).filter((i) => crk.kids[i].length === 0);
  const rnd = mulberry32(9);
  const sapN = 16000, sap = new Float32Array(sapN * 16);
  for (let i = 0; i < sapN; i++) {
    const leaf = leaves[Math.floor(rnd() * leaves.length)];
    sap.set([leaf, rnd(), 0.05 + 0.08 * rnd(), 0.0009 + 0.0012 * rnd(), T[rnd() < 0.3 ? 'gold-0' : 'gold-1'], 0.35 + 0.9 * rnd(), 0.004, 1], i * 16);
  }
  const sapSys = R.system('particles', { data: sap, glsl: PATHFLOW });
  // blossoms at crown tips
  const bl = [];
  leaves.forEach((li) => {
    const p = nodes[li]; if (p[1] < HORIZON) return;
    for (let k = 0; k < 40; k++) {
      const r = 0.022 * Math.pow(rnd(), 1.5), a = rnd() * 6.283, zz = (rnd() - 0.5) * 0.03;
      bl.push([p[0] + r * Math.cos(a), p[1] + r * Math.sin(a), zz, 0.0012 + 0.003 * rnd() * rnd(), T[rnd() < 0.5 ? 'gold-0' : 'gold-1'], 0.15 + 0.8 * Math.pow(rnd(), 2), rnd(), 1 + rnd() * 3]);
    }
  });
  const bd = new Float32Array(bl.length * 16);
  bl.forEach((b, i) => bd.set(b, i * 16));
  const blossom = R.system('particles', { data: bd, glsl: DUST });
  return { lines, sapSys, blossom, nodeTex, nodes, xf, ang, sc, sx };
}

// Seed hexagon with its gold seam (the retained imperfection), placed by a transform.
function seedSystems(R, W) {
  const s = W.flake.seed;
  const hex = G.hexOutline([0, 0], s.r, s.rot);
  const l = [];
  for (let i = 0; i < 6; i++) l.push({ p0: hex[i], p1: hex[(i + 1) % 6], w: 0.0012, tok: T['azure-0'], glowR: 0.006, glowAmt: 0.5 });
  // the seam: the crack's first steps inside the hexagon, both directions
  const crk = W.crack;
  crk.segs.forEach((sg) => {
    const a = [sg.a[0] - s.c[0], sg.a[1] - s.c[1]], b = [sg.b[0] - s.c[0], sg.b[1] - s.c[1]];
    if (Math.hypot(...a) < s.r * 0.98) {
      let bb = b; const L = Math.hypot(...b);
      if (L > s.r * 0.95) bb = [b[0] * s.r * 0.9 / L, b[1] * s.r * 0.9 / L];
      l.push({ p0: a, p1: bb, w: 0.0016, tok: T['gold-0'], glowR: 0.01, glowAmt: 0.9 });
    }
  });
  const lines = R.system('lines', { data: lineBuf(l), glsl: LINES_BASIC });
  const fill = R.system('shards', {
    data: G.shardVertices([hex]),
    glsl: /* glsl */ `uniform mat4 uModel;
      void shard(vec2 l, vec2 c, float id, vec4 r, out mat4 M, out vec4 tint, out float eg, out float a){
        M = uModel; M[3] += uModel*vec4(c,0.,0.); tint = vec4(1.); eg = 0.; a = uP0.x; }`,
    fsGlsl: /* glsl */ `vec3 shade(vec3 c, vec2 uv, float id){ float g = smoothstep(0.9, 0.1, uv.y*0.7 + uv.x*0.3); return mix(TOK(${T['azure-2']}), TOK(${T['azure-0']}), 0.08 + 0.25*g)*0.35; }`,
  });
  return { lines, fill };
}

function modelMat(tx, ty, tz, rotZ = 0, sc = 1) {
  const c = Math.cos(rotZ) * sc, s = Math.sin(rotZ) * sc;
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, sc, 0, tx, ty, tz, 1];
}

// ---- B: kintsugi crystal -----------------------------------------------------
function buildKintsugi(R, W) {
  const rnd = mulberry32(31);
  // living variation: each arm bends/scales a little differently
  const armVar = [0, 1, 2, 3, 4, 5].map(() => ({ s: 0.93 + 0.12 * rnd(), a: (rnd() - 0.5) * 0.06 }));
  const xf = (p, arm) => {
    if (arm < 0) return [p[0], p[1], 0];
    const v = armVar[arm], c = Math.cos(v.a), s = Math.sin(v.a);
    return [(p[0] * c - p[1] * s) * v.s, (p[0] * s + p[1] * c) * v.s, 0];
  };
  const l = W.flakeLinesData.filter((s) => s.extra !== 1).map((s) => ({ ...s, p0: xf(s.p0, s.rnd), p1: xf(s.p1, s.rnd), tok: T['azure-0'], glowAmt: 0.45, glowR: 0.008, g0: 0, g1: 0 }));
  const flake = R.system('lines', { data: lineBuf(l), glsl: LINES_BASIC });
  const seams = [];
  const crk = W.crack;
  crk.segs.forEach((s) => { if (Math.hypot(s.b[0], s.b[1]) < 0.47) seams.push({ p0: s.a, p1: s.b, w: 0.0006 + 0.0012 * Math.pow(s.leaves / crk.leaves[0], 0.5), tok: T['gold-1'], glowR: 0.007, glowAmt: 0.5 }); });
  const seam = R.system('lines', { data: lineBuf(seams), glsl: LINES_BASIC });
  return { flake, seam };
}

// ---- C: phyllotaxis ------------------------------------------------------------
function buildSpiral(R) {
  const n = 1100, GA = Math.PI * (3 - Math.sqrt(5));
  const l = [];
  const rnd = mulberry32(77);
  for (let i = 1; i < n; i++) {
    const r = 0.0165 * Math.sqrt(i), a = i * GA;
    const c = [r * Math.cos(a), r * Math.sin(a)];
    const hr = 0.0072 * (0.75 + 0.25 * Math.sqrt(i / n)) * (0.9 + 0.2 * rnd());
    const hex = G.hexOutline(c, hr, a);
    const f = i / n;
    // dithered transition gold → azure: the living centre is warm, the outer (older) ring cold
    const u = Math.min(1, Math.max(0, f + (rnd() - 0.5) * 0.3));
    const tok = u < 0.62 ? T['gold-0'] + Math.min(0.999, u / 0.62) * 1.0 + (u > 0.45 ? 0 : 0) : T['azure-0'] + Math.min(0.999, (u - 0.62) / 0.38);
    for (let k = 0; k < 6; k++) l.push({ p0: hex[k], p1: hex[(k + 1) % 6], w: 0.0007, tok, glowR: 0.004, glowAmt: 0.4, alpha: (1 - 0.5 * f) * (0.55 + 0.45 * rnd()) });
  }
  return R.system('lines', { data: lineBuf(l), glsl: LINES_BASIC });
}

// Remnants of the old pane, drifting in the current (cold glass).
function driftShards(R, W, { n = 70, seed = 12 } = {}) {
  const rnd = mulberry32(seed);
  const cells = W.shatter.cells.slice().sort(() => rnd() - 0.5).slice(0, n).map((c) => c.poly);
  return R.system('shards', {
    data: G.shardVertices(cells, seed),
    glsl: /* glsl */ `
      void shard(vec2 l, vec2 c, float id, vec4 r, out mat4 M, out vec4 tint, out float eg, out float a){
        float x = (r.x*2.-1.)*2.6 + uTime*0.03*(0.5+r.y);
        x = mod(x + 2.8, 5.6) - 2.8;
        float z = -1.8 + 2.1*r.z;
        float y = ${HORIZON.toFixed(3)} + (r.w-0.5)*0.07 + 0.02*sin(x*2.+r.y*6.);
        mat3 Rm = rotAxis(vec3(r.y-0.5, r.z-0.5, r.x-0.3), uTime*0.25*(r.w+0.2) + r.x*9.);
        float s = 0.35 + 0.3*r.y;
        M = mat4(vec4(Rm[0]*s,0.), vec4(Rm[1]*s,0.), vec4(Rm[2]*s,0.), vec4(x, y, z, 1.));
        tint = vec4(1.); eg = 0.6; a = uP0.x*smoothstep(2.8, 2.2, abs(x)); }`,
    fsGlsl: /* glsl */ `vec3 shade(vec3 c, vec2 uv, float id){ float n = vnoise(vec3(uv*40., id)); return mix(TOK(${T['azure-2']}), TOK(${T['azure-1']}), 0.3+0.2*n)*0.22; }`,
  });
}

export function buildFinals(R, W) {
  const F = {
    dust: dustField(R, {}),
    river: river(R, {}),
    drift: driftShards(R, W),
    tree: buildTree(R, W),
    seed: seedSystems(R, W),
    kin: buildKintsugi(R, W),
    spiral: buildSpiral(R),
  };
  return F;
}

const L_ALL = (i = 1, tok = -1, w = 1, g = 1, root = 1) => ({ uP0: [99, i, 0, tok], uP1: [w, g, root, 0] });

export function finalDraws(F, W, which, time, { macro = false } = {}) {
  const d = [];
  const seedHexDraw = (M, i = 1, seam = true) => {
    d.push({ sys: F.seed.fill, blend: 'over', u: { uModel: M, uP0: [0.6, 0, 0, 0], uEdgeTok: T['azure-0'], uSheen: 0.8 } });
    d.push({ sys: F.seed.lines, blend: 'max', u: { uModel: M, ...L_ALL(i), uP1: [1, 1, 1, 0] }, count: seam ? undefined : 6 });
  };
  d.push({ sys: F.dust, u: { uP0: [0.6, 0, 0, 0] } });
  d.push({ sys: F.drift, blend: 'over', u: { uP0: [0.9, 0, 0, 0], uEdgeTok: T['azure-0'], uSheen: 0.6 } });
  if (which === 'A') {
    d.push({ sys: F.river, u: { uP0: [1.6, 0, 0, 0] } });
    const t = F.tree;
    d.push({ sys: t.lines, blend: 'max', u: { ...L_ALL(0.75, T['gold-2'], 1.0, 1.0, 0.2) } });
    d.push({ sys: t.lines, blend: 'max', u: { ...L_ALL(1.1, T['gold-0'], 0.4, 0.3, 0.2) } });
    if (!macro) d.push({ sys: t.sapSys, u: { uNodes: { tex: t.nodeTex, unit: 3 }, uP0: [2.2, 0, 0, 0] } });
    d.push({ sys: t.blossom, u: { uP0: [0.8, 0, 0, 0] } });
    // seed at the root, 3.5° off its original orientation, scaled up so it reads
    seedHexDraw(modelMat(0, HORIZON, 0.001, 0.061 + t.ang, t.sc), 1.3, false);
  } else if (which === 'B') {
    d.push({ sys: F.river, u: { uP0: [0.55, 0, 0, 0] } });
    const M = modelMat(0, 0.08, 0, 0.0, 1.12);
    d.push({ sys: F.kin.flake, blend: 'max', u: { uModel: M, ...L_ALL(0.8) } });
    d.push({ sys: F.kin.seam, blend: 'max', u: { uModel: M, ...L_ALL(1.0) } });
    d.push({ sys: F.kin.seam, blend: 'max', u: { uModel: M, ...L_ALL(1.2, T['gold-0'], 0.45, 0.3) } });
    const s = W.flake.seed;
    const Ms = modelMat((s.c[0] + 0.004) * 1.12, 0.08 + (s.c[1] - 0.006) * 1.12, 0.001, 0.061, 1.12);
    seedHexDraw(Ms, 1.2);
  } else if (which === 'C') {
    d.push({ sys: F.river, u: { uP0: [0.55, 0, 0, 0] } });
    // disc tilted toward the camera, reads as a wide ellipse in 2.39
    const tilt = 1.12, c = Math.cos(tilt), s = Math.sin(tilt), k = 1.6;
    const M = [k, 0, 0, 0, 0, c * k, -s * k, 0, 0, s * k, c * k, 0, 0, -0.02, 0, 1];
    d.push({ sys: F.spiral, blend: 'max', u: { uModel: M, ...L_ALL(0.9) } });
    const Ms = [...M]; // seed at the very centre, slightly off-axis
    const r = 0.061, cr = Math.cos(r), sr = Math.sin(r), sc = 1.35;
    const R2 = [cr * sc * 0.8, sr * sc * 0.8, 0, 0, -sr * sc * 0.8, cr * sc * 0.8, 0, 0, 0, 0, sc, 0, 0.004, 0.002, 0.001, 1];
    seedHexDraw(mulM(Ms, R2), 1.5);
  }
  return d;
}

function mulM(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
  return o;
}

// Builds every static GPU system of the film once. Motion lives in the GLSL
// snippets (pure functions of uTime + per-instance data) so any frame can be
// rendered in isolation, in any order.
import * as G from './geometry.js';
import { T } from './tokens.js';
import { mulberry32 } from '../engine/math.js';

// ---- packing helpers ------------------------------------------------------
// line instance: a0=(p0.xyz,w) a1=(p1.xyz,g0) a2=(g1,tok,glowR,glowAmt) a3=(alpha,gen,rnd,extra)
function lineBuf(list) {
  const out = new Float32Array(list.length * 16);
  list.forEach((s, i) => {
    const o = i * 16, p0 = s.p0, p1 = s.p1;
    out.set([p0[0], p0[1], p0[2] ?? 0, s.w, p1[0], p1[1], p1[2] ?? 0, s.g0 ?? 0, s.g1 ?? 0, s.tok, s.glowR ?? 0, s.glowAmt ?? 0, s.alpha ?? 1, s.gen ?? 0, s.rnd ?? 0, s.extra ?? 0], o);
  });
  return out;
}

const LINE_COMMON = /* glsl */ `
uniform mat4 uModel;
// growth: uP0.x = front position; uP0.y = intensity; uP0.z = soft width of the front; uP0.w = tok override (<0 none)
void grow(inout vec3 p0, inout vec3 p1, out float vis){
  float G = uP0.x, g0 = a1.w, g1 = a2.x;
  float k = clamp((G - g0)/max(g1 - g0, 1e-5), 0., 1.);
  p1 = mix(p0, p1, k); vis = k > 0. ? 1. : 0.;
}`;

export const LINES_BASIC = LINE_COMMON + /* glsl */ `
void segment(out vec3 p0, out vec3 p1, out float w, out vec3 col, out float alpha, out float glow, out float glowAmt){
  p0 = a0.xyz; p1 = a1.xyz; float vis; grow(p0, p1, vis);
  p0 = (uModel*vec4(p0,1.)).xyz; p1 = (uModel*vec4(p1,1.)).xyz;
  w = a0.w*uP1.x;
  float tk = uP0.w >= 0. ? uP0.w : a2.y;          // fractional token = gradient map toward the next token
  col = mix(TOK(floor(tk)), TOK(floor(tk)+1.), fract(tk)) * uP0.y; alpha = a3.x*vis;
  glow = a2.z*uP1.y; glowAmt = a2.w;
}`;

// ---- the world ---------------------------------------------------------------
export function buildWorld(R) {
  const W = {};
  const flake = G.snowflake();
  const crk = G.crack(flake.seed);
  const sh = G.shatter(crk, flake.seed);
  W.flake = flake; W.crack = crk; W.shatter = sh;

  // Pane background: one square shard, procedural frost shading
  W.paneBg = R.system('shards', {
    data: G.shardVertices([[[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]]),
    glsl: /* glsl */ `
      void shard(vec2 l, vec2 c, float id, vec4 r, out mat4 M, out vec4 tint, out float eg, out float a){
        M = mat4(1.); M[3] = vec4(c, 0., 1.); tint = vec4(1.); eg = 0.; a = uP0.x; }`,
    fsGlsl: /* glsl */ `
      vec3 shade(vec3 c, vec2 uv, float id){
        vec2 p = uv - 0.5;
        float r = length(p);
        vec3 col = mix(TOK(${T['ice-1']}), TOK(${T['ice-2']}), smoothstep(0.0, 0.62, r));
        col = mix(col, TOK(${T['ice-3']}), smoothstep(0.45, 0.72, r)*0.55);
        float fr = vnoise(vec3(uv*180., 1.3))*0.5 + vnoise(vec3(uv*55., 7.1))*0.5;
        col *= 1. + 0.035*fr;
        return col*uP0.y;
      }`,
  });

  // Snowflake strokes — `g0/g1` = growth front
  const fl = [];
  for (const s of flake.segs) fl.push({ p0: s.a, p1: s.b, w: s.w * 0.5, g0: s.g0, g1: s.g1, tok: T['ice-0'], glowR: 0.006, glowAmt: 0.35, gen: s.depth, rnd: s.arm });
  for (const p of flake.plates) {
    const hex = G.hexOutline(p.c, p.r, p.rot);
    for (let i = 0; i < 6; i++) fl.push({ p0: hex[i], p1: hex[(i + 1) % 6], w: 0.0011, g0: p.g, g1: p.g + 0.02, tok: T['ice-0'], glowR: 0.004, glowAmt: 0.3, gen: 3, rnd: p.arm, extra: p.kind === 'seed' ? 1 : 0 });
  }
  W.flakeLinesData = fl;
  W.flakeLines = R.system('lines', { data: lineBuf(fl), glsl: LINES_BASIC });

  // Crack strokes (pane space)
  const cl = crk.segs.map((s) => ({ p0: s.a, p1: s.b, w: 0.0011 + 0.0016 * Math.pow(s.leaves / crk.leaves[0], 0.5), g0: s.d0 / crk.maxDist, g1: s.d1 / crk.maxDist, tok: T['ember'], glowR: 0.01, glowAmt: 0.55, gen: s.gen, rnd: s.primary }));
  W.crackLines = R.system('lines', { data: lineBuf(cl), glsl: LINES_BASIC });

  W.lineBuf = lineBuf;
  return W;
}

// Tree = the crack, stood upright on the seed (crown up, roots down).
export function treeFromCrack(crk, seedPlate, { scale = 1.05, sx = 1.18, base = [0, -0.34, 0] } = {}) {
  // main direction: seed → mean of crown nodes (primary 0)
  let mx = 0, my = 0, n = 0;
  crk.segs.forEach((s) => { if (s.primary === 0) { mx += s.b[0] - seedPlate.c[0]; my += s.b[1] - seedPlate.c[1]; n++; } });
  const ang = Math.PI / 2 - Math.atan2(my / n, mx / n);
  const xf = (p) => {
    const v = [p[0] - seedPlate.c[0], p[1] - seedPlate.c[1]];
    const r = [v[0] * Math.cos(ang) - v[1] * Math.sin(ang), v[0] * Math.sin(ang) + v[1] * Math.cos(ang)];
    return [base[0] + r[0] * scale * sx, base[1] + r[1] * scale, base[2]];
  };
  return { xf, ang };
}

export { lineBuf };
export const rngFor = (s) => mulberry32(s);

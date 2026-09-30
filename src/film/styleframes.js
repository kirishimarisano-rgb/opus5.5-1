// Checkpoint-2 style frames: two per act. These use the same systems the film will use.
import * as G from './geometry.js';
import { T } from './tokens.js';
import { camera, ortho } from '../engine/math.js';
import { buildFinals, finalDraws, seedSystems, modelMat, HORIZON } from './finals.js';

const PANE_SNIPPET = /* glsl */ `
// uP0.x = tau (story seconds since impact; <0 = intact), uP1.xy = impact point, uP1.z = seed shard id, uP1.w = edge glow
void shard(vec2 l, vec2 c, float id, vec4 r, out mat4 M, out vec4 tint, out float eg, out float a){
  float tau = max(uP0.x, 0.);
  vec2 d = c - uP1.xy; float dist = length(d) + 1e-3; vec2 dir = d/dist;
  bool seed = abs(id - uP1.z) < 0.5;
  float k = 1.3;
  float travel = (1. - exp(-tau*k))/k;
  float v = seed ? 0.05 : 0.32*(0.35 + r.x)/(0.35 + dist*2.2);
  vec3 off = vec3(dir*v, (0.25 + 0.9*r.y)*v*1.4) * travel;
  float spin = seed ? 0.2 : (0.6 + 2.2*r.w)/(0.4+dist*2.);
  mat3 Rm = rotAxis(vec3(r.y-0.5, r.z-0.5, 0.25*(r.x-0.5)), spin*travel*3.);
  M = mat4(vec4(Rm[0],0.), vec4(Rm[1],0.), vec4(Rm[2],0.), vec4(vec3(c,0.) + off, 1.));
  tint = vec4(1.); eg = uP1.w*exp(-tau*0.7)*smoothstep(0.45, 0.08, dist)*(uP0.x >= 0. ? 1. : 0.); a = uP0.y;
}`;

export function buildStyle(R, W) {
  const S = { F: buildFinals(R, W) };
  S.pane = R.makeView('pane', 2048, 2048);
  const square = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  S.paneQuad = R.system('shards', { data: G.shardVertices([square]), glsl: PANE_SNIPPET });
  const polys = [...W.shatter.cells.map((c) => c.poly), W.shatter.seedShard.poly];
  S.seedId = polys.length - 1;
  S.shards = R.system('shards', { data: G.shardVertices(polys, 41), glsl: PANE_SNIPPET });
  S.seedSys = seedSystems(R, W);
  return S;
}

// Act I/II pane content (ortho, pane space). zoom/center = in-pane camera.
function renderPane(R, W, S, { bright = 0.42, growth = 1, crack = -1, slip = 0, zoom = 1, center = [0, 0] }) {
  const h = 0.5 / zoom;
  const cam = { vp: ortho(center[0] - h, center[0] + h, center[1] - h, center[1] + h), proj: 2048 * zoom, eye: [center[0], center[1], 5] };
  const sd = W.flake.seed;
  const lineU = (G_, i, w, tok = -1) => ({ uP0: [G_, i, 0, tok], uP1: [w, 0, 1, 0], uP2: [0.006 * slip, -0.004 * slip, 0.061 * slip, 0], uP3: [sd.c[0], sd.c[1], 0, 0] });
  const draws = [
    { sys: W.paneBg, blend: 'over', u: { uP0: [1, bright, 0, 0] } },
    // frost: lit, not glowing — one thin stroke, no halo
    { sys: W.flakeLines, blend: 'max', u: lineU(growth, 0.75, 0.9, T['ice-1']) },
  ];
  if (crack >= 0) draws.push({ sys: W.crackLines, blend: 'max', u: lineU(crack, 1.0, 1.5) });
  return R.renderView({ view: S.pane, cam, clear: [0, 0, 0], draws });
}

const mainCam = (R, eye = [0, 0, 2.3325], target = [0, 0, 0], fov = 30) => camera({ eye, target, fovY: fov * Math.PI / 180, width: R.W, height: R.H });

export const FRAMES = {
  // I-b: the snowflake growing on the melody; subtitle 1 set vertically in the right margin
  '1a_theme': (R, W, S) => {
    const tex = renderPane(R, W, S, { bright: 0.4, growth: 0.42 });
    const d = [{ sys: S.paneQuad, blend: 'over', u: { uTex: { tex, unit: 0 }, uP0: [-1, 1, 0, 0], uP1: [0, 0, -1, 0], uEdgeTok: T['ice-0'], uSheen: 0 } }];
    return { draws: d, cam: mainCam(R), post: { sat: 1.0 }, text: { s: '一切，從秩序開始。', tok: 'text-ice', x: 1680, y: 300 } };
  },
  // I-c: inside the 1:1 — the camera moves, the window does not
  '1b_crystal': (R, W, S) => {
    const tex = renderPane(R, W, S, { bright: 0.42, growth: 1, zoom: 3.2, center: [0.2, 0.12] });
    return { draws: [{ sys: S.paneQuad, blend: 'over', u: { uTex: { tex, unit: 0 }, uP0: [-1, 1, 0, 0], uP1: [0, 0, -1, 0], uEdgeTok: T['ice-0'], uSheen: 0 } }], cam: mainCam(R), post: { sat: 1.0 } };
  },
  // II-b: the seed has slipped; the only foreign hue creeps out of it
  '2a_crack': (R, W, S) => {
    const tex = renderPane(R, W, S, { bright: 0.4, growth: 1, crack: 0.55, slip: 1 });
    return { draws: [{ sys: S.paneQuad, blend: 'over', u: { uTex: { tex, unit: 0 }, uP0: [-1, 1, 0, 0], uP1: [0, 0, -1, 0], uEdgeTok: T['ice-0'], uSheen: 0 } }], cam: mainCam(R), post: { sat: 1.25 } };
  },
  // II-d: impact, 0.45 s of story time into the slow motion — glow moment #1
  '2b_impact': (R, W, S) => {
    const tex = renderPane(R, W, S, { bright: 0.4, growth: 1, crack: 1, slip: 1 });
    const sd = W.flake.seed.c;
    return {
      draws: [{ sys: S.shards, blend: 'over', u: { uTex: { tex, unit: 0 }, uP0: [0.45, 1, 0, 0], uP1: [sd[0], sd[1], S.seedId, 0.7], uEdgeTok: T['ember'], uSheenTok: T['ice-0'], uSheen: 0.3 } }],
      cam: mainCam(R, [0.05, -0.02, 2.2], [0.03, -0.02, 0], 32), post: { sat: 1.3, bloom: 0.06, bloomThreshold: 0.55 },
    };
  },
  // III-a: after the silence — the seed alone, its seam the first thing to light
  '3a_ember': (R, W, S) => {
    const M = modelMat(0, HORIZON, 0, 0.061 + S.F.tree.ang, S.F.tree.sc);
    const d = [
      { sys: S.F.river, count: 2500, u: { uP0: [0.25, 0, 0, 0] } },
      { sys: S.seedSys.fill, blend: 'over', u: { uModel: M, uP0: [0.25, 0, 0, 0], uEdgeTok: T['azure-0'], uSheenTok: T['azure-0'], uSheen: 0.15 } },
      { sys: S.seedSys.lines, blend: 'max', count: 6, u: { uModel: M, uP0: [99, 0.35, 0, T['ash-1']], uP1: [0.8, 0, 1, 0] } },
      { sys: S.seedSys.seam, blend: 'max', u: { uModel: M, uP0: [99, 0.8, 0, T['gold-1']], uP1: [0.8, 0, 1, 0] } },
    ];
    return { draws: d, cam: mainCam(R, [0.16, HORIZON + 0.012, 0.6], [0.16, HORIZON, 0], 30), post: { sat: 0.7 }, text: { s: '但生命，選擇逆流。', tok: 'text-gold', x: 1560, y: 330 } };
  },
  // III-e: climax, 2.39:1 — final shape A
  '3b_climax': (R, W, S) => {
    const lb = (1080 - 1920 / 2.39) / 2;
    return { draws: finalDraws(S.F, W, 'A', 3), cam: mainCam(R, [0, -0.26, 2.3], [0, 0.08, 0]), post: { sat: 1.0, matte: [0, lb, 1920, 1080 - lb] } };
  },
};

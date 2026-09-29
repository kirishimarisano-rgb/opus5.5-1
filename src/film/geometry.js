// Deterministic geometry for 《熵》. All shapes live in "pane space":
// the 1:1 pane is the square [-0.5, 0.5]², y up.
import { mulberry32 } from '../engine/math.js';

const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const addv = (a, b) => [a[0] + b[0], a[1] + b[1]];
const len = (a) => Math.hypot(a[0], a[1]);

// ---------------------------------------------------------------------------
// Snowflake: a six-fold dendrite. Returns line segments + hexagonal plates.
// `growth` of each element ∈ [0,1] = when the growth front reaches it.
export function snowflake(seed = 7) {
  const rnd = mulberry32(seed);
  const R = 0.43;          // arm length
  const core = 0.055;      // central plate radius
  const arm = { segs: [], plates: [] };
  const S = (a, b, w, g0, g1, depth) => arm.segs.push({ a, b, w, g0, g1, depth });
  // main spine
  const steps = 28;
  for (let i = 0; i < steps; i++) {
    const r0 = core + (R - core) * (i / steps), r1 = core + (R - core) * ((i + 1) / steps);
    S([r0, 0], [r1, 0], 0.0042 * (1 - 0.55 * i / steps), r0 / R, r1 / R, 0);
  }
  // side branches (mirrored) at 60°, envelope → hexagonal silhouette, with growth-rhythm modulation
  const nodes = [0.095, 0.14, 0.18, 0.235, 0.275, 0.315, 0.35, 0.385];
  const mod = nodes.map(() => 0.7 + 0.3 * rnd());
  nodes.forEach((r, k) => {
    const L = Math.min(0.8 * r, 0.62 * (R - r)) * mod[k];
    if (L < 0.012) return;
    const dir = [Math.cos(Math.PI / 3), Math.sin(Math.PI / 3)];
    const n = Math.max(3, Math.round(L / 0.012));
    const w0 = 0.0028 * (0.5 + L / 0.3);
    for (let s = 0; s < n; s++) {
      const t0 = s / n, t1 = (s + 1) / n;
      const p0 = [r + dir[0] * L * t0, dir[1] * L * t0], p1 = [r + dir[0] * L * t1, dir[1] * L * t1];
      const g0 = (r + L * t0) / R, g1 = (r + L * t1) / R;
      S(p0, p1, w0 * (1 - 0.6 * t0), g0, g1, 1);
      // tertiary twigs off the side branch, parallel to the spine (60° from the branch)
      if (s > 0 && s % 3 === 0 && L * (1 - t0) > 0.04) {
        const q = p0, l2 = L * (1 - t0) * 0.42 * (0.6 + 0.4 * rnd());
        const d2 = [1, 0];
        const m = Math.max(2, Math.round(l2 / 0.012));
        for (let u = 0; u < m; u++) {
          const a = [q[0] + d2[0] * l2 * u / m, q[1] + d2[1] * l2 * u / m], b = [q[0] + d2[0] * l2 * (u + 1) / m, q[1] + d2[1] * l2 * (u + 1) / m];
          S(a, b, w0 * 0.45, g1 + (l2 * u / m) / R, g1 + (l2 * (u + 1) / m) / R, 2);
        }
      }
    }
    // small plate at some branch roots
    if (k % 3 === 1) arm.plates.push({ c: [r, 0], r: 0.013 + 0.006 * rnd(), g: r / R, kind: 'node' });
  });
  arm.plates.push({ c: [R * 0.985, 0], r: 0.011, g: 1, kind: 'tip' });

  // replicate: 6 rotations × mirror (y → -y) for off-axis elements
  const segs = [], plates = [];
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3;
    for (const s of arm.segs) {
      segs.push({ ...s, arm: k, a: rot(s.a, a), b: rot(s.b, a) });
      if (Math.abs(s.a[1]) > 1e-6 || Math.abs(s.b[1]) > 1e-6)
        segs.push({ ...s, arm: k, a: rot([s.a[0], -s.a[1]], a), b: rot([s.b[0], -s.b[1]], a) });
    }
    for (const p of arm.plates) plates.push({ ...p, arm: k, c: rot(p.c, a), rot: a });
  }
  // central hexagon plate + inner ring
  plates.push({ c: [0, 0], r: core, g: 0, kind: 'core', rot: 0, arm: -1 });
  plates.push({ c: [0, 0], r: core * 0.55, g: 0, kind: 'core', rot: Math.PI / 6, arm: -1 });

  // THE seed: node plate on arm 5 (pointing lower-right), closest to r≈0.235
  let seedIdx = -1, best = 1e9;
  plates.forEach((p, i) => { if (p.arm === 5 && p.kind === 'node') { const d = Math.abs(len(p.c) - 0.235); if (d < best) { best = d; seedIdx = i; } } });
  const seedPlate = plates[seedIdx];
  seedPlate.kind = 'seed';
  seedPlate.r = 0.028;
  return { segs, plates, seed: seedPlate, R };
}

export function hexOutline(c, r, a) {
  const pts = [];
  for (let i = 0; i < 6; i++) pts.push(addv(c, rot([r, 0], a + i * Math.PI / 3)));
  return pts;
}

// ---------------------------------------------------------------------------
// Crack: a branching fracture that starts inside the seed hex.
// Returns nodes {p, parent, dist (path length from root), gen} and segments.
export function crack(seedPlate, seed = 16) {
  const rnd = mulberry32(seed);
  const nodes = [{ p: seedPlate.c.slice(), parent: -1, dist: 0, gen: 0, dir: 0 }];
  const inside = (p) => Math.abs(p[0]) < 0.498 && Math.abs(p[1]) < 0.498;
  const step = 0.011;
  const toCenter = Math.atan2(-seedPlate.c[1], -seedPlate.c[0]);
  // two primary fronts: across the flake's heart (→ crown), and toward the near edge (→ roots)
  const fronts = [
    { from: 0, dir: toCenter + 0.18, gen: 0, budget: 1.2 },
    { from: 0, dir: toCenter + Math.PI - 0.25, gen: 0, budget: 0.5 },
  ];
  while (fronts.length) {
    const f = fronts.shift();
    let cur = f.from, dir = f.dir, travelled = 0;
    const maxLen = f.budget;
    while (travelled < maxLen) {
      if (rnd() < 0.1) dir += (rnd() - 0.5) * 0.7; // glass fractures: straight runs, sharp kinks
      dir += (rnd() - 0.5) * 0.06;
      const prev = nodes[cur];
      const L = step * (0.7 + 0.6 * rnd());
      const p = [prev.p[0] + Math.cos(dir) * L, prev.p[1] + Math.sin(dir) * L];
      if (!inside(p)) break;
      nodes.push({ p, parent: cur, dist: prev.dist + L, gen: f.gen, dir });
      cur = nodes.length - 1; travelled += L;
      const pBranch = [0.11, 0.09, 0.07, 0.05, 0.04][f.gen];
      if (f.gen < 5 && rnd() < pBranch && travelled > 0.03) {
        const side = rnd() < 0.5 ? -1 : 1;
        fronts.push({ from: cur, dir: dir + side * (0.45 + 0.45 * rnd()), gen: f.gen + 1, budget: (maxLen - travelled) * (0.25 + 0.3 * rnd()) + 0.03 });
      }
    }
  }
  const maxDist = Math.max(...nodes.map((n) => n.dist));
  // leaf counts → pipe-model widths (used when the crack becomes a tree)
  const kids = nodes.map(() => []);
  nodes.forEach((n, i) => { if (n.parent >= 0) kids[n.parent].push(i); });
  const leaves = new Array(nodes.length).fill(0);
  for (let i = nodes.length - 1; i >= 0; i--) leaves[i] = kids[i].length ? kids[i].reduce((a, k) => a + leaves[k], 0) : 1;
  const segs = [];
  nodes.forEach((n, i) => { if (n.parent >= 0) segs.push({ a: nodes[n.parent].p, b: n.p, i0: n.parent, i1: i, d0: nodes[n.parent].dist, d1: n.dist, gen: n.gen, leaves: leaves[i], root: fronts }); });
  // which primary front does each node belong to: walk up to the first child of the root
  const branchOf = nodes.map(() => 0);
  for (let i = 1; i < nodes.length; i++) { let j = i; while (nodes[j].parent > 0) j = nodes[j].parent; branchOf[i] = j; }
  const firstKids = kids[0];
  return { nodes, segs: segs.map((s) => ({ ...s, root: undefined, primary: firstKids.indexOf(branchOf[s.i1]) })), maxDist, leaves, kids };
}

// ---------------------------------------------------------------------------
// Voronoi shatter of the pane. Sites cluster around the crack and the seed.
export function shatter(crackGeo, seedPlate, seed = 23, count = 150) {
  const rnd = mulberry32(seed);
  const sites = [];
  const crackPts = crackGeo.nodes.map((n) => n.p);
  while (sites.length < count) {
    let p;
    const u = rnd();
    if (u < 0.55) { const c = crackPts[Math.floor(rnd() * crackPts.length)]; const r = 0.06 * Math.sqrt(rnd()), a = rnd() * 6.283; p = [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]; }
    else p = [rnd() - 0.5, rnd() - 0.5];
    if (Math.abs(p[0]) >= 0.5 || Math.abs(p[1]) >= 0.5) continue;
    if (Math.hypot(p[0] - seedPlate.c[0], p[1] - seedPlate.c[1]) < seedPlate.r * 2.4) continue; // keep the seed's cell clean
    sites.push(p);
  }
  const cells = sites.map((s) => {
    let poly = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    for (const o of sites) {
      if (o === s) continue;
      const m = [(s[0] + o[0]) / 2, (s[1] + o[1]) / 2], n = [o[0] - s[0], o[1] - s[1]];
      poly = clipHalf(poly, m, n);
      if (poly.length < 3) break;
    }
    return { site: s, poly };
  }).filter((c) => c.poly.length >= 3);
  // the seed hex is its own shard, cut out of whichever cells it overlaps
  const hex = hexOutline(seedPlate.c, seedPlate.r, seedPlate.rot);
  return { cells, seedShard: { site: seedPlate.c, poly: hex } };
}
function clipHalf(poly, m, n) { // keep points where (p-m)·n <= 0
  const out = [], f = (p) => (p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
    if (fa <= 0) out.push(a);
    if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

export function centroid(poly) {
  let x = 0, y = 0, A = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], c = a[0] * b[1] - b[0] * a[1];
    A += c; x += (a[0] + b[0]) * c; y += (a[1] + b[1]) * c;
  }
  A *= 0.5;
  return Math.abs(A) < 1e-12 ? poly[0] : [x / (6 * A), y / (6 * A)];
}

// Fan-triangulate polygons into the shard vertex format:
// [local.xy, center.xy, uv.xy, edgeDist, id, rnd.xyzw] per vertex.
export function shardVertices(polys, seed = 5) {
  const rnd = mulberry32(seed);
  const out = [];
  polys.forEach((poly, id) => {
    const c = centroid(poly);
    const r4 = [rnd(), rnd(), rnd(), rnd()];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
      const h = Math.abs(((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / L);
      for (const [p, e] of [[c, h], [a, 0], [b, 0]])
        out.push(p[0] - c[0], p[1] - c[1], c[0], c[1], p[0] + 0.5, p[1] + 0.5, e, id, ...r4);
    }
  });
  return new Float32Array(out);
}

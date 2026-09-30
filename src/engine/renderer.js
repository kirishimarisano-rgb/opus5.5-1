// 《熵》renderer: HDR scene views (particles / lines / shards) → bloom → grade → output.
// Everything is a pure function of the frame description handed to render().
import { compile, setUniforms, makeTarget, resolveTarget, makeVAO, makeTexture } from './gl.js';

export const NOISE_GLSL = /* glsl */ `
float hash11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec3 hash33(vec3 p3){ p3=fract(p3*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yxz+33.33); return fract((p3.xxy+p3.yxx)*p3.zyx); }
float vnoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  float n000=hash33(i).x, n100=hash33(i+vec3(1,0,0)).x, n010=hash33(i+vec3(0,1,0)).x, n110=hash33(i+vec3(1,1,0)).x;
  float n001=hash33(i+vec3(0,0,1)).x, n101=hash33(i+vec3(1,0,1)).x, n011=hash33(i+vec3(0,1,1)).x, n111=hash33(i+vec3(1,1,1)).x;
  return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y),f.z)*2.-1.; }
vec3 vnoise3(vec3 x){ return vec3(vnoise(x), vnoise(x+vec3(31.4,-7.1,12.9)), vnoise(x+vec3(-19.3,23.7,-5.2))); }
float sstep(float a,float b,float x){ float t=clamp((x-a)/(b-a),0.,1.); return t*t*t*(t*(t*6.-15.)+10.); }
float eoc(float t){ t=clamp(t,0.,1.); return 1.-(1.-t)*(1.-t)*(1.-t); }
mat3 rotAxis(vec3 a, float ang){ a=normalize(a); float s=sin(ang), c=cos(ang), oc=1.-c;
  return mat3(oc*a.x*a.x+c, oc*a.x*a.y+a.z*s, oc*a.z*a.x-a.y*s,
              oc*a.x*a.y-a.z*s, oc*a.y*a.y+c, oc*a.y*a.z+a.x*s,
              oc*a.z*a.x+a.y*s, oc*a.y*a.z-a.x*s, oc*a.z*a.z+c); }
`;

function header(nTok) {
  return `#version 300 es
precision highp float; precision highp int;
uniform vec3 uTok[${nTok}];
uniform float uTime, uFrame, uMinPx, uProj;
uniform mat4 uVP; uniform vec2 uRes; uniform vec3 uEye;
uniform vec4 uP0, uP1, uP2, uP3;
#define TOK(i) uTok[int(i)]
${NOISE_GLSL}
`;
}

const PARTICLE_VS = (body) => `
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 a0; layout(location=2) in vec4 a1; layout(location=3) in vec4 a2; layout(location=4) in vec4 a3;
out vec2 vQ; out vec3 vCol;
${body}
void main(){
  vec3 pos; float size; vec3 col; float alpha;
  particle(pos, size, col, alpha);
  vec4 clip = uVP*vec4(pos,1.);
  if(alpha<=1e-5 || clip.w<=0.02){ gl_Position=vec4(2.,2.,2.,1.); return; }
  alpha *= smoothstep(0.12, 0.45, clip.w); // no particles in the lens
  float px = size*uProj/clip.w;
  float pc = max(px, uMinPx);
  alpha *= (px*px)/(pc*pc);
  float R = pc*3.0;
  gl_Position = clip + vec4(aCorner*R*2.0/uRes*clip.w, 0., 0.);
  vQ = aCorner*3.0; vCol = col*alpha;
}`;
const PARTICLE_FS = `
in vec2 vQ; in vec3 vCol; out vec4 o;
void main(){ float g = max(exp(-0.5*dot(vQ,vQ)) - 0.0111, 0.)*1.0113; o = vec4(vCol*g, g*0.0); }`;

const LINE_VS = (body) => `
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 a0; layout(location=2) in vec4 a1; layout(location=3) in vec4 a2; layout(location=4) in vec4 a3;
flat out vec2 vS0; flat out vec2 vS1; flat out float vW; flat out float vG; flat out vec4 vCol; flat out float vGlowAmt;
${body}
void main(){
  vec3 p0, p1; float w, glow, glowAmt; vec3 col; float alpha;
  segment(p0, p1, w, col, alpha, glow, glowAmt);
  vec4 c0 = uVP*vec4(p0,1.), c1 = uVP*vec4(p1,1.);
  if(alpha<=1e-5 || c0.w<=0.02 || c1.w<=0.02){ gl_Position=vec4(2.,2.,2.,1.); return; }
  vec2 s0 = (c0.xy/c0.w*0.5+0.5)*uRes, s1 = (c1.xy/c1.w*0.5+0.5)*uRes;
  float wpx = w*uProj/(0.5*(c0.w+c1.w));
  float wc = max(wpx, 0.5*uMinPx);
  alpha *= wpx/wc;
  float gpx = min(glow*uProj/(0.5*(c0.w+c1.w)), 0.011*uRes.y);
  float E = wc + gpx*2.6 + 1.5;
  vec2 d = s1-s0; float L = length(d); vec2 dir = L>1e-4 ? d/L : vec2(1.,0.); vec2 n = vec2(-dir.y, dir.x);
  vec2 base = aCorner.x<0. ? s0 : s1;
  vec2 sp = base + dir*aCorner.x*E + n*aCorner.y*E;
  float z = aCorner.x<0. ? c0.z/c0.w : c1.z/c1.w;
  gl_Position = vec4(sp/uRes*2.-1., z, 1.);
  vS0=s0; vS1=s1; vW=wc; vG=max(gpx,1e-3); vCol=vec4(col, alpha); vGlowAmt=glowAmt;
}`;
const LINE_FS = `
flat in vec2 vS0; flat in vec2 vS1; flat in float vW; flat in float vG; flat in vec4 vCol; flat in float vGlowAmt;
uniform float uBlendOver; out vec4 o;
void main(){
  vec2 p = gl_FragCoord.xy; vec2 ba = vS1-vS0; float h = clamp(dot(p-vS0,ba)/max(dot(ba,ba),1e-6),0.,1.);
  float d = length(p-vS0-ba*h);
  float core = clamp(vW + 0.5 - d, 0., 1.);
  float glow = vGlowAmt*exp(-(d*d)/(vG*vG));
  float a = vCol.a*(core + glow);
  o = uBlendOver>0.5 ? vec4(vCol.rgb*vCol.a*core, vCol.a*core) : vec4(vCol.rgb*a, 0.);
}`;

const SHARD_VS = (body) => `
layout(location=0) in vec4 aPos;   // local.xy, center.xy
layout(location=1) in vec4 aUV;    // uv.xy, edgeDist, id
layout(location=2) in vec4 aRnd;
out vec2 vUV; out float vEdge; out vec3 vN; out vec3 vW; flat out vec4 vTint; flat out float vEdgeGlow; flat out float vAlpha; flat out float vId;
${body}
void main(){
  mat4 M; vec4 tint; float edgeGlow, alpha;
  shard(aPos.xy, aPos.zw, aUV.w, aRnd, M, tint, edgeGlow, alpha);
  vec4 wp = M*vec4(aPos.xy, 0., 1.);
  gl_Position = uVP*wp;
  vUV=aUV.xy; vEdge=aUV.z; vN=normalize(mat3(M)*vec3(0.,0.,1.)); vW=wp.xyz; vTint=tint; vEdgeGlow=edgeGlow; vAlpha=alpha; vId=aUV.w;
}`;
const SHARD_FS = (body) => `
in vec2 vUV; in float vEdge; in vec3 vN; in vec3 vW; flat in vec4 vTint; flat in float vEdgeGlow; flat in float vAlpha; flat in float vId;
uniform sampler2D uTex; uniform float uEdgeTok; uniform float uSheen; uniform float uSheenTok; out vec4 o;
${body}
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  c = shade(c, vUV, vId);
  c *= vTint.rgb;
  vec3 V = normalize(uEye - vW);
  vec3 N = faceforward(vN, -V, vN);
  vec3 L = normalize(vec3(-0.4, 0.8, 0.6));
  float spec = pow(max(dot(reflect(-L, N), V), 0.), 24.);
  float fres = pow(1. - abs(dot(N, V)), 3.);
  c += TOK(uSheenTok)*uSheen*(spec*1.4 + fres*0.25);
  float ew = fwidth(vEdge);
  float edge = exp(-vEdge/max(ew*2.2, 1e-5));
  c += TOK(uEdgeTok)*vEdgeGlow*edge*1.5;
  float a = vAlpha*vTint.a;
  o = vec4(c*a, a);
}`;

const FS_QUAD_VS = `#version 300 es
layout(location=0) in vec2 aCorner; out vec2 vUv;
void main(){ vUv = aCorner*0.5+0.5; gl_Position = vec4(aCorner,0.,1.); }`;

const COMBINE_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uA, uB; out vec4 o;
void main(){ o = vec4(texture(uA,vUv).rgb + texture(uB,vUv).rgb, 1.); }`;

const BLOOM_DOWN_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uPrefilter, uThreshold; out vec4 o;
vec3 s(vec2 d){ return texture(uSrc, vUv + d*uTexel).rgb; }
void main(){
  vec3 a=s(vec2(-2,2)),b=s(vec2(0,2)),c=s(vec2(2,2)),d=s(vec2(-2,0)),e=s(vec2(0,0)),f=s(vec2(2,0)),g=s(vec2(-2,-2)),h=s(vec2(0,-2)),i=s(vec2(2,-2));
  vec3 j=s(vec2(-1,1)),k=s(vec2(1,1)),l=s(vec2(-1,-1)),m=s(vec2(1,-1));
  vec3 r = e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+k+l+m)*0.125;
  if(uPrefilter>0.5){ float br=max(r.r,max(r.g,r.b)); float soft=clamp(br-uThreshold+0.5,0.,1.); soft=soft*soft*0.5; float w=max(soft, br-uThreshold)/max(br,1e-4); r*=max(w,0.); }
  o = vec4(r,1.);
}`;
const BLOOM_UP_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uSrc, uBase; uniform vec2 uTexel; uniform float uRadius; out vec4 o;
vec3 s(vec2 d){ return texture(uSrc, vUv + d*uTexel*uRadius).rgb; }
void main(){
  vec3 r = s(vec2(0,0))*4. + (s(vec2(-1,0))+s(vec2(1,0))+s(vec2(0,1))+s(vec2(0,-1)))*2. + s(vec2(-1,-1))+s(vec2(1,-1))+s(vec2(-1,1))+s(vec2(1,1));
  o = vec4(texture(uBase,vUv).rgb + r/16., 1.);
}`;

const COMPOSITE_FS = (nTok, ss) => `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uBloom, uText;
uniform vec3 uTok[${nTok}];
uniform vec2 uOut; uniform float uExposure, uBloomAmt, uSat, uVignette, uGrain, uFrame, uFlip, uFade;
uniform vec4 uMatte;   // x0,y0,x1,y1 in output pixels (visible rect)
uniform float uMatteTok;
float hash(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.x+p.y)*p.z); }
vec3 tone(vec3 c){ // linear below knee (tokens stay true), soft shoulder above
  const float k = 0.78;
  vec3 x = max(c - k, 0.);
  return min(c, vec3(k)) + (1.-k)*(1.-exp(-x/(1.-k)));
}
vec3 toSRGB(vec3 c){ c=clamp(c,0.,1.); return mix(c*12.92, 1.055*pow(c,vec3(1./2.4))-0.055, step(0.0031308,c)); }
void main(){
  vec2 px = gl_FragCoord.xy; if(uFlip>0.5) px.y = uOut.y - px.y;
  vec2 uv = px/uOut;
  vec3 bl = texture(uBloom, uv).rgb*uBloomAmt;
  vec3 acc = vec3(0.);
  ivec2 base = ivec2(floor(px))*${ss};
  for(int y=0;y<${ss};y++) for(int x=0;x<${ss};x++){
    vec3 c = texelFetch(uScene, base+ivec2(x,y), 0).rgb;
    acc += tone((c + bl)*uExposure);
  }
  vec3 c = acc/float(${ss * ss});
  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  c = max(mix(vec3(l), c, uSat), 0.);
  vec2 q = uv-0.5; q.x *= uOut.x/uOut.y;
  c *= 1. - uVignette*smoothstep(0.35, 1.05, length(q));
  // matte (letterbox / slit) with 1px analytic AA
  float mx = clamp(min(px.x-uMatte.x, uMatte.z-px.x)+0.5, 0., 1.);
  float my = clamp(min(px.y-uMatte.y, uMatte.w-px.y)+0.5, 0., 1.);
  c = mix(uTok[int(uMatteTok)], c, mx*my);
  vec4 t = texture(uText, vec2(uv.x, 1.-uv.y));
  c = c*(1.-t.a) + pow(t.rgb, vec3(2.2));
  c *= uFade;
  vec3 s = toSRGB(c);
  float n = hash(vec3(px, uFrame)) + hash(vec3(px+17.3, uFrame*1.37)) - 1.0; // triangular dither
  float g = (hash(vec3(px*0.5, uFrame+3.1))-0.5)*uGrain*(0.35+0.65*sqrt(l+0.02));
  s += n/255. + g;
  o = vec4(s, 1.);
}`;

export class Renderer {
  constructor(canvas, { tokens, outW = 1920, outH = 1080, ss = 2, msaa = 4, minPx = 0.9 }) {
    this.canvas = canvas;
    canvas.width = outW; canvas.height = outH;
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    gl.getExtension('EXT_float_blend');
    this.gl = gl; this.tokens = tokens; this.nTok = tokens.length / 3;
    this.outW = outW; this.outH = outH; this.ss = ss; this.msaa = msaa; this.minPx = minPx;
    this.W = outW * ss; this.H = outH * ss;
    this.quad = makeVAO(gl, { quad: true });
    this.views = {};
    this.main = this.makeView('main', this.W, this.H);
    this.combine = compile(gl, FS_QUAD_VS, COMBINE_FS, 'combine');
    this.down = compile(gl, FS_QUAD_VS, BLOOM_DOWN_FS, 'bloom-down');
    this.up = compile(gl, FS_QUAD_VS, BLOOM_UP_FS, 'bloom-up');
    this.comp = compile(gl, FS_QUAD_VS, COMPOSITE_FS(this.nTok, ss), 'composite');
    this.bloom = [];
    let w = this.W, h = this.H;
    for (let i = 0; i < 7; i++) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); this.bloom.push({ d: makeTarget(gl, w, h), u: makeTarget(gl, w, h) }); }
    this.textTex = makeTexture(gl, outW, outH, { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE });
    this.blank = makeTexture(gl, 1, 1, { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE, data: new Uint8Array(4) });
  }

  makeView(name, w, h) {
    const gl = this.gl;
    const v = { name, w, h, color: makeTarget(gl, w, h, { samples: this.msaa }), max: makeTarget(gl, w, h), out: makeTarget(gl, w, h) };
    this.views[name] = v;
    return v;
  }

  // kind: 'particles' | 'lines' | 'shards'
  system(kind, { glsl, fsGlsl = '', data, count }) {
    const gl = this.gl, H = header(this.nTok);
    let prog, vao, n;
    if (kind === 'particles') {
      prog = compile(gl, H + PARTICLE_VS(glsl), H + PARTICLE_FS, 'particles');
      vao = makeVAO(gl, { quad: true, instanceData: data, instanceLayout: [[1, 4], [2, 4], [3, 4], [4, 4]] });
      n = count ?? data.length / 16;
    } else if (kind === 'lines') {
      prog = compile(gl, H + LINE_VS(glsl), H + LINE_FS, 'lines');
      vao = makeVAO(gl, { quad: true, instanceData: data, instanceLayout: [[1, 4], [2, 4], [3, 4], [4, 4]] });
      n = count ?? data.length / 16;
    } else if (kind === 'shards') {
      prog = compile(gl, H + SHARD_VS(glsl), H + SHARD_FS(fsGlsl || 'vec3 shade(vec3 c, vec2 uv, float id){ return c; }'), 'shards');
      vao = makeVAO(gl, { quad: false, vertexData: data, vertexLayout: [[0, 4], [1, 4], [2, 4]] });
      n = count ?? data.length / 12;
    }
    return { kind, prog, vao, n };
  }

  // Render a view: { view, cam:{vp,proj,eye}, clear:[r,g,b], draws:[{sys, blend:'add'|'over'|'max', u:{...}}], time, frame }
  renderView({ view, cam, clear = [0, 0, 0], draws, time = 0, frame = 0 }) {
    const gl = this.gl;
    const common = {
      uTok: { vec3array: this.tokens }, uTime: time, uFrame: frame, uMinPx: this.minPx * (view === this.main ? this.ss : 1),
      uProj: cam.proj, uVP: cam.vp, uRes: [view.w, view.h], uEye: cam.eye || [0, 0, 5],
      uModel: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    };
    gl.viewport(0, 0, view.w, view.h);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    // colour target (MSAA)
    gl.bindFramebuffer(gl.FRAMEBUFFER, view.color.drawFbo);
    gl.clearColor(clear[0], clear[1], clear[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    for (const d of draws) if (d.blend !== 'max') this.#draw(d, common);
    resolveTarget(gl, view.color);
    // max target: union of glowing strokes without joint doubling
    gl.bindFramebuffer(gl.FRAMEBUFFER, view.max.fbo);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    for (const d of draws) if (d.blend === 'max') this.#draw(d, common);
    gl.disable(gl.BLEND);
    // combine
    gl.bindFramebuffer(gl.FRAMEBUFFER, view.out.fbo);
    gl.useProgram(this.combine.program);
    setUniforms(gl, this.combine, { uA: { tex: view.color.tex, unit: 0 }, uB: { tex: view.max.tex, unit: 1 } });
    gl.bindVertexArray(this.quad.vao); gl.drawArrays(gl.TRIANGLES, 0, 6);
    return view.out.tex;
  }

  #draw(d, common) {
    const gl = this.gl, s = d.sys;
    if (!s || s.n === 0 || d.skip) return;
    gl.useProgram(s.prog.program);
    const blend = d.blend || (s.kind === 'shards' ? 'over' : 'add');
    if (blend === 'max') { gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE); }
    else if (blend === 'add') { gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE); }
    else { gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); }
    setUniforms(gl, s.prog, { uP0: [0, 0, 0, 0], uP1: [0, 0, 0, 0], uP2: [0, 0, 0, 0], uP3: [0, 0, 0, 0], uBlendOver: blend === 'over' ? 1 : 0, ...common, ...d.u });
    gl.bindVertexArray(s.vao.vao);
    if (s.kind === 'shards') gl.drawArrays(gl.TRIANGLES, 0, s.n);
    else gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, d.count ?? s.n);
    gl.blendEquation(gl.FUNC_ADD);
  }

  dataTexture(data, w, h) { // RGBA32F, nearest — for node graphs sampled in vertex shaders
    const gl = this.gl;
    return makeTexture(gl, w, h, { internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, filter: gl.NEAREST, data });
  }

  setText(source) { // source: canvas / ImageBitmap at output res, or null
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.textTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.hasText = !!source;
  }

  // post: { exposure, bloom, bloomThreshold, bloomRadius, sat, vignette, grain, matte:[x0,y0,x1,y1], fade, flip }
  finish(sceneTex, post, frame = 0) {
    const gl = this.gl;
    // bloom chain
    let src = sceneTex, sw = this.W, sh = this.H;
    gl.useProgram(this.down.program);
    gl.bindVertexArray(this.quad.vao);
    this.bloom.forEach((lvl, i) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, lvl.d.fbo); gl.viewport(0, 0, lvl.d.w, lvl.d.h);
      setUniforms(gl, this.down, { uSrc: { tex: src, unit: 0 }, uTexel: [1 / sw, 1 / sh], uPrefilter: i === 0 ? 1 : 0, uThreshold: post.bloomThreshold ?? 0.9 });
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      src = lvl.d.tex; sw = lvl.d.w; sh = lvl.d.h;
    });
    gl.useProgram(this.up.program);
    let upSrc = this.bloom[this.bloom.length - 1].d.tex;
    for (let i = this.bloom.length - 2; i >= 0; i--) {
      const lvl = this.bloom[i], below = this.bloom[i + 1];
      gl.bindFramebuffer(gl.FRAMEBUFFER, lvl.u.fbo); gl.viewport(0, 0, lvl.u.w, lvl.u.h);
      setUniforms(gl, this.up, { uSrc: { tex: upSrc, unit: 0 }, uBase: { tex: lvl.d.tex, unit: 1 }, uTexel: [1 / below.d.w, 1 / below.d.h], uRadius: post.bloomRadius ?? 1 });
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      upSrc = lvl.u.tex;
    }
    // composite to canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.outW, this.outH);
    gl.useProgram(this.comp.program);
    setUniforms(gl, this.comp, {
      uScene: { tex: sceneTex, unit: 0 }, uBloom: { tex: upSrc, unit: 1 }, uText: { tex: this.hasText ? this.textTex : this.blank, unit: 2 },
      uTok: { vec3array: this.tokens }, uOut: [this.outW, this.outH],
      uExposure: post.exposure ?? 1, uBloomAmt: post.bloom ?? 0.1, uSat: post.sat ?? 1, uVignette: post.vignette ?? 0.25,
      uGrain: post.grain ?? 0.01, uFrame: frame % 997, uFlip: post.flip ? 1 : 0, uFade: post.fade ?? 1,
      uMatte: post.matte ?? [0, 0, this.outW, this.outH], uMatteTok: post.matteTok ?? 0,
    });
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  readPixels(buf) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, this.outW, this.outH, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
  }
}

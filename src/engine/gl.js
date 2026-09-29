// Minimal WebGL2 helpers.

export function compile(gl, vsSrc, fsSrc, label = '') {
  const mk = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const numbered = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
      throw new Error(`[${label}] shader compile failed:\n${log}\n${numbered}`);
    }
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`[${label}] link failed: ${gl.getProgramInfoLog(p)}`);
  const uniforms = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    uniforms[name] = gl.getUniformLocation(p, info.name);
  }
  return { program: p, uniforms, label };
}

// Set uniforms from a plain object; types inferred from value shape.
export function setUniforms(gl, prog, values) {
  for (const k in values) {
    const loc = prog.uniforms[k];
    if (loc == null) continue;
    const v = values[k];
    if (typeof v === 'number') gl.uniform1f(loc, v);
    else if (v && v.tex) { gl.activeTexture(gl.TEXTURE0 + v.unit); gl.bindTexture(gl.TEXTURE_2D, v.tex); gl.uniform1i(loc, v.unit); }
    else if (v && v.int !== undefined) gl.uniform1i(loc, v.int);
    else if (Array.isArray(v) && v.length === 16) gl.uniformMatrix4fv(loc, false, v);
    else if (v.length === 2) gl.uniform2fv(loc, v);
    else if (v.length === 3) gl.uniform3fv(loc, v);
    else if (v.length === 4) gl.uniform4fv(loc, v);
    else if (v.length === 16) gl.uniformMatrix4fv(loc, false, v);
    else if (v.vec3array) gl.uniform3fv(loc, v.vec3array);
    else if (v.vec4array) gl.uniform4fv(loc, v.vec4array);
    else if (v.floatarray) gl.uniform1fv(loc, v.floatarray);
  }
}

export function makeTexture(gl, w, h, { internal = gl.RGBA16F, format = gl.RGBA, type = gl.HALF_FLOAT, filter = gl.LINEAR, data = null } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

// Render target: texture + fbo; optional MSAA renderbuffer resolved into the texture.
export function makeTarget(gl, w, h, { samples = 0, internal = gl.RGBA16F } = {}) {
  const tex = makeTexture(gl, w, h, { internal });
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const target = { w, h, tex, fbo, drawFbo: fbo, samples };
  if (samples > 0) {
    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, internal, w, h);
    const msFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, msFbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
    target.drawFbo = msFbo;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return target;
}

export function resolveTarget(gl, t) {
  if (!t.samples) return;
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.drawFbo);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.fbo);
  gl.blitFramebuffer(0, 0, t.w, t.h, 0, 0, t.w, t.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
}

// Instanced attribute buffer: data is Float32Array, layout = [[loc, size], ...] interleaved.
export function makeVAO(gl, { quad = true, instanceData = null, instanceLayout = [], vertexData = null, vertexLayout = [] }) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const bufs = [];
  const bindInterleaved = (data, layout, divisor) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = layout.reduce((a, [, s]) => a + s, 0) * 4;
    let off = 0;
    for (const [loc, size] of layout) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
      gl.vertexAttribDivisor(loc, divisor);
      off += size * 4;
    }
    bufs.push(b);
  };
  if (quad) bindInterleaved(new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), [[0, 2]], 0);
  if (vertexData) bindInterleaved(vertexData, vertexLayout, 0);
  if (instanceData) bindInterleaved(instanceData, instanceLayout, 1);
  gl.bindVertexArray(null);
  return { vao, bufs };
}

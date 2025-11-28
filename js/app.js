/*
  Art Morph — GPU fractal & ornaments prototype
  - WebGL1 fragment shader renders animated Julia fractal
  - Palettes inspired by Khokhloma (reds/gold) and Gzhel (blue/white) + rainbow
  - Interactive: zoom, pan, rotation, iterations, speed, palette; mouse & touch
  - Responsive HiDPI canvas with context loss handling
*/

(() => {
  const $ = (sel) => document.querySelector(sel);
  const canvas = document.getElementById('glcanvas');
  const fallbackEl = document.getElementById('gl-fallback');

  // UI elements
  const ui = {
    palette: $('#palette'),
    iterations: $('#iterations'),
    zoom: $('#zoom'),
    rotation: $('#rotation'),
    speed: $('#speed'),
    playPause: $('#playPause'),
    reset: $('#reset'),
    iterationsValue: $('#iterationsValue'),
    zoomValue: $('#zoomValue'),
    rotationValue: $('#rotationValue'),
    speedValue: $('#speedValue'),
  };

  // Initial view parameters
  const state = {
    palette: 0,
    maxIter: 200,
    scale: 1.0, // 1.0 = default view
    rotationDeg: 0,
    speed: 1.0,
    playing: true,
    center: { x: -0.2, y: 0.0 }, // a balanced view for Julia sets
  };

  // Base plane span (width) at scale=1.0; height is adjusted by aspect
  const BASE_SPAN = 3.0; // typical for Julia/Mandelbrot

  let gl = null;
  let program = null;
  let buffer = null;
  let attribs = {};
  let uniforms = {};
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let lastT = performance.now();
  let timeSec = 0; // accumulated time in seconds (paused respects state.playing)
  let needsRender = true;

  function createGL() {
    const options = { antialias: false, preserveDrawingBuffer: false, alpha: false, powerPreference: 'high-performance' };
    gl = canvas.getContext('webgl', options) || canvas.getContext('experimental-webgl', options);
    if (!gl) throw new Error('WebGL not supported');

    // Handle context loss/restoration
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      cancelAnimationFrame(rafId);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      initGL();
      needsRender = true;
      start();
    });
  }

  const VERT_SRC = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

  const FRAG_SRC = `
precision highp float;

uniform vec2 u_resolution;  // canvas size in pixels
uniform vec2 u_center;      // complex plane center
uniform float u_span;       // base span scaled by zoom (width of plane)
uniform float u_rotation;   // radians
uniform float u_time;       // seconds
uniform int u_maxIter;
uniform int u_palette;      // 0=Khokhloma,1=Gzhel,2=Rainbow

// Utility: rotate 2D vector
mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

// Convert HSV to RGB
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0., 2./6., 4./6.)) * 6. - 3.);
  vec3 rgb = clamp(p - 1., 0., 1.);
  return c.z * mix(vec3(1.), rgb, c.y);
}

// Khokhloma-inspired palette: deep reds to gold with black background
vec3 paletteKhokhloma(float t) {
  // Clamp and ease
  t = clamp(t, 0., 1.);
  // Color stops
  vec3 c0 = vec3(0.02, 0.0, 0.0);     // near black with hint of red
  vec3 c1 = vec3(0.35, 0.0, 0.02);    // deep crimson
  vec3 c2 = vec3(0.8, 0.15, 0.0);     // red-orange
  vec3 c3 = vec3(1.0, 0.65, 0.0);     // gold
  vec3 c4 = vec3(1.0, 0.9, 0.4);      // pale gold/white
  if (t < 0.25) return mix(c0, c1, smoothstep(0., 0.25, t));
  if (t < 0.5)  return mix(c1, c2, smoothstep(0.25, 0.5, t));
  if (t < 0.8)  return mix(c2, c3, smoothstep(0.5, 0.8, t));
  return mix(c3, c4, smoothstep(0.8, 1.0, t));
}

// Gzhel-inspired palette: deep blue to white porcelain
vec3 paletteGzhel(float t) {
  t = clamp(t, 0., 1.);
  vec3 c0 = vec3(0.02, 0.05, 0.12);   // near black/blue
  vec3 c1 = vec3(0.05, 0.25, 0.65);   // cobalt
  vec3 c2 = vec3(0.35, 0.55, 0.95);   // light blue
  vec3 c3 = vec3(0.92, 0.96, 1.0);    // porcelain white
  if (t < 0.4) return mix(c0, c1, smoothstep(0., 0.4, t));
  if (t < 0.75) return mix(c1, c2, smoothstep(0.4, 0.75, t));
  return mix(c2, c3, smoothstep(0.75, 1.0, t));
}

vec3 paletteRainbow(float t) {
  return hsv2rgb(vec3(fract(t + 0.0), 0.85, 1.0));
}

vec3 getPalette(float t, int which) {
  if (which == 0) return paletteKhokhloma(t);
  if (which == 1) return paletteGzhel(t);
  return paletteRainbow(t);
}

// Continuous coloring for Julia set
void main() {
  // Map pixel to complex plane, keeping aspect ratio
  vec2 uv = (gl_FragCoord.xy / u_resolution) * 2.0 - 1.0; // [-1,1]
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  uv.x *= aspect;

  // span defines width of plane; scale uv accordingly and rotate
  vec2 z = (rot(u_rotation) * uv) * (u_span * 0.5) + u_center;

  // Animate c over time to morph shapes
  float t = u_time * 0.25; // slow down a bit
  vec2 c = vec2(0.285 + 0.25*cos(t*1.7), 0.01 + 0.25*sin(t*1.2));

  // Iterate Julia: z = z^2 + c
  int maxIter = u_maxIter;
  float i;
  float trap = 1e9; // distance estimator trap (optional)
  for (i = 0.0; i < 2000.0; i++) {
    if (int(i) >= maxIter) break;
    // z^2 in complex
    vec2 z2 = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
    z = z2;
    float r2 = dot(z, z);
    trap = min(trap, abs(z.x) + abs(z.y));
    if (r2 > 256.0) break; // bailout
  }

  float colorT;
  if (int(i) >= maxIter) {
    // inside set: dark shade with trap coloring
    colorT = 0.0;
  } else {
    // Smooth iteration count
    float r = length(z);
    float nu = i - log2(log2(max(r, 1.001))) + 4.0;
    colorT = nu / float(maxIter);
  }

  // Subtle modulation by orbit trap to add detail
  colorT = clamp(colorT + 0.15 * exp(-3.0*trap), 0.0, 1.0);
  vec3 col = getPalette(colorT, u_palette);

  // Vignette for aesthetics
  float d = length(uv);
  float vig = smoothstep(1.2, 0.2, d);
  col *= mix(0.85, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}`;

  function compileShader(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('Shader compile error: ' + log);
    }
    return sh;
  }

  function createProgram(vsSrc, fsSrc) {
    const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'a_position');
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error('Program link error: ' + log);
    }
    return prog;
  }

  function initGL() {
    // Create program
    program = createProgram(VERT_SRC, FRAG_SRC);
    gl.useProgram(program);

    // Fullscreen quad
    const verts = new Float32Array([
      -1, -1,  1, -1,  -1,  1,
       1, -1,  1,  1,  -1,  1,
    ]);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    attribs.a_position = 0;
    gl.enableVertexAttribArray(attribs.a_position);
    gl.vertexAttribPointer(attribs.a_position, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    uniforms.u_resolution = gl.getUniformLocation(program, 'u_resolution');
    uniforms.u_center = gl.getUniformLocation(program, 'u_center');
    uniforms.u_span = gl.getUniformLocation(program, 'u_span');
    uniforms.u_rotation = gl.getUniformLocation(program, 'u_rotation');
    uniforms.u_time = gl.getUniformLocation(program, 'u_time');
    uniforms.u_maxIter = gl.getUniformLocation(program, 'u_maxIter');
    uniforms.u_palette = gl.getUniformLocation(program, 'u_palette');

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 1);
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const newDpr = Math.min(window.devicePixelRatio || 1, 2);
    if (newDpr !== dpr) dpr = newDpr;
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      needsRender = true;
    }
  }

  function updateUI() {
    ui.iterationsValue.textContent = String(state.maxIter);
    ui.zoomValue.textContent = state.scale.toFixed(2) + '×';
    ui.rotationValue.textContent = Math.round(state.rotationDeg) + '°';
    ui.speedValue.textContent = state.speed.toFixed(2) + '×';
  }

  function setUniforms() {
    gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.u_center, state.center.x, state.center.y);
    // span = BASE_SPAN * scale; adjust for aspect inside shader
    gl.uniform1f(uniforms.u_span, BASE_SPAN * state.scale);
    gl.uniform1f(uniforms.u_rotation, state.rotationDeg * Math.PI / 180);
    gl.uniform1f(uniforms.u_time, timeSec * state.speed);
    gl.uniform1i(uniforms.u_maxIter, state.maxIter|0);
    gl.uniform1i(uniforms.u_palette, state.palette|0);
  }

  function render() {
    if (!gl) return;
    resizeCanvas();
    gl.clear(gl.COLOR_BUFFER_BIT);
    setUniforms();
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  let rafId = 0;
  function loop(tNow) {
    const dt = (tNow - lastT) / 1000;
    lastT = tNow;
    if (state.playing) {
      timeSec += dt;
      needsRender = true;
    }
    if (needsRender) {
      render();
      needsRender = false;
    }
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    cancelAnimationFrame(rafId);
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  // UI wiring
  function bindUI() {
    ui.palette.addEventListener('input', (e) => {
      state.palette = parseInt(e.target.value, 10);
      needsRender = true; updateUI();
    });
    ui.iterations.addEventListener('input', (e) => {
      state.maxIter = parseInt(e.target.value, 10);
      needsRender = true; updateUI();
    });
    ui.zoom.addEventListener('input', (e) => {
      state.scale = parseFloat(e.target.value);
      needsRender = true; updateUI();
    });
    ui.rotation.addEventListener('input', (e) => {
      state.rotationDeg = parseFloat(e.target.value);
      needsRender = true; updateUI();
    });
    ui.speed.addEventListener('input', (e) => {
      state.speed = parseFloat(e.target.value);
      needsRender = true; updateUI();
    });
    ui.playPause.addEventListener('click', () => {
      state.playing = !state.playing;
      ui.playPause.textContent = state.playing ? 'Pause' : 'Play';
      ui.playPause.setAttribute('aria-pressed', String(state.playing));
      // Force a render when pausing to capture current frame
      needsRender = true;
    });
    ui.reset.addEventListener('click', () => {
      Object.assign(state, { palette: 0, maxIter: 200, scale: 1.0, rotationDeg: 0, speed: 1.0, playing: true, center: { x: -0.2, y: 0.0 } });
      ui.palette.value = String(state.palette);
      ui.iterations.value = String(state.maxIter);
      ui.zoom.value = String(state.scale);
      ui.rotation.value = String(state.rotationDeg);
      ui.speed.value = String(state.speed);
      ui.playPause.textContent = 'Pause';
      ui.playPause.setAttribute('aria-pressed', 'true');
      needsRender = true; updateUI();
    });
  }

  // Pointer interactions: pan, zoom, recenter
  let isPanning = false;
  let lastPointer = { x: 0, y: 0 };
  let pinch = { active: false, d0: 0, scale0: 1 };

  function screenToPlaneDelta(dx, dy) {
    const span = BASE_SPAN * state.scale;
    const aspect = canvas.width / Math.max(1, canvas.height);
    const planeDx = (dx / canvas.width) * span * aspect;
    const planeDy = -(dy / canvas.height) * span;
    const a = state.rotationDeg * Math.PI / 180;
    const ca = Math.cos(a), sa = Math.sin(a);
    // rotate delta by same rotation as view so dragging aligns with screen axes
    const rx = ca * planeDx - sa * planeDy;
    const ry = sa * planeDx + ca * planeDy;
    return { x: rx, y: ry };
  }

  function onPointerDown(x, y) {
    isPanning = true;
    lastPointer.x = x; lastPointer.y = y;
  }
  function onPointerMove(x, y) {
    if (!isPanning || pinch.active) return;
    const dx = x - lastPointer.x;
    const dy = y - lastPointer.y;
    lastPointer.x = x; lastPointer.y = y;
    const d = screenToPlaneDelta(dx, dy);
    state.center.x -= d.x;
    state.center.y -= d.y;
    needsRender = true;
  }
  function onPointerUp() { isPanning = false; }

  function onWheel(e) {
    e.preventDefault();
    const zoomFactor = Math.exp(-e.deltaY * 0.001);
    // Zoom towards cursor: adjust center to keep cursor position stable
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * dpr;
    const py = (e.clientY - rect.top) * dpr;
    // Compute plane coordinate before zoom
    const aspect = canvas.width / Math.max(1, canvas.height);
    const uvx = (px / canvas.width) * 2 - 1;
    const uvy = (py / canvas.height) * 2 - 1;
    const uv = { x: uvx * aspect, y: uvy };
    const a = state.rotationDeg * Math.PI / 180;
    const rx = Math.cos(a) * uv.x - Math.sin(a) * uv.y;
    const ry = Math.sin(a) * uv.x + Math.cos(a) * uv.y;
    const spanBefore = BASE_SPAN * state.scale;
    const worldBefore = { x: rx * (spanBefore * 0.5) + state.center.x, y: ry * (spanBefore * 0.5) + state.center.y };

    state.scale = Math.min(10, Math.max(0.1, state.scale / zoomFactor));
    ui.zoom.value = String(state.scale);

    const spanAfter = BASE_SPAN * state.scale;
    const worldAfter = { x: rx * (spanAfter * 0.5) + state.center.x, y: ry * (spanAfter * 0.5) + state.center.y };
    // Adjust center so the point under cursor stays fixed
    state.center.x += worldBefore.x - worldAfter.x;
    state.center.y += worldBefore.y - worldAfter.y;

    updateUI();
    needsRender = true;
  }

  function onDblClick(e) {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * dpr;
    const py = (e.clientY - rect.top) * dpr;
    const aspect = canvas.width / Math.max(1, canvas.height);
    const uv = { x: (px / canvas.width) * 2 - 1, y: (py / canvas.height) * 2 - 1 };
    uv.x *= aspect;
    const a = state.rotationDeg * Math.PI / 180;
    const rx = Math.cos(a) * uv.x - Math.sin(a) * uv.y;
    const ry = Math.sin(a) * uv.x + Math.cos(a) * uv.y;
    const span = BASE_SPAN * state.scale;
    state.center.x = rx * (span * 0.5) + state.center.x;
    state.center.y = ry * (span * 0.5) + state.center.y;
    needsRender = true;
  }

  // Touch: pinch to zoom, one-finger pan
  function distance(t0, t1) {
    const dx = t0.clientX - t1.clientX;
    const dy = t0.clientY - t1.clientY;
    return Math.hypot(dx, dy);
  }

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
      pinch.active = true;
      pinch.d0 = distance(e.touches[0], e.touches[1]);
      pinch.scale0 = state.scale;
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && !pinch.active) {
      onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
      const d1 = distance(e.touches[0], e.touches[1]);
      const factor = pinch.d0 / Math.max(1, d1);
      state.scale = Math.min(10, Math.max(0.1, pinch.scale0 * factor));
      ui.zoom.value = String(state.scale);
      updateUI();
      needsRender = true;
    }
  }, { passive: false });
  canvas.addEventListener('touchend', () => {
    pinch.active = false;
    onPointerUp();
  });

  // Mouse events
  canvas.addEventListener('mousedown', (e) => onPointerDown(e.clientX, e.clientY));
  window.addEventListener('mousemove', (e) => onPointerMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDblClick);

  window.addEventListener('resize', () => { needsRender = true; });

  function showFallback(msg) {
    if (fallbackEl) {
      fallbackEl.classList.remove('hidden');
      fallbackEl.textContent = msg || fallbackEl.textContent;
    }
  }

  // Boot
  function main() {
    try {
      createGL();
      initGL();
    } catch (err) {
      console.error(err);
      showFallback('WebGL failed to initialize: ' + err.message);
      return;
    }

    // Initialize UI defaults
    ui.palette.value = String(state.palette);
    ui.iterations.value = String(state.maxIter);
    ui.zoom.value = String(state.scale);
    ui.rotation.value = String(state.rotationDeg);
    ui.speed.value = String(state.speed);
    updateUI();
    bindUI();

    // Fit canvas to viewport initially
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    resizeCanvas();
    render();
    start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();

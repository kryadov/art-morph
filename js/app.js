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
  const overlay = document.getElementById('overlay2d');
  const overlayCtx = overlay ? overlay.getContext('2d') : null;
  const fallbackEl = document.getElementById('gl-fallback');

  // UI elements
  const ui = {
    controls: $('#controls'),
    fractal: $('#fractal'),
    palette: $('#palette'),
    iterations: $('#iterations'),
    zoom: $('#zoom'),
    rotation: $('#rotation'),
    speed: $('#speed'),
    playPause: $('#playPause'),
    reset: $('#reset'),
    recenter: $('#recenter'),
    iterationsValue: $('#iterationsValue'),
    zoomValue: $('#zoomValue'),
    rotationValue: $('#rotationValue'),
    speedValue: $('#speedValue'),
  };

  // Initial view parameters
  const state = {
    fractalType: 0, // 0=Julia,1=Sierpinski Triangle,2=Sierpinski Carpet
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
  let overlayNeedsRender = true;
  // State for stochastic overlay fractals (e.g., Barnsley fern)
  let fernState = { x: 0, y: 0, ready: false };

  // Settings panel visibility persistence key
  const LS_KEY_CONTROLS_HIDDEN = 'ui.controlsHidden';

  function setControlsHidden(hidden) {
    const el = ui.controls;
    if (!el) return;
    el.classList.toggle('hidden', !!hidden);
    el.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    try { localStorage.setItem(LS_KEY_CONTROLS_HIDDEN, hidden ? '1' : '0'); } catch (_) { /* ignore */ }
  }

  function getControlsHidden() {
    try { return localStorage.getItem(LS_KEY_CONTROLS_HIDDEN) === '1'; } catch (_) { return false; }
  }

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
uniform int u_fractalType;  // 0=Julia,1=Tri,2=Carpet

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

// Compute color for Julia set at point z0
vec3 colorJulia(vec2 z0) {
  vec2 z = z0;
  // Animate c over time to morph shapes
  float t = u_time * 0.25; // slow down a bit
  vec2 c = vec2(0.285 + 0.25*cos(t*1.7), 0.01 + 0.25*sin(t*1.2));

  int maxIter = u_maxIter;
  float i = 0.0;
  float trap = 1e9;
  for (int ii = 0; ii < 2000; ii++) {
    i = float(ii);
    if (ii >= maxIter) break;
    vec2 z2 = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
    z = z2;
    float r2 = dot(z, z);
    trap = min(trap, abs(z.x) + abs(z.y));
    if (r2 > 256.0) break;
  }

  float colorT;
  if (int(i) >= maxIter) {
    colorT = 0.0;
  } else {
    float r = length(z);
    float nu = i - log2(log2(max(r, 1.001))) + 4.0;
    colorT = nu / float(maxIter);
  }
  colorT = clamp(colorT + 0.15 * exp(-3.0*trap), 0.0, 1.0);
  return getPalette(colorT, u_palette);
}

// Sierpinski Triangle test using base-2 fractional folding
// Returns t in [0,1], where lower values indicate earlier removal (more hollow)
float sierpinskiTri(vec2 pNorm) {
  vec2 q = pNorm;
  float tLevel = 1.0;
  for (int ii = 0; ii < 1024; ii++) {
    if (ii >= u_maxIter) break;
    vec2 r = fract(q * 2.0);
    // In a unit triangle tiling, points with r.x + r.y > 1 are in the 'removed' central region
    if (r.x + r.y > 1.0) {
      tLevel = float(ii) / max(1.0, float(u_maxIter));
      return tLevel; // early removal
    }
    q = r;
  }
  return 1.0; // never removed => deepest level
}

// Sierpinski Carpet using base-3 digit test
float sierpinskiCarpet(vec2 pNorm) {
  vec2 q = pNorm;
  float tLevel = 1.0;
  for (int ii = 0; ii < 1024; ii++) {
    if (ii >= u_maxIter) break;
    vec2 r = fract(q * 3.0);
    if (r.x > 1.0/3.0 && r.x < 2.0/3.0 && r.y > 1.0/3.0 && r.y < 2.0/3.0) {
      tLevel = float(ii) / max(1.0, float(u_maxIter));
      return tLevel;
    }
    q = r;
  }
  return 1.0;
}

float isMiddleThird(float a) {
  return step(1.0/3.0, a) * step(a, 2.0/3.0);
}

// Menger Sponge membership depth using base-3 rule: removed if at any level, at least two axes in middle third
float mengerDepth(vec3 p) {
  vec3 q = p;
  for (int ii = 0; ii < 128; ii++) {
    if (ii >= u_maxIter) break;
    vec3 r = fract(q * 3.0);
    float midCount = isMiddleThird(r.x) + isMiddleThird(r.y) + isMiddleThird(r.z);
    if (midCount >= 2.0) {
      return float(ii) / max(1.0, float(u_maxIter));
    }
    q = r;
  }
  return 1.0;
}

// Sierpinski Pyramid (tetrahedral gasket) approximate rule: removed when x+y+y >1 in tri, generalized to 3D as sum > 1
float sierpinskiPyramidDepth(vec3 p) {
  vec3 q = p;
  for (int ii = 0; ii < 128; ii++) {
    if (ii >= u_maxIter) break;
    vec3 r = fract(q * 2.0);
    if (r.x + r.y + r.z > 1.0) {
      return float(ii) / max(1.0, float(u_maxIter));
    }
    q = r;
  }
  return 1.0;
}

// Plasma effect
vec3 colorPlasma(vec2 p) {
    float t = u_time * 0.5;
    float v = 0.0;
    v += sin(p.x * 8.0 + t);
    v += sin((p.y * 5.0 - t) * 2.0);
    v += sin((p.x + p.y + t) * 4.0);
    vec2 p2 = p * 2.0;
    v += sin(sqrt(p2.x*p2.x + p2.y*p2.y + 1.0) + t);
    v = v / 4.0;
    return getPalette(v, u_palette);
}

void main() {
  // Map pixel to complex plane, keeping aspect ratio
  vec2 uv = (gl_FragCoord.xy / u_resolution) * 2.0 - 1.0; // [-1,1]
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  uv.x *= aspect;

  // span defines width of plane; scale uv accordingly and rotate
  vec2 z = (rot(u_rotation) * uv) * (u_span * 0.5) + u_center;

  vec3 col;
  if (u_fractalType == 0) {
    col = colorJulia(z);
  } else if (u_fractalType == 1) {
    // Map to unit square roughly centered around current center/span
    vec2 pNorm = z / max(1e-6, u_span) + vec2(0.5);
    float tTri = sierpinskiTri(pNorm);
    float shade = 1.0 - tTri; // earlier removal = brighter
    col = getPalette(shade, u_palette);
  } else if (u_fractalType == 2) {
    vec2 pNorm = z / max(1e-6, u_span) + vec2(0.5);
    float tCar = sierpinskiCarpet(pNorm);
    float shade = 1.0 - tCar;
    col = getPalette(shade, u_palette);
  } else if (u_fractalType == 3) {
    // 3D: Menger Sponge slice; z varies over time to reveal layers
    vec2 pNorm2 = z / max(1e-6, u_span) + vec2(0.5);
    float zSlice = 0.5 + 0.45 * sin(u_time * 0.25);
    vec3 p3 = vec3(pNorm2, zSlice);
    float t = mengerDepth(p3);
    float shade = 1.0 - t;
    col = getPalette(shade, u_palette);
  } else if (u_fractalType == 4) {
    // 3D: Sierpinski Pyramid slice
    vec2 pNorm2 = z / max(1e-6, u_span) + vec2(0.5);
    float zSlice = 0.5 + 0.45 * sin(u_time * 0.22 + 1.0);
    vec3 p3 = vec3(pNorm2, zSlice);
    float t = sierpinskiPyramidDepth(p3);
    float shade = 1.0 - t;
    col = getPalette(shade, u_palette);
  } else if (u_fractalType == 10) {
    col = colorPlasma(z);
  } else {
    // Overlay-only types: neutral background
    col = vec3(0.0);
  }

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
    uniforms.u_fractalType = gl.getUniformLocation(program, 'u_fractalType');

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
      if (overlay) {
        overlay.width = w;
        overlay.height = h;
        overlayNeedsRender = true;
      }
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
    gl.uniform1i(uniforms.u_fractalType, state.fractalType|0);
  }

  // ----- Overlay 2D drawing (for line/tree/L-system fractals) -----
  function clearOverlay() {
    if (!overlayCtx || !overlay) return;
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  }

  function rot2(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [c, -s, s, c];
  }

  function applyMat2(m, v) { return { x: m[0]*v.x + m[1]*v.y, y: m[2]*v.x + m[3]*v.y }; }

  // Map normalized coords [0,1]x[0,1] to plane world point, mirroring shader mapping
  function worldFromNorm(nx, ny) {
    // Build uv in [-1,1]
    const aspect = canvas.width / Math.max(1, canvas.height);
    let uvx = (nx * 2 - 1) * aspect;
    let uvy = (ny * 2 - 1);
    const a = state.rotationDeg * Math.PI / 180;
    const m = rot2(a);
    const r = applyMat2(m, { x: uvx, y: uvy });
    const span = BASE_SPAN * state.scale;
    return { x: r.x * (span * 0.5) + state.center.x, y: r.y * (span * 0.5) + state.center.y };
  }

  // Map plane world point back to overlay pixel
  function planeToScreen(px, py) {
    const span = BASE_SPAN * state.scale;
    const a = state.rotationDeg * Math.PI / 180;
    const inv = rot2(-a);
    // Remove center
    const dx = px - state.center.x;
    const dy = py - state.center.y;
    const pre = applyMat2(inv, { x: dx / (span * 0.5), y: dy / (span * 0.5) });
    // Undo aspect scaling on x
    const aspect = canvas.width / Math.max(1, canvas.height);
    const uvx = pre.x / Math.max(1e-6, aspect);
    const uvy = pre.y;
    const sx = (uvx + 1) * 0.5 * canvas.width;
    const sy = (uvy + 1) * 0.5 * canvas.height;
    return { x: sx, y: sy };
  }

  function pathMoveToNorm(nx, ny) {
    const w = worldFromNorm(nx, ny);
    const s = planeToScreen(w.x, w.y);
    overlayCtx.moveTo(s.x, s.y);
  }
  function pathLineToNorm(nx, ny) {
    const w = worldFromNorm(nx, ny);
    const s = planeToScreen(w.x, w.y);
    overlayCtx.lineTo(s.x, s.y);
  }

  // Stochastic Barnsley fern (IFS) — overlay dots
  function drawFern(iter) {
    if (!overlayCtx) return;
    // Points per frame scales with iterations slider
    const pts = Math.max(2000, Math.min(40000, (iter|0) * 200));
    // Canonical fern bounding box
    const xmin = -2.1820, xmax = 2.6558; const w = xmax - xmin;
    const ymin = 0.0, ymax = 9.9983; const h = ymax - ymin;
    const s = 0.9; // occupy 90% of unit height
    const xscale = s * (w / h);
    const yscale = s;
    const offx = 0.5 - xscale * 0.5;
    const offy = 0.05; // bottom margin

    // Visuals
    const size = Math.max(1, Math.floor(1 * dpr));
    overlayCtx.save();
    overlayCtx.fillStyle = 'rgba(234,234,234,0.9)';

    // Initialize state once
    if (!fernState.ready) {
      fernState.x = 0; fernState.y = 0; fernState.ready = true;
    }
    let x = fernState.x, y = fernState.y;
    for (let i = 0; i < pts; i++) {
      const r = Math.random();
      let nx, ny;
      if (r < 0.01) {
        // Stem
        nx = 0;
        ny = 0.16 * y;
      } else if (r < 0.86) {
        // Successively smaller leaflets
        nx = 0.85 * x + 0.04 * y;
        ny = -0.04 * x + 0.85 * y + 1.6;
      } else if (r < 0.93) {
        // Largest left-hand leaflet
        nx = 0.20 * x - 0.26 * y;
        ny = 0.23 * x + 0.22 * y + 1.6;
      } else {
        // Largest right-hand leaflet
        nx = -0.15 * x + 0.28 * y;
        ny = 0.26 * x + 0.24 * y + 0.44;
      }
      x = nx; y = ny;

      // Map to normalized [0,1]
      const nnx = offx + ((x - xmin) / w) * xscale;
      const nny = offy + ((y - ymin) / h) * yscale;
      const wpt = worldFromNorm(nnx, nny);
      const spt = planeToScreen(wpt.x, wpt.y);
      overlayCtx.fillRect(spt.x, spt.y, size, size);
    }
    fernState.x = x; fernState.y = y;
    overlayCtx.restore();
  }

  function drawKoch(iter) {
    if (!overlayCtx) return;
    iter = Math.max(0, Math.min(6, iter|0));
    // Generate via L-system
    let str = 'F';
    for (let i = 0; i < iter; i++) {
      let next = '';
      for (const ch of str) {
        if (ch === 'F') next += 'F+F--F+F'; else next += ch;
      }
      str = next;
    }
    const angle = Math.PI / 3; // 60°
    let x = 0.1, y = 0.5, dir = 0;
    const len = 0.8 / Math.pow(3, iter);
    overlayCtx.save();
    overlayCtx.lineWidth = Math.max(1, Math.floor(2 * dpr));
    overlayCtx.strokeStyle = '#eaeaea';
    overlayCtx.beginPath();
    pathMoveToNorm(x, y);
    for (const ch of str) {
      if (ch === 'F') {
        x += Math.cos(dir) * len;
        y += Math.sin(dir) * len;
        pathLineToNorm(x, y);
      } else if (ch === '+') dir += angle; else if (ch === '-') dir -= angle;
    }
    overlayCtx.stroke();
    overlayCtx.restore();
  }

  function buildHilbertString(n) {
    let s = 'A';
    for (let i = 0; i < n; i++) {
      let next = '';
      for (const ch of s) {
        if (ch === 'A') next += '+BF-AFA-FB+';
        else if (ch === 'B') next += '-AF+BFB+FA-';
        else next += ch;
      }
      s = next;
    }
    return s;
  }

  // Classic Peano (3x3) curve via L-system
  function buildPeanoString(n) {
    let s = 'L';
    for (let i = 0; i < n; i++) {
      let next = '';
      for (const ch of s) {
        if (ch === 'L') next += 'LFRFL-F-RFLFR+F+LFRFL';
        else if (ch === 'R') next += 'RFLFR+F+LFRFL-F-RFLFR';
        else next += ch;
      }
      s = next;
    }
    return s;
  }

  function drawPeano(iter) {
    if (!overlayCtx) return;
    iter = Math.max(1, Math.min(5, iter|0));
    const s = buildPeanoString(iter - 1);
    const angle = Math.PI / 2;
    const len = 0.8 / Math.pow(3, iter - 1);
    let x = 0.1, y = 0.1, dir = 0; // start at bottom-left
    overlayCtx.save();
    overlayCtx.lineWidth = Math.max(1, Math.floor(2 * dpr));
    overlayCtx.strokeStyle = '#eaeaea';
    overlayCtx.beginPath();
    pathMoveToNorm(x, y);
    for (const ch of s) {
      if (ch === 'F') {
        x += Math.cos(dir) * len;
        y += Math.sin(dir) * len;
        pathLineToNorm(x, y);
      } else if (ch === '+') dir += angle; else if (ch === '-') dir -= angle;
    }
    overlayCtx.stroke();
    overlayCtx.restore();
  }

  function drawTree(iter) {
    if (!overlayCtx) return;
    iter = Math.max(1, Math.min(12, iter|0));
    const stack = [];
    const axiom = 'X';
    const rules = {
      'X': 'F-[[X]+X]+F[+FX]-X',
      'F': 'FF'
    };
    // Build string up to smaller iterations to avoid explosion
    let s = axiom;
    const maxI = Math.min(5, iter);
    for (let i = 0; i < maxI; i++) {
      let next = '';
      for (const ch of s) {
        next += (rules[ch] || ch);
      }
      s = next;
    }
    // Turtle
    let x = 0.5, y = 0.95, dir = -Math.PI/2; // start at bottom center upwards
    const step = 0.02 * Math.max(1, iter - 2);
    overlayCtx.save();
    overlayCtx.lineWidth = Math.max(1, Math.floor(1.5 * dpr));
    overlayCtx.strokeStyle = '#eaeaea';
    overlayCtx.beginPath();
    pathMoveToNorm(x, y);
    for (const ch of s) {
      if (ch === 'F') {
        const nx = x + Math.cos(dir) * step;
        const ny = y + Math.sin(dir) * step;
        pathLineToNorm(nx, ny);
        x = nx; y = ny;
      } else if (ch === '+') dir += Math.PI/7; // ~25.7°
      else if (ch === '-') dir -= Math.PI/7;
      else if (ch === '[') stack.push({ x, y, dir });
      else if (ch === ']') {
        const st = stack.pop();
        if (!st) continue;
        x = st.x; y = st.y; dir = st.dir;
        overlayCtx.moveTo(planeToScreen(worldFromNorm(x,y).x, worldFromNorm(x,y).y).x, planeToScreen(worldFromNorm(x,y).x, worldFromNorm(x,y).y).y);
      }
    }
    overlayCtx.stroke();
    overlayCtx.restore();
  }

  function drawPythagoras(iter) {
    if (!overlayCtx) return;
    const depth = Math.max(1, Math.min(10, iter|0));
    overlayCtx.save();
    overlayCtx.lineWidth = Math.max(1, Math.floor(1.2 * dpr));
    overlayCtx.strokeStyle = '#eaeaea';
    overlayCtx.fillStyle = 'rgba(255,255,255,0.08)';

    function drawSquare(center, side, angle) {
      const ex = { x: Math.cos(angle) * (side/2), y: Math.sin(angle) * (side/2) };
      const ey = { x: -Math.sin(angle) * (side/2), y: Math.cos(angle) * (side/2) };
      const p1 = { x: center.x - ex.x - ey.x, y: center.y - ex.y - ey.y }; // bottom-left
      const p2 = { x: center.x + ex.x - ey.x, y: center.y + ex.y - ey.y }; // bottom-right
      const p3 = { x: center.x + ex.x + ey.x, y: center.y + ex.y + ey.y }; // top-right
      const p4 = { x: center.x - ex.x + ey.x, y: center.y - ex.y + ey.y }; // top-left
      const s1 = planeToScreen(worldFromNorm(p1.x, p1.y).x, worldFromNorm(p1.x, p1.y).y);
      const s2 = planeToScreen(worldFromNorm(p2.x, p2.y).x, worldFromNorm(p2.x, p2.y).y);
      const s3 = planeToScreen(worldFromNorm(p3.x, p3.y).x, worldFromNorm(p3.x, p3.y).y);
      const s4 = planeToScreen(worldFromNorm(p4.x, p4.y).x, worldFromNorm(p4.x, p4.y).y);
      overlayCtx.beginPath();
      overlayCtx.moveTo(s1.x, s1.y);
      overlayCtx.lineTo(s2.x, s2.y);
      overlayCtx.lineTo(s3.x, s3.y);
      overlayCtx.lineTo(s4.x, s4.y);
      overlayCtx.closePath();
      overlayCtx.fill();
      overlayCtx.stroke();
      return { p1, p2, p3, p4 };
    }

    function rec(center, side, angle, d) {
      const corners = drawSquare(center, side, angle);
      if (d <= 0) return;
      const childSide = side / Math.SQRT2;
      const angleL = angle - Math.PI/4;
      const angleR = angle + Math.PI/4;
      const exL = { x: Math.cos(angleL) * (childSide/2), y: Math.sin(angleL) * (childSide/2) };
      const eyL = { x: -Math.sin(angleL) * (childSide/2), y: Math.cos(angleL) * (childSide/2) };
      const exR = { x: Math.cos(angleR) * (childSide/2), y: Math.sin(angleR) * (childSide/2) };
      const eyR = { x: -Math.sin(angleR) * (childSide/2), y: Math.cos(angleR) * (childSide/2) };
      // centers from top-left and top-right corners respectively
      const cL = { x: corners.p4.x + exL.x - eyL.x, y: corners.p4.y + exL.y - eyL.y };
      const cR = { x: corners.p3.x - exR.x - eyR.x, y: corners.p3.y - exR.y - eyR.y };
      rec(cL, childSide, angleL, d - 1);
      rec(cR, childSide, angleR, d - 1);
    }

    const baseSide = 0.18; // normalized units in [0,1]
    const baseCenter = { x: 0.5, y: 0.1 + baseSide/2 };
    rec(baseCenter, baseSide, 0, depth - 1);
    overlayCtx.restore();
  }

  function drawOverlay() {
    if (!overlayCtx || !overlay) return;
    clearOverlay();
    if (state.fractalType === 5) {
      drawKoch(state.maxIter);
    } else if (state.fractalType === 6) {
      drawPeano(state.maxIter);
    } else if (state.fractalType === 7) {
      drawPythagoras(state.maxIter);
    } else if (state.fractalType === 8) {
      drawTree(state.maxIter);
    } else if (state.fractalType === 9) {
      drawFern(state.maxIter);
    }
  }

  function render() {
    if (!gl) return;
    resizeCanvas();
    gl.clear(gl.COLOR_BUFFER_BIT);
    setUniforms();
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (state.fractalType >= 5) {
      drawOverlay();
    } else if (overlayCtx) {
      clearOverlay();
    }
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
    function applyFractalDefaults(type) {
      if (type === 0) {
        // Julia
        state.maxIter = 200;
        state.scale = 1.0;
        state.rotationDeg = 0;
        state.center = { x: -0.2, y: 0.0 };
      } else if (type === 1) {
        // Sierpinski Triangle
        state.maxIter = 9;
        state.scale = 1.2;
        state.rotationDeg = 0;
        state.center = { x: 0.0, y: 0.0 };
      } else if (type === 2) {
        // Sierpinski Carpet
        state.maxIter = 6;
        state.scale = 1.0;
        state.rotationDeg = 0;
        state.center = { x: 0.0, y: 0.0 };
      } else if (type === 3) {
        // Menger Sponge slice
        state.maxIter = 5;
        state.scale = 1.0;
        state.rotationDeg = 0;
        state.center = { x: 0.0, y: 0.0 };
      } else if (type === 4) {
        // Sierpinski Pyramid slice
        state.maxIter = 9;
        state.scale = 1.0;
        state.rotationDeg = 0;
        state.center = { x: 0.0, y: 0.0 };
      } else if (type === 5) {
        // Koch curve
        state.maxIter = 4;
        state.scale = 1.0;
        state.rotationDeg = 0;
        state.center = { x: 0.0, y: 0.0 };
      } else if (type === 6) {
        // Peano/Hilbert curve
        state.maxIter = 5;
        state.scale = 1.0;
        state.rotationDeg = 0;
        state.center = { x: 0.0, y: 0.0 };
      } else if (type === 7) {
        // Pythagoras tree
        state.maxIter = 9;
        state.scale = 1.0;
        state.rotationDeg = 0;
        state.center = { x: 0.0, y: 0.0 };
      } else if (type === 8) {
        // L-system plant
        state.maxIter = 6;
        state.scale = 1.0;
        state.rotationDeg = 0;
        state.center = { x: 0.0, y: 0.0 };
      } else if (type === 9) {
        // Stochastic Fern (IFS)
        state.maxIter = 200; // controls points per frame
        state.scale = 1.0;
        state.rotationDeg = 0;
        state.center = { x: 0.0, y: 0.0 };
        fernState.ready = false;
      } else if (type === 10) {
        // Colorful Plasma
        state.maxIter = 50; // Not used by plasma, but can be repurposed
        state.scale = 1.0;
        state.rotationDeg = 0;
        state.center = { x: 0.0, y: 0.0 };
      }
      // Reflect in UI controls
      ui.iterations.value = String(state.maxIter);
      ui.zoom.value = String(state.scale);
      ui.rotation.value = String(state.rotationDeg);
      updateUI();
    }

    if (ui.fractal) {
      ui.fractal.addEventListener('input', (e) => {
        const t = parseInt(e.target.value, 10) | 0;
        if (t === state.fractalType) return;
        state.fractalType = t;
        applyFractalDefaults(t);
        // Reset stochastic states on switch
        fernState.ready = false;
        needsRender = true;
      });
    }
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
      Object.assign(state, { fractalType: 0, palette: 0, maxIter: 200, scale: 1.0, rotationDeg: 0, speed: 1.0, playing: true, center: { x: -0.2, y: 0.0 } });
      if (ui.fractal) ui.fractal.value = String(state.fractalType);
      ui.palette.value = String(state.palette);
      ui.iterations.value = String(state.maxIter);
      ui.zoom.value = String(state.scale);
      ui.rotation.value = String(state.rotationDeg);
      ui.speed.value = String(state.speed);
      ui.playPause.textContent = 'Pause';
      ui.playPause.setAttribute('aria-pressed', 'true');
      fernState.ready = false;
      needsRender = true; updateUI();
    });

    // Recenter: reset only the view center to the default for current fractal
    if (ui.recenter) {
      ui.recenter.addEventListener('click', () => {
        const defCenter = (state.fractalType === 0)
          ? { x: -0.2, y: 0.0 } // Julia default view
          : { x: 0.0, y: 0.0 };
        state.center = { x: defCenter.x, y: defCenter.y };
        needsRender = true;
      });
    }
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
    // Toggle settings panel visibility instead of recentering
    e.preventDefault();
    const hidden = ui.controls && ui.controls.classList.contains('hidden');
    setControlsHidden(!hidden);
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

  // Keyboard: toggle settings panel visibility with 'h'
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const ae = document.activeElement;
    const tag = ae && ae.tagName ? ae.tagName.toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (ae && ae.isContentEditable)) return;
    if (e.key === 'h' || e.key === 'H') {
      const hidden = ui.controls && ui.controls.classList.contains('hidden');
      setControlsHidden(!hidden);
    }
  });

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
    if (ui.fractal) ui.fractal.value = String(state.fractalType);
    ui.palette.value = String(state.palette);
    ui.iterations.value = String(state.maxIter);
    ui.zoom.value = String(state.scale);
    ui.rotation.value = String(state.rotationDeg);
    ui.speed.value = String(state.speed);
    updateUI();
    bindUI();

    // Apply persisted controls visibility state
    setControlsHidden(getControlsHidden());

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

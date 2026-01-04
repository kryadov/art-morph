/*
  Art Morph — GPU fractal & ornaments prototype
  - WebGL1 fragment shader renders animated Julia fractal
  - Palettes: Khokhloma, Gzhel, Rainbow, Sunset, Forest, Ocean, Neon, Monochrome
  - Interactive: zoom, pan, rotation, iterations, speed, palette; mouse & touch
  - Responsive HiDPI canvas with context loss handling
*/

import { fractals, getFractalById } from './fractals/index.js';
import { noiseGLSL } from './fractals/utils.js';

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
    // Music controls
    musicFile: $('#musicFile'),
    musicPlay: $('#musicPlay'),
    musicStop: $('#musicStop'),
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
  let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let lastT = performance.now();
  let timeSec = 0; // accumulated time in seconds (paused respects state.playing)
  let needsRender = true;
  let overlayNeedsRender = true;
  // State for stochastic overlay fractals (e.g., Barnsley fern)
  let fernState = { x: 0, y: 0, ready: false };

  // ----- Music playback (user-chosen MP3) -----
  let music = new Audio();
  music.loop = true;
  let musicObjectUrl = null;

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    try { music.pause(); } catch (_) { /* noop */ }
    if (musicObjectUrl) {
      try { URL.revokeObjectURL(musicObjectUrl); } catch (_) { /* ignore */ }
      musicObjectUrl = null;
    }
  });

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

  // Generate FRAG_SRC dynamically based on imported fractals
  const generateFragSrc = () => {
    const shaderFractals = fractals.filter(f => f.type === 'shader');
    const fractalFunctions = shaderFractals.map(f => f.glsl).join('\n');

    const fractalCases = shaderFractals.map(f => `
  } else if (u_fractalType == ${f.id}) {
    ${f.id === 1 || f.id === 2 ? `
    vec2 pNorm = z / max(1e-6, u_span) + vec2(0.5);
    float t = ${f.id === 1 ? 'sierpinskiTri' : 'sierpinskiCarpet'}(pNorm);
    float shade = 1.0 - t;
    col = getPalette(shade, u_palette);
    ` : f.id === 3 ? `
    vec2 pNorm2 = z / max(1e-6, u_span) + vec2(0.5);
    float zSlice = 0.5 + 0.45 * sin(u_time * 0.25);
    vec3 p3 = vec3(pNorm2, zSlice);
    float t = mengerDepth(p3);
    float shade = 1.0 - t;
    col = getPalette(shade, u_palette);
    ` : f.id === 4 ? `
    vec2 pNorm2 = z / max(1e-6, u_span) + vec2(0.5);
    float zSlice = 0.5 + 0.45 * sin(u_time * 0.22 + 1.0);
    vec3 p3 = vec3(pNorm2, zSlice);
    float t = sierpinskiPyramidDepth(p3);
    float shade = 1.0 - t;
    col = getPalette(shade, u_palette);
    ` : f.id === 11 ? `
    vec2 pNorm2 = z / max(1e-6, u_span) + vec2(0.5);
    float zSlice = 0.5 + 0.45 * sin(u_time * 0.22 + 1.0);
    vec3 p3 = vec3(pNorm2, zSlice);
    col = colorDynamicMorph(p3);
    ` : f.id === 14 ? `
    vec2 pNorm2 = z / max(1e-6, u_span) + vec2(0.5);
    float zSlice = 0.5 + 0.4 * sin(u_time * 0.2);
    vec3 p3 = vec3(pNorm2, zSlice);
    col = colorWeb3D(p3);
    ` : f.id === 12 || f.id === 15 || f.id === 18 ? `
    col = ${f.id === 12 ? 'colorStarJourney' : f.id === 15 ? 'colorStar3D' : 'colorClouds'}(uv);
    ` : `
    col = ${f.id === 0 ? 'colorJulia' : f.id === 10 ? 'colorPlasma' : f.id === 13 ? 'colorLiquid' : f.id === 17 ? 'colorFlameTongues' : 'colorEnergyCore'}(z);
    `}
    `).join('');

    return `
precision highp float;

uniform vec2 u_resolution;  // canvas size in pixels
uniform vec2 u_center;      // complex plane center
uniform float u_span;       // base span scaled by zoom (width of plane)
uniform float u_rotation;   // radians
uniform float u_time;       // seconds
uniform int u_maxIter;
uniform int u_palette;      // 0=Khokhloma,1=Gzhel,2=Rainbow,3=Sunset,4=Forest,5=Ocean,6=Neon,7=Monochrome
uniform int u_fractalType;  // 0=Julia,1=Tri,2=Carpet,13=Liquid,14=Web3D,18=Clouds

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

// Sunset palette: deep blues to oranges and yellows
vec3 paletteSunset(float t) {
  t = clamp(t, 0., 1.);
  vec3 c0 = vec3(0.05, 0.02, 0.15);  // dark midnight blue
  vec3 c1 = vec3(0.4, 0.05, 0.4);    // purple
  vec3 c2 = vec3(0.9, 0.3, 0.1);     // orange-red
  vec3 c3 = vec3(1.0, 0.8, 0.2);     // yellow-gold
  if (t < 0.3) return mix(c0, c1, smoothstep(0., 0.3, t));
  if (t < 0.7) return mix(c1, c2, smoothstep(0.3, 0.7, t));
  return mix(c2, c3, smoothstep(0.7, 1.0, t));
}

// Forest palette: dark greens to light lime
vec3 paletteForest(float t) {
  t = clamp(t, 0., 1.);
  vec3 c0 = vec3(0.01, 0.05, 0.01);  // very dark green
  vec3 c1 = vec3(0.1, 0.35, 0.15);   // forest green
  vec3 c2 = vec3(0.4, 0.6, 0.2);     // olive/lime
  vec3 c3 = vec3(0.8, 0.9, 0.5);     // pale spring green
  if (t < 0.4) return mix(c0, c1, smoothstep(0., 0.4, t));
  if (t < 0.7) return mix(c1, c2, smoothstep(0.4, 0.7, t));
  return mix(c2, c3, smoothstep(0.7, 1.0, t));
}

// Ocean palette: deep sea to bright cyan/white
vec3 paletteOcean(float t) {
  t = clamp(t, 0., 1.);
  vec3 c0 = vec3(0.02, 0.05, 0.2);   // deep blue
  vec3 c1 = vec3(0.0, 0.4, 0.55);    // teal
  vec3 c2 = vec3(0.2, 0.8, 0.85);    // cyan
  vec3 c3 = vec3(0.9, 1.0, 1.0);     // water white
  if (t < 0.35) return mix(c0, c1, smoothstep(0., 0.35, t));
  if (t < 0.75) return mix(c1, c2, smoothstep(0.35, 0.75, t));
  return mix(c2, c3, smoothstep(0.75, 1.0, t));
}

// Neon palette: dark to vibrant magenta and cyan
vec3 paletteNeon(float t) {
  t = clamp(t, 0., 1.);
  vec3 c0 = vec3(0.05, 0.0, 0.1);    // dark purple
  vec3 c1 = vec3(0.9, 0.0, 0.9);     // magenta
  vec3 c2 = vec3(0.0, 0.9, 0.9);     // cyan
  vec3 c3 = vec3(1.0, 1.0, 1.0);     // white
  if (t < 0.4) return mix(c0, c1, smoothstep(0., 0.4, t));
  if (t < 0.8) return mix(c1, c2, smoothstep(0.4, 0.8, t));
  return mix(c2, c3, smoothstep(0.8, 1.0, t));
}

// Monochrome palette: black to white
vec3 paletteMonochrome(float t) {
  return vec3(clamp(t, 0., 1.));
}

vec3 getPalette(float t, int which) {
  if (which == 0) return paletteKhokhloma(t);
  if (which == 1) return paletteGzhel(t);
  if (which == 2) return paletteRainbow(t);
  if (which == 3) return paletteSunset(t);
  if (which == 4) return paletteForest(t);
  if (which == 5) return paletteOcean(t);
  if (which == 6) return paletteNeon(t);
  return paletteMonochrome(t); // 7
}

${noiseGLSL}

${fractalFunctions}

void main() {
  // Map pixel to complex plane, keeping aspect ratio
  vec2 uv = (gl_FragCoord.xy / u_resolution) * 2.0 - 1.0; // [-1,1]
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  uv.x *= aspect;

  // span defines width of plane; scale uv accordingly and rotate
  vec2 z = (rot(u_rotation) * uv) * (u_span * 0.5) + u_center;

  vec3 col;
  if (u_fractalType == -1) {
    // Placeholder
    col = vec3(0.0);
  ${fractalCases}
  } else {
    // Overlay-only types: neutral background
    col = vec3(0.0);
  }

  // Vignette for aesthetics
  float d_vig = length(uv);
  float vig = smoothstep(1.2, 0.2, d_vig);
  col *= mix(0.85, 1.0, vig);

  // Dithering to hide banding in smooth gradients
  float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (noise - 0.5) * (1.0 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}`;
  };

  const FRAG_SRC = generateFragSrc();

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
    // Reduce resolution for heavy 3D shaders to save GPU
    let dprLimit = 2;
    if (state.fractalType === 12 || state.fractalType === 15 || state.fractalType === 17 || state.fractalType === 18) dprLimit = 1.25;
    const newDpr = Math.min(window.devicePixelRatio || 1, dprLimit);
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

  function drawOverlay() {
    if (!overlayCtx || !overlay) return;
    clearOverlay();
    const fractal = getFractalById(state.fractalType);
    if (fractal && fractal.type === 'overlay' && fractal.draw) {
      fractal.draw(overlayCtx, state.maxIter, dpr, {
        pathMoveToNorm,
        pathLineToNorm,
        worldFromNorm,
        planeToScreen
      }, fernState);
    }
  }

  function render() {
    if (!gl) return;
    resizeCanvas();
    gl.clear(gl.COLOR_BUFFER_BIT);
    setUniforms();
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    const fractal = getFractalById(state.fractalType);
    if (fractal && fractal.type === 'overlay') {
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
      const fractal = getFractalById(type);
      if (fractal && fractal.defaults) {
        Object.assign(state, fractal.defaults);
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

    // ----- Music UI -----
    function updateMusicUI() {
      const hasSrc = !!music.src;
      if (ui.musicPlay) {
        ui.musicPlay.disabled = !hasSrc;
        ui.musicPlay.setAttribute('aria-pressed', String(hasSrc && !music.paused));
      }
      if (ui.musicStop) {
        ui.musicStop.disabled = !hasSrc;
        ui.musicStop.setAttribute('aria-pressed', 'false');
      }
    }

    if (ui.musicFile) {
      ui.musicFile.addEventListener('change', () => {
        const f = ui.musicFile.files && ui.musicFile.files[0];
        if (!f) return;
        try { music.pause(); } catch (_) { /* noop */ }
        music.currentTime = 0;
        if (musicObjectUrl) {
          try { URL.revokeObjectURL(musicObjectUrl); } catch (_) { /* ignore */ }
          musicObjectUrl = null;
        }
        musicObjectUrl = URL.createObjectURL(f);
        music.src = musicObjectUrl;
        updateMusicUI();
      });
    }

    if (ui.musicPlay) {
      ui.musicPlay.addEventListener('click', () => {
        if (!music.src) return;
        const p = music.play();
        if (p && typeof p.then === 'function') {
          p.then(() => updateMusicUI()).catch((err) => {
            console.warn('Music play failed:', err);
            updateMusicUI();
          });
        } else {
          updateMusicUI();
        }
      });
    }

    if (ui.musicStop) {
      ui.musicStop.addEventListener('click', () => {
        if (!music.src) return;
        try { music.pause(); } catch (_) { /* noop */ }
        try { music.currentTime = 0; } catch (_) { /* noop */ }
        updateMusicUI();
      });
    }

    music.addEventListener('play', updateMusicUI);
    music.addEventListener('pause', updateMusicUI);
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

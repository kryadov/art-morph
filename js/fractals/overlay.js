export const kochCurve = {
  id: 5,
  name: 'Koch Curve',
  type: 'overlay',
  defaults: {
    maxIter: 4,
    scale: 1.0,
    rotationDeg: 0,
    center: { x: 0.0, y: 0.0 }
  },
  draw: (ctx, iter, dpr, helpers) => {
    const { pathMoveToNorm, pathLineToNorm } = helpers;
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
    ctx.save();
    ctx.lineWidth = Math.max(1, Math.floor(2 * dpr));
    ctx.strokeStyle = '#eaeaea';
    ctx.beginPath();
    pathMoveToNorm(x, y);
    for (const ch of str) {
      if (ch === 'F') {
        x += Math.cos(dir) * len;
        y += Math.sin(dir) * len;
        pathLineToNorm(x, y);
      } else if (ch === '+') dir += angle; else if (ch === '-') dir -= angle;
    }
    ctx.stroke();
    ctx.restore();
  }
};

export const peanoCurve = {
  id: 6,
  name: 'Peano Curve',
  type: 'overlay',
  defaults: {
    maxIter: 5,
    scale: 1.0,
    rotationDeg: 0,
    center: { x: 0.0, y: 0.0 }
  },
  draw: (ctx, iter, dpr, helpers) => {
    const { pathMoveToNorm, pathLineToNorm } = helpers;
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

    iter = Math.max(1, Math.min(5, iter|0));
    const s = buildPeanoString(iter - 1);
    const angle = Math.PI / 2;
    const len = 0.8 / Math.pow(3, iter - 1);
    let x = 0.1, y = 0.1, dir = 0; // start at bottom-left
    ctx.save();
    ctx.lineWidth = Math.max(1, Math.floor(2 * dpr));
    ctx.strokeStyle = '#eaeaea';
    ctx.beginPath();
    pathMoveToNorm(x, y);
    for (const ch of s) {
      if (ch === 'F') {
        x += Math.cos(dir) * len;
        y += Math.sin(dir) * len;
        pathLineToNorm(x, y);
      } else if (ch === '+') dir += angle; else if (ch === '-') dir -= angle;
    }
    ctx.stroke();
    ctx.restore();
  }
};

export const pythagorasTree = {
  id: 7,
  name: 'Pythagoras Tree',
  type: 'overlay',
  defaults: {
    maxIter: 9,
    scale: 1.0,
    rotationDeg: 0,
    center: { x: 0.0, y: 0.0 }
  },
  draw: (ctx, iter, dpr, helpers) => {
    const { worldFromNorm, planeToScreen } = helpers;
    const depth = Math.max(1, Math.min(10, iter|0));
    ctx.save();
    ctx.lineWidth = Math.max(1, Math.floor(1.2 * dpr));
    ctx.strokeStyle = '#eaeaea';
    ctx.fillStyle = 'rgba(255,255,255,0.08)';

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
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.lineTo(s3.x, s3.y);
      ctx.lineTo(s4.x, s4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
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
    ctx.restore();
  }
};

export const lSystemTree = {
  id: 8,
  name: 'L-System Tree',
  type: 'overlay',
  defaults: {
    maxIter: 6,
    scale: 1.0,
    rotationDeg: 0,
    center: { x: 0.0, y: 0.0 }
  },
  draw: (ctx, iter, dpr, helpers) => {
    const { pathMoveToNorm, pathLineToNorm, worldFromNorm, planeToScreen } = helpers;
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
    ctx.save();
    ctx.lineWidth = Math.max(1, Math.floor(1.5 * dpr));
    ctx.strokeStyle = '#eaeaea';
    ctx.beginPath();
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
        ctx.moveTo(planeToScreen(worldFromNorm(x,y).x, worldFromNorm(x,y).y).x, planeToScreen(worldFromNorm(x,y).x, worldFromNorm(x,y).y).y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }
};

export const fern = {
  id: 9,
  name: 'Stochastic Fern',
  type: 'overlay',
  defaults: {
    maxIter: 200,
    scale: 1.0,
    rotationDeg: 0,
    center: { x: 0.0, y: 0.0 }
  },
  draw: (ctx, iter, dpr, helpers, state) => {
    const { worldFromNorm, planeToScreen } = helpers;
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
    ctx.save();
    ctx.fillStyle = 'rgba(234,234,234,0.9)';

    // Initialize state once
    if (!state.ready) {
      state.x = 0; state.y = 0; state.ready = true;
    }
    let x = state.x, y = state.y;
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
      ctx.fillRect(spt.x, spt.y, size, size);
    }
    state.x = x; state.y = y;
    ctx.restore();
  }
};

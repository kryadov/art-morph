export const starJourney = {
  id: 12,
  name: 'Star Journey',
  type: 'shader',
  defaults: {
    maxIter: 8,
    scale: 1.0,
    rotationDeg: 0,
    center: { x: 0.0, y: 0.0 }
  },
  glsl: `
// Star Journey (3D Raymarching)
vec3 colorStarJourney(vec2 uv) {
  // Camera flies forward: 0.5 (was 1.5) for 3x slower movement
  vec3 ro = vec3(0.0, 0.0, u_time * 0.5);
  vec3 rd = normalize(vec3(uv, 1.0));

  // Rotate camera
  float a = u_time * 0.1;
  rd.xy *= rot(a);
  rd.xz *= rot(a * 0.7);

  float t = 0.0;
  float minOrbit = 1e10;
  int steps = 0;

  // Pre-calculate animation offset
  vec3 shift = vec3(0.5 * sin(u_time * 0.2), 0.3 * cos(u_time * 0.3), 0.0);

  for (int i = 0; i < 40; i++) {
    steps = i;
    vec3 p = ro + rd * t;
    // Repeat space
    vec3 q = mod(p + 4.0, 8.0) - 4.0;

    // Fractal DE: Simple recursive folding
    float s = 1.0;
    for (int j = 0; j < 5; j++) {
      if (j >= u_maxIter / 2) break;
      q = abs(q) - 1.2;
      float r2 = dot(q, q);
      minOrbit = min(minOrbit, r2);
      float k = 2.0 / clamp(r2, 0.1, 1.5);
      q *= k;
      s *= k;
      q += shift;
    }
    float d = (length(q) - 0.2) / s;
    if (d < 0.001 || t > 40.0) break;
    t += d * 0.7;
  }

  // Use minOrbit for smooth coloring. Log scale to compress the range and mirror palette.
  float colorT = fract(log(1.0 + minOrbit) * 0.5 + u_time * 0.04);
  colorT = 1.0 - abs(colorT * 2.0 - 1.0);
  vec3 col = getPalette(colorT, u_palette);

  // Simple lighting / fog
  col *= 1.0 / (1.0 + t * t * 0.015);
  // Soft glow based on steps
  col += (float(steps) / 40.0) * 0.15 * col;

  return col;
}
`
};

export const star3D = {
  id: 15,
  name: '3D Bending Star',
  type: 'shader',
  defaults: {
    maxIter: 64,
    scale: 1.0,
    rotationDeg: 0,
    center: { x: 0.0, y: 0.0 }
  },
  glsl: `
// 3D Bending Star with Raymarching
vec3 colorStar3D(vec2 uv) {
  float camTime = u_time * 0.3;
  // Camera orbits around the center
  vec3 ro = vec3(5.0 * cos(camTime), 2.0 * sin(camTime * 0.4), 5.0 * sin(camTime));
  vec3 target = vec3(0.0, 0.0, 0.0);
  vec3 cw = normalize(target - ro);
  vec3 cp = vec3(0.0, 1.0, 0.0);
  vec3 cu = normalize(cross(cw, cp));
  vec3 cv = normalize(cross(cu, cw));
  vec3 rd = normalize(uv.x * cu + uv.y * cv + 2.0 * cw);

  float t = 0.0;
  float totalGlow = 0.0;
  float minD = 1e10;

  for (int i = 0; i < 100; i++) {
    if (i >= u_maxIter) break;
    vec3 p = ro + rd * t;

    // Bending effect: rotate space based on distance from center
    float r = length(p);
    float bend = r * 0.2 - u_time * 0.6;
    float s = sin(bend), c = cos(bend);
    p.xz *= mat2(c, -s, s, c);
    p.xy *= mat2(c, -s, s, c);

    // Star SDF: Core + multiple rays
    float core = length(p) - 0.25;

    float rays = 1e10;
    vec3 qR = p;
    float thick = 0.008 * (1.0 + 2.0 / (r + 0.1));
    for (int j = 0; j < 6; j++) {
      rays = min(rays, min(length(qR.yz), min(length(qR.xz), length(qR.xy))));
      qR.xy *= rot(0.8);
      qR.yz *= rot(0.5);
    }
    rays -= thick;

    float d = min(core, rays);
    minD = min(minD, d);

    // Accumulate glow, stronger near the center
    totalGlow += exp(-d * 10.0) * (1.0 / (1.0 + r * 0.5));

    if (d < 0.001 || t > 20.0) break;
    t += d * 0.5;
  }

  // Base color from palette
  float colorT = fract(u_time * 0.05 + minD);
  vec3 col = getPalette(colorT, u_palette);

  // Apply intense glow for "bright inside"
  col += vec3(1.0, 0.9, 0.6) * totalGlow * 0.2;

  // Exponential fog
  col *= exp(-0.15 * t);

  return col;
}
`
};

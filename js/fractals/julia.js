export const julia = {
  id: 0,
  name: 'Julia Set',
  type: 'shader',
  defaults: {
    maxIter: 200,
    scale: 1.0,
    rotationDeg: 0,
    center: { x: -0.2, y: 0.0 }
  },
  glsl: `
// Compute color for Julia set at point z0
vec3 colorJulia(vec2 z0) {
  vec2 z = z0;
  // Animate c over time to morph shapes
  float t = u_time * 0.25; // slow down a bit
  vec2 c = vec2(0.285 + 0.25*cos(t*1.7), 0.01 + 0.25*sin(t*1.2));

  int maxIter = u_maxIter;
  float i = 0.0;
  float trap = 1e9;
  for (int ii = 0; ii < 500; ii++) {
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
`
};

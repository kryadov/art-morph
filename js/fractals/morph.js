export const dynamicMorph = {
  id: 11,
  name: 'Dynamic Morph',
  type: 'shader',
  defaults: {
    maxIter: 8,
    scale: 1.0,
    rotationDeg: 0,
    center: { x: 0.0, y: 0.0 }
  },
  glsl: `
// Dynamic Morph
vec3 colorDynamicMorph(vec3 p) {
  vec3 q = p;
  float t = u_time * 0.1;
  for (int i = 0; i < 10; i++) {
    if (i >= u_maxIter) break;
    q = abs(q) / dot(q, q) - vec3(0.5 + 0.3*sin(t), 0.5 + 0.3*cos(t), 0.5 + 0.3*sin(t*1.2));
  }
  float colorT = fract(length(q) * 0.2);
  colorT = 1.0 - abs(colorT * 2.0 - 1.0);
  return getPalette(colorT, u_palette);
}
`
};

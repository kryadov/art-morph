export const plasma = {
  id: 10,
  name: 'Plasma',
  type: 'shader',
  defaults: {
    maxIter: 50,
    scale: 1.0,
    rotationDeg: 0,
    center: { x: 0.0, y: 0.0 }
  },
  glsl: `
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
`
};

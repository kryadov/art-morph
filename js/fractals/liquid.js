import { noiseGLSL } from './utils.js';

export const liquid = {
  id: 13,
  name: 'Liquid Gradient',
  type: 'shader',
  defaults: {
    maxIter: 30,
    scale: 1.0,
    rotationDeg: 0,
    center: { x: 0.0, y: 0.0 }
  },
  glsl: `
vec3 colorLiquid(vec2 p) {
  float t = u_time * 0.15;
  int baseOct = 1 + u_maxIter / 25;
  if (baseOct > 3) baseOct = 3;
  // Domain warping
  vec2 q = vec2(fbm(p, baseOct), fbm(p + vec2(5.2, 1.3), baseOct));
  vec2 r = vec2(fbm(p + 4.0*q + vec2(1.7, 9.2) + t, baseOct), fbm(p + 4.0*q + vec2(8.3, 2.8) + t*1.1, baseOct));
  float f = fbm(p + 4.0*r, baseOct + 2);
  return getPalette(clamp(f*f*3.5, 0.0, 1.0), u_palette);
}
`
};

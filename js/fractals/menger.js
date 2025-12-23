export const mengerSponge = {
  id: 3,
  name: 'Menger Sponge',
  type: 'shader',
  defaults: {
    maxIter: 5,
    scale: 1.0,
    rotationDeg: 0,
    center: { x: 0.0, y: 0.0 }
  },
  glsl: `
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
`
};

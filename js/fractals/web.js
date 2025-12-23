export const web3D = {
  id: 14,
  name: '3D Web',
  type: 'shader',
  defaults: {
    maxIter: 10,
    scale: 1.0,
    rotationDeg: 0,
    center: { x: 0.0, y: 0.0 }
  },
  glsl: `
// 3D Web (Iterative network with gradient)
vec3 colorWeb3D(vec3 p) {
  vec3 q = p;
  float t = u_time * 0.15;
  float minD = 1000.0;
  for (int i = 0; i < 16; i++) {
    if (i >= u_maxIter) break;
    q = abs(q) - vec3(0.4, 0.4, 0.4);
    float s = sin(t + float(i)*0.1);
    float c = cos(t + float(i)*0.1);
    q.xy = mat2(c, -s, s, c) * q.xy;
    q.xz = mat2(c, -s, s, c) * q.xz;
    q = q * 1.5 - vec3(0.2 * sin(t * 0.5));
    // Orbit trap for web-like filaments
    float dist = min(abs(q.x), min(abs(q.y), abs(q.z)));
    minD = min(minD, dist);
  }
  float colorT = fract(log(1.0 + minD * 100.0) * 0.4 + t);
  return getPalette(colorT, u_palette);
}
`
};

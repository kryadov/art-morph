export const clouds = {
  id: 18,
  name: 'Cloud Flight',
  type: 'shader',
  defaults: {
    maxIter: 5,
    scale: 1.0,
    rotationDeg: 0,
    center: { x: 0.0, y: 0.0 }
  },
  glsl: `
// Infinite flight through clouds
vec3 colorClouds(vec2 uv) {
  float t = u_time * 0.5;

  // Day/Night cycle: 0.0 (night, black) to 1.0 (day, white)
  float dn = sin(u_time * 0.15) * 0.5 + 0.5;
  dn = smoothstep(0.1, 0.9, dn);

  vec2 p = uv;

  // Flight effect
  float dens = 0.0;

  // 1. Cumulus layers
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    // Pseudorandom offset per layer
    vec2 off = vec2(fi * 1.23, fi * 4.56);

    // We use a zoom-like effect for "flight through"
    float z = fract(0.2 * (t + fi * 1.5));
    float s = 0.5 + 5.0 * (1.0 - z);
    float fade = smoothstep(0.0, 0.3, z) * smoothstep(1.0, 0.7, z);

    vec2 uv2 = p * s + off + vec2(0.0, t * 0.1);
    float n = fbm(uv2, 3);
    dens += smoothstep(0.45, 0.65, n) * fade;
  }

  // 2. Cirrus layers (high up, slow)
  vec2 pCirrus = p * 0.3 + vec2(t * 0.05, t * 0.02);
  float nCirrus = fbm(pCirrus, 4);
  float cirrus = smoothstep(0.5, 0.85, nCirrus) * 0.5;
  dens = max(dens, cirrus);

  dens = clamp(dens, 0.0, 1.0);

  // Colors based on day/night
  // Day (dn=1): Sky=White, Clouds=Light blue-ish gray
  // Night (dn=0): Sky=Black, Clouds=Dark gray-blue
  vec3 bg = mix(vec3(0.0), vec3(1.0), dn);
  vec3 cloud = mix(vec3(0.05, 0.05, 0.1), vec3(0.85, 0.9, 0.95), dn);

  vec3 col = mix(bg, cloud, dens);

  // Bloom/Sun effect for day
  float sun = pow(max(0.0, 1.0 - length(uv - vec2(0.3, 0.2))), 12.0);
  col += sun * dn * 0.3;

  return col;
}
`
};

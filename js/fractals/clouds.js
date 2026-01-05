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
  float t = u_time * 1.0;

  // Day/Night cycle: 0.0 (night, black) to 1.0 (day, white)
  float dayCycle = sin(u_time * 0.15) * 0.5 + 0.5;
  float dn = smoothstep(0.1, 0.9, dayCycle);

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
    float s = 0.5 + 3.5 * (1.0 - z);
    float fade = smoothstep(0.0, 0.3, z) * smoothstep(1.0, 0.7, z);

    vec2 uv2 = p * s + off + vec2(0.0, t * 0.1);
    float n = fbm(uv2, 3);
    dens += smoothstep(0.45, 0.6, n) * fade;
  }

  // 2. Cirrus layers (high up, slow)
  vec2 pCirrus = p * 0.2 + vec2(t * 0.05, t * 0.02);
  float nCirrus = fbm(pCirrus, 3);
  float cirrus = smoothstep(0.55, 0.75, nCirrus) * 0.5;
  dens = max(dens, cirrus);

  dens = clamp(dens, 0.0, 1.0);

  // Natural base colors
  vec3 skyDay = vec3(0.6, 0.8, 1.0);
  vec3 skyNight = vec3(0.01, 0.02, 0.05);
  vec3 cloudDay = vec3(1.0, 1.0, 1.0);
  vec3 cloudNight = vec3(0.05, 0.05, 0.1);

  vec3 baseSky = mix(skyNight, skyDay, dn);
  vec3 baseCloud = mix(cloudNight, cloudDay, dn);

  // Palette influence (tint and gradient)
  // We use UV for sky gradient and density for cloud tint
  vec3 pColBg = getPalette(uv.y * 0.3 + dn * 0.2, u_palette);
  vec3 pColCloud = getPalette(dens * 0.5 + dn * 0.5, u_palette);

  vec3 bg = mix(baseSky, pColBg, 0.15);
  vec3 cloud = mix(baseCloud, pColCloud, 0.15);

  vec3 col = mix(bg, cloud, dens);

  // Bloom/Sun effect for day (more intense)
  vec2 sunPos = vec2(
    noise(vec2(t * 0.2, 1.23)) * 2.0 - 1.0,
    noise(vec2(t * 0.2, 4.56)) * 2.0 - 1.0
  );
  float sun = pow(max(0.0, 1.0 - length(uv - sunPos)), 12.0);
  col += sun * dn * 0.6;

  return col;
}
`
};

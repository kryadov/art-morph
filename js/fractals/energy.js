import { noiseGLSL } from './utils.js';

export const energyCore = {
  id: 16,
  name: 'Energy Core',
  type: 'shader',
  defaults: {
    maxIter: 50,
    scale: 1.0,
    rotationDeg: 0,
    center: { x: 0.0, y: 0.0 }
  },
  glsl: `
#define PI 3.14159265359
// Energy Core: Infinite flight to the center
vec3 colorEnergyCore(vec2 z) {
  float t = u_time * 0.7;
  float r = length(z);
  float angle = atan(z.y, z.x);

  // Breathing effect: пульсация радиуса, амплитуды шумов и яркости
  float pulse = sin(u_time * 1.5);
  float breathing = 1.0 + 0.1 * pulse;

  // Infinite flight effect (logarithmic zoom)
  // Everything expands from center: log(r) - t
  float logR = log(r + 1e-6) - t;

  // 1. Spiral twist 3x greater
  // We add logR-dependent twist to the angle.
  // Combined with wavePattern's logR*10, this results in logR*30 (3x increase).
  angle += logR * 20.0;

  // Multiple Electric Rings (голубой/лазурный) approaching (expanding)
  float multiRings = 0.0;
  float spiralRings = 0.0;
  float arcs = 0.0;
  float ringDensity = 0.3; // How many rings in flight

  // We check a few potential ring indices that could be visible
  for (int i = -2; i <= 1; i++) {
    float ringIdx = floor(logR * ringDensity) + float(i);
    // Project ring index back to radius: r = exp(t + (ringIdx + 0.5) / ringDensity)
    float ringRadius = exp(t + (ringIdx + 0.5) / ringDensity);

    // Only render if within visible range
    if (ringRadius < 0.01 || ringRadius > 4.0) continue;

    // Jagged lightning-like displacement for the ring
    float ringNoise = sin(angle * 6.0 + t * 0.2 + ringIdx * 12.3) * 0.5 + 0.5;
    float ringJagged = (abs(fract(angle / (2.0 * PI) + ringIdx) - 0.5) - 0.25) * 0.5;
    ringJagged += (ringNoise - 0.5) * 0.3;

    float dist = abs(r - ringRadius + ringJagged * ringRadius * 0.4 * breathing);

    // Sharper ring (cusp profile instead of gaussian) and thinner
    float ringIntensity = exp(-dist * (180.0 / (ringRadius * (1.0 + 0.3 * pulse))));

    // 1. Rings disappear at a random distance up to 30% to the camera
    // Camera is roughly at r=1.2. 30% of 1.2 is 0.36.
    // Random threshold between 0.84 and 1.2 based on ring index
    float rand = fract(sin(ringIdx * 123.456) * 789.012);
    float randomThreshold = 0.84 + 0.36 * rand;
    float fade = smoothstep(randomThreshold, randomThreshold * 0.8, ringRadius) * smoothstep(0.0, 0.1, ringRadius);
    multiRings += ringIntensity * fade;

    // Flickering lightning arcs for each ring
    // Use u_maxIter to scale complexity if needed (here we just optimize calculations)
    int numArcs = 3;
    for (int j = 0; j < 3; j++) {
      float fj = float(j);
      float a = angle + t * (1.2 + fj * 0.4 + ringIdx * 0.1) + fj * 2.1 + ringIdx;

      // Optimized lightning-like jagged displacement: use sin instead of noise for GPU speed
      float jagged = abs(fract(a * 1.5 + t * 0.5) - 0.5) * 0.4;
      jagged += sin(a * 12.0 + t * 3.0 + ringIdx) * 0.2;
      jagged += sin(a * 25.0 - t * 5.0 + fj) * 0.1;

      float arcLine = abs(r - ringRadius + 0.12 * (jagged - 0.4) * breathing * ringRadius);
      float arcInner = exp(-arcLine * (140.0 / ringRadius));

      // Flickering using a hash-like sine function based on ring and time
      float flicker = step(0.65, fract(sin(ringIdx * 17.8 + fj * 45.2 + floor(t * 22.0)) * 43758.5));
      arcs += arcInner * flicker * fade;
    }
  }

  // Дополнительные спиральные кольца в тоннеле (бесконечная спираль)
  // Случайная модуляция частоты и амплитуды спирали
  float spiralFM = noise(vec2(t * 0.3, logR * 0.3)) * 4.0;
  // Используем cos(angle) для бесшовности по углу
  float spiralAM = noise(vec2(t * 0.4, cos(angle) * 0.5 + 0.5)) * 0.5 + 0.5;
  float spiralFreq = 8.0 + spiralFM;
  float spiralAngleMult = 1.0;
  float spiralVal = logR * spiralFreq + angle * spiralAngleMult;

  // Создаем эффект непрерывной спирали через sin
  float sDist = abs(fract(spiralVal / (2.0 * PI) + 0.5) - 0.5) * ((2.0 * PI) / spiralFreq);
  float sIntensity = exp(-sDist * 40.0 / r) * spiralAM; // Толщина зависит от радиуса и модуляции

  // Увеличиваем дальность видимости спирали к центру
  float sFade = smoothstep(2.5, 1.2, r) * smoothstep(0.005, 0.05, r);
  spiralRings = sIntensity * sFade;

  // Plasma waves (фиолетово-синие оттенки) spreading outward
  // Случайная амплитудно-частотная модуляция с эффектом размытия (smear)
  float waveFM = noise(vec2(t * 0.4, logR * 0.2)) * 6.0;
  // Используем cos(angle) для бесшовности
  float waveAM = noise(vec2(t * 0.5, cos(angle) * 0.5 + 0.5)) * 0.4 + 0.6;

  // Используем полярные координаты для шума, чтобы растянуть его вдоль тоннеля
  // Низкая частота по logR и более высокая по angle создает радиальные полосы
  // Для бесшовности по углу используем cos(angle)
  float n = noise(vec2(logR * 1.5 - t * 0.2, cos(angle) * 0.5 + 0.5));

  // Уменьшаем частоту по logR и увеличиваем по angle, чтобы уйти от формы кругов
  // Множитель угла должен быть целым числом для бесшовности (убираем линию на 180 градусах)
  float waveAngleMult = 7.0;
  float wavePattern = sin(logR * (4.0 + waveFM) + angle * waveAngleMult + t + n * 6.0);

  // Смешиваем паттерн с шумом для более "размазанного" вида
  float plasma = smoothstep(-0.5, 1.0, wavePattern * waveAM + n * 0.4) * exp(-r * 0.8);

  // 3. Palette should influence colors
  vec3 colorLow = getPalette(0.1, u_palette);
  vec3 colorMid = getPalette(0.5, u_palette);
  vec3 colorHigh = getPalette(0.9, u_palette);
  vec3 coreCol = colorLow * 0.2;

  vec3 col = vec3(0.0);

  // Plasma background (waves of violet-blue) using palette
  vec3 plasmaCol = mix(colorLow, colorMid, sin(logR * 2.0 + t + n) * 0.5 + 0.5);
  col += plasmaCol * plasma * 0.6;

  // The electric rings using palette
  col += colorHigh * multiRings * (2.2 + 0.8 * pulse);

  // Extra spiral rings using palette
  col += colorMid * spiralRings * 1.5;

  // Arcs (extra bright palette color / white)
  col += mix(colorHigh, vec3(1.0), 0.4) * arcs * 2.2;

  // Energy Core at the end of the tunnel
  float coreGlow = exp(-r * 25.0) * (2.0 + 1.0 * pulse);
  vec3 coreGlowCol = colorHigh * coreGlow;

  // Dark core masking
  // В центре - тёмное ядро (почти чёрное)
  float coreMask = smoothstep(0.02, 0.2 * breathing, r);
  col *= coreMask;

  // Add the energy core glow
  col += coreGlowCol;

  // Smoothly blend into the dark core for that "hole" look
  col = mix(coreCol, col, smoothstep(0.01, 0.15, r));

  return col;
}
`
};

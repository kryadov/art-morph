import { noiseGLSL } from './utils.js';

export const flameTongues = {
  id: 17,
  name: 'Flame Tongues',
  type: 'shader',
  defaults: {
    maxIter: 50,
    scale: 1.0,
    rotationDeg: 0,
    center: { x: 0.0, y: 0.0 }
  },
  glsl: `
// Flame Tongues effect
vec3 colorFlameTongues(vec2 p) {
    float t = u_time * 1.2;
    float finalFlame = 0.0;

    // Генерируем семь языков пламени
    for (int i = 0; i < 7; i++) {
        float fi = float(i);
        float distCenter = abs(fi - 3.0); // 0 (центр), 1, 2, 3 (края)

        // Смещение, размер и высота зависят от удаления от центра
        float offset = (fi - 3.0) * 0.4;
        float sizeScale = 1.0 - distCenter * 0.1; // Боковые меньше
        float yShift = distCenter * 0.15;         // Боковые ниже

        vec2 pi = p;
        pi.x -= offset;
        pi.y += yShift;
        pi /= sizeScale;

        // Индивидуальная скорость и фаза для каждого языка
        float ti = t * (0.9 + fi * 0.1) + fi * 1.5;

        vec2 q = pi;

        // Искажение координат для имитации движения пламени вверх
        // Оптимизация: используем 2 октавы FBM для n1 (искажение не требует высокой детализации)
        float n1 = fbm(pi * 1.8 - vec2(0.0, ti * 1.5), 2);
        pi.x += (n1 - 0.5) * 0.4 * (pi.y + 1.0);

        // Базовая форма пламени (конус)
        float y = q.y + 0.8;
        float strength = 1.0 - length(pi * vec2(1.2, 0.4) - vec2(0.0, -0.8));
        strength = clamp(strength, 0.0, 1.0);

        // Языки пламени через шум
        // Оптимизация: используем 3 октавы вместо 5
        float n2 = fbm(pi * 2.5 - vec2(0.0, ti * 0.8), 3);
        float flame = strength * n2 * 2.8;

        // Ослабление сверху
        flame *= (1.0 - smoothstep(0.2, 1.5, y));

        finalFlame = max(finalFlame, flame);
    }

    // Пороговая обработка для выразительности
    finalFlame = smoothstep(0.1, 0.7, finalFlame);

    // Окрашивание через палитру
    vec3 col = getPalette(clamp(finalFlame, 0.0, 1.0), u_palette);

    // Добавляем внутреннее "жаркое" ядро
    float core = smoothstep(0.5, 0.9, finalFlame);
    col = mix(col, getPalette(0.9, u_palette), core * 0.5);

    return col;
}
`
};

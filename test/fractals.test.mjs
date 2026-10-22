import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fractals, getFractalById } from '../js/fractals/index.js';

describe('fractal registry', () => {
  it('has unique numeric ids', () => {
    const ids = fractals.map((f) => f.id);
    expect(ids.every(Number.isInteger)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives each entry a renderer matching its type', () => {
    for (const f of fractals) {
      expect(f.name, `id ${f.id}`).toBeTruthy();
      if (f.type === 'shader') expect(typeof f.glsl, f.name).toBe('string');
      else if (f.type === 'overlay') expect(typeof f.draw, f.name).toBe('function');
      else throw new Error(`${f.name}: unknown type ${f.type}`);
    }
  });

  it('looks entries up by id', () => {
    expect(getFractalById(0).name).toBe('Julia Set');
    expect(getFractalById(-1)).toBeUndefined();
  });

  it('backs every option in the fractal picker', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const select = html.match(/<select id="fractal">([\s\S]*?)<\/select>/)[1];
    const values = [...select.matchAll(/<option value="(\d+)"/g)].map((m) => Number(m[1]));
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(getFractalById(v), `option ${v}`).toBeDefined();
  });
});

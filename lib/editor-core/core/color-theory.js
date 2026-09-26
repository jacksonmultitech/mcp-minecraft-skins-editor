/**
 * @file color-theory.js
 * Herramientas de teoría del color, sin interfaz:
 *  - armonías (colores relacionados por su posición en el círculo cromático),
 *  - escalas tonales (del tono más claro al más oscuro),
 *  - paletas aleatorias,
 *  - agrupación de los colores usados en una skin.
 *
 * Las armonías giran el TONO en HSL (el círculo cromático clásico que usan
 * la mayoría de herramientas) y conservan saturación y luminosidad.
 * Las escalas y la agrupación usan OKLCH/OKLab porque son perceptuales:
 * pasos iguales se ven como cambios iguales.
 */
import { rgbToHsl, hslToRgb, rgbToOklch, rgbToOklab, oklchToRgb, rgbaToHex } from '../utils/color.js';
import { SKIN_WIDTH, SKIN_HEIGHT } from '../config.js';

/* ------------------------------------------------------------------------ */
/* Armonías                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Desplazamientos de tono (en grados) de cada armonía, respecto al color base.
 * El primer valor siempre es 0: el color base.
 */
export const HARMONIES = Object.freeze({
  analogous: [0, -30, 30],                      // Análogos: vecinos en el círculo
  complementary: [0, 180],                      // Complementario: el opuesto
  splitComplementary: [0, 150, 210],            // Complementario dividido: los vecinos del opuesto
  doubleSplitComplementary: [0, -30, 30, 150, 210], // Doble: vecinos del base y del opuesto
  triadic: [0, 120, 240],                       // Triádico: triángulo equilátero
  tetradic: [0, 90, 180, 270],                  // Tetrádico (cuadrado): cada 90°
  rectangle: [0, 60, 180, 240],                 // Rectángulo: dos pares complementarios
});

export const HARMONY_ORDER = Object.keys(HARMONIES);

/**
 * Calcula los colores de una armonía.
 * @param {number[]} rgba Color base.
 * @param {keyof HARMONIES} type
 * @returns {Array<{ rgba:number[], offset:number, hue:number }>}
 */
export function harmony([r, g, b, a = 255], type) {
  const { h, s, l } = rgbToHsl(r, g, b);
  return (HARMONIES[type] ?? HARMONIES.complementary).map((offset) => {
    const hue = (((h + offset) % 360) + 360) % 360;
    const rgba = offset === 0 ? [r, g, b, a] : [...hslToRgb(hue, s, l), a];
    return { rgba, offset, hue };
  });
}

/* ------------------------------------------------------------------------ */
/* Escala tonal                                                               */
/* ------------------------------------------------------------------------ */

/** Mueve un ángulo `from` hacia `to` por el camino más corto, en `amount` (0–1). */
function towardsHue(from, to, amount) {
  const diff = ((to - from + 540) % 360) - 180;
  return (from + diff * amount + 360) % 360;
}

/**
 * Genera una escala del color, del tono más claro al más oscuro.
 *
 * Modo "pixelart": las sombras se desplazan hacia el azul/violeta y las
 * luces hacia el amarillo. Es la técnica clásica ("hue shifting") para
 * sombrear skins y pixel art con más vida que simplemente oscurecer.
 *
 * @param {number[]} rgba Color base.
 * @param {{ steps?: number, mode?: 'linear'|'pixelart' }} [options]
 * @returns {{ colors: number[][], baseIndex: number }}
 *   baseIndex es la posición donde se colocó el color base exacto.
 */
export function tonalScale([r, g, b, a = 255], { steps = 11, mode = 'linear' } = {}) {
  const base = rgbToOklch(r, g, b);
  const L_MAX = 0.97, L_MIN = 0.18;
  const lightness = Array.from({ length: steps }, (_, i) => L_MAX - ((L_MAX - L_MIN) * i) / (steps - 1));
  // El paso más parecido en luminosidad se reemplaza por el color exacto.
  let baseIndex = 0;
  lightness.forEach((L, i) => { if (Math.abs(L - base.l) < Math.abs(lightness[baseIndex] - base.l)) baseIndex = i; });

  const colors = lightness.map((L, i) => {
    if (i === baseIndex) return [r, g, b, a];
    // Menos croma en los extremos (los muy claros y muy oscuros no pueden ser tan vivos).
    const distance = Math.abs(L - base.l);
    const chroma = base.c * Math.max(0.25, 1 - distance * 1.1);
    let hue = base.h;
    if (mode === 'pixelart' && base.c > 0.02) {
      const amount = Math.min(1, distance / 0.6) * 0.35;
      hue = L < base.l ? towardsHue(base.h, 275, amount) : towardsHue(base.h, 95, amount);
    }
    return [...oklchToRgb(L, chroma, hue), a];
  });
  return { colors, baseIndex };
}

/* ------------------------------------------------------------------------ */
/* Paleta aleatoria                                                           */
/* ------------------------------------------------------------------------ */

/**
 * Elige un color base agradable al azar (evita tonos demasiado grises o
 * demasiado saturados) y una armonía.
 * @param {() => number} [random] Generador (0–1), para poder probarlo.
 * @returns {{ base: number[], type: keyof HARMONIES }}
 */
export function randomPalette(random = Math.random) {
  const h = random() * 360;
  const s = 45 + random() * 40;
  const l = 38 + random() * 27;
  const type = HARMONY_ORDER[Math.floor(random() * HARMONY_ORDER.length)];
  return { base: [...hslToRgb(h, s, l), 255], type };
}

/* ------------------------------------------------------------------------ */
/* Agrupar los colores de una skin                                            */
/* ------------------------------------------------------------------------ */

/**
 * Familias de color según el tono OKLCH (grados). Los rangos siguen cómo
 * se perciben los nombres de colores; "neutral" agrupa grises, blanco y negro.
 */
export const COLOR_FAMILIES = [
  { id: 'red', from: 15, to: 45 },
  { id: 'orange', from: 45, to: 80 },
  { id: 'yellow', from: 80, to: 115 },
  { id: 'green', from: 115, to: 165 },
  { id: 'teal', from: 165, to: 220 },
  { id: 'blue', from: 220, to: 280 },
  { id: 'purple', from: 280, to: 330 },
  { id: 'pink', from: 330, to: 375 }, // 330–360 y 0–15
];

/** Croma por debajo del cual un color se considera neutro (gris). */
const NEUTRAL_CHROMA = 0.035;

/** Devuelve la familia de un color RGBA. */
export function colorFamily([r, g, b]) {
  const { c, h } = rgbToOklch(r, g, b);
  if (c < NEUTRAL_CHROMA) return 'neutral';
  const hue = h < 15 ? h + 360 : h;
  return COLOR_FAMILIES.find((f) => hue >= f.from && hue < f.to)?.id ?? 'pink';
}

/**
 * Analiza los colores visibles de la skin y los organiza:
 *  1. Cuenta cuántos píxeles usa cada color exacto.
 *  2. Une los colores casi iguales (distancia OKLab < tolerancia) en un solo
 *     grupo representado por el más usado. Así el "ruido" de una textura
 *     no llena la paleta de variantes imperceptibles.
 *  3. Clasifica cada grupo en una familia (rojos, azules, neutros…) y
 *     ordena las familias según el círculo cromático y cada familia de
 *     claro a oscuro, como una rampa de sombreado.
 *
 * @param {Uint8ClampedArray} pixels
 * @param {Int16Array} lookup Mapa de regiones (−1 = zona sin uso).
 * @param {{ tolerance?: number, limit?: number }} [options]
 *   tolerance: 0 = sin agrupar; 0.04 ≈ similares; 0.08 ≈ amplio.
 *   limit: máximo de grupos a mostrar (los más usados).
 * @returns {Array<{ family:string, groups: Array<{ rgba:number[], hex:string, pixels:number, variants:number, lightness:number }> }>}
 */
export function groupSkinColors(pixels, lookup, { tolerance = 0.04, limit = 48 } = {}) {
  // 1) Frecuencia de cada color exacto.
  const counts = new Map();
  for (let i = 0; i < SKIN_WIDTH * SKIN_HEIGHT; i++) {
    if (lookup[i] < 0 || pixels[i * 4 + 3] === 0) continue;
    const key = (pixels[i * 4] << 24 | pixels[i * 4 + 1] << 16 | pixels[i * 4 + 2] << 8 | pixels[i * 4 + 3]) >>> 0;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const colors = [...counts.entries()]
    .map(([key, n]) => ({ rgba: [key >>> 24, (key >>> 16) & 255, (key >>> 8) & 255, key & 255], n }))
    .sort((a, b) => b.n - a.n);

  // 2) Agrupación "codiciosa": cada color se une al primer grupo cercano.
  //    OKLab se calcula una sola vez por color (la búsqueda es O(colores × grupos)).
  const groups = [];
  for (const { rgba, n } of colors) {
    const lab = rgbToOklab(rgba[0], rgba[1], rgba[2]);
    const target = tolerance > 0
      ? groups.find((g) => Math.hypot(g.lab.L - lab.L, g.lab.a - lab.a, g.lab.b - lab.b, (g.rgba[3] - rgba[3]) / 510) < tolerance)
      : null;
    if (target) {
      target.pixels += n;
      target.variants += 1;
    } else {
      groups.push({ rgba, lab, pixels: n, variants: 1 });
    }
  }

  // 3) Los más usados, clasificados por familia y ordenados.
  const top = groups.sort((a, b) => b.pixels - a.pixels).slice(0, limit);
  const order = [...COLOR_FAMILIES.map((f) => f.id), 'neutral'];
  const byFamily = new Map(order.map((id) => [id, []]));
  for (const g of top) {
    byFamily.get(colorFamily(g.rgba)).push({
      rgba: g.rgba, hex: rgbaToHex(g.rgba, true), pixels: g.pixels, variants: g.variants, lightness: g.lab.L,
    });
  }
  return order
    .filter((id) => byFamily.get(id).length > 0)
    .map((family) => ({
      family,
      groups: byFamily.get(family).sort((a, b) => b.lightness - a.lightness),
    }));
}

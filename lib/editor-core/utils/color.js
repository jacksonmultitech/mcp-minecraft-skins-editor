/**
 * @file color.js
 * Utilidades de color: conversiones HEX ⇄ RGBA ⇄ HSV y ajustes de brillo.
 *
 * Convención: un color RGBA es un arreglo [r, g, b, a] con valores 0–255.
 */

/** Limita un número al rango [min, max]. */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Convierte "#rgb", "#rrggbb" o "#rrggbbaa" a RGBA.
 * @param {string} hex
 * @returns {number[] | null} [r,g,b,a] o null si el texto no es válido.
 */
export function hexToRgba(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  if (/^[0-9a-f]{6}$/i.test(h)) h += 'ff';
  if (!/^[0-9a-f]{8}$/i.test(h)) return null;
  return [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/**
 * Convierte RGBA a "#rrggbb" (o "#rrggbbaa" si `withAlpha` y a < 255).
 * @param {number[]} rgba
 * @param {boolean} [withAlpha=false]
 */
export function rgbaToHex([r, g, b, a = 255], withAlpha = false) {
  const hex = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  const base = `#${hex(r)}${hex(g)}${hex(b)}`;
  return withAlpha && a < 255 ? base + hex(a) : base;
}

/**
 * RGB (0–255) → HSV (h: 0–360, s: 0–1, v: 0–1).
 * @returns {{h:number, s:number, v:number}}
 */
export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/**
 * HSV → RGB (0–255).
 * @returns {number[]} [r, g, b]
 */
export function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((n) => Math.round((n + m) * 255));
}

/**
 * Aclara (amount > 0) u oscurece (amount < 0) un color manteniendo su tono.
 * Mezcla hacia blanco o hacia negro según el signo.
 * @param {number[]} rgba
 * @param {number} amount Valor entre -1 y 1.
 * @returns {number[]}
 */
export function shade([r, g, b, a], amount) {
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  return [r + (target - r) * t, g + (target - g) * t, b + (target - b) * t, a].map(Math.round);
}

/**
 * Aplica una variación aleatoria de brillo ("ruido"), muy usada para dar
 * textura a telas, cabello o piel al estilo de las skins de Minecraft.
 * @param {number[]} rgba
 * @param {number} intensity 0–1
 */
export function noise(rgba, intensity) {
  const delta = (Math.random() * 2 - 1) * intensity * 0.35;
  return shade(rgba, delta);
}

/* ------------------------------------------------------------------------ */
/* HSL                                                                        */
/* ------------------------------------------------------------------------ */

/**
 * RGB (0–255) → HSL (h: 0–360, s: 0–100, l: 0–100).
 * @returns {{h:number, s:number, l:number}}
 */
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: rgbToHsv(r * 255, g * 255, b * 255).h, s: s * 100, l: l * 100 };
}

/** HSL (h: 0–360, s y l: 0–100) → RGB (0–255). */
export function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

/* ------------------------------------------------------------------------ */
/* OKLab / OKLCH (espacio perceptual de Björn Ottosson, usado por CSS)        */
/* ------------------------------------------------------------------------ */

const toLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255;

/** RGB (0–255) → OKLab {L: 0–1, a, b}. */
export function rgbToOklab(r, g, b) {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** OKLab → RGB lineal SIN recortar (puede salir del rango 0–1). */
function oklabToLinear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** RGB (0–255) → OKLCH {l: 0–1, c: ≥0, h: 0–360}. */
export function rgbToOklch(r, g, b) {
  const { L, a, b: bb } = rgbToOklab(r, g, b);
  const c = Math.hypot(a, bb);
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h: c < 1e-4 ? 0 : h };
}

/**
 * OKLCH → RGB (0–255). Si el color no existe en sRGB, se reduce el croma
 * (búsqueda binaria) conservando luminosidad y tono: así el resultado se
 * parece lo más posible al color pedido.
 */
export function oklchToRgb(l, c, h) {
  const rad = (h * Math.PI) / 180;
  const inGamut = (cc) => oklabToLinear(l, cc * Math.cos(rad), cc * Math.sin(rad)).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  let chroma = c;
  if (!inGamut(chroma)) {
    let lo = 0, hi = chroma;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(mid)) lo = mid; else hi = mid;
    }
    chroma = lo;
  }
  return oklabToLinear(l, chroma * Math.cos(rad), chroma * Math.sin(rad))
    .map((v) => clamp(Math.round(toGamma(clamp(v, 0, 1))), 0, 255));
}

/**
 * Diferencia perceptual entre dos colores RGBA (ΔE en OKLab, incluye opacidad).
 * ~0.02 es casi imperceptible; ~0.1 es claramente distinto.
 */
export function colorDistance(a, b) {
  const p = rgbToOklab(a[0], a[1], a[2]);
  const q = rgbToOklab(b[0], b[1], b[2]);
  const alpha = ((a[3] ?? 255) - (b[3] ?? 255)) / 255;
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b, alpha * 0.5);
}

/* ------------------------------------------------------------------------ */
/* Texto ⇄ color                                                              */
/* ------------------------------------------------------------------------ */

/** Formatos de texto disponibles en la interfaz. */
export const COLOR_FORMATS = ['hex', 'rgb', 'hsl', 'oklch'];

const round = (n, d = 0) => Number(n.toFixed(d));

/**
 * Convierte un color RGBA a texto CSS en el formato pedido.
 * @param {number[]} rgba
 * @param {'hex'|'rgb'|'hsl'|'oklch'} format
 * @param {{ compact?: boolean }} [opts] compact: solo los números ("245, 73, 39").
 */
export function formatColor([r, g, b, a = 255], format, { compact = false } = {}) {
  const alpha = a < 255 ? round(a / 255, 2) : null;
  const withAlpha = (body) => (alpha === null ? body : `${body} / ${alpha}`);
  switch (format) {
    case 'rgb':
      return compact ? `${r}, ${g}, ${b}` : `rgb(${withAlpha(`${r} ${g} ${b}`)})`;
    case 'hsl': {
      const { h, s, l } = rgbToHsl(r, g, b);
      return compact ? `${round(h)}, ${round(s)}, ${round(l)}` : `hsl(${withAlpha(`${round(h)} ${round(s)}% ${round(l)}%`)})`;
    }
    case 'oklch': {
      const { l, c, h } = rgbToOklch(r, g, b);
      return compact ? `${round(l, 2)}, ${round(c, 2)}, ${round(h)}` : `oklch(${withAlpha(`${round(l * 100, 1)}% ${round(c, 3)} ${round(h, 1)}`)})`;
    }
    default:
      return rgbaToHex([r, g, b, a], true).toUpperCase();
  }
}

/** Lee un número CSS con posible "%" y lo escala: "50%" → 0.5 * pct. */
function cssNumber(token, pct = 1) {
  const t = String(token).trim();
  return t.endsWith('%') ? (parseFloat(t) / 100) * pct : parseFloat(t);
}

/**
 * Interpreta un color escrito por el usuario: HEX (#abc, abc, #aabbccdd),
 * rgb(), hsl(), oklch() (con comas o espacios) o un nombre CSS ("tomato").
 * @param {string} text
 * @returns {number[] | null} RGBA o null si no se reconoce.
 */
export function parseColor(text) {
  const str = String(text).trim().toLowerCase();
  if (!str) return null;
  const hex = hexToRgba(str);
  if (hex) return hex;

  const fn = str.match(/^(rgba?|hsla?|oklch)\(\s*([^)]*)\)$/);
  if (fn) {
    const parts = fn[2].replace(/\s*\/\s*/, ' / ').split(/[\s,]+/).filter(Boolean);
    const slash = parts.indexOf('/');
    const alphaToken = slash >= 0 ? parts[slash + 1] : parts[3];
    const [p1, p2, p3] = parts;
    const alpha = alphaToken === undefined ? 255 : Math.round(clamp(cssNumber(alphaToken, 1), 0, 1) * 255);
    if ([p1, p2, p3].some((p) => p === undefined || Number.isNaN(parseFloat(p)))) return null;
    let rgb;
    if (fn[1].startsWith('rgb')) rgb = [p1, p2, p3].map((p) => clamp(Math.round(cssNumber(p, 255)), 0, 255));
    else if (fn[1].startsWith('hsl')) rgb = hslToRgb(((parseFloat(p1) % 360) + 360) % 360, clamp(parseFloat(p2), 0, 100), clamp(parseFloat(p3), 0, 100));
    else rgb = oklchToRgb(clamp(cssNumber(p1, 1), 0, 1), Math.max(0, cssNumber(p2, 0.4)), ((parseFloat(p3) % 360) + 360) % 360);
    return [...rgb, alpha];
  }

  // Nombres CSS ("red", "rebeccapurple"…): el navegador los normaliza.
  if (/^[a-z]+$/.test(str) && typeof document !== 'undefined') {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = '#010203';
    ctx.fillStyle = str;
    if (ctx.fillStyle !== '#010203') return hexToRgba(ctx.fillStyle);
  }
  return null;
}

/** Compara dos colores RGBA. */
export const sameColor = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

/** Devuelve "#000" o "#fff" según cuál contraste mejor con el color dado. */
export function contrastText([r, g, b]) {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#111' : '#fff';
}

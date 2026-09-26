/**
 * @file skin-model.js
 * Definición geométrica del personaje y del mapa UV de la textura.
 *
 * Este módulo es la "fuente de verdad" que relaciona cada píxel de la
 * imagen PNG de 64×64 con una cara de un cubo del modelo 3D. Lo usan:
 *  - el renderizador (para generar vértices y coordenadas UV),
 *  - el picking (para saber qué píxel se pinta al hacer clic en 3D),
 *  - el editor 2D (para mostrar guías y nombres de cada zona),
 *  - el modo espejo (para encontrar el píxel simétrico).
 *
 * Sistema de coordenadas (unidades = píxeles de la skin):
 *  - Y hacia arriba; los pies están en y = 0 y la cabeza termina en y = 32.
 *  - El personaje mira hacia +Z (hacia la cámara inicial).
 *  - El lado DERECHO del personaje está en −X (a la izquierda de quien lo mira).
 *
 * Distribución UV de una caja con origen (u, v) y tamaño (w, h, d):
 *
 *            u   u+d      u+d+w    u+2d+w   u+2d+2w
 *        v   ┌───┬────────┬────────┐
 *            │   │ arriba │ abajo  │
 *      v+d   ├───┼────────┼────────┼────────┐
 *            │der│ frente │  izq   │ atrás  │
 *    v+d+h   └───┴────────┴────────┴────────┘
 *
 * Referencia: https://minecraft.wiki/w/Skin
 */
import { MODEL, LAYER, SKIN_WIDTH, SKIN_HEIGHT } from '../config.js';

/** Identificadores de las partes del cuerpo. */
export const PART = Object.freeze({
  HEAD: 'head',
  BODY: 'body',
  RIGHT_ARM: 'rightArm',
  LEFT_ARM: 'leftArm',
  RIGHT_LEG: 'rightLeg',
  LEFT_LEG: 'leftLeg',
});

/** Orden estable de las partes (útil para la interfaz). */
export const PART_ORDER = [PART.HEAD, PART.BODY, PART.RIGHT_ARM, PART.LEFT_ARM, PART.RIGHT_LEG, PART.LEFT_LEG];

/** Identificadores de las caras de un cubo. */
export const FACE_ORDER = ['top', 'bottom', 'right', 'front', 'left', 'back'];

/**
 * Datos de cada parte: posición en la textura (capa base y externa),
 * tamaño y posición en el espacio 3D en reposo.
 * `x` es la esquina mínima en X; `y` la altura de la base del cubo.
 */
const PART_SPECS = {
  [PART.HEAD]: {
    uv: { base: [0, 0], overlay: [32, 0] },
    size: [8, 8, 8], pos: [-4, 24, -4], pivot: [0, 24, 0], inflate: 0.5,
  },
  [PART.BODY]: {
    uv: { base: [16, 16], overlay: [16, 32] },
    size: [8, 12, 4], pos: [-4, 12, -2], pivot: [0, 24, 0], inflate: 0.25,
  },
  [PART.RIGHT_ARM]: {
    uv: { base: [40, 16], overlay: [40, 32] },
    size: [4, 12, 4], pos: [-8, 12, -2], pivot: [-5, 22, 0], inflate: 0.25,
    slim: { size: [3, 12, 4], pos: [-7, 12, -2] },
  },
  [PART.LEFT_ARM]: {
    uv: { base: [32, 48], overlay: [48, 48] },
    size: [4, 12, 4], pos: [4, 12, -2], pivot: [5, 22, 0], inflate: 0.25,
    slim: { size: [3, 12, 4], pos: [4, 12, -2] },
  },
  [PART.RIGHT_LEG]: {
    uv: { base: [0, 16], overlay: [0, 32] },
    size: [4, 12, 4], pos: [-4, 0, -2], pivot: [-2, 12, 0], inflate: 0.25,
  },
  [PART.LEFT_LEG]: {
    uv: { base: [16, 48], overlay: [0, 48] },
    size: [4, 12, 4], pos: [0, 0, -2], pivot: [2, 12, 0], inflate: 0.25,
  },
};

/**
 * Calcula los rectángulos UV de las 6 caras de una caja.
 * @returns {Record<string, {x:number,y:number,w:number,h:number}>}
 */
export function faceRects(u, v, w, h, d) {
  return {
    top: { x: u + d, y: v, w, h: d },
    bottom: { x: u + d + w, y: v, w, h: d },
    right: { x: u, y: v + d, w: d, h },
    front: { x: u + d, y: v + d, w, h },
    left: { x: u + d + w, y: v + d, w: d, h },
    back: { x: u + 2 * d + w, y: v + d, w, h },
  };
}

/**
 * Describe cómo se orienta cada cara en 3D a partir de la caja [min, max].
 * - origin: esquina 3D que corresponde al píxel superior izquierdo del rectángulo UV.
 * - uAxis / vAxis: direcciones (unitarias) en las que avanzan columnas y filas.
 * - uLen / vLen: longitud de la cara en esas direcciones.
 */
function faceFrame(face, min, max) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
  switch (face) {
    case 'front': return { normal: [0, 0, 1], origin: [x0, y1, z1], uAxis: [1, 0, 0], vAxis: [0, -1, 0], uLen: sx, vLen: sy };
    case 'back': return { normal: [0, 0, -1], origin: [x1, y1, z0], uAxis: [-1, 0, 0], vAxis: [0, -1, 0], uLen: sx, vLen: sy };
    case 'right': return { normal: [-1, 0, 0], origin: [x0, y1, z0], uAxis: [0, 0, 1], vAxis: [0, -1, 0], uLen: sz, vLen: sy };
    case 'left': return { normal: [1, 0, 0], origin: [x1, y1, z1], uAxis: [0, 0, -1], vAxis: [0, -1, 0], uLen: sz, vLen: sy };
    case 'top': return { normal: [0, 1, 0], origin: [x0, y1, z0], uAxis: [1, 0, 0], vAxis: [0, 0, 1], uLen: sx, vLen: sz };
    case 'bottom': return { normal: [0, -1, 0], origin: [x0, y0, z0], uAxis: [1, 0, 0], vAxis: [0, 0, 1], uLen: sx, vLen: sz };
    default: throw new Error(`Cara desconocida: ${face}`);
  }
}

/**
 * @typedef {Object} FaceInfo
 * @property {string} name        Nombre de la cara (top, front…).
 * @property {{x:number,y:number,w:number,h:number}} rect Rectángulo en la textura.
 * @property {number[]} normal
 * @property {number[]} origin
 * @property {number[]} uAxis
 * @property {number[]} vAxis
 * @property {number} uLen
 * @property {number} vLen
 *
 * @typedef {Object} BoxInfo
 * @property {string} key    Identificador único, p. ej. "head:overlay".
 * @property {string} part   Parte del cuerpo.
 * @property {string} layer  Capa (base u overlay).
 * @property {number[]} min  Esquina mínima (ya inflada si es capa externa).
 * @property {number[]} max  Esquina máxima.
 * @property {number[]} pivot Punto de giro para animaciones.
 * @property {FaceInfo[]} faces
 */

/** Caché de cajas por modelo (se calculan una sola vez). */
const boxCache = new Map();

/**
 * Devuelve las 12 cajas (6 partes × 2 capas) del modelo indicado.
 * @param {string} model MODEL.CLASSIC o MODEL.SLIM
 * @returns {BoxInfo[]}
 */
export function getBoxes(model) {
  if (boxCache.has(model)) return boxCache.get(model);
  const boxes = [];
  for (const part of PART_ORDER) {
    const spec = PART_SPECS[part];
    const variant = model === MODEL.SLIM && spec.slim ? spec.slim : spec;
    const [w, h, d] = variant.size;
    const pos = variant.pos;
    for (const layer of [LAYER.BASE, LAYER.OVERLAY]) {
      const inf = layer === LAYER.OVERLAY ? spec.inflate : 0;
      const min = [pos[0] - inf, pos[1] - inf, pos[2] - inf];
      const max = [pos[0] + w + inf, pos[1] + h + inf, pos[2] + d + inf];
      const [u, v] = spec.uv[layer];
      const rects = faceRects(u, v, w, h, d);
      const faces = FACE_ORDER.map((name) => ({ name, rect: rects[name], ...faceFrame(name, min, max) }));
      boxes.push({ key: `${part}:${layer}`, part, layer, min, max, pivot: spec.pivot, faces });
    }
  }
  boxCache.set(model, boxes);
  return boxes;
}

/* ------------------------------------------------------------------------ */
/* Mapa inverso: píxel de la textura → (parte, capa, cara)                   */
/* ------------------------------------------------------------------------ */

const regionCache = new Map();

/**
 * Construye una tabla con la región a la que pertenece cada píxel.
 * @param {string} model
 * @returns {{ lookup: Int16Array, regions: Array<{part:string, layer:string, face:string, rect:object}> }}
 *   `lookup[y*64+x]` es el índice en `regions`, o -1 si el píxel no se usa.
 */
export function getRegionMap(model) {
  if (regionCache.has(model)) return regionCache.get(model);
  const lookup = new Int16Array(SKIN_WIDTH * SKIN_HEIGHT).fill(-1);
  const regions = [];
  for (const box of getBoxes(model)) {
    for (const face of box.faces) {
      const idx = regions.length;
      regions.push({ part: box.part, layer: box.layer, face: face.name, rect: face.rect });
      const { x, y, w, h } = face.rect;
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) lookup[j * SKIN_WIDTH + i] = idx;
    }
  }
  const result = { lookup, regions };
  regionCache.set(model, result);
  return result;
}

/** Devuelve la región de un píxel o null si está fuera del mapa UV. */
export function regionAt(model, x, y) {
  if (x < 0 || y < 0 || x >= SKIN_WIDTH || y >= SKIN_HEIGHT) return null;
  const { lookup, regions } = getRegionMap(model);
  const idx = lookup[y * SKIN_WIDTH + x];
  return idx < 0 ? null : regions[idx];
}

/* ------------------------------------------------------------------------ */
/* Conversión entre punto 3D y píxel                                          */
/* ------------------------------------------------------------------------ */

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Convierte un punto 3D sobre una cara en el píxel correspondiente.
 * @param {FaceInfo} face
 * @param {number[]} p Punto sobre la cara.
 * @returns {{x:number, y:number}}
 */
export function pointToTexel(face, p) {
  const rel = [p[0] - face.origin[0], p[1] - face.origin[1], p[2] - face.origin[2]];
  const s = Math.min(0.9999, Math.max(0, dot(rel, face.uAxis) / face.uLen));
  const t = Math.min(0.9999, Math.max(0, dot(rel, face.vAxis) / face.vLen));
  return { x: face.rect.x + Math.floor(s * face.rect.w), y: face.rect.y + Math.floor(t * face.rect.h) };
}

/** Punto 3D del centro de un píxel de una cara. */
function texelCenter(face, x, y) {
  const s = (x - face.rect.x + 0.5) / face.rect.w;
  const t = (y - face.rect.y + 0.5) / face.rect.h;
  return [0, 1, 2].map((k) => face.origin[k] + face.uAxis[k] * s * face.uLen + face.vAxis[k] * t * face.vLen);
}

/* ------------------------------------------------------------------------ */
/* Modo espejo                                                                */
/* ------------------------------------------------------------------------ */

const MIRROR_PART = {
  [PART.HEAD]: PART.HEAD,
  [PART.BODY]: PART.BODY,
  [PART.RIGHT_ARM]: PART.LEFT_ARM,
  [PART.LEFT_ARM]: PART.RIGHT_ARM,
  [PART.RIGHT_LEG]: PART.LEFT_LEG,
  [PART.LEFT_LEG]: PART.RIGHT_LEG,
};
const MIRROR_FACE = { top: 'top', bottom: 'bottom', front: 'front', back: 'back', right: 'left', left: 'right' };

const mirrorCache = new Map();
const sideCache = new Map();

/**
 * Indica de qué lado del personaje está cada píxel:
 * -1 = lado derecho (x < 0), 1 = lado izquierdo (x > 0), 0 = sin uso.
 * @param {string} model
 * @returns {Int8Array}
 */
export function getSideMap(model) {
  if (sideCache.has(model)) return sideCache.get(model);
  const sides = new Int8Array(SKIN_WIDTH * SKIN_HEIGHT);
  for (const box of getBoxes(model)) {
    // Las caras internas de las piernas están justo en x = 0; en ese caso
    // se usa el lado en el que está la caja completa.
    const boxSide = Math.sign(box.min[0] + box.max[0]);
    for (const face of box.faces) {
      const { x, y, w, h } = face.rect;
      for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) {
          sides[j * SKIN_WIDTH + i] = Math.sign(texelCenter(face, i, j)[0]) || boxSide;
        }
      }
    }
  }
  sideCache.set(model, sides);
  return sides;
}

/**
 * Tabla de simetría: para cada píxel, el índice del píxel "espejo" respecto
 * al plano X = 0 (izquierda ⇄ derecha del personaje), o -1 si no aplica.
 *
 * Se calcula geométricamente: se toma el centro 3D del píxel, se refleja
 * en X y se busca qué píxel de la parte simétrica cae en ese punto. Así la
 * tabla es correcta tanto para el modelo clásico como para el delgado.
 * @param {string} model
 * @returns {Int32Array}
 */
export function getMirrorMap(model) {
  if (mirrorCache.has(model)) return mirrorCache.get(model);
  const map = new Int32Array(SKIN_WIDTH * SKIN_HEIGHT).fill(-1);
  const boxes = getBoxes(model);
  const byKey = new Map(boxes.map((b) => [b.key, b]));
  for (const box of boxes) {
    const target = byKey.get(`${MIRROR_PART[box.part]}:${box.layer}`);
    for (const face of box.faces) {
      const targetFace = target.faces.find((f) => f.name === MIRROR_FACE[face.name]);
      const { x, y, w, h } = face.rect;
      for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) {
          const c = texelCenter(face, i, j);
          const mirrored = [-c[0], c[1], c[2]];
          const t = pointToTexel(targetFace, mirrored);
          map[j * SKIN_WIDTH + i] = t.y * SKIN_WIDTH + t.x;
        }
      }
    }
  }
  mirrorCache.set(model, map);
  return map;
}

/* ------------------------------------------------------------------------ */
/* Utilidades para la conversión entre modelos                               */
/* ------------------------------------------------------------------------ */

/** Partes afectadas al cambiar entre brazos de 4 px y de 3 px. */
export const ARM_PARTS = [PART.RIGHT_ARM, PART.LEFT_ARM];

/**
 * Detecta si una skin usa el modelo delgado ("Alex").
 * En el modelo delgado quedan 4 zonas sin uso en los brazos; si alguna tiene
 * un píxel transparente, la skin es delgada. (Heurística usada también por
 * editores populares como skinview3d).
 * @param {Uint8ClampedArray} data Píxeles RGBA de 64×64.
 */
export function detectSlim(data) {
  const areas = [[50, 16, 2, 4], [54, 20, 2, 12], [42, 48, 2, 4], [46, 52, 2, 12]];
  for (const [x0, y0, w, h] of areas) {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (data[(y * SKIN_WIDTH + x) * 4 + 3] !== 255) return true;
      }
    }
  }
  return false;
}

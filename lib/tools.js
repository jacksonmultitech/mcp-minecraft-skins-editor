/**
 * @file tools.js
 * Definición del servidor MCP: herramientas que cualquier agente de IA puede usar.
 *
 * Hay dos tipos:
 *  - Herramientas "puras" (no necesitan el editor): mapa UV, armonías y escala tonal.
 *    Usan los mismos módulos del editor, copiados en lib/editor-core/.
 *  - Herramientas "en vivo": envían una orden al editor abierto del usuario a
 *    través del relevo (relay.js) y esperan su respuesta.
 *
 * Los nombres de las herramientas están en inglés (convención de MCP) y las
 * descripciones en español, que es el idioma del usuario.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { request, RelayError } from './relay.js';
import { getBoxes, PART_ORDER, FACE_ORDER } from './editor-core/core/skin-model.js';
import { parseColor, rgbaToHex, formatColor } from './editor-core/utils/color.js';
import { harmony, tonalScale, HARMONY_ORDER } from './editor-core/core/color-theory.js';

export const SERVER_INFO = { name: 'editor-skins-minecraft', version: '1.1.0' };

export const SERVER_INSTRUCTIONS = `Servidor para crear y editar skins de Minecraft (PNG 64×64) en el editor web del usuario, en vivo.

Flujo recomendado:
1. Pide al usuario el código de sesión: aparece en el editor al pulsar "Agente IA → Conectar" (formato XXXX-XXXX-XXXX). Úsalo como session_code en cada herramienta en vivo.
2. Consulta get_uv_layout para conocer dónde está cada parte y cara en la textura, y get_editor_state para ver el modelo actual (clásico = brazos de 4 px, delgado = 3 px).
3. Pinta con fill_face (colores base por cara), draw_face_pattern (detalles como ojos, boca, botones) y paint_pixels (píxeles sueltos). add_noise da textura. Usa color_harmony y tonal_scale para elegir paletas y sombras.
4. Revisa el resultado con get_skin_image (vista "preview" en 3D o "texture" plana) y corrige.
Cada acción queda como un paso que el usuario puede deshacer con Ctrl+Z. La capa "base" debe quedar opaca; la capa "overlay" (externa) sirve para sombreros, capuchas, chaquetas, etc. y puede tener transparencia.`;

/* ------------------------------------------------------------------------ */
/* Esquemas comunes                                                          */
/* ------------------------------------------------------------------------ */

const sessionCode = z.string().min(12).max(20)
  .describe('Código de sesión que muestra el editor al pulsar "Agente IA → Conectar" (ej. K7QM-X2PD-9RTA).');
const part = z.enum(PART_ORDER)
  .describe('Parte del cuerpo: head (cabeza), body (torso), rightArm, leftArm, rightLeg, leftLeg. "Derecha/izquierda" son del personaje.');
const layer = z.enum(['base', 'overlay'])
  .describe('Capa: "base" (el cuerpo, debe ser opaca) u "overlay" (capa externa: sombrero, chaqueta, mangas, pantalón).');
const face = z.enum(FACE_ORDER)
  .describe('Cara del cubo: top, bottom, right, front, left, back.');
const color = z.string().min(1).max(60)
  .describe('Color: "#RRGGBB", "#RRGGBBAA", "rgb(…)", "hsl(…)", "oklch(…)" o "transparent" (borra el píxel).');
const model = z.enum(['classic', 'slim']).describe('classic = brazos de 4 px (tipo "Steve"), slim = brazos de 3 px (tipo "Alex").');

/** Normaliza un color a #RRGGBBAA o lanza un error legible. */
function normalizeColor(input) {
  const text = String(input).trim().toLowerCase();
  if (text === 'transparent' || text === 'transparente') return '#00000000';
  const rgba = parseColor(text);
  if (!rgba) throw new RelayError(`Color no válido: "${input}". Usa por ejemplo "#3c6ea8", "rgb(60 110 168)" o "transparent".`);
  return rgbaToHex(rgba, true).length === 7 ? `${rgbaToHex(rgba)}ff` : rgbaToHex(rgba, true);
}

/* ------------------------------------------------------------------------ */
/* Respuestas                                                                */
/* ------------------------------------------------------------------------ */

const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const failure = (error) => ({
  isError: true,
  content: [{ type: 'text', text: error instanceof RelayError ? error.message : `Error inesperado: ${error.message}` }],
});

/** Envuelve un manejador para devolver errores legibles en vez de fallar. */
const safe = (fn) => async (args) => {
  try {
    return await fn(args);
  } catch (error) {
    return failure(error);
  }
};

/* ------------------------------------------------------------------------ */
/* Mapa UV (herramienta pura)                                                */
/* ------------------------------------------------------------------------ */

const ORIENTATION_NOTES = {
  front: 'Vista de frente al personaje: columna 0 a tu izquierda (lado derecho del personaje), fila 0 arriba.',
  back: 'Vista desde atrás: columna 0 a tu izquierda (lado izquierdo del personaje), fila 0 arriba.',
  right: 'Vista desde el lado derecho del personaje: columna 0 hacia la espalda, la última hacia el frente.',
  left: 'Vista desde el lado izquierdo del personaje: columna 0 hacia el frente, la última hacia la espalda.',
  top: 'Vista desde arriba: fila 0 = borde de atrás, última fila = borde del frente; columna 0 = lado derecho del personaje.',
  bottom: 'Vista desde abajo: fila 0 = borde de atrás, última fila = borde del frente; columna 0 = lado derecho del personaje.',
};

export function uvLayout(modelName = 'classic') {
  const parts = {};
  for (const box of getBoxes(modelName)) {
    parts[box.part] ??= {};
    parts[box.part][box.layer] = Object.fromEntries(box.faces.map((f) => [f.name, { ...f.rect }]));
  }
  return {
    model: modelName,
    texture: '64×64 px. Coordenadas (x, y) con origen arriba a la izquierda.',
    parts,
    orientation: ORIENTATION_NOTES,
    tips: [
      'La cara frontal de la cabeza (head.base.front) mide 8×8: los ojos suelen ir en la fila 4 (y = 12).',
      'En draw_face_pattern las filas se dibujan tal como se verían mirando esa cara de frente (ver "orientation").',
      'Los brazos miden 4 px de ancho en el modelo clásico y 3 px en el delgado.',
    ],
  };
}

/* ------------------------------------------------------------------------ */
/* Servidor                                                                  */
/* ------------------------------------------------------------------------ */

/** Crea un servidor MCP con todas las herramientas registradas. */
export function createMcpServer() {
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });

  /* ---------------------------- Herramientas puras ---------------------------- */

  server.registerTool('get_uv_layout', {
    title: 'Mapa UV de la skin',
    description: 'Devuelve dónde está cada parte, capa y cara dentro de la textura de 64×64 (x, y, ancho, alto) y cómo se orienta cada cara. No necesita el editor.',
    inputSchema: { model: model.optional() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, safe(async ({ model: m }) => text(uvLayout(m ?? 'classic'))));

  server.registerTool('color_harmony', {
    title: 'Armonía de colores',
    description: `Calcula colores que combinan con un color base según la teoría del color (rotando el tono en HSL). Tipos: ${HARMONY_ORDER.join(', ')}. No necesita el editor.`,
    inputSchema: {
      base: color.describe('Color base.'),
      type: z.enum(HARMONY_ORDER).describe('Tipo de armonía.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, safe(async ({ base, type }) => {
    const rgba = parseColor(normalizeColor(base));
    return text({
      type,
      colors: harmony(rgba, type).map((c) => ({ offset: c.offset, hex: formatColor(c.rgba, 'hex'), hsl: formatColor(c.rgba, 'hsl') })),
    });
  }));

  server.registerTool('tonal_scale', {
    title: 'Escala tonal (sombras y luces)',
    description: 'Genera una rampa de 11 tonos del más claro al más oscuro a partir de un color. mode "pixelart" desplaza las sombras hacia el azul y las luces hacia el amarillo (sombreado clásico de pixel art). No necesita el editor.',
    inputSchema: {
      base: color.describe('Color base.'),
      mode: z.enum(['linear', 'pixelart']).default('pixelart'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, safe(async ({ base, mode }) => {
    const { colors, baseIndex } = tonalScale(parseColor(normalizeColor(base)), { mode });
    return text({ mode, baseIndex, colors: colors.map((c) => formatColor(c, 'hex')) });
  }));

  /* ---------------------------- Herramientas en vivo --------------------------- */

  server.registerTool('get_editor_state', {
    title: 'Estado del editor',
    description: 'Lee el estado actual del editor del usuario: modelo, nombre, capa activa, colores más usados y avisos de compatibilidad.',
    inputSchema: { session_code: sessionCode },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, safe(async ({ session_code }) => text(await request(session_code, 'state', {}))));

  server.registerTool('get_skin_image', {
    title: 'Ver la skin',
    description: 'Devuelve una imagen de la skin actual. view "preview" = personaje en 3D (como en el juego), visto en diagonal desde el lado indicado en angle; "texture" = la textura plana 64×64 ampliada ×8 (cuadros grises = transparente).',
    inputSchema: {
      session_code: sessionCode,
      view: z.enum(['preview', 'texture']).default('preview'),
      angle: z.enum(['front', 'back', 'left', 'right']).default('front').describe('Lado desde el que se mira en la vista 3D.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, safe(async ({ session_code, view, angle }) => {
    const data = await request(session_code, 'image', { view, angle });
    return {
      content: [
        { type: 'image', data: data.base64, mimeType: 'image/png' },
        { type: 'text', text: `Imagen "${view}" de ${data.width}×${data.height} px.` },
      ],
    };
  }));

  server.registerTool('new_skin', {
    title: 'Nueva skin',
    description: 'Reemplaza la skin del editor por una nueva: "template" (personaje de ejemplo) o "blank" (todo transparente). Se puede deshacer.',
    inputSchema: {
      session_code: sessionCode,
      kind: z.enum(['template', 'blank']).default('blank'),
      model: model.optional(),
    },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, safe(async ({ session_code, kind, model: m }) => text(await request(session_code, 'new', { kind, model: m }))));

  server.registerTool('set_model', {
    title: 'Cambiar modelo de brazos',
    description: 'Cambia entre modelo clásico (brazos de 4 px) y delgado (3 px). adapt_arms reajusta la textura de los brazos para que no quede desplazada.',
    inputSchema: {
      session_code: sessionCode,
      model,
      adapt_arms: z.boolean().default(true),
    },
    annotations: { openWorldHint: false },
  }, safe(async ({ session_code, model: m, adapt_arms }) => text(await request(session_code, 'model', { model: m, adaptArms: adapt_arms }))));

  server.registerTool('paint_pixels', {
    title: 'Pintar píxeles',
    description: 'Pinta píxeles sueltos de la textura (coordenadas 0–63). Útil para detalles; para rellenar caras usa fill_face y para dibujos usa draw_face_pattern. Máximo 4096 píxeles por llamada.',
    inputSchema: {
      session_code: sessionCode,
      pixels: z.array(z.object({
        x: z.number().int().min(0).max(63),
        y: z.number().int().min(0).max(63),
        color,
      })).min(1).max(4096),
    },
    annotations: { openWorldHint: false },
  }, safe(async ({ session_code, pixels }) => {
    const normalized = pixels.map((p) => ({ x: p.x, y: p.y, color: normalizeColor(p.color) }));
    return text(await request(session_code, 'pixels', { pixels: normalized }));
  }));

  server.registerTool('fill_face', {
    title: 'Rellenar cara',
    description: 'Rellena con un color una cara de una parte del cuerpo (o todas sus caras con faces = ["all"]). Ideal para poner los colores base antes de los detalles.',
    inputSchema: {
      session_code: sessionCode,
      part,
      layer: layer.default('base'),
      faces: z.array(z.enum([...FACE_ORDER, 'all'])).min(1).default(['all']),
      color,
    },
    annotations: { openWorldHint: false },
  }, safe(async ({ session_code, part: p, layer: l, faces, color: c }) => text(await request(session_code, 'fill', {
    part: p, layer: l, faces: faces.includes('all') ? FACE_ORDER : faces, color: normalizeColor(c),
  }))));

  server.registerTool('draw_face_pattern', {
    title: 'Dibujar en una cara',
    description: 'Dibuja un patrón de caracteres sobre una cara (como arte ASCII). rows debe tener exactamente el alto de la cara y cada fila su ancho (ver get_uv_layout; p. ej. la cara frontal de la cabeza es 8×8). legend asigna un color a cada carácter; los caracteres que no están en legend dejan el píxel sin cambios. Usa en legend caracteres distintos entre sí, no la misma letra en mayúscula y minúscula (p. ej. "G" y "g"): algunos clientes rechazan esas claves como duplicadas. Las filas se dibujan tal como se ve la cara de frente.',
    inputSchema: {
      session_code: sessionCode,
      part,
      face,
      layer: layer.default('base'),
      rows: z.array(z.string().min(1).max(8)).min(1).max(12),
      legend: z.record(z.string().length(1), color)
        .describe('Carácter → color. No uses dos claves que solo difieren en mayúscula/minúscula (p. ej. "G" y "g"); elige otra letra.'),
    },
    annotations: { openWorldHint: false },
  }, safe(async ({ session_code, part: p, face: f, layer: l, rows, legend }) => {
    const normalizedLegend = Object.fromEntries(Object.entries(legend).map(([k, v]) => [k, normalizeColor(v)]));
    return text(await request(session_code, 'pattern', { part: p, face: f, layer: l, rows, legend: normalizedLegend }));
  }));

  server.registerTool('add_noise', {
    title: 'Agregar textura (ruido)',
    description: 'Varía levemente el brillo de los píxeles ya pintados para dar textura de tela, cabello o piel. intensity entre 0.02 (sutil) y 0.4 (fuerte).',
    inputSchema: {
      session_code: sessionCode,
      layer: layer.default('base'),
      parts: z.array(part).optional().describe('Partes a afectar (por defecto, todas).'),
      intensity: z.number().min(0.02).max(0.4).default(0.12),
    },
    annotations: { openWorldHint: false },
  }, safe(async ({ session_code, layer: l, parts, intensity }) => text(await request(session_code, 'noise', { layer: l, parts, intensity }))));

  server.registerTool('mirror_side', {
    title: 'Copiar un lado al otro',
    description: 'Copia de forma simétrica un lado del personaje sobre el otro (brazo y pierna incluidos).',
    inputSchema: {
      session_code: sessionCode,
      direction: z.enum(['right_to_left', 'left_to_right']).describe('right_to_left copia el lado derecho del personaje sobre el izquierdo.'),
      layer: layer.optional().describe('Si se omite, afecta a ambas capas.'),
    },
    annotations: { openWorldHint: false },
  }, safe(async ({ session_code, direction, layer: l }) => text(await request(session_code, 'mirror', { direction, layer: l }))));

  server.registerTool('clear_layer', {
    title: 'Limpiar capa',
    description: 'Vuelve transparentes todos los píxeles de una capa (o solo de algunas partes). Se puede deshacer.',
    inputSchema: {
      session_code: sessionCode,
      layer,
      parts: z.array(part).optional(),
    },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, safe(async ({ session_code, layer: l, parts }) => text(await request(session_code, 'clear', { layer: l, parts }))));

  server.registerTool('undo', {
    title: 'Deshacer',
    description: 'Deshace las últimas acciones en el editor.',
    inputSchema: { session_code: sessionCode, steps: z.number().int().min(1).max(20).default(1) },
    annotations: { openWorldHint: false },
  }, safe(async ({ session_code, steps }) => text(await request(session_code, 'undo', { steps }))));

  server.registerTool('redo', {
    title: 'Rehacer',
    description: 'Rehace acciones deshechas en el editor.',
    inputSchema: { session_code: sessionCode, steps: z.number().int().min(1).max(20).default(1) },
    annotations: { openWorldHint: false },
  }, safe(async ({ session_code, steps }) => text(await request(session_code, 'redo', { steps }))));

  server.registerTool('download_skin', {
    title: 'Descargar la skin',
    description: 'Pide al editor que descargue la skin como PNG de 64×64 en la computadora del usuario (el navegador puede pedir confirmación).',
    inputSchema: {
      session_code: sessionCode,
      file_name: z.string().max(48).optional().describe('Nombre del archivo sin extensión.'),
    },
    annotations: { openWorldHint: false },
  }, safe(async ({ session_code, file_name }) => text(await request(session_code, 'download', { fileName: file_name }))));

  return server;
}

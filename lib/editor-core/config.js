/**
 * @file config.js
 * Constantes globales de la aplicación.
 *
 * Centralizar aquí los "números mágicos" facilita ajustar el comportamiento
 * del editor sin tener que buscar valores repartidos por todo el código.
 */

/** Tamaño de la textura de una skin moderna (Java 1.8+ y Bedrock). */
export const SKIN_WIDTH = 64;
export const SKIN_HEIGHT = 64;

/** Alto de las skins antiguas (formato "legacy", anterior a Java 1.8). */
export const LEGACY_SKIN_HEIGHT = 32;

/** Modelos de brazos admitidos por el juego. */
export const MODEL = Object.freeze({
  CLASSIC: 'classic', // "Steve": brazos de 4 px
  SLIM: 'slim',       // "Alex":  brazos de 3 px
});

/** Capas de la skin. */
export const LAYER = Object.freeze({
  BASE: 'base',       // Capa interna (en Java siempre se dibuja opaca)
  OVERLAY: 'overlay', // Capa externa (sombrero, chaqueta, mangas, pantalón)
});

/** Máximo de pasos que guarda el historial de deshacer/rehacer. */
export const HISTORY_LIMIT = 100;

/** Claves usadas en localStorage (siempre envueltas en try/catch). */
export const STORAGE_KEYS = Object.freeze({
  THEME: 'mse.theme',
  AUTOSAVE: 'mse.autosave',
  SETTINGS: 'mse.settings',
  RECENT_COLORS: 'mse.recentColors',
  SIDEBAR_WIDTH: 'mse.sidebarWidth',
  AGENT_SESSION: 'mse.agentSession',
  BRIDGE_URL: 'mse.bridgeUrl',
});

/**
 * Ancho del panel lateral redimensionable (píxeles CSS).
 * MAX_VIEWPORT_RATIO evita que el panel ocupe más de ese porcentaje de la
 * ventana y deje sin espacio al lienzo de edición.
 */
export const SIDEBAR_LIMITS = Object.freeze({
  MIN: 280,
  MAX: 640,
  MAX_VIEWPORT_RATIO: 0.45,
  STEP: 16,
});

/**
 * Conexión con un agente de IA (servidor MCP publicado en Vercel).
 * La URL se puede cambiar desde "Agente IA → Opciones avanzadas"
 * o abriendo el editor con ?bridge=https://otro-servidor.
 */
export const REMOTE = Object.freeze({
  DEFAULT_BRIDGE_URL: 'https://editor-skins-mcp.vercel.app',
  POLL_ACTIVE_MS: 350,          // consulta rápida mientras el agente está trabajando
  POLL_WARM_MS: 1200,           // hasta 2 minutos después de la última orden
  POLL_IDLE_MS: 3000,           // sin actividad reciente
  ACTIVE_WINDOW_MS: 20_000,
  IDLE_DISCONNECT_MS: 30 * 60_000, // se desconecta solo tras 30 min sin órdenes
});

/** Cantidad de colores recientes que se recuerdan. */
export const RECENT_COLORS_LIMIT = 16;

/** Límites de zoom de la cámara 3D (distancia al objetivo, en "píxeles de skin"). */
export const CAMERA_LIMITS = Object.freeze({
  MIN_DISTANCE: 12,
  MAX_DISTANCE: 140,
  DEFAULT_DISTANCE: 58,
  MIN_PITCH: -Math.PI / 2 + 0.01,
  MAX_PITCH: Math.PI / 2 - 0.01,
});

/** Límites de zoom del editor 2D (tamaño en pantalla de cada píxel de la skin). */
export const CANVAS2D_LIMITS = Object.freeze({
  MIN_SCALE: 2,
  MAX_SCALE: 64,
});

/**
 * Umbral de opacidad para dibujar un píxel de la capa externa.
 * Minecraft Java descarta los píxeles casi transparentes ("cutout");
 * Bedrock oculta los que tienen opacidad ≤ 25/255.
 */
export const OVERLAY_ALPHA_CUTOFF = 26 / 255;

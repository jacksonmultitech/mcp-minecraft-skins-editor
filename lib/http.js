/**
 * @file http.js
 * Utilidades HTTP compartidas por las funciones de /api (API Web estándar:
 * Request/Response, compatible con Vercel y con el servidor de desarrollo).
 */
import { RelayError } from './relay.js';

/**
 * Orígenes que pueden usar el puente del editor (CORS).
 * Se puede ampliar con la variable ALLOWED_ORIGINS (separada por comas).
 */
export function allowedOrigins(env = process.env) {
  const defaults = ['https://jacksonmultitech.github.io'];
  const extra = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return [...defaults, ...extra];
}

/** ¿El origen está permitido? Localhost se acepta siempre (desarrollo). */
export function isAllowedOrigin(origin, env = process.env) {
  if (!origin) return false;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return allowedOrigins(env).includes(origin);
}

/** Cabeceras CORS para el puente (solo orígenes permitidos). */
export function bridgeCorsHeaders(request) {
  const origin = request.headers.get('origin');
  if (!isAllowedOrigin(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

/** Respuesta JSON. */
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

/** Lee el cuerpo JSON con un límite de tamaño. */
export async function readJson(request, maxBytes = 3_000_000) {
  const textBody = await request.text();
  if (textBody.length > maxBytes) throw new RelayError('Cuerpo demasiado grande.', 413, 'too_large');
  try {
    return textBody ? JSON.parse(textBody) : {};
  } catch {
    throw new RelayError('JSON inválido.', 400, 'bad_json');
  }
}

/** IP del cliente (Vercel la envía en x-forwarded-for). */
export function clientIp(request) {
  return (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
}

/**
 * Envuelve un manejador del puente: CORS, preflight, origen y errores.
 * @param {(request: Request) => Promise<Response|object>} handler
 */
export function bridgeHandler(handler) {
  return async (request) => {
    const cors = bridgeCorsHeaders(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    // El puente solo lo usa el editor desde un navegador con un origen permitido.
    if (!isAllowedOrigin(request.headers.get('origin'))) {
      return json({ error: 'Origen no permitido.', code: 'forbidden_origin' }, 403);
    }
    try {
      const result = await handler(request);
      return result instanceof Response ? result : json(result, 200, cors);
    } catch (error) {
      const status = error instanceof RelayError ? error.status : 500;
      if (status === 500) console.error(error);
      return json({ error: error.message, code: error.code ?? 'server_error' }, status, cors);
    }
  };
}

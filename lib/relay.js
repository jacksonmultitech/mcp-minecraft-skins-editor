/**
 * @file relay.js
 * Relevo de órdenes entre Claude (vía MCP) y el editor abierto en el navegador.
 *
 * Las funciones de Vercel no pueden mantener una conexión abierta con el
 * navegador, así que el relevo usa Redis como buzón:
 *
 *   Claude → herramienta MCP → enqueue()  → lista  q:<código>
 *   Editor → poll() cada pocos cientos de ms  ← toma las órdenes de la lista
 *   Editor → postResults()                  → claves r:<código>:<id>
 *   Claude ← waitForResult() lee la respuesta ←
 *
 * Seguridad:
 *  - El código de sesión (≈60 bits aleatorios) es lo que el usuario le da a Claude.
 *  - El editor recibe además un token secreto; solo quien lo tiene puede leer
 *    órdenes o responder. En Redis se guarda su hash SHA-256, no el token.
 *  - Todo vence solo: sesión a las 3 h, respuestas al minuto.
 */
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { getStore } from './store.js';

export const SESSION_TTL_S = 3 * 60 * 60;   // 3 horas
export const ALIVE_TTL_S = 25;              // el editor "sigue ahí" si consultó hace < 25 s
export const RESULT_TTL_S = 60;
export const MAX_BATCH = 20;                // órdenes entregadas por consulta
export const SESSIONS_PER_IP_PER_HOUR = 30;

/** Alfabeto sin caracteres confusos (sin 0/O, 1/I/L). */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Error con código HTTP, para responder al editor con el estado correcto. */
export class RelayError extends Error {
  constructor(message, status = 400, code = 'bad_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Genera un código legible: XXXX-XXXX-XXXX (≈59 bits). */
export function generateCode() {
  const bytes = randomBytes(12);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8).join('')}`;
}

/** Normaliza lo que escriba el usuario ("abcd efgh-ijkl" → "ABCD-EFGH-IJKL"). */
export function normalizeCode(input) {
  const clean = String(input ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (clean.length !== 12 || [...clean].some((c) => !ALPHABET.includes(c))) {
    throw new RelayError('Código de sesión inválido. Debe tener 12 caracteres, como "K7QM-X2PD-9RTA". Pídelo al usuario: aparece en el editor al pulsar "Conectar con Claude".', 400, 'invalid_code');
  }
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8)}`;
}

const hash = (token) => createHash('sha256').update(String(token)).digest('hex');
const keys = (code) => ({
  session: `sess:${code}`,
  queue: `q:${code}`,
  alive: `alive:${code}`,
  result: (id) => `r:${code}:${id}`,
});

/**
 * Crea una sesión nueva para un editor.
 * @param {string} [ip] Para limitar abusos (máx. SESSIONS_PER_IP_PER_HOUR).
 * @returns {Promise<{code:string, token:string, expiresIn:number}>}
 */
export async function createSession(ip = 'desconocida') {
  const store = getStore();
  const rateKey = `rate:${hash(ip).slice(0, 16)}`;
  const count = await store.cmd('INCR', rateKey);
  if (count === 1) await store.cmd('EXPIRE', rateKey, 3600);
  if (count > SESSIONS_PER_IP_PER_HOUR) {
    throw new RelayError('Demasiadas sesiones creadas desde esta conexión. Intenta en una hora.', 429, 'rate_limited');
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const token = randomBytes(32).toString('hex');
    const record = JSON.stringify({ tokenHash: hash(token), createdAt: Date.now() });
    const ok = await store.cmd('SET', keys(code).session, record, 'EX', SESSION_TTL_S, 'NX');
    if (ok === 'OK') return { code, token, expiresIn: SESSION_TTL_S };
  }
  throw new RelayError('No se pudo crear la sesión. Intenta de nuevo.', 500, 'server_error');
}

/** Verifica que el token del editor corresponde a la sesión. */
async function verifyEditor(code, token) {
  const raw = await getStore().cmd('GET', keys(code).session);
  if (!raw) throw new RelayError('La sesión no existe o ya venció. Vuelve a conectar el editor.', 404, 'session_not_found');
  const { tokenHash } = JSON.parse(raw);
  const a = Buffer.from(tokenHash, 'hex');
  const b = Buffer.from(hash(token), 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new RelayError('Token de editor inválido.', 403, 'forbidden');
  }
}

/**
 * El editor pide órdenes pendientes (y así avisa que sigue conectado).
 * @returns {Promise<object[]>} Órdenes en el orden en que Claude las envió.
 */
export async function poll(codeInput, token) {
  const code = normalizeCode(codeInput);
  await verifyEditor(code, token);
  const k = keys(code);
  const [, , popped] = await getStore().pipeline([
    ['SET', k.alive, Date.now(), 'EX', ALIVE_TTL_S],
    ['EXPIRE', k.session, SESSION_TTL_S],
    ['LPOP', k.queue, MAX_BATCH],
  ]);
  const list = Array.isArray(popped) ? popped : popped ? [popped] : [];
  return list.map((item) => JSON.parse(item));
}

/**
 * El editor entrega los resultados de las órdenes que ejecutó.
 * @param {Array<{id:string, ok:boolean, data?:any, error?:string}>} results
 */
export async function postResults(codeInput, token, results) {
  const code = normalizeCode(codeInput);
  await verifyEditor(code, token);
  if (!Array.isArray(results) || results.length === 0) return 0;
  const k = keys(code);
  const commands = results
    .filter((r) => r && typeof r.id === 'string' && r.id.length <= 64)
    .map((r) => ['SET', k.result(r.id), JSON.stringify({ ok: Boolean(r.ok), data: r.data ?? null, error: r.error ?? null }), 'EX', RESULT_TTL_S]);
  if (commands.length) await getStore().pipeline(commands);
  return commands.length;
}

/** El editor cierra la sesión (botón "Desconectar"). */
export async function endSession(codeInput, token) {
  const code = normalizeCode(codeInput);
  await verifyEditor(code, token);
  const k = keys(code);
  await getStore().cmd('DEL', k.session, k.queue, k.alive);
}

/**
 * Claude envía una orden al editor.
 * @param {string} codeInput Código que el usuario le dio a Claude.
 * @param {string} op Operación (ver EDITOR_OPS en tools.js).
 * @param {object} args
 * @returns {Promise<string>} id de la orden.
 */
export async function enqueue(codeInput, op, args = {}) {
  const code = normalizeCode(codeInput);
  const store = getStore();
  const k = keys(code);
  const [exists, alive] = await store.pipeline([['EXISTS', k.session], ['EXISTS', k.alive]]);
  if (!exists) {
    throw new RelayError(`No hay ninguna sesión activa con el código ${code}. Pide al usuario que abra el editor, pulse "Conectar con Claude" y te dé el código que aparece.`, 404, 'session_not_found');
  }
  if (!alive) {
    throw new RelayError('La sesión existe, pero el editor no responde: puede que la pestaña esté cerrada o sin conexión. Pide al usuario que tenga el editor abierto y conectado.', 409, 'editor_offline');
  }
  const id = randomUUID();
  await store.pipeline([
    ['RPUSH', k.queue, JSON.stringify({ id, op, args, at: Date.now() })],
    ['EXPIRE', k.queue, SESSION_TTL_S],
  ]);
  return id;
}

/**
 * Espera la respuesta del editor a una orden.
 * @param {number} [timeoutMs=20000]
 */
export async function waitForResult(codeInput, id, timeoutMs = 20000) {
  const code = normalizeCode(codeInput);
  const store = getStore();
  const key = keys(code).result(id);
  const deadline = Date.now() + timeoutMs;
  let delay = 150;
  while (Date.now() < deadline) {
    const raw = await store.cmd('GET', key);
    if (raw) {
      await store.cmd('DEL', key);
      return JSON.parse(raw);
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay + 100, 600);
  }
  throw new RelayError('El editor no respondió a tiempo. Puede estar en una pestaña en segundo plano o sin conexión; la orden quedó en cola y se aplicará cuando responda.', 504, 'timeout');
}

/** Envía una orden y espera su resultado (atajo usado por las herramientas MCP). */
export async function request(codeInput, op, args, timeoutMs) {
  const id = await enqueue(codeInput, op, args);
  const result = await waitForResult(codeInput, id, timeoutMs);
  if (!result.ok) throw new RelayError(result.error || 'El editor no pudo realizar la acción.', 422, 'editor_error');
  return result.data;
}

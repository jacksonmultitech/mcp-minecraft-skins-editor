/**
 * @file api/health.js
 * GET /api/health → estado del servicio (útil para verificar el despliegue).
 */
import { getStore } from '../lib/store.js';
import { json } from '../lib/http.js';
import { SERVER_INFO } from '../lib/tools.js';

export async function GET() {
  const store = getStore();
  let storeOk = false;
  let error = null;
  try {
    storeOk = (await store.cmd('PING')) === 'PONG';
  } catch (e) {
    error = e.message;
  }
  return json({
    ok: storeOk && store.kind === 'upstash',
    server: SERVER_INFO,
    store: store.kind,
    storeSource: store.source,
    storeOk,
    error,
    warning: store.kind === 'memory'
      ? 'Sin Upstash Redis: el relevo usa memoria y no funcionará entre funciones de Vercel. Conecta la base de datos al proyecto y vuelve a desplegar.'
      : null,
  });
}

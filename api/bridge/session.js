/**
 * @file api/bridge/session.js
 * POST   /api/bridge/session → el editor crea una sesión y recibe { code, token }.
 * DELETE /api/bridge/session → el editor cierra la sesión ({ code, token }).
 */
import { createSession, endSession } from '../../lib/relay.js';
import { bridgeHandler, readJson, clientIp } from '../../lib/http.js';

export const POST = bridgeHandler(async (request) => createSession(clientIp(request)));

export const DELETE = bridgeHandler(async (request) => {
  const { code, token } = await readJson(request);
  await endSession(code, token);
  return { ok: true };
});

export const OPTIONS = POST;

/**
 * @file api/bridge/poll.js
 * POST /api/bridge/poll  { code, token }  →  { commands: [...] }
 * El editor consulta periódicamente si el agente envió órdenes.
 */
import { poll } from '../../lib/relay.js';
import { bridgeHandler, readJson } from '../../lib/http.js';

export const POST = bridgeHandler(async (request) => {
  const { code, token } = await readJson(request, 10_000);
  return { commands: await poll(code, token) };
});

export const OPTIONS = POST;

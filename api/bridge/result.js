/**
 * @file api/bridge/result.js
 * POST /api/bridge/result  { code, token, results: [{ id, ok, data?, error? }] }
 * El editor devuelve el resultado de cada orden ejecutada.
 */
import { postResults } from '../../lib/relay.js';
import { bridgeHandler, readJson } from '../../lib/http.js';

export const POST = bridgeHandler(async (request) => {
  const { code, token, results } = await readJson(request);
  return { saved: await postResults(code, token, results) };
});

export const OPTIONS = POST;

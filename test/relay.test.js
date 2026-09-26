/**
 * Pruebas del relevo con el almacén en memoria (sin red).
 * Ejecutar: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, setStore, findUpstashCredentials } from '../lib/store.js';
import { createSession, poll, postResults, enqueue, waitForResult, endSession, normalizeCode, generateCode } from '../lib/relay.js';

setStore(new MemoryStore());

test('los códigos tienen el formato XXXX-XXXX-XXXX y se normalizan', () => {
  const code = generateCode();
  assert.match(code, /^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
  assert.equal(normalizeCode(code.toLowerCase().replace(/-/g, ' ')), code);
  assert.throws(() => normalizeCode('corto'), /inválido/);
});

test('flujo completo: orden → consulta del editor → resultado', async () => {
  const { code, token } = await createSession('1.2.3.4');
  await poll(code, token); // el editor "se presenta"
  const id = await enqueue(code, 'pixels', { pixels: [] });
  const [cmd] = await poll(code, token);
  assert.equal(cmd.id, id);
  assert.equal(cmd.op, 'pixels');
  await postResults(code, token, [{ id, ok: true, data: { painted: 0 } }]);
  const result = await waitForResult(code, id, 2000);
  assert.deepEqual(result, { ok: true, data: { painted: 0 }, error: null });
});

test('rechaza token incorrecto y sesiones inexistentes', async () => {
  const { code } = await createSession('5.6.7.8');
  await assert.rejects(() => poll(code, 'x'.repeat(64)), /Token/);
  await assert.rejects(() => enqueue('ABCD-EFGH-JKMN', 'state'), /No hay ninguna sesión/);
});

test('avisa si el editor no está consultando', async () => {
  const { code } = await createSession('9.9.9.9');
  await assert.rejects(() => enqueue(code, 'state'), /no responde/);
});

test('cerrar sesión la elimina', async () => {
  const { code, token } = await createSession('1.1.1.1');
  await endSession(code, token);
  await assert.rejects(() => poll(code, token), /no existe/);
});

test('detecta credenciales de Upstash con prefijo personalizado', () => {
  const creds = findUpstashCredentials({ STORAGE_REST_API_URL: 'https://x.upstash.io', STORAGE_REST_API_TOKEN: 't' });
  assert.equal(creds.url, 'https://x.upstash.io');
  assert.equal(findUpstashCredentials({}), null);
});

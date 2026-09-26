/**
 * Prueba de integración: cliente MCP oficial → servidor local → relevo →
 * "editor" simulado que responde las órdenes.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MemoryStore, setStore } from '../lib/store.js';
import { createSession, poll, postResults } from '../lib/relay.js';
import { startDevServer } from '../scripts/dev-server.js';

setStore(new MemoryStore());
const PORT = 3999;
let server;
let client;
let fakeEditor;

before(async () => {
  server = await startDevServer(PORT);
  client = new Client({ name: 'prueba', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://localhost:${PORT}/mcp`)));
});

after(async () => {
  clearInterval(fakeEditor);
  await client.close();
  server.close();
});

test('lista las herramientas', async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  for (const n of ['get_uv_layout', 'paint_pixels', 'fill_face', 'draw_face_pattern', 'get_skin_image', 'color_harmony']) {
    assert.ok(names.includes(n), `falta ${n}`);
  }
});

test('herramientas puras: mapa UV y armonía', async () => {
  const uv = JSON.parse((await client.callTool({ name: 'get_uv_layout', arguments: { model: 'slim' } })).content[0].text);
  assert.deepEqual(uv.parts.head.base.front, { x: 8, y: 8, w: 8, h: 8 });
  assert.equal(uv.parts.rightArm.base.front.w, 3);
  const h = JSON.parse((await client.callTool({ name: 'color_harmony', arguments: { base: '#ff0000', type: 'triadic' } })).content[0].text);
  assert.deepEqual(h.colors.map((c) => c.hex), ['#FF0000', '#00FF00', '#0000FF']);
});

test('herramienta en vivo con un editor simulado', async () => {
  const { code, token } = await createSession('test');
  await poll(code, token);
  const received = [];
  fakeEditor = setInterval(async () => {
    const cmds = await poll(code, token);
    for (const c of cmds) {
      received.push(c);
      await postResults(code, token, [{ id: c.id, ok: true, data: { painted: c.args.pixels?.length ?? 0 } }]);
    }
  }, 50);
  const res = await client.callTool({ name: 'paint_pixels', arguments: { session_code: code, pixels: [{ x: 1, y: 2, color: 'rgb(255 0 0)' }, { x: 3, y: 4, color: 'transparent' }] } });
  assert.ok(!res.isError, res.content[0].text);
  assert.equal(JSON.parse(res.content[0].text).painted, 2);
  assert.deepEqual(received[0].args.pixels.map((p) => p.color), ['#ff0000ff', '#00000000']);
});

test('errores legibles: código inválido y color inválido', async () => {
  const bad = await client.callTool({ name: 'get_editor_state', arguments: { session_code: 'XXXXXXXXXXXX1' } });
  assert.ok(bad.isError);
  assert.match(bad.content[0].text, /Código de sesión inválido/);
  const badColor = await client.callTool({ name: 'color_harmony', arguments: { base: 'nocolor', type: 'triadic' } });
  assert.ok(badColor.isError);
  assert.match(badColor.content[0].text, /Color no válido/);
});

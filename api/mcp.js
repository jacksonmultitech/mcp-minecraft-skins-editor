/**
 * @file api/mcp.js
 * Endpoint MCP (transporte "Streamable HTTP" en modo sin estado).
 * Se publica en /mcp gracias a la reescritura de vercel.json.
 *
 * Sin estado = cada petición crea su propio servidor y transporte. Encaja con
 * las funciones de Vercel, que no conservan memoria entre peticiones; el
 * estado compartido vive en Redis (ver lib/relay.js).
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from '../lib/tools.js';

/** CORS abierto: permite probar el servidor con clientes MCP web (p. ej. MCP Inspector). */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, Mcp-Protocol-Version',
};

function withCors(response) {
  const headers = new Headers(response.headers);
  Object.entries(CORS).forEach(([k, v]) => headers.set(k, v));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function POST(request) {
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // modo sin estado
    enableJsonResponse: true,      // respuestas JSON simples en vez de streams SSE
  });
  await server.connect(transport);
  try {
    return withCors(await transport.handleRequest(request));
  } catch (error) {
    console.error(error);
    return withCors(Response.json(
      { jsonrpc: '2.0', error: { code: -32603, message: 'Error interno del servidor' }, id: null },
      { status: 500 },
    ));
  } finally {
    // La respuesta ya está completa (JSON), así que se puede cerrar.
    transport.close().catch(() => {});
    server.close().catch(() => {});
  }
}

/** En modo sin estado no hay flujo SSE para GET ni sesiones que cerrar con DELETE. */
function methodNotAllowed() {
  return withCors(Response.json(
    { jsonrpc: '2.0', error: { code: -32000, message: 'Método no permitido. Usa POST.' }, id: null },
    { status: 405, headers: { Allow: 'POST, OPTIONS' } },
  ));
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * @file scripts/dev-server.js
 * Servidor local que imita a Vercel para desarrollar y probar sin desplegar:
 *  - /mcp y /api/*  → ejecuta las funciones de la carpeta api/ (Request/Response)
 *  - el resto       → archivos estáticos de public/
 *
 * Uso: npm run dev   (puerto 3000, o PORT=xxxx npm run dev)
 * Sin variables de Upstash, el relevo usa memoria (suficiente en local).
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

/** Ruta → archivo de función (como hace Vercel con la carpeta api/). */
function routeToApi(pathname) {
  if (pathname === '/mcp') return 'api/mcp.js';
  if (pathname.startsWith('/api/')) return `${pathname.slice(1).replace(/\/$/, '')}.js`;
  return null;
}

/** Convierte la petición de Node en un Request estándar. */
async function toRequest(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(`http://localhost:${PORT}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
  });
}

export function startDevServer(port = PORT) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      const apiFile = routeToApi(url.pathname);
      if (apiFile) {
        const mod = await import(pathToFileURL(join(root, apiFile)).href);
        const handler = mod[req.method];
        if (!handler) { res.writeHead(405).end(); return; }
        const response = await handler(await toRequest(req));
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const file = normalize(join(root, 'public', url.pathname === '/' ? 'index.html' : url.pathname));
      if (!file.startsWith(join(root, 'public'))) { res.writeHead(403).end(); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(data);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ERR_MODULE_NOT_FOUND') { res.writeHead(404).end('No encontrado'); return; }
      console.error(error);
      res.writeHead(500).end('Error interno');
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

// Ejecutado directamente: iniciar el servidor.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startDevServer().then(() => console.log(`Servidor MCP local en http://localhost:${PORT}  (MCP: /mcp)`));
}

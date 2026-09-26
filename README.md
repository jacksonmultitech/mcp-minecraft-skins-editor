# MCP del Editor de Skins de Minecraft

Servidor [MCP](https://modelcontextprotocol.io) que permite a Claude **crear y editar skins en vivo** dentro del [Editor de Skins de Minecraft](https://jacksonmultitech.github.io/minecraft-skins-editor/). Tú ves cada cambio en el editor mientras Claude pinta, y puedes deshacerlo con `Ctrl`+`Z`.

> 🤖 **Todo este proyecto fue creado con Claude AI "Opus 5.5"** (Anthropic): el servidor, las herramientas MCP, la documentación y las pruebas.

- Endpoint MCP: `https://<tu-proyecto>.vercel.app/mcp` (HTTP “streamable”, sin autenticación, sin estado).
- Página informativa con el estado del servicio: `https://<tu-proyecto>.vercel.app/`.

## Cómo funciona

```
 Claude ──(MCP / HTTP)──▶ /mcp ──▶ cola en Upstash Redis ◀──(consulta)── Editor (navegador)
        ◀── resultado ──────────── resultados en Redis ───(responde)──▶
```

1. En el editor, **Conectar con Claude** crea una sesión: el servidor devuelve un **código** (por ejemplo `K7QM-X2PD-9RTA`) y un **token** secreto que nunca sale del navegador.
2. Le das el código a Claude. Cada herramienta que usa Claude deja una orden en la cola de esa sesión.
3. El editor consulta la cola (cada 350 ms cuando hay actividad, hasta 3 s en reposo), ejecuta las órdenes con su propio motor y devuelve el resultado.
4. La herramienta espera el resultado (hasta ~20 s) y se lo entrega a Claude.

Como el editor ejecuta todo, el servidor **no guarda skins**: solo órdenes y resultados durante segundos.

## Herramientas

| Herramienta | Qué hace | Necesita el editor |
|---|---|---|
| `get_uv_layout` | Mapa de la textura 64×64: coordenadas de cada parte, capa y cara. | No |
| `color_harmony` | Armonías (complementaria, análoga, tríada…) a partir de un color. | No |
| `tonal_scale` | Rampa de sombreado normal o estilo pixel art. | No |
| `get_editor_state` | Modelo, colores usados, avisos de compatibilidad. | Sí |
| `get_skin_image` | Imagen 3D (frente, espalda, izquierda, derecha) o de la textura. | Sí |
| `new_skin` · `set_model` | Empezar de cero o desde plantilla; brazos de 4 o 3 px. | Sí |
| `fill_face` · `draw_face_pattern` · `paint_pixels` | Pintar caras completas, dibujos tipo arte ASCII y píxeles sueltos. | Sí |
| `add_noise` · `mirror_side` · `clear_layer` | Textura, simetría y limpieza de capas. | Sí |
| `undo` · `redo` · `download_skin` | Historial y descarga del PNG. | Sí |

Los errores se devuelven en español y con la causa concreta (por ejemplo, “La cara head.base.front mide 8×8…”), para que Claude pueda corregirse solo.

## Estructura

```
api/mcp.js            Endpoint MCP (/mcp se reescribe aquí)
api/health.js         Estado del servicio y del almacenamiento
api/bridge/           session · poll · result: API que usa el editor
lib/tools.js          Definición de las herramientas (zod)
lib/relay.js          Sesiones, cola de órdenes y resultados
lib/store.js          Upstash Redis por REST (o memoria en local)
lib/http.js           CORS y respuestas JSON
lib/editor-core/      Copia del núcleo del editor (mapa UV y teoría del color)
public/index.html     Página informativa
scripts/dev-server.js Servidor local que imita a Vercel
scripts/sync-core.js  Actualiza lib/editor-core desde el repositorio del editor
test/                 Pruebas (node --test)
```

## Despliegue en Vercel

1. Importa este repositorio en Vercel (Framework: **Other**; no necesita comando de compilación).
2. Conecta una base **Upstash Redis** al proyecto (Storage → Upstash → Connect). Vercel crea las variables solas.
3. Despliega y abre `/api/health`: debe responder `"store": "upstash"`.

Variables de entorno reconocidas:

| Variable | Uso |
|---|---|
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Credenciales de Upstash (las crea la integración). También sirven `UPSTASH_REDIS_REST_URL`/`_TOKEN` o cualquier `<PREFIJO>_REST_API_URL`/`_TOKEN`. |
| `ALLOWED_ORIGINS` | Opcional. Orígenes extra (separados por comas) que pueden usar el puente, además de `https://jacksonmultitech.github.io`. |

Si cambias el dominio del servidor, actualiza `REMOTE.DEFAULT_BRIDGE_URL` en `js/config.js` del editor (o usa *Opciones avanzadas* en el diálogo “Conectar con Claude”).

## Agregar el conector en Claude

- **claude.ai / Claude Desktop:** Configuración → Conectores → Agregar conector personalizado → pega `https://<tu-proyecto>.vercel.app/mcp`.
- **Claude Code:** `claude mcp add --transport http skins https://<tu-proyecto>.vercel.app/mcp`

Luego abre el editor, pulsa **Conectar con Claude → Conectar** y escribe en Claude: *“Usa el editor de skins con el código XXXX-XXXX-XXXX y hazme…”*.

## Desarrollo local

```bash
npm install
npm run dev        # http://localhost:3000 (sin Upstash usa memoria)
npm test           # pruebas del relevo y del servidor MCP
```

Para probar con el editor local: `http://localhost:8080/?bridge=http://localhost:3000`.

## Seguridad

- Solo quien tiene el código puede enviar órdenes a esa sesión; solo quien tiene el token (el navegador) puede leerlas y responder. El token se guarda como hash SHA-256.
- Los códigos tienen 12 caracteres aleatorios (≈ 60 bits) y vencen tras 3 horas sin uso; el editor se desconecta solo tras 30 minutos sin órdenes.
- La API del puente solo acepta peticiones del sitio del editor (CORS) y de `localhost`.
- No hay secretos en el repositorio: las credenciales viven en las variables de entorno de Vercel.

## Créditos

Creado íntegramente con **Claude AI "Opus 5.5"** de [Anthropic](https://www.anthropic.com).

---

Proyecto independiente, sin afiliación con Mojang Studios ni Microsoft. Licencia MIT.

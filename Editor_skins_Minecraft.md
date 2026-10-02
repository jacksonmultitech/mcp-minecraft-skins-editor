# Editor de Skins de Minecraft (experimento)

- Artifact publicado: https://claude.ai/artifact/2zUcCjzfYnqUURBaBoF4qr (versión 3, sin la conexión con el agente: el puente no funciona dentro de claude.ai por la política de seguridad de los artifacts). La versión vigente es la de GitHub Pages.
- Stack: HTML + CSS + JS (módulos ES) + WebGL2 nativos, sin librerías ni build.
- Salida: PNG RGBA 64×64 (Java 1.8+ y Bedrock). Abre 64×64, convierte 64×32 (legacy) y reduce HD.
- Funciones: edición 3D/2D, cámara orbital (zoom solo con la rueda; Ctrl+rueda se quitó a pedido del usuario), 8 herramientas, espejo, capas base/externa con botón "Ocultar/Mostrar capa", modelo clásico/delgado, vista previa animada con fondos, tema claro/oscuro, autoguardado, UI en es-419.
- v2 · Teoría del color (inspirada en htmlcolorcodes.com): valores HEX/RGB/HSL/OKLCH copiables, entrada en cualquier formato, cuentagotas de pantalla, escala tonal (normal / pixel art), 7 armonías, paleta aleatoria, exportar.
- v2 · "Colores de tu skin": une tonos casi iguales (OKLab), agrupa por familias y ordena de claro a oscuro (Exacto / Similares / Amplio).
- v3 · Descargar la paleta de la skin: PNG, .gpl, JSON, TXT o copiar.
- v3 · Círculo cromático interactivo con puntos arrastrables; panel lateral redimensionable (280–640 px); medida base 1920×1080.
- v4 · Conexión con un agente de IA por MCP ("opción B": el agente controla el editor en vivo). Botón "Agente IA" en el encabezado → código de sesión (p. ej. K7QM-X2PD-9RTA). Archivos: js/remote/{agent-bridge,commands}.js, js/ui/agent-panel.js; `REMOTE.DEFAULT_BRIDGE_URL` en js/config.js; `?bridge=URL` para apuntar a otro servidor.

## Versiones (empaquetado)

- Versionado semántico de tres dígitos. Cada versión = Release en GitHub (etiqueta vX.Y.Z con .zip y .tgz) + paquete npm en GitHub Packages (`@jacksonmultitech/minecraft-skins-editor` y `@jacksonmultitech/mcp-minecraft-skins-editor`).
- Workflow `.github/workflows/release.yml` ("Empaquetado") en ambos repos: se ejecuta al cambiar `package.json` en main; si la etiqueta ya existe, no hace nada. Notas del Release = sección del CHANGELOG.md. Para publicar: subir `version` en package.json (y en el MCP también `SERVER_INFO.version` en lib/tools.js; una prueba verifica que coincidan) y agregar la sección al CHANGELOG.
- 1.0.0 (26-sep-2026): estado inicial, empaquetado antes de las mejoras.
- 1.1.0 (02-oct-2026), editor:
  - Botón "Claude" → "Agente IA" (cualquier agente MCP: Claude, ChatGPT, Copilot, Cursor, Gemini…). Clave de sesión `mse.agentSession`.
  - Botón visible "Paleta de la skin" a la derecha del cuentagotas (antes era un ícono pequeño junto a "Colores de tu skin").
  - "Exportar colores" → "Exportar armonía y escala" (solo exporta ese panel).
  - Ayuda de la vista previa en una fila bajo el lienzo, a la izquierda del botón de captura.
  - Selector "Fondo": escenas pixel art de 128×128 generadas por código en js/core/backgrounds.js (pradera, atardecer, noche, cueva, Nether, El End, pantalla verde), sin texturas del juego, o imagen propia (JPEG ≤ 1024 px en `mse.previewBackgroundImage`). Se dibuja en WebGL con ajuste "cover" (renderer.setBackground). La captura PNG incluye el fondo; `get_skin_image` usa siempre el fondo liso.
  - favicon.svg compartido (editor, docs y tests); desbordes del panel a 280 px corregidos.
- 1.1.0, MCP: textos e instrucciones para cualquier agente ("Agente IA → Conectar"), README y página con ejemplos para varios clientes, núcleo sincronizado.

## Repositorios y despliegue

- Editor: github.com/jacksonmultitech/minecraft-skins-editor → GitHub Pages (main / raíz, con .nojekyll) → https://jacksonmultitech.github.io/minecraft-skins-editor/
- MCP: github.com/jacksonmultitech/mcp-minecraft-skins-editor → Vercel, proyecto `mcp-minecraft-skins-editor` (prj_DbMRyu61X7dFHk5tN0cES90V78OS, team_FED5NXn4Htb9ulfFkZlJ1hxb, slug percy-team2), enlazado a GitHub: cada push a main despliega a producción. Upstash Redis conectado (KV_REST_API_URL/TOKEN creadas por la integración).
- Dominio real del MCP: https://editor-skins-mcp.vercel.app (no mcp-minecraft-skins-editor.vercel.app, que no es nuestro). Endpoint `/mcp`; salud en `/api/health` (debe decir `"store": "upstash"`). Si cambia, actualizar `REMOTE.DEFAULT_BRIDGE_URL` y ejecutar `npm run sync-core` en el MCP.
- Conector en claude.ai: "MC_Skins_Editor" → https://editor-skins-mcp.vercel.app/mcp.
- Wiki: https://github.com/jacksonmultitech/minecraft-skins-editor/wiki, generada desde docs/index.html por scripts/docs_to_wiki.py (18 páginas + Home, _Sidebar y _Footer; imágenes en docs/img/). Workflow `wiki.yml`: se ejecuta con cambios en docs/**, al editar la Wiki (gollum) o a mano. Para corregirla se edita docs/index.html; las páginas creadas a mano en la Wiki no se borran.
- Ramas: solo `main` en ambos repos (el usuario borró las ramas claude/*). Se trabaja y publica directo en main, con varios commits por tarea.
- Ambos README dicen que todo fue creado con Claude AI "Opus 5.5"; cada repo tiene su .gitignore.
- Estado (02-oct-2026): todo publicado y verificado: Pages 1.1.0, Vercel 1.1.0 con Upstash, Releases y paquetes v1.0.0 y v1.1.0 en ambos repos, Wiki publicada.

## Arquitectura del MCP

- @modelcontextprotocol/sdk 1.30.1 + zod 4; transporte HTTP streamable sin estado (respuestas JSON) en funciones web estándar de Vercel.
- Relevo en Redis: cola q:<código>, resultados r:<código>:<id> (60 s), alive:<código> (25 s), sess:<código> (3 h, hash SHA-256 del token). Límite: 30 sesiones/hora por IP.
- El editor consulta la cola (350 ms activo → 3 s en reposo) y ejecuta las órdenes; se desconecta solo tras 30 min sin órdenes. CORS del puente: jacksonmultitech.github.io + localhost (+ ALLOWED_ORIGINS).
- 16 herramientas: get_uv_layout, color_harmony, tonal_scale, get_editor_state, get_skin_image (3D con ángulo o textura), new_skin, set_model, paint_pixels, fill_face, draw_face_pattern, add_noise, mirror_side, clear_layer, undo, redo, download_skin.
- lib/editor-core es una copia del núcleo del editor (npm run sync-core).

## Skins creadas con el MCP

- "skin-claude_v1": caballero con armadura azul y capa roja (prueba de conexión).
- "Emgicraft": mago artesano según el concept art del usuario: cabello castaño con mechones turquesa, runa "E" en la mejilla, abrigo índigo con solapas oliva y líneas de lapislázuli, camisa magenta con colgante Totem-Ender, guantelete de relojería con núcleo de redstone (brazo derecho), guante con cristales de amatista (brazo izquierdo) y mochila-gólem. Método: se diseñó y revisó en un editor + MCP locales y luego se envió en vivo (53 llamadas, usando mirror_side para la simetría).

## Lecciones

- El intermediario de conectores de claude.ai rechaza claves JSON que solo difieren en mayúsculas ("G" y "g") como "duplicate JSON keys". La descripción de draw_face_pattern lo advierte.
- Desde el contenedor de Claude Code, *.vercel.app y github.io devuelven 403: usar web_fetch_vercel_url (Vercel) y api.github.com / raw.githubusercontent.com.
- `npm publish dist/x.tgz` se interpreta como repositorio de GitHub: usar `./dist/x.tgz`.
- La Wiki de GitHub no existe hasta crear la primera página a mano; después el workflow la completa sola.

## Verificación

- Editor: 26 pruebas del núcleo (tests/, incluye fondos y ajuste "cover"). MCP: 11 pruebas (npm test, incluye la de versión). E2E local con cliente MCP oficial: ~160 ms por orden con el editor activo.
- Ejecutar localmente: `python3 -m http.server 8080` en el editor; `npm run dev` en el MCP (puerto 3000) y abrir el editor con `?bridge=http://localhost:3000`.
- Wiki local: `pip install -r scripts/requirements-wiki.txt && python3 scripts/docs_to_wiki.py` (sale en wiki-build/).

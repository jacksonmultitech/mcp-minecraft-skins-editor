# Registro de cambios

Todas las versiones siguen el [versionado semántico](https://semver.org/lang/es/) de tres dígitos (MAYOR.MENOR.PARCHE). Cada versión se publica como *Release* (con el `.zip` del código) y como paquete en GitHub Packages.

## [1.1.0] - 2026-10-02

### Cambiado
- Funciona con **cualquier agente de IA** compatible con MCP: las instrucciones del servidor, la descripción de `session_code` y los errores del relevo indican el nuevo botón del editor **Agente IA → Conectar**.
- README y página informativa con instrucciones para Claude, Claude Code, ChatGPT, VS Code (Copilot), Cursor, Gemini CLI y otros agentes; los ejemplos se completan con la URL real del servidor.
- `lib/editor-core` sincronizado con el editor 1.1.0.

### Agregado
- Prueba que comprueba que la versión que informa el servidor coincide con `package.json` (11 pruebas).

## [1.0.0] - 2026-09-26

Primera versión publicada.

- Servidor MCP con transporte HTTP "streamable" sin estado, desplegado en Vercel (`/mcp`).
- Relevo de órdenes entre el agente y el editor mediante Upstash Redis (cola, resultados, sesiones con token cifrado en SHA-256).
- 16 herramientas: `get_uv_layout`, `color_harmony`, `tonal_scale`, `get_editor_state`, `get_skin_image`, `new_skin`, `set_model`, `paint_pixels`, `fill_face`, `draw_face_pattern`, `add_noise`, `mirror_side`, `clear_layer`, `undo`, `redo`, `download_skin`.
- API del puente para el editor (`/api/bridge/session`, `poll`, `result`) con CORS limitado al sitio del editor.
- Página informativa y `/api/health` con el estado del almacenamiento.

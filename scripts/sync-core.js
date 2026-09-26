/**
 * @file scripts/sync-core.js
 * Copia desde el repositorio del editor los módulos que el MCP reutiliza
 * (mapa UV, colores y teoría del color) a lib/editor-core/.
 *
 * Uso: npm run sync-core   (espera el editor en ../minecraft-skins-editor)
 *      node scripts/sync-core.js <ruta-al-editor>
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const editor = process.argv[2] ?? join(root, '..', 'minecraft-skins-editor');
const FILES = ['config.js', 'core/skin-model.js', 'core/color-theory.js', 'utils/color.js'];

for (const file of FILES) {
  const target = join(root, 'lib', 'editor-core', file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(editor, 'js', file), target);
  console.log(`✔ ${file}`);
}

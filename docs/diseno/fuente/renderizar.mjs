// Genera los PNG de docs/diseno/wireframes y docs/diseno/mockups a partir de
// pantallas.html. Cada <section class="tablero"> se guarda como una imagen.
//
// Requiere Playwright con Chromium (no es una dependencia del proyecto):
//   node docs/diseno/fuente/renderizar.mjs
// Si Playwright está instalado de forma global, indica su ruta con
//   PLAYWRIGHT_MODULE=/ruta/a/playwright/index.mjs node docs/diseno/fuente/renderizar.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');

const aqui = path.dirname(fileURLToPath(import.meta.url));
const pagina = pathToFileURL(path.join(aqui, 'pantallas.html')).href;
const modos = [
  { modo: 'wireframe', carpeta: 'wireframes' },
  { modo: 'mockup', carpeta: 'mockups' },
];

const navegador = await chromium.launch();
const pestana = await navegador.newPage({ viewport: { width: 2200, height: 1200 }, deviceScaleFactor: 2 });

for (const { modo, carpeta } of modos) {
  await pestana.goto(`${pagina}?modo=${modo}`);
  await pestana.evaluate(() => document.fonts.ready);
  const destino = path.join(aqui, '..', carpeta);
  fs.mkdirSync(destino, { recursive: true });
  for (const tablero of await pestana.$$('section.tablero')) {
    const id = await tablero.getAttribute('id');
    await tablero.screenshot({ path: path.join(destino, `${id}.png`) });
    console.log(`${carpeta}/${id}.png`);
  }
}

await navegador.close();

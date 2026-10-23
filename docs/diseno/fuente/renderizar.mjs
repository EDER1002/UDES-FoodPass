// Genera los WIREFRAMES de docs/diseno a partir de pantallas.html:
//   - wireframes/: una imagen por pantalla, todas del mismo tamaño
//     (celular 390 × 844 o ventana de escritorio), con el mismo margen y fondo.
//   - wireframes/anotados/: cada tablero con su título y sus notas numeradas.
// Los MOCKUPS ya no salen de aquí: son capturas de la aplicación real, que sigue
// el prototipo de Figma (npm run diseno:capturas, archivo e2e/capturas.spec.js).
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
const salidas = [
  { parametros: 'modo=wireframe&exportar=1', carpeta: 'wireframes', selector: '.marco-export' },
  { parametros: 'modo=wireframe', carpeta: 'wireframes/anotados', selector: 'section.tablero' },
];

// Borra los PNG anteriores para que no queden imágenes de pantallas que ya no existen
for (const carpeta of new Set(salidas.map(s => s.carpeta))) {
  const destino = path.join(aqui, '..', carpeta);
  fs.mkdirSync(destino, { recursive: true });
  for (const archivo of fs.readdirSync(destino)) {
    if (archivo.endsWith('.png')) fs.rmSync(path.join(destino, archivo));
  }
}

const navegador = await chromium.launch();
const pestana = await navegador.newPage({ viewport: { width: 2200, height: 1200 }, deviceScaleFactor: 2 });

for (const { parametros, carpeta, selector } of salidas) {
  await pestana.goto(`${pagina}?${parametros}`);
  await pestana.evaluate(() => document.fonts.ready);
  for (const elemento of await pestana.$$(selector)) {
    // La portada (00) solo existe en los mockups
    if (!(await elemento.isVisible())) continue;
    const nombre = await elemento.evaluate(e => e.id || e.firstElementChild?.dataset.archivo);
    await elemento.screenshot({ path: path.join(aqui, '..', carpeta, `${nombre}.png`) });
    console.log(`${carpeta}/${nombre}.png`);
  }
}

await navegador.close();

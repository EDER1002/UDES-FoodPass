import { PasarelaSandbox } from './PasarelaSandbox.js';
import { PasarelaWompi } from './PasarelaWompi.js';

/** Elige el adaptador de la pasarela según PASARELA_MODO. */
export function crearPasarela(config, { demoraSandboxMs = 0 } = {}) {
  if (config.pasarela.modo === 'wompi') return new PasarelaWompi(config.pasarela.wompi);
  return new PasarelaSandbox({ demoraMs: demoraSandboxMs });
}

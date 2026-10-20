import { ErrorAplicacion } from '../../../../compartido/errores.js';
import { PagoNequi } from './PagoNequi.js';
import { PagoPSE } from './PagoPSE.js';
import { PagoTarjeta } from './PagoTarjeta.js';

/**
 * Registro de estrategias de pago. Para agregar un medio nuevo: crea su clase
 * (que implemente EstrategiaPago) y agrégala a esta lista.
 */
export function crearEstrategias({ pasarela, reloj }) {
  const lista = [new PagoNequi({ pasarela }), new PagoPSE({ pasarela }), new PagoTarjeta({ pasarela, reloj })];
  const porMetodo = new Map(lista.map((e) => [e.metodo, e]));
  return {
    metodos: () => [...porMetodo.keys()],
    obtener(metodo) {
      const estrategia = porMetodo.get(metodo);
      if (!estrategia) {
        throw new ErrorAplicacion('METODO_NO_SOPORTADO', 'Elige un medio de pago válido: Nequi, PSE o tarjeta.', 400);
      }
      return estrategia;
    },
  };
}

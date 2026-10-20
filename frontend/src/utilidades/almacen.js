// Acceso seguro a localStorage / sessionStorage: en modo privado o con el
// almacenamiento bloqueado, la aplicación sigue funcionando sin él.
export const almacen = {
  leer(area, clave) {
    try {
      const texto = area.getItem(clave);
      return texto ? JSON.parse(texto) : null;
    } catch {
      return null;
    }
  },
  guardar(area, clave, valor) {
    try {
      area.setItem(clave, JSON.stringify(valor));
    } catch {
      // Sin almacenamiento disponible
    }
  },
  borrar(area, clave) {
    try {
      area.removeItem(clave);
    } catch {
      // Sin almacenamiento disponible
    }
  },
  limpiar(area) {
    try {
      area.clear();
    } catch {
      // Sin almacenamiento disponible
    }
  },
};

const CLAVE_SELECCION = 'foodpass.seleccion';

/** Selección del menú en curso (para volver desde el resumen sin perderla). */
export const seleccionGuardada = {
  leer: () => almacen.leer(sessionStorage, CLAVE_SELECCION),
  guardar: (seleccion) => almacen.guardar(sessionStorage, CLAVE_SELECCION, seleccion),
  borrar: () => almacen.borrar(sessionStorage, CLAVE_SELECCION),
};

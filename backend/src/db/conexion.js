import pg from 'pg';

// Las columnas DATE llegan como texto 'AAAA-MM-DD' para no depender de la zona
// horaria del servidor. Las fechas de negocio siempre son de America/Bogota.
pg.types.setTypeParser(pg.types.builtins.DATE, (valor) => valor);

export function crearPool(urlConexion) {
  return new pg.Pool({
    connectionString: urlConexion,
    max: 20,
    options: '-c timezone=America/Bogota',
  });
}

/**
 * Acceso a datos compartido por los repositorios. Cada repositorio solo
 * consulta las tablas de su propio módulo.
 */
export class BaseDeDatos {
  constructor(pool) {
    this.pool = pool;
  }

  consulta(texto, valores = [], cliente = null) {
    return (cliente ?? this.pool).query(texto, valores);
  }

  /**
   * Ejecuta `fn` dentro de una transacción. Si se pasa un cliente que ya está
   * en una transacción, se reutiliza: así varios servicios participan en la
   * misma transacción sin tocar las tablas de los demás.
   */
  async transaccion(fn, cliente = null) {
    if (cliente?.enTransaccion) return fn(cliente);
    const propio = cliente ?? (await this.pool.connect());
    try {
      await propio.query('BEGIN');
      propio.enTransaccion = true;
      const resultado = await fn(propio);
      await propio.query('COMMIT');
      return resultado;
    } catch (error) {
      await propio.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      propio.enTransaccion = false;
      if (!cliente) propio.release();
    }
  }

  /** Presta una conexión dedicada (por ejemplo, para un bloqueo consultivo). */
  async conCliente(fn) {
    const cliente = await this.pool.connect();
    try {
      return await fn(cliente);
    } finally {
      cliente.release();
    }
  }
}

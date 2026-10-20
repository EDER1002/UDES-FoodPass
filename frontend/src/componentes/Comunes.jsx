import { useEffect, useRef } from 'react';
import { Icono } from './Icono.jsx';

/** Indicador "Paso X de 3" (RNF04: la reserva toma máximo 3 pasos). */
export function Pasos({ actual, texto, siguiente }) {
  return (
    <div className="pasos">
      <div className="pasos-texto">
        <b>Paso {actual} de 3 · {texto}</b>
        {siguiente && <span>{siguiente}</span>}
      </div>
      <div className="barras" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={actual} aria-label={`Paso ${actual} de 3`}>
        {[1, 2, 3].map((n) => <i key={n} className={n <= actual ? 'on' : ''} />)}
      </div>
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }) {
  return (
    <div className="cargando" role="status" aria-live="polite">
      <span className="girando" aria-hidden="true" />
      {texto}
    </div>
  );
}

/**
 * Pantalla de estado o error: ícono + título + explicación + acciones.
 * Se anuncia a los lectores de pantalla y recibe el foco al aparecer.
 */
export function EstadoPantalla({ icono = 'alerta', tono = 'alerta', titulo, children, acciones, alerta = true }) {
  const titular = useRef(null);
  useEffect(() => {
    titular.current?.focus();
  }, [titulo]);
  return (
    <section className="estado-pantalla" role={alerta ? 'alert' : undefined}>
      <span className={`icono-grande ${tono}`}><Icono nombre={icono} /></span>
      <h1 ref={titular} tabIndex={-1}>{titulo}</h1>
      {children}
      {acciones && <div className="acciones">{acciones}</div>}
    </section>
  );
}

/** Traduce un error de la API a una pantalla clara (estados de error del documento). */
export function PantallaDeError({ error, alReintentar, acciones }) {
  const porCodigo = {
    SIN_CONEXION: { icono: 'wifi-off', tono: 'neutro', titulo: 'Sin conexión' },
    FUERA_DE_HORARIO: { icono: 'reloj', tono: 'alerta', titulo: 'Fuera del horario de reservas' },
    PLATO_AGOTADO: { icono: 'alerta', tono: 'alerta', titulo: 'Se agotó una opción' },
    SUBSIDIO_NO_DISPONIBLE: { icono: 'insignia', tono: 'info', titulo: 'Subsidio no disponible' },
    MENU_NO_DISPONIBLE: { icono: 'plato', tono: 'info', titulo: 'Todavía no hay menú' },
    RESERVA_EXPIRADA: { icono: 'reloj', tono: 'alerta', titulo: 'Se venció el tiempo para pagar' },
  };
  const vista = porCodigo[error?.codigo] ?? { icono: 'x-circulo', tono: '', titulo: 'Algo salió mal' };
  return (
    <EstadoPantalla
      icono={vista.icono}
      tono={vista.tono}
      titulo={vista.titulo}
      acciones={
        <>
          {alReintentar && (
            <button type="button" className="btn btn-primario" onClick={alReintentar}>
              <Icono nombre="actualizar" />Reintentar
            </button>
          )}
          {acciones}
        </>
      }
    >
      <p>{error?.message}</p>
      {error?.codigo === 'SIN_CONEXION' && (
        <p className="pista" style={{ textAlign: 'left' }}>
          <Icono nombre="escudo" />
          <span>Reintentar es seguro: <b>nunca se cobra dos veces</b>.</span>
        </p>
      )}
    </EstadoPantalla>
  );
}

const ESTADOS_RESERVA = {
  PENDIENTE_PAGO: { clase: 'alerta', icono: 'reloj', texto: 'Pendiente de pago' },
  CONFIRMADA: { clase: 'ok', icono: 'check', texto: 'Confirmada' },
  ENTREGADA: { clase: 'info', icono: 'entrega', texto: 'Entregada' },
  CANCELADA: { clase: 'peligro', icono: 'x-circulo', texto: 'Cancelada' },
};

/** Estado de la reserva con ícono + texto + color (nunca solo color). */
export function EstadoReserva({ estado }) {
  const e = ESTADOS_RESERVA[estado] ?? { clase: 'neutro', icono: 'info', texto: estado };
  return <span className={`estado ${e.clase}`}><Icono nombre={e.icono} />{e.texto}</span>;
}

export function Aviso({ tono = '', icono = 'info', titulo, children, rol }) {
  return (
    <div className={`aviso ${tono}`} role={rol}>
      <Icono nombre={icono} />
      <div>
        {titulo && <strong>{titulo}</strong>}
        {children && <span>{children}</span>}
      </div>
    </div>
  );
}

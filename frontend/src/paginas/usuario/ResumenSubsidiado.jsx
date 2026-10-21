import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Cargando, PantallaDeError } from '../../componentes/Comunes.jsx';
import { Icono } from '../../componentes/Icono.jsx';
import { useSesion } from '../../sesion/SesionContexto.jsx';
import { seleccionGuardada } from '../../utilidades/almacen.js';
import { dinero } from '../../utilidades/formato.js';
import { useDatos } from '../../utilidades/ganchos.js';

/** Paso 2 del estudiante subsidiado: confirma sin pagar (RF06). */
export function ResumenSubsidiado() {
  const { api, usuario } = useSesion();
  const navegar = useNavigate();
  const [seleccion] = useState(() => seleccionGuardada.leer());
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);
  // Nombres y precio salen del menú que entrega el backend, no de lo guardado en el navegador.
  const { datos, error, cargando, recargar } = useDatos(
    async (senal) => {
      const [{ contexto }, { menu }] = await Promise.all([api('/reservas/contexto', { senal }), api('/menu/hoy', { senal })]);
      return { contexto, menu };
    },
    [api],
  );

  useEffect(() => {
    if (datos?.contexto?.reservaActiva?.estado === 'CONFIRMADA') navegar('/qr', { replace: true });
  }, [datos, navegar]);

  const completa = seleccion?.idTipoAlmuerzo && seleccion?.idProteina && seleccion?.idsAcompanamiento?.length;
  if (usuario.rol !== 'ESTUDIANTE_SUBSIDIADO' || !completa) return <Navigate to="/" replace />;
  if (cargando && !datos) return <Cargando />;
  if (error) return <div className="contenedor"><PantallaDeError error={error} alReintentar={recargar} acciones={<Link to="/" className="btn btn-secundario">Volver al menú</Link>} /></div>;

  const { contexto, menu } = datos;
  const tipo = menu.tipos.find((t) => t.idTipoAlmuerzo === seleccion.idTipoAlmuerzo);
  const proteina = menu.proteinas.find((p) => p.idProteina === seleccion.idProteina);
  const acompanamientos = menu.acompanamientos.filter((a) => seleccion.idsAcompanamiento.includes(a.idAcompanamiento));
  if (!tipo || !proteina || acompanamientos.length !== seleccion.idsAcompanamiento.length) return <Navigate to="/" replace />;

  async function confirmar() {
    setEnviando(true);
    try {
      const { reserva } = await api('/reservas', {
        metodo: 'POST',
        cuerpo: { idTipoAlmuerzo: seleccion.idTipoAlmuerzo, idProteina: seleccion.idProteina, idsAcompanamiento: seleccion.idsAcompanamiento },
      });
      seleccionGuardada.borrar();
      navegar('/qr', { replace: true, state: { recienConfirmada: { subsidio: true, monto: reserva.valorTotal } } });
    } catch (e) {
      if (e.codigo === 'RESERVA_ACTIVA_EXISTENTE') navegar('/qr', { replace: true });
      else setErrorEnvio(e);
    } finally {
      setEnviando(false);
    }
  }

  const { subsidio } = contexto;
  if (errorEnvio || !subsidio.disponible) {
    const e = errorEnvio ?? { codigo: 'SUBSIDIO_NO_DISPONIBLE', message: subsidio.motivo };
    return (
      <div className="contenedor">
        <PantallaDeError
          error={e}
          alReintentar={e.codigo === 'SIN_CONEXION' ? () => { setErrorEnvio(null); confirmar(); } : undefined}
          acciones={e.codigo === 'PLATO_AGOTADO' || e.codigo === 'OPCION_NO_VALIDA'
            ? <Link to="/" className="btn btn-primario">Elegir otra opción</Link>
            : <Link to="/pagos" className="btn btn-secundario">Ver mis pagos</Link>}
        />
      </div>
    );
  }

  const detalle = [proteina.nombre, ...acompanamientos.map((a) => a.nombre)].join(', ').toLowerCase();
  return (
    <div className="contenedor">
      <Link to="/" className="cerrar-circulo" aria-label="Cambiar mi selección (volver al menú)"><Icono nombre="cerrar" /></Link>

      <section className="pedido-figma" aria-labelledby="titulo-pedido">
        <h2 id="titulo-pedido">Tu Pedido</h2>
        <div className="linea">
          <span className="que"><b>{tipo.nombre}</b><span>({detalle})</span></span>
          <span className="precio" style={{ textDecoration: 'line-through' }}>{dinero(tipo.precio)}</span>
        </div>
        <div className="linea" style={{ marginTop: 8 }}>
          <span className="subsidio"><Icono nombre="insignia" /> Subsidio UDES</span>
          <span className="subsidio">−{dinero(tipo.precio)}</span>
        </div>
        <hr className="separador-dorado" />
        <div className="total-linea">
          <span>TOTAL<small>Subsidio aplicado: no necesitas pagar</small></span>
          <b style={{ color: 'var(--exito)' }}>{dinero(0)}</b>
        </div>
      </section>

      <p className="pista"><Icono nombre="info" /><span>Beneficio de hoy: <b>disponible</b> (1 por día). Reclamas en la cafetería principal, zona de buses.</span></p>

      <div className="cierre-pedido">
        <button type="button" className="btn btn-lila" onClick={confirmar} disabled={enviando}>
          {enviando ? <><span className="girando" aria-hidden="true" />Confirmando…</> : 'Confirmar reserva'}
        </button>
        <p className="nota-peq">Recibirás tu QR en el siguiente paso.</p>
      </div>
    </div>
  );
}

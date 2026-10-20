import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Cargando, PantallaDeError, Pasos } from '../../componentes/Comunes.jsx';
import { Icono } from '../../componentes/Icono.jsx';
import { useSesion } from '../../sesion/SesionContexto.jsx';
import { seleccionGuardada } from '../../utilidades/almacen.js';
import { dinero } from '../../utilidades/formato.js';
import { useDatos } from '../../utilidades/ganchos.js';
import { DetallePedido } from './DetallePedido.jsx';

/** Paso 2 del estudiante subsidiado: confirma sin pagar (RF06). */
export function ResumenSubsidiado() {
  const { api, usuario } = useSesion();
  const navegar = useNavigate();
  const [seleccion] = useState(() => seleccionGuardada.leer());
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);
  const { datos, error, cargando, recargar } = useDatos((senal) => api('/reservas/contexto', { senal }), [api]);

  useEffect(() => {
    if (datos?.contexto?.reservaActiva?.estado === 'CONFIRMADA') navegar('/mi-ficho', { replace: true });
  }, [datos, navegar]);

  const completa = seleccion?.idTipoAlmuerzo && seleccion?.idProteina && seleccion?.idsAcompanamiento?.length;
  if (usuario.rol !== 'ESTUDIANTE_SUBSIDIADO' || !completa) return <Navigate to="/" replace />;
  if (cargando) return <Cargando />;
  if (error) return <div className="contenedor"><PantallaDeError error={error} alReintentar={recargar} /></div>;

  const { subsidio } = datos.contexto;
  if (errorEnvio || !subsidio.disponible) {
    const e = errorEnvio ?? { codigo: 'SUBSIDIO_NO_DISPONIBLE', message: subsidio.motivo };
    return (
      <div className="contenedor">
        <PantallaDeError
          error={e}
          alReintentar={e.codigo === 'SIN_CONEXION' ? () => setErrorEnvio(null) : undefined}
          acciones={e.codigo === 'PLATO_AGOTADO' || e.codigo === 'OPCION_NO_VALIDA'
            ? <Link to="/" className="btn btn-primario">Elegir otra opción</Link>
            : <Link to="/mis-reservas" className="btn btn-secundario">Ver mis reservas</Link>}
        />
      </div>
    );
  }

  const confirmar = async () => {
    setEnviando(true);
    try {
      const { reserva } = await api('/reservas', {
        metodo: 'POST',
        cuerpo: { idTipoAlmuerzo: seleccion.idTipoAlmuerzo, idProteina: seleccion.idProteina, idsAcompanamiento: seleccion.idsAcompanamiento },
      });
      seleccionGuardada.borrar();
      navegar('/mi-ficho', { replace: true, state: { recienConfirmada: { subsidio: true, monto: reserva.valorTotal } } });
    } catch (e) {
      if (e.codigo === 'RESERVA_ACTIVA_EXISTENTE') navegar('/mi-ficho', { replace: true });
      else setErrorEnvio(e);
    } finally {
      setEnviando(false);
    }
  };

  const nombres = seleccion.nombres ?? {};
  const pedido = {
    tipoAlmuerzo: { nombre: nombres.tipo },
    proteina: { nombre: nombres.proteina },
    acompanamientos: (nombres.acompanamientos ?? []).map((nombre, i) => ({ idAcompanamiento: i, nombre })),
    lugarReclamo: 'Cafetería principal · Zona de buses',
  };
  return (
    <>
      <div className="contenedor con-barra">
        <Pasos actual={2} texto="Confirma tu reserva" siguiente="Luego: tu ficho" />
        <Link to="/" className="volver"><Icono nombre="flecha-izq" />Cambiar mi selección</Link>
        <span className="chip exito" style={{ alignSelf: 'flex-start' }}><Icono nombre="insignia" />Estudiante subsidiado</span>

        <section className="tarjeta" aria-labelledby="titulo-pedido">
          <h2 id="titulo-pedido">Tu pedido <span className="chip"><Icono nombre="calendario" />Hoy</span></h2>
          <DetallePedido reserva={pedido} />
        </section>

        <section className="tarjeta exito" aria-labelledby="titulo-subsidio">
          <h2 id="titulo-subsidio" style={{ color: 'var(--exito)', justifyContent: 'flex-start' }}><Icono nombre="check-circulo" />Subsidio aplicado</h2>
          <dl className="filas">
            <div className="fila tachada"><dt>Valor del almuerzo</dt><dd>{dinero(nombres.precio)}</dd></div>
            <div className="fila"><dt>Subsidio UDES</dt><dd style={{ color: 'var(--exito)' }}>−{dinero(nombres.precio)}</dd></div>
          </dl>
          <div className="total exito"><div><span className="lbl">Total</span><small>No necesitas pagar</small></div><span className="monto">{dinero(0)}</span></div>
          <p className="pista"><Icono nombre="info" /><span>Beneficio de hoy: <b>disponible</b> (1 por día).</span></p>
        </section>
      </div>
      <div className="barra-accion">
        <div className="interior">
          <button type="button" className="btn btn-primario" onClick={confirmar} disabled={enviando}>
            {enviando ? <><span className="girando" aria-hidden="true" />Confirmando…</> : <><Icono nombre="check" />Confirmar reserva</>}
          </button>
          <p className="nota-peq">Recibirás tu ficho QR en el siguiente paso.</p>
        </div>
      </div>
    </>
  );
}

import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Aviso, Cargando, EstadoPantalla, PantallaDeError } from '../../componentes/Comunes.jsx';
import { Icono } from '../../componentes/Icono.jsx';
import { useSesion } from '../../sesion/SesionContexto.jsx';
import { seleccionGuardada } from '../../utilidades/almacen.js';
import { dinero, duracion, hora } from '../../utilidades/formato.js';
import { useCuentaRegresiva, useDatos } from '../../utilidades/ganchos.js';

const POCAS_PORCIONES = 5;

export function MenuDelDia() {
  const { api } = useSesion();
  const navegar = useNavigate();
  const { datos, error, cargando, recargar } = useDatos(
    async (senal) => {
      const [{ contexto }, respuestaMenu] = await Promise.all([
        api('/reservas/contexto', { senal }),
        api('/menu/hoy', { senal }).catch((e) => {
          if (e.codigo === 'MENU_NO_DISPONIBLE') return { menu: null };
          throw e;
        }),
      ]);
      return { contexto, menu: respuestaMenu.menu };
    },
    [api],
  );
  const [seleccion, setSeleccion] = useState(() => {
    const guardada = seleccionGuardada.leer() ?? {};
    return { ...guardada, idsAcompanamiento: Array.isArray(guardada.idsAcompanamiento) ? guardada.idsAcompanamiento : [] };
  });
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);
  const restante = useCuentaRegresiva(datos?.contexto);
  const idPista = useId();

  const menu = datos?.menu;
  const contexto = datos?.contexto;
  const tipo = menu?.tipos.find((t) => t.idTipoAlmuerzo === seleccion.idTipoAlmuerzo);
  const proteina = menu?.proteinas.find((p) => p.idProteina === seleccion.idProteina);
  const acompanamientos = (menu?.acompanamientos ?? []).filter((a) => seleccion.idsAcompanamiento?.includes(a.idAcompanamiento));

  // Al cargar el menú: tipo por defecto y se quitan las opciones que ya no están o se agotaron.
  useEffect(() => {
    if (!menu) return;
    setSeleccion((s) => {
      const tipoValido = menu.tipos.find((t) => t.idTipoAlmuerzo === s.idTipoAlmuerzo) ?? menu.tipos[0];
      const disponible = (lista, clave, id) => lista.some((x) => x[clave] === id && x.porciones > 0);
      return {
        idTipoAlmuerzo: tipoValido?.idTipoAlmuerzo,
        idProteina: disponible(menu.proteinas, 'idProteina', s.idProteina) ? s.idProteina : undefined,
        idsAcompanamiento: (s.idsAcompanamiento ?? [])
          .filter((id) => disponible(menu.acompanamientos, 'idAcompanamiento', id))
          .slice(0, tipoValido?.maxAcompanamientos ?? 2),
      };
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    seleccionGuardada.guardar({
      ...seleccion,
      nombres: { tipo: tipo?.nombre, precio: tipo?.precio, proteina: proteina?.nombre, acompanamientos: acompanamientos.map((a) => a.nombre) },
    });
  }, [seleccion, menu, tipo, proteina, acompanamientos]);

  const max = tipo?.maxAcompanamientos ?? 2;
  const faltante = useMemo(() => {
    if (!tipo) return 'Elige el tipo de almuerzo.';
    if (!proteina) return 'Elige una proteína.';
    if (acompanamientos.length < 1) return 'Elige al menos un acompañamiento.';
    return null;
  }, [tipo, proteina, acompanamientos.length]);

  if (cargando) return <Cargando texto="Cargando el menú del día…" />;
  if (error) return <div className="contenedor"><PantallaDeError error={error} alReintentar={recargar} /></div>;

  const irAMisReservas = <Link to="/pagos" className="btn btn-secundario">Ver mis pagos</Link>;
  const activa = contexto.reservaActiva;
  const esSubsidiado = contexto.subsidio.aplica;

  if (activa?.estado === 'CONFIRMADA') {
    return (
      <div className="contenedor">
        <EstadoPantalla icono="check-circulo" tono="ok" titulo="Ya tienes tu almuerzo reservado" alerta={false}
          acciones={<><Link to="/qr" className="btn btn-primario"><Icono nombre="qr" />Ver mi QR</Link>{irAMisReservas}</>}>
          <p>Preséntalo en la cafetería para reclamar tu almuerzo. Solo puedes tener una reserva activa por día.</p>
        </EstadoPantalla>
      </div>
    );
  }
  if (activa?.estado === 'PENDIENTE_PAGO' && activa.conPago) {
    return (
      <div className="contenedor">
        <EstadoPantalla icono="reloj" tono="info" titulo="Tienes un pago en proceso" alerta={false}
          acciones={<Link to={`/reserva/${activa.idReserva}/pago`} className="btn btn-primario">Ver el estado del pago</Link>}>
          <p>Tu banco todavía está procesando el pago de la reserva de hoy.</p>
        </EstadoPantalla>
      </div>
    );
  }
  if (!menu) {
    return (
      <div className="contenedor">
        <EstadoPantalla icono="plato" tono="info" titulo="Todavía no hay menú para hoy" alerta={false}
          acciones={<><button type="button" className="btn btn-primario" onClick={recargar}><Icono nombre="actualizar" />Volver a consultar</button>{irAMisReservas}</>}>
          <p>La cafetería aún no ha publicado el menú del día. Vuelve en un rato.</p>
        </EstadoPantalla>
      </div>
    );
  }
  if (!contexto.horario.abierto || (restante !== null && restante <= 0)) {
    return (
      <div className="contenedor">
        <EstadoPantalla icono="reloj" tono="alerta" titulo={restante !== null && restante <= 0 ? 'Las reservas de hoy ya cerraron' : 'Fuera del horario de reservas'} acciones={irAMisReservas}>
          <p>{contexto.horario.motivo ?? `Las reservas de hoy cerraron a las ${hora(contexto.horario.fin)}.`}</p>
          {/* El motivo del backend ya incluye el horario: no se repite */}
          {!contexto.horario.motivo && contexto.horario.inicio && <p>Tu horario es de <b>{hora(contexto.horario.inicio)}</b> a <b>{hora(contexto.horario.fin)}</b> (hora de Colombia).</p>}
        </EstadoPantalla>
      </div>
    );
  }
  if (esSubsidiado && !contexto.subsidio.disponible) {
    return (
      <div className="contenedor">
        <EstadoPantalla icono="insignia" tono="info" titulo={contexto.subsidio.motivo?.startsWith('Ya usaste') ? 'Ya usaste tu subsidio de hoy' : 'Tu subsidio no está disponible'} acciones={irAMisReservas}>
          <p>{contexto.subsidio.motivo}</p>
        </EstadoPantalla>
      </div>
    );
  }
  if (errorEnvio) {
    const agotado = errorEnvio.codigo === 'PLATO_AGOTADO';
    return (
      <div className="contenedor">
        <PantallaDeError
          error={errorEnvio}
          alReintentar={errorEnvio.codigo === 'SIN_CONEXION' ? () => { setErrorEnvio(null); continuar(); } : undefined}
          acciones={
            <button type="button" className={`btn ${agotado ? 'btn-primario' : 'btn-secundario'}`} onClick={() => { setErrorEnvio(null); recargar(); }}>
              {agotado ? 'Elegir otra opción' : 'Volver al menú'}
            </button>
          }
        />
      </div>
    );
  }

  const elegirTipo = (t) =>
    setSeleccion((s) => ({ ...s, idTipoAlmuerzo: t.idTipoAlmuerzo, idsAcompanamiento: s.idsAcompanamiento.slice(0, t.maxAcompanamientos) }));
  const alternarAcompanamiento = (a) =>
    setSeleccion((s) => {
      const ya = s.idsAcompanamiento.includes(a.idAcompanamiento);
      if (ya) return { ...s, idsAcompanamiento: s.idsAcompanamiento.filter((id) => id !== a.idAcompanamiento) };
      if (s.idsAcompanamiento.length < max) return { ...s, idsAcompanamiento: [...s.idsAcompanamiento, a.idAcompanamiento] };
      if (max === 1) return { ...s, idsAcompanamiento: [a.idAcompanamiento] };
      return s;
    });

  // Declaración de función (no `const`): "Reintentar" la usa desde la pantalla de error, que se arma antes de esta línea.
  async function continuar() {
    if (faltante) return;
    const pedido = { idTipoAlmuerzo: tipo.idTipoAlmuerzo, idProteina: proteina.idProteina, idsAcompanamiento: acompanamientos.map((a) => a.idAcompanamiento) };
    if (esSubsidiado) {
      navegar('/reserva/confirmar');
      return;
    }
    setEnviando(true);
    try {
      const { reserva } = await api('/reservas', { metodo: 'POST', cuerpo: pedido });
      navegar(`/reserva/${reserva.idReserva}/pago`);
    } catch (e) {
      if (e.codigo === 'RESERVA_ACTIVA_EXISTENTE') recargar();
      else setErrorEnvio(e);
    } finally {
      setEnviando(false);
    }
  }

  const pocoTiempo = restante !== null && restante <= 15 * 60;
  const precio = esSubsidiado ? 'Subsidio aplicado · $0' : tipo ? dinero(tipo.precio) : '';
  return (
    <div className="contenedor">
      <div className={`hora-limite ${pocoTiempo ? 'urgente' : ''}`} role={pocoTiempo ? 'status' : undefined}>
        <Icono nombre="campana" />
        <span>Disponible hasta:</span>
        <b>{hora(contexto.horario.fin)}</b>
        {restante !== null && <small>Faltan {duracion(restante)} · hora de Colombia</small>}
      </div>
      {activa?.estado === 'PENDIENTE_PAGO' && (
        <Aviso tono="alerta" icono="info" titulo="Tienes una reserva sin pagar">
          <Link to={`/reserva/${activa.idReserva}/pago`}>Continuar al pago</Link> o elige de nuevo: la nueva reemplaza a la anterior.
        </Aviso>
      )}

      <h1 className="titulo-figma">Menú del Día</h1>

      <fieldset className="seccion">
        <legend className="solo-lectores">Tipo de almuerzo</legend>
        <div className="opciones">
          {menu.tipos.map((t) => {
            const sel = t.idTipoAlmuerzo === seleccion.idTipoAlmuerzo;
            return (
              <label key={t.idTipoAlmuerzo} className={`opcion-fila ${sel ? 'sel' : ''}`}>
                <input type="radio" name="tipo" checked={sel} onChange={() => elegirTipo(t)} />
                <span className="casilla" aria-hidden="true">{sel && <Icono nombre="check" />}</span>
                <span className="texto">
                  <span className="nombre">{t.nombre}</span>
                  {t.descripcion && <span className="detalle">{t.descripcion}</span>}
                </span>
                <span className="lado">{sel ? <span className="marca-elegida"><Icono nombre="check" />Elegido</span> : esSubsidiado ? '' : dinero(t.precio)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="seccion">
        <div className="seccion-cab"><legend className="subtitulo-figma">Proteína</legend><span>Elige 1</span></div>
        <div className="opciones">
          {menu.proteinas.map((p) => {
            const sel = p.idProteina === seleccion.idProteina;
            const agotada = p.porciones <= 0;
            return (
              <label key={p.idProteina} className={`opcion-fila ${sel ? 'sel' : ''} ${agotada ? 'agotada' : ''}`}>
                <input type="radio" name="proteina" checked={sel} disabled={agotada} onChange={() => setSeleccion((s) => ({ ...s, idProteina: p.idProteina }))} />
                <span className="casilla" aria-hidden="true">{sel && <Icono nombre="check" />}</span>
                <span className="texto">
                  <span className="nombre">{p.nombre}</span>
                  {p.descripcion && <span className="detalle">{p.descripcion}</span>}
                </span>
                <span className="lado">{sel ? <span className="marca-elegida"><Icono nombre="check" />Elegida</span> : <Porciones cantidad={p.porciones} />}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="seccion">
        <div className="seccion-cab">
          <legend className="subtitulo-figma">Acompañamiento</legend>
          <span className={acompanamientos.length === max ? 'ok' : ''} aria-live="polite">
            {acompanamientos.length} de {max} {max === 1 ? 'elegido' : 'elegidos'}
          </span>
        </div>
        <div className="opciones-casillas">
          {menu.acompanamientos.map((a) => {
            const sel = seleccion.idsAcompanamiento.includes(a.idAcompanamiento);
            const agotada = a.porciones <= 0;
            const bloqueada = !sel && !agotada && max > 1 && acompanamientos.length >= max;
            return (
              <label key={a.idAcompanamiento} className={`casilla-item ${sel ? 'sel' : ''} ${agotada ? 'agotada' : ''} ${bloqueada ? 'bloqueada' : ''}`}>
                <input type="checkbox" name="acompanamiento" checked={sel} disabled={agotada || bloqueada} onChange={() => alternarAcompanamiento(a)} />
                <span className="casilla" aria-hidden="true">{sel && <Icono nombre="check" />}</span>
                <span>
                  <span className="nombre">{a.nombre}</span>
                  <span className="detalle">{sel ? 'Elegido' : <Porciones cantidad={a.porciones} />}</span>
                </span>
              </label>
            );
          })}
        </div>
        {max > 1 && acompanamientos.length >= max && (
          <p className="pista"><Icono nombre="info" /><span>Ya elegiste {max}. Para cambiar uno, primero quita otro.</span></p>
        )}
      </fieldset>

      <div className="cierre-pedido">
        <p className="resumen" aria-live="polite">
          <b>{tipo?.nombre ?? 'Elige tu almuerzo'}</b>{precio && <> · {precio}</>}
          <br />
          {[proteina?.nombre, ...acompanamientos.map((a) => a.nombre)].filter(Boolean).join(', ') || 'Sin proteína ni acompañamientos'}
        </p>
        <button type="button" className="btn btn-lila" onClick={continuar} aria-disabled={Boolean(faltante) || enviando} aria-describedby={faltante ? idPista : undefined} disabled={enviando}>
          {enviando ? <><span className="girando" aria-hidden="true" />Reservando…</> : 'Ordenar'}
        </button>
        {faltante && <p className="nota-peq" id={idPista} role="status">{faltante}</p>}
      </div>
    </div>
  );
}

/** Porciones que quedan, en texto (RF03). */
function Porciones({ cantidad }) {
  if (cantidad <= 0) return <span>Agotado</span>;
  return <span className={cantidad <= POCAS_PORCIONES ? 'porciones pocas' : ''}>{cantidad <= POCAS_PORCIONES ? `¡Quedan ${cantidad}!` : `Quedan ${cantidad}`}</span>;
}

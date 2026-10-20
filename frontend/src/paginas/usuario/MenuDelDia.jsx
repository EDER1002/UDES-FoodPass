import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Aviso, Cargando, EstadoPantalla, PantallaDeError, Pasos } from '../../componentes/Comunes.jsx';
import { Icono } from '../../componentes/Icono.jsx';
import { useSesion } from '../../sesion/SesionContexto.jsx';
import { seleccionGuardada } from '../../utilidades/almacen.js';
import { dinero, duracion, fechaLarga, hora, mayuscula } from '../../utilidades/formato.js';
import { useCuentaRegresiva, useDatos } from '../../utilidades/ganchos.js';
import { imagenDePlato, tinteDePlato } from '../../utilidades/platos.js';

const POCAS_PORCIONES = 5;

export function MenuDelDia() {
  const { api, usuario } = useSesion();
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

  const irAMisReservas = <Link to="/mis-reservas" className="btn btn-secundario">Ver mis reservas</Link>;
  const activa = contexto.reservaActiva;
  const esSubsidiado = contexto.subsidio.aplica;

  if (activa?.estado === 'CONFIRMADA') {
    return (
      <div className="contenedor">
        <EstadoPantalla icono="check-circulo" tono="ok" titulo="Ya tienes tu almuerzo reservado" alerta={false}
          acciones={<><Link to="/mi-ficho" className="btn btn-primario"><Icono nombre="qr" />Ver mi ficho</Link>{irAMisReservas}</>}>
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
          {contexto.horario.inicio && <p>Tu horario es de <b>{hora(contexto.horario.inicio)}</b> a <b>{hora(contexto.horario.fin)}</b> (hora de Colombia).</p>}
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
          alReintentar={errorEnvio.codigo === 'SIN_CONEXION' ? () => { setErrorEnvio(null); } : undefined}
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

  const continuar = async () => {
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
  };

  const pocoTiempo = restante !== null && restante <= 15 * 60;
  return (
    <>
      <div className="contenedor con-barra">
        <Pasos actual={1} texto="Elige tu almuerzo" siguiente={esSubsidiado ? 'Luego: confirmar y ficho' : 'Luego: pago y ficho'} />
        <div className="saludo">
          <div>
            <h1>Hola, {usuario.nombre}</h1>
            <p>{mayuscula(fechaLarga(menu.fecha))}</p>
          </div>
          <span className={`chip ${esSubsidiado ? 'exito' : ''}`}><Icono nombre={esSubsidiado ? 'insignia' : 'usuario'} />{usuario.nombreRol}</span>
        </div>
        <Aviso tono={pocoTiempo ? 'alerta' : ''} icono="reloj" titulo={`Reservas hasta las ${hora(contexto.horario.fin)}`} rol={pocoTiempo ? 'status' : undefined}>
          {restante !== null && `Faltan ${duracion(restante)} · hora de Colombia`}
        </Aviso>
        {activa?.estado === 'PENDIENTE_PAGO' && (
          <Aviso tono="alerta" icono="info" titulo="Tienes una reserva sin pagar">
            <Link to={`/reserva/${activa.idReserva}/pago`}>Continuar al pago</Link> o elige de nuevo: la nueva reemplaza a la anterior.
          </Aviso>
        )}

        <fieldset className="seccion">
          <div className="seccion-cab"><legend>1. Tipo de almuerzo</legend></div>
          <div className="opciones dos">
            {menu.tipos.map((t) => {
              const sel = t.idTipoAlmuerzo === seleccion.idTipoAlmuerzo;
              return (
                <label key={t.idTipoAlmuerzo} className={`opcion tipo ${sel ? 'sel' : ''}`}>
                  <input type="radio" name="tipo" checked={sel} onChange={() => elegirTipo(t)} />
                  <span className="control" aria-hidden="true">{sel && <Icono nombre="check" />}</span>
                  <span className="nombre">{t.nombre}</span>
                  {t.descripcion && <span className="desc">{t.descripcion}</span>}
                  <span className="precio">{dinero(t.precio)}</span>
                  {sel && <span className="marca-sel"><Icono nombre="check" />Seleccionado</span>}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="seccion">
          <div className="seccion-cab"><legend>2. Proteína</legend><span>Elige 1</span></div>
          <div className="opciones">
            {menu.proteinas.map((p) => (
              <OpcionPlato key={p.idProteina} plato={p} tipo="radio" nombreGrupo="proteina"
                seleccionada={p.idProteina === seleccion.idProteina}
                alElegir={() => setSeleccion((s) => ({ ...s, idProteina: p.idProteina }))} />
            ))}
          </div>
        </fieldset>

        <fieldset className="seccion">
          <div className="seccion-cab">
            <legend>3. Acompañamientos</legend>
            <span className={acompanamientos.length === max ? 'ok' : ''} aria-live="polite">
              {acompanamientos.length} de {max} {max === 1 ? 'elegido' : 'elegidos'}
            </span>
          </div>
          <div className="opciones">
            {menu.acompanamientos.map((a) => {
              const sel = seleccion.idsAcompanamiento.includes(a.idAcompanamiento);
              return (
                <OpcionPlato key={a.idAcompanamiento} plato={a} tipo="checkbox" nombreGrupo="acompanamiento" seleccionada={sel}
                  bloqueada={!sel && max > 1 && acompanamientos.length >= max}
                  alElegir={() => alternarAcompanamiento(a)} />
              );
            })}
          </div>
          {max > 1 && acompanamientos.length >= max && (
            <p className="pista"><Icono nombre="info" /><span>Ya elegiste {max}. Para cambiar uno, primero quita otro.</span></p>
          )}
        </fieldset>
      </div>

      <div className="barra-accion">
        <div className="interior">
          <div className="resumen-linea">
            <span className="txt">
              <b>{tipo?.nombre ?? 'Elige tu almuerzo'}</b><br />
              {[proteina?.nombre, ...acompanamientos.map((a) => a.nombre)].filter(Boolean).join(' · ') || 'Sin proteína ni acompañamientos'}
            </span>
            <span className="monto">{esSubsidiado ? dinero(0) : tipo ? dinero(tipo.precio) : ''}</span>
          </div>
          <button type="button" className="btn btn-primario" onClick={continuar} aria-disabled={Boolean(faltante) || enviando} aria-describedby={faltante ? idPista : undefined} disabled={enviando}>
            {enviando ? <><span className="girando" aria-hidden="true" />Reservando…</> : <>{esSubsidiado ? 'Continuar' : 'Continuar al pago'}<Icono nombre="flecha-der" /></>}
          </button>
          {faltante && <p className="nota-peq" id={idPista}>{faltante}</p>}
        </div>
      </div>
    </>
  );
}

/** Opción de proteína o acompañamiento: imagen, porciones y selección (borde + ícono + texto). */
function OpcionPlato({ plato, tipo, nombreGrupo, seleccionada, bloqueada = false, alElegir }) {
  const agotada = plato.porciones <= 0;
  const clases = ['opcion', seleccionada && 'sel', agotada && 'agotada', bloqueada && 'deshabilitada'].filter(Boolean).join(' ');
  return (
    <label className={clases}>
      <input type={tipo} name={nombreGrupo} checked={seleccionada} disabled={agotada || bloqueada} onChange={alElegir} />
      <span className="ilus" style={{ background: tinteDePlato(plato.imagenUrl) }}>
        {/* La imagen es decorativa: el nombre del plato ya está escrito al lado. */}
        <img src={imagenDePlato(plato.imagenUrl)} alt="" width="54" height="54" loading="lazy" />
      </span>
      <span className="info">
        <span className="nombre">{plato.nombre}</span>
        {plato.descripcion && <span className="desc">{plato.descripcion}</span>}
        <span className="meta">
          {agotada ? (
            <span className="etiqueta"><Icono nombre="x-circulo" />Agotado</span>
          ) : (
            <span className={`porciones ${plato.porciones <= POCAS_PORCIONES ? 'pocas' : ''}`}>
              {plato.porciones <= POCAS_PORCIONES ? `¡Quedan ${plato.porciones}!` : `Quedan ${plato.porciones}`}
            </span>
          )}
          {seleccionada && <span className="marca-sel"><Icono nombre="check" />Seleccionado</span>}
        </span>
      </span>
      <span className={`control ${tipo === 'checkbox' ? 'cuadro' : ''}`} aria-hidden="true">{seleccionada && <Icono nombre="check" />}</span>
    </label>
  );
}

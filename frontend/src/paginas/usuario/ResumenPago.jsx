import { cloneElement, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { generarClaveIdempotencia } from '../../api/cliente.js';
import { Aviso, Cargando, EstadoPantalla, PantallaDeError } from '../../componentes/Comunes.jsx';
import { Icono } from '../../componentes/Icono.jsx';
import { useSesion } from '../../sesion/SesionContexto.jsx';
import { seleccionGuardada } from '../../utilidades/almacen.js';
import { dinero } from '../../utilidades/formato.js';
import { useDatos } from '../../utilidades/ganchos.js';

const MEDIOS = [
  { metodo: 'PSE', nombre: 'PSE', logo: '/pagos/pse.svg' },
  { metodo: 'TARJETA', nombre: 'Tarjeta', logo: '/pagos/tarjeta.svg' },
  { metodo: 'NEQUI', nombre: 'Nequi', logo: '/pagos/nequi.svg' },
];

const CAMPOS_VACIOS = { telefono: '', banco: '', tipoPersona: 'NATURAL', documento: '', numero: '', titular: '', vencimiento: '', cvc: '' };

const OBLIGATORIOS = {
  NEQUI: [['telefono', 'Escribe el número de celular de tu cuenta Nequi']],
  PSE: [['banco', 'Elige tu banco'], ['documento', 'Escribe el documento del titular de la cuenta']],
  TARJETA: [['numero', 'Escribe el número de la tarjeta'], ['titular', 'Escribe el nombre que aparece en la tarjeta'], ['vencimiento', 'Escribe la fecha de vencimiento (MM/AA)'], ['cvc', 'Escribe el código de seguridad']],
};

/** Solo los datos del medio elegido viajan al backend. */
function datosDelMedio(metodo, campos) {
  if (metodo === 'NEQUI') return { telefono: campos.telefono };
  if (metodo === 'PSE') return { banco: campos.banco, tipoPersona: campos.tipoPersona, documento: campos.documento };
  return { numero: campos.numero, titular: campos.titular, vencimiento: campos.vencimiento, cvc: campos.cvc };
}

/** Lo que vio la persona según el estado final del pago (lo decide el backend). */
function resultadoDeReserva(reserva) {
  if (reserva.pago?.estado === 'REEMBOLSADO') {
    return { resultado: 'REEMBOLSADO', mensaje: `Una opción de tu almuerzo se agotó mientras se confirmaba el pago. ${reserva.pago.reembolsoSimulado === false ? 'La cafetería te devolverá el dinero' : 'Te devolvimos el dinero (reembolso simulado)'} y la reserva se canceló.` };
  }
  return { resultado: 'RECHAZADO', mensaje: 'El banco rechazó la transacción. Tu reserva se canceló y no se hizo ningún cobro.' };
}

export function ResumenPago() {
  const { id } = useParams();
  const { api } = useSesion();
  const navegar = useNavigate();
  const { datos, error, cargando, recargar } = useDatos(
    async (senal) => {
      const [{ reserva }, medios] = await Promise.all([api(`/reservas/${id}`, { senal }), api('/pagos/medios', { senal })]);
      return { reserva, medios };
    },
    [api, id],
  );
  const [metodo, setMetodo] = useState('PSE');
  const [campos, setCampos] = useState(CAMPOS_VACIOS);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [errorPago, setErrorPago] = useState(null);
  const [errorCampo, setErrorCampo] = useState(null);
  // Clave de idempotencia del intento actual. Vive solo en memoria: nunca se
  // guarda junto con los datos de pago.
  const intento = useRef(null);

  const reserva = datos?.reserva;
  useEffect(() => {
    if (reserva?.estado === 'CONFIRMADA' || reserva?.estado === 'ENTREGADA') navegar('/qr', { replace: true });
  }, [reserva, navegar]);

  // Declarada como función (no `const`): "Reintentar" la usa desde pantallas que se arman antes.
  async function pagar() {
    const faltante = OBLIGATORIOS[metodo].find(([campo]) => !String(campos[campo]).trim());
    if (faltante) {
      setErrorCampo({ campo: faltante[0], mensaje: faltante[1] });
      document.getElementById(`campo-${faltante[0]}`)?.focus();
      return;
    }
    const datosPago = datosDelMedio(metodo, campos);
    const firma = `${metodo}|${JSON.stringify(datosPago)}`;
    if (!intento.current || intento.current.firma !== firma) intento.current = { clave: generarClaveIdempotencia(), firma };
    setEnviando(true);
    setErrorPago(null);
    setErrorCampo(null);
    try {
      const r = await api(`/reservas/${reserva.idReserva}/pago`, {
        metodo: 'POST',
        cuerpo: { metodo, datos: datosPago },
        encabezados: { 'Idempotency-Key': intento.current.clave },
      });
      intento.current = null;
      if (r.resultado === 'APROBADO') {
        seleccionGuardada.borrar();
        navegar('/qr', { replace: true, state: { recienConfirmada: { metodo, monto: r.reserva.valorTotal } } });
        return;
      }
      setResultado(r);
    } catch (e) {
      // Sin conexión se conserva la clave: reintentar nunca cobra dos veces (RNF05).
      if (e.codigo !== 'SIN_CONEXION') intento.current = null;
      if (e.codigo === 'DATOS_INVALIDOS') {
        const campo = e.detalles?.campos?.[0];
        setErrorCampo({ campo: campo?.campo, mensaje: e.message });
        document.getElementById(`campo-${campo?.campo}`)?.focus();
      } else if (e.codigo === 'RESERVA_NO_PENDIENTE' || e.codigo === 'PAGO_EN_CURSO') {
        recargar();
      } else {
        setErrorPago(e);
      }
    } finally {
      setEnviando(false);
    }
  }

  if (cargando && !datos) return <Cargando texto="Cargando tu pedido…" />;
  if (error) {
    return (
      <div className="contenedor">
        <PantallaDeError error={error} alReintentar={error.codigo === 'SIN_CONEXION' ? recargar : undefined}
          acciones={<Link to="/" className="btn btn-secundario">Volver al menú</Link>} />
      </div>
    );
  }

  const volverAElegir = () => navegar('/', { replace: true });

  /** Crea una reserva nueva con la misma selección (la anterior quedó cancelada). */
  const intentarDeNuevo = async () => {
    setEnviando(true);
    try {
      const { reserva: nueva } = await api('/reservas', {
        metodo: 'POST',
        cuerpo: {
          idTipoAlmuerzo: reserva.tipoAlmuerzo.idTipoAlmuerzo,
          idProteina: reserva.proteina.idProteina,
          idsAcompanamiento: reserva.acompanamientos.map((a) => a.idAcompanamiento),
        },
      });
      setResultado(null);
      setErrorPago(null);
      navegar(`/reserva/${nueva.idReserva}/pago`, { replace: true });
    } catch (e) {
      setResultado(null);
      setErrorPago(e);
    } finally {
      setEnviando(false);
    }
  };

  // El resultado ya conocido manda sobre la reserva cargada al entrar (que puede estar desactualizada).
  const pendiente = resultado ? resultado.resultado === 'PENDIENTE' : reserva.estado === 'PENDIENTE_PAGO' && reserva.pago?.estado === 'PENDIENTE';
  if (pendiente) {
    return <PagoPendiente idReserva={reserva.idReserva} urlBanco={resultado?.urlBanco} mensaje={resultado?.mensaje} pruebas={Boolean(datos.medios.datosDePrueba)}
      alTerminar={(r) => setResultado(resultadoDeReserva(r))} />;
  }
  if (resultado?.resultado === 'RECHAZADO') {
    return (
      <div className="contenedor">
        <EstadoPantalla icono="x-circulo" tono="" titulo="Tu pago fue rechazado"
          acciones={<>
            <button type="button" className="btn btn-primario" onClick={intentarDeNuevo} disabled={enviando}>Intentar con otro medio</button>
            <button type="button" className="btn btn-secundario" onClick={volverAElegir}>Volver al menú</button>
          </>}>
          <p>{resultado.mensaje}</p>
        </EstadoPantalla>
      </div>
    );
  }
  if (resultado?.resultado === 'REEMBOLSADO') {
    return (
      <div className="contenedor">
        <EstadoPantalla icono="alerta" tono="alerta" titulo="No pudimos confirmar tu almuerzo"
          acciones={<button type="button" className="btn btn-primario" onClick={volverAElegir}>Elegir otra opción</button>}>
          <p>{resultado.mensaje}</p>
        </EstadoPantalla>
      </div>
    );
  }
  if (errorPago) {
    const volver = ['RESERVA_EXPIRADA', 'PLATO_AGOTADO', 'MENU_NO_DISPONIBLE', 'FUERA_DE_HORARIO'].includes(errorPago.codigo);
    return (
      <div className="contenedor">
        <PantallaDeError
          error={errorPago}
          alReintentar={errorPago.codigo === 'SIN_CONEXION' ? () => pagar() : undefined}
          acciones={volver
            ? <button type="button" className="btn btn-primario" onClick={volverAElegir}>{errorPago.codigo === 'PLATO_AGOTADO' ? 'Elegir otra opción' : 'Volver al menú'}</button>
            : <button type="button" className="btn btn-secundario" onClick={() => { setErrorPago(null); recargar(); }}>Volver al resumen</button>}
        />
      </div>
    );
  }
  if (reserva.estado === 'CANCELADA') {
    return (
      <div className="contenedor">
        <EstadoPantalla icono="info" tono="neutro" titulo="Esta reserva ya no está activa"
          acciones={<button type="button" className="btn btn-primario" onClick={volverAElegir}>Volver al menú</button>}>
          <p>Se canceló o venció el tiempo para pagarla. Elige de nuevo tu almuerzo.</p>
        </EstadoPantalla>
      </div>
    );
  }
  if (reserva.estado !== 'PENDIENTE_PAGO') return <Cargando />;

  const cambiar = (campo) => (e) => {
    let valor = e.target.value;
    if (campo === 'numero') valor = valor.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
    if (campo === 'vencimiento') {
      const digitos = valor.replace(/\D/g, '').slice(0, 4);
      valor = digitos.length > 2 ? `${digitos.slice(0, 2)}/${digitos.slice(2)}` : digitos;
    }
    if (['cvc', 'documento'].includes(campo)) valor = valor.replace(/\D/g, '').slice(0, campo === 'cvc' ? 4 : 15);
    setCampos((c) => ({ ...c, [campo]: valor }));
    if (errorCampo?.campo === campo) setErrorCampo(null);
  };
  const elegirMedio = (m) => {
    setMetodo(m);
    setErrorCampo(null);
  };

  const prueba = datos.medios.datosDePrueba;
  const detalle = [reserva.proteina?.nombre, ...reserva.acompanamientos.map((a) => a.nombre)].filter(Boolean).join(', ').toLowerCase();
  return (
    <div className="contenedor">
      <Link to="/" className="cerrar-circulo" aria-label="Cambiar mi selección (volver al menú)"><Icono nombre="cerrar" /></Link>

      <section className="pedido-figma" aria-labelledby="titulo-pedido">
        <h2 id="titulo-pedido">Tu Pedido</h2>
        <div className="linea">
          <span className="que"><b>{reserva.tipoAlmuerzo.nombre}</b><span>({detalle})</span></span>
          <span className="precio">{dinero(reserva.valorTotal)}</span>
        </div>
        <hr className="separador-dorado" />
        <div className="total-linea">
          <span>TOTAL<small>Calculado por el sistema</small></span>
          <b>{dinero(reserva.valorTotal)}</b>
        </div>
      </section>

      <h2 className="titulo-figma">Métodos de Pago</h2>
      <fieldset className="pastilla">
        <legend className="solo-lectores">Medio de pago</legend>
        {MEDIOS.map((m) => (
          <label key={m.metodo}>
            <input type="radio" name="medio" value={m.metodo} checked={metodo === m.metodo} onChange={() => elegirMedio(m.metodo)} />
            {m.nombre}
          </label>
        ))}
      </fieldset>
      {/* Los logos repiten el selector de arriba: son un atajo visual, no un control aparte. */}
      <div className="logos-pago" aria-hidden="true">
        {MEDIOS.map((m) => (
          <button key={m.metodo} type="button" tabIndex={-1} className={`logo-pago ${metodo === m.metodo ? 'sel' : ''}`} onClick={() => elegirMedio(m.metodo)}>
            <img src={m.logo} alt="" width="56" height="56" />
          </button>
        ))}
      </div>

      <div className="datos-medio">
        {metodo === 'NEQUI' && (
          <Campo id="telefono" etiqueta="Número de celular Nequi" error={errorCampo} ayuda="Te llegará una solicitud de pago a este número.">
            <input id="campo-telefono" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="300 123 4567" maxLength={13} value={campos.telefono} onChange={cambiar('telefono')} />
          </Campo>
        )}
        {metodo === 'PSE' && (
          <>
            <Campo id="banco" etiqueta="Banco" error={errorCampo}>
              <select id="campo-banco" value={campos.banco} onChange={cambiar('banco')}>
                <option value="">Elige tu banco</option>
                {datos.medios.bancosPse.map((b) => <option key={b.codigo} value={b.codigo}>{b.nombre}</option>)}
              </select>
            </Campo>
            <div className="campo">
              <span className="rotulo" id="rotulo-persona">Tipo de persona</span>
              <div className="grupo-radios" role="radiogroup" aria-labelledby="rotulo-persona">
                {[['NATURAL', 'Natural'], ['JURIDICA', 'Jurídica']].map(([valor, texto]) => (
                  <label key={valor} className="radio-chip">
                    <input type="radio" name="tipoPersona" value={valor} checked={campos.tipoPersona === valor} onChange={cambiar('tipoPersona')} />{texto}
                  </label>
                ))}
              </div>
            </div>
            <Campo id="documento" etiqueta="Documento del titular" error={errorCampo}>
              <input id="campo-documento" inputMode="numeric" autoComplete="off" placeholder="Número de documento" value={campos.documento} onChange={cambiar('documento')} />
            </Campo>
          </>
        )}
        {metodo === 'TARJETA' && (
          <>
            <Campo id="numero" etiqueta="Número de la tarjeta" error={errorCampo}>
              <input id="campo-numero" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={campos.numero} onChange={cambiar('numero')} />
            </Campo>
            <Campo id="titular" etiqueta="Nombre en la tarjeta" error={errorCampo}>
              <input id="campo-titular" autoComplete="cc-name" placeholder="Como aparece en la tarjeta" value={campos.titular} onChange={cambiar('titular')} />
            </Campo>
            <div className="dos-campos">
              <Campo id="vencimiento" etiqueta="Vence (MM/AA)" error={errorCampo}>
                <input id="campo-vencimiento" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" value={campos.vencimiento} onChange={cambiar('vencimiento')} />
              </Campo>
              <Campo id="cvc" etiqueta="Código (CVC)" error={errorCampo}>
                <input id="campo-cvc" inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={campos.cvc} onChange={cambiar('cvc')} />
              </Campo>
            </div>
            <p className="pista"><Icono nombre="candado" /><span>No guardamos los datos de tu tarjeta.</span></p>
          </>
        )}
      </div>

      <div className="cierre-pedido">
        <button type="button" className="btn btn-lila" onClick={pagar} disabled={enviando}>
          {enviando ? <><span className="girando" aria-hidden="true" />Procesando pago…</> : 'Confirmar Pago'}
        </button>
        <p className="nota-peq"><Icono nombre="candado" />Conexión segura · Reintentar nunca cobra dos veces</p>
        {datos.medios.terminos?.terminos && (
          <p className="nota-peq">
            Al confirmar aceptas los <a href={datos.medios.terminos.terminos} target="_blank" rel="noreferrer">términos de Wompi</a>
            {datos.medios.terminos.datosPersonales && <> y su <a href={datos.medios.terminos.datosPersonales} target="_blank" rel="noreferrer">tratamiento de datos personales</a></>}.
          </p>
        )}
      </div>

      {prueba && <>
      <Aviso tono="prueba" icono="escudo" titulo="Entorno de pruebas">No se cobra dinero real.</Aviso>
      <details className="datos-prueba">
        <summary>Ver datos de prueba</summary>
        <ul>
          {prueba.nequiAprobado
            ? <li>Nequi: <code>{prueba.nequiAprobado}</code> aprueba y <code>{prueba.nequiRechazado}</code> rechaza.</li>
            : <li>Nequi: cualquier celular aprueba; <code>{prueba.nequiRechazado}</code> rechaza.</li>}
          <li>Tarjeta: <code>{prueba.tarjetaAprobada.replace(/(\d{4})/g, '$1 ').trim()}</code> aprueba y <code>{prueba.tarjetaRechazada.replace(/(\d{4})/g, '$1 ').trim()}</code> rechaza (cualquier fecha futura y CVC).</li>
          <li>PSE: elige el banco según el resultado que quieras probar.</li>
        </ul>
      </details>
      </>}
    </div>
  );
}

function Campo({ id, etiqueta, ayuda, error, children }) {
  const idAyuda = useId();
  const conError = error?.campo === id;
  return (
    <div className={`campo ${conError ? 'error' : ''}`}>
      <label htmlFor={`campo-${id}`}>{etiqueta}</label>
      <div className="entrada">{cloneElement(children, { 'aria-describedby': conError || ayuda ? idAyuda : undefined, 'aria-invalid': conError || undefined })}</div>
      {conError ? (
        <span className="msg-error" id={idAyuda} role="alert"><Icono nombre="alerta" />{error.mensaje}</span>
      ) : (
        ayuda && <span className="ayuda" id={idAyuda}>{ayuda}</span>
      )}
    </div>
  );
}

/**
 * Pago con respuesta pendiente (PSE): consulta el estado hasta que llegue el
 * webhook. Cada consulta espera a que termine la anterior (con mala señal no se acumulan).
 */
function PagoPendiente({ idReserva, urlBanco, mensaje, pruebas, alTerminar }) {
  const { api } = useSesion();
  const navegar = useNavigate();
  const alTerminarRef = useRef(alTerminar);
  alTerminarRef.current = alTerminar;

  useEffect(() => {
    let activo = true;
    let temporizador = null;
    const consultar = async () => {
      try {
        const { reserva } = await api(`/reservas/${idReserva}`);
        if (!activo) return;
        if (reserva.estado === 'CONFIRMADA') {
          seleccionGuardada.borrar();
          navegar('/qr', { replace: true, state: { recienConfirmada: { metodo: reserva.pago?.metodo, monto: reserva.valorTotal } } });
          return;
        }
        if (reserva.estado === 'CANCELADA') {
          alTerminarRef.current(reserva);
          return;
        }
      } catch {
        // Se vuelve a intentar en la siguiente consulta
      }
      if (activo) temporizador = setTimeout(consultar, 3000);
    };
    consultar();
    return () => {
      activo = false;
      clearTimeout(temporizador);
    };
  }, [api, idReserva, navegar]);

  return (
    <div className="contenedor">
      <EstadoPantalla icono="reloj" tono="info" titulo={urlBanco ? 'Termina el pago en tu banco' : 'Tu banco está procesando el pago'} alerta={false}
        acciones={<>
          {/* Se abre en otra pestaña: esta pantalla sigue esperando el resultado. */}
          {urlBanco && <a href={urlBanco} target="_blank" rel="noreferrer" className="btn btn-primario">Ir a mi banco para pagar</a>}
          <Link to="/pagos" className="btn btn-secundario">Ver mis pagos</Link>
        </>}>
        <p>{mensaje ?? 'Te mostraremos el resultado apenas llegue.'} No cierres esta pantalla.</p>
        <div className="cargando" style={{ minHeight: 0, padding: 8 }} role="status"><span className="girando" aria-hidden="true" />Esperando confirmación…</div>
        {pruebas && <p className="pista"><Icono nombre="info" /><span>En el entorno de pruebas, el pago pendiente se confirma con el webhook de la pasarela.</span></p>}
      </EstadoPantalla>
    </div>
  );
}

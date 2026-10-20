import { cloneElement, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { generarClaveIdempotencia } from '../../api/cliente.js';
import { Aviso, Cargando, EstadoPantalla, PantallaDeError, Pasos } from '../../componentes/Comunes.jsx';
import { Icono } from '../../componentes/Icono.jsx';
import { useSesion } from '../../sesion/SesionContexto.jsx';
import { seleccionGuardada } from '../../utilidades/almacen.js';
import { dinero, fechaCorta } from '../../utilidades/formato.js';
import { useDatos } from '../../utilidades/ganchos.js';
import { DetallePedido } from './DetallePedido.jsx';

const MEDIOS = [
  { metodo: 'NEQUI', nombre: 'Nequi', desc: 'Apruebas el pago en tu app', icono: 'celular' },
  { metodo: 'PSE', nombre: 'PSE', desc: 'Débito desde tu cuenta bancaria', icono: 'banco' },
  { metodo: 'TARJETA', nombre: 'Tarjeta', desc: 'Crédito o débito', icono: 'tarjeta' },
];

const CAMPOS_VACIOS = { telefono: '', banco: '', tipoPersona: 'NATURAL', documento: '', numero: '', titular: '', vencimiento: '', cvc: '' };

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
  const [metodo, setMetodo] = useState('NEQUI');
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
    if (reserva?.estado === 'CONFIRMADA' || reserva?.estado === 'ENTREGADA') navegar('/mi-ficho', { replace: true });
  }, [reserva, navegar]);

  if (cargando) return <Cargando texto="Cargando tu pedido…" />;
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

  if (resultado?.resultado === 'PENDIENTE' || (reserva.estado === 'PENDIENTE_PAGO' && reserva.pago?.estado === 'PENDIENTE')) {
    return <PagoPendiente idReserva={reserva.idReserva} alRechazar={(mensaje) => setResultado({ resultado: 'RECHAZADO', mensaje })} />;
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
        <EstadoPantalla icono="alerta" tono="alerta" titulo="Se agotó una opción de tu almuerzo"
          acciones={<button type="button" className="btn btn-primario" onClick={volverAElegir}>Elegir otra opción</button>}>
          <p>{resultado.mensaje}</p>
        </EstadoPantalla>
      </div>
    );
  }
  if (errorPago) {
    const volver = ['RESERVA_EXPIRADA', 'PLATO_AGOTADO', 'MENU_NO_DISPONIBLE'].includes(errorPago.codigo);
    return (
      <div className="contenedor">
        <PantallaDeError
          error={errorPago}
          alReintentar={errorPago.codigo === 'SIN_CONEXION' ? () => pagar() : undefined}
          acciones={volver
            ? <button type="button" className="btn btn-primario" onClick={volverAElegir}>{errorPago.codigo === 'PLATO_AGOTADO' ? 'Elegir otra opción' : 'Volver a elegir'}</button>
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

  const datosDelMedio = () => {
    if (metodo === 'NEQUI') return { telefono: campos.telefono };
    if (metodo === 'PSE') return { banco: campos.banco, tipoPersona: campos.tipoPersona, documento: campos.documento };
    return { numero: campos.numero, titular: campos.titular, vencimiento: campos.vencimiento, cvc: campos.cvc };
  };

  const OBLIGATORIOS = {
    NEQUI: [['telefono', 'Escribe el número de celular de tu cuenta Nequi']],
    PSE: [['banco', 'Elige tu banco'], ['documento', 'Escribe el documento del titular de la cuenta']],
    TARJETA: [['numero', 'Escribe el número de la tarjeta'], ['titular', 'Escribe el nombre que aparece en la tarjeta'], ['vencimiento', 'Escribe la fecha de vencimiento (MM/AA)'], ['cvc', 'Escribe el código de seguridad']],
  };

  async function pagar() {
    const faltante = OBLIGATORIOS[metodo].find(([campo]) => !String(campos[campo]).trim());
    if (faltante) {
      setErrorCampo({ campo: faltante[0], mensaje: faltante[1] });
      document.getElementById(`campo-${faltante[0]}`)?.focus();
      return;
    }
    const datosPago = datosDelMedio();
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
        navegar('/mi-ficho', { replace: true, state: { recienConfirmada: { metodo, monto: r.reserva.valorTotal } } });
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

  const prueba = datos.medios.datosDePrueba;
  return (
    <>
      <div className="contenedor con-barra">
        <Pasos actual={2} texto="Revisa y paga" siguiente="Luego: tu ficho" />
        <Link to="/" className="volver"><Icono nombre="flecha-izq" />Cambiar mi selección</Link>

        <section className="tarjeta" aria-labelledby="titulo-pedido">
          <h2 id="titulo-pedido">Tu pedido <span className="chip"><Icono nombre="calendario" />Hoy, {fechaCorta(reserva.fechaReserva)}</span></h2>
          <DetallePedido reserva={reserva} />
        </section>

        <div className="total">
          <div><span className="lbl">Total a pagar</span><small>Calculado por el sistema</small></div>
          <span className="monto">{dinero(reserva.valorTotal)}</span>
        </div>

        <fieldset className="seccion">
          <div className="seccion-cab"><legend>Medio de pago</legend></div>
          <div className="opciones">
            {MEDIOS.map((m) => {
              const sel = metodo === m.metodo;
              return (
                <div key={m.metodo} className={`opcion medio ${sel ? 'sel' : ''}`}>
                  <label className="top">
                    <input type="radio" name="medio" value={m.metodo} checked={sel} onChange={() => { setMetodo(m.metodo); setErrorCampo(null); }} />
                    <span className="icono-medio"><Icono nombre={m.icono} /></span>
                    <span className="info"><span className="nombre">{m.nombre}</span><span className="desc">{m.desc}</span></span>
                    <span className="control" aria-hidden="true">{sel && <Icono nombre="check" />}</span>
                  </label>
                  {sel && (
                    <div className="extra">
                      {m.metodo === 'NEQUI' && (
                        <Campo id="telefono" etiqueta="Número de celular Nequi" error={errorCampo} ayuda="Te llegará una solicitud de pago a este número.">
                          <input id="campo-telefono" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="300 123 4567" maxLength={13} value={campos.telefono} onChange={cambiar('telefono')} />
                        </Campo>
                      )}
                      {m.metodo === 'PSE' && (
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
                      {m.metodo === 'TARJETA' && (
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
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>

        <Aviso tono="prueba" icono="escudo" titulo="Entorno de pruebas">No se cobra dinero real.</Aviso>
        <details className="datos-prueba">
          <summary>Ver datos de prueba</summary>
          <ul>
            <li>Nequi: cualquier celular aprueba; <code>{prueba.nequiRechazado}</code> rechaza.</li>
            <li>Tarjeta: <code>{prueba.tarjetaAprobada.replace(/(\d{4})/g, '$1 ').trim()}</code> aprueba y <code>{prueba.tarjetaRechazada.replace(/(\d{4})/g, '$1 ').trim()}</code> rechaza (cualquier fecha futura y CVC).</li>
            <li>PSE: elige el banco según el resultado que quieras probar.</li>
          </ul>
        </details>
      </div>

      <div className="barra-accion">
        <div className="interior">
          <button type="button" className="btn btn-primario" onClick={pagar} disabled={enviando}>
            {enviando ? <><span className="girando" aria-hidden="true" />Procesando pago…</> : `Pagar ${dinero(reserva.valorTotal)}`}
          </button>
          <p className="nota-peq"><Icono nombre="candado" />Conexión segura · Reintentar nunca cobra dos veces</p>
        </div>
      </div>
    </>
  );
}

function Campo({ id, etiqueta, ayuda, error, children }) {
  const idAyuda = useId();
  const conError = error?.campo === id;
  return (
    <div className={`campo ${conError ? 'error' : ''}`}>
      <label htmlFor={`campo-${id}`}>{etiqueta}</label>
      <div className="entrada">{childrenConAria(children, conError ? idAyuda : ayuda ? idAyuda : undefined, conError)}</div>
      {conError ? (
        <span className="msg-error" id={idAyuda} role="alert"><Icono nombre="alerta" />{error.mensaje}</span>
      ) : (
        ayuda && <span className="ayuda" id={idAyuda}>{ayuda}</span>
      )}
    </div>
  );
}

function childrenConAria(hijo, describedBy, invalido) {
  return cloneElement(hijo, { 'aria-describedby': describedBy, 'aria-invalid': invalido || undefined });
}

/** Pago con respuesta pendiente (PSE): consulta el estado hasta que llegue el webhook. */
function PagoPendiente({ idReserva, alRechazar }) {
  const { api } = useSesion();
  const navegar = useNavigate();
  useEffect(() => {
    let activo = true;
    const consultar = async () => {
      try {
        const { reserva } = await api(`/reservas/${idReserva}`);
        if (!activo) return;
        if (reserva.estado === 'CONFIRMADA') {
          seleccionGuardada.borrar();
          navegar('/mi-ficho', { replace: true, state: { recienConfirmada: { metodo: reserva.pago?.metodo, monto: reserva.valorTotal } } });
        } else if (reserva.estado === 'CANCELADA') {
          alRechazar('El banco rechazó la transacción. Tu reserva se canceló y no se hizo ningún cobro.');
        }
      } catch {
        // Se vuelve a intentar en la siguiente consulta
      }
    };
    const temporizador = setInterval(consultar, 3000);
    return () => {
      activo = false;
      clearInterval(temporizador);
    };
  }, [api, idReserva, navegar, alRechazar]);

  return (
    <div className="contenedor">
      <EstadoPantalla icono="reloj" tono="info" titulo="Tu banco está procesando el pago" alerta={false}
        acciones={<Link to="/mis-reservas" className="btn btn-secundario">Ver mis reservas</Link>}>
        <p>Te mostraremos el resultado apenas llegue. No cierres esta pantalla.</p>
        <div className="cargando" style={{ minHeight: 0, padding: 8 }} role="status"><span className="girando" aria-hidden="true" />Esperando confirmación…</div>
        <p className="pista"><Icono nombre="info" /><span>En el entorno de pruebas, el pago pendiente se confirma con el webhook de la pasarela.</span></p>
      </EstadoPantalla>
    </div>
  );
}

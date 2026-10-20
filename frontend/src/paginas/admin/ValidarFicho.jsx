import { useCallback, useEffect, useRef, useState } from 'react';
import { Aviso, EstadoPantalla } from '../../componentes/Comunes.jsx';
import { Icono } from '../../componentes/Icono.jsx';
import { useSesion } from '../../sesion/SesionContexto.jsx';
import { NOMBRE_METODO, dinero, hora, hoyEnBogota } from '../../utilidades/formato.js';
import { useDatos } from '../../utilidades/ganchos.js';

/** Validación de fichos en la caja: escanear → revisar pedido → registrar entrega (RF08). */
export function ValidarFicho() {
  const { api } = useSesion();
  const [vista, setVista] = useState({ paso: 'escanear' });
  const [token, setToken] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [usarCamara, setUsarCamara] = useState(false);
  const { datos: conteo, recargar: recargarConteo } = useDatos((senal) => api(`/admin/entregas?fecha=${hoyEnBogota()}`, { senal }), [api]);

  const validar = useCallback(async (texto) => {
    if (!texto.trim()) return;
    setOcupado(true);
    try {
      const respuesta = await api('/admin/fichos/validar', { metodo: 'POST', cuerpo: { token: texto } });
      setVista({ paso: 'pedido', ...respuesta });
    } catch (error) {
      setVista({ paso: 'error', error });
    } finally {
      setOcupado(false);
    }
  }, [api]);

  const entregar = async () => {
    setOcupado(true);
    try {
      const respuesta = await api(`/admin/fichos/${vista.ficho.idFicho}/entregar`, { metodo: 'POST' });
      setVista({ paso: 'entregado', ...respuesta });
      recargarConteo();
    } catch (error) {
      setVista({ paso: 'error', error });
    } finally {
      setOcupado(false);
    }
  };

  const siguiente = () => {
    setToken('');
    setVista({ paso: 'escanear' });
  };

  const resumen = conteo?.resumen;
  return (
    <div className="admin-cuerpo angosto">
      <div className="titulo-pagina">
        <h1>Validar ficho</h1>
        {resumen && <span className="chip" style={{ marginLeft: 'auto' }}><Icono nombre="entrega" />{resumen.entregadas} de {resumen.confirmadas} entregados hoy</span>}
      </div>

      {vista.paso === 'escanear' && (
        <>
          {usarCamara ? (
            <Escaner alLeer={validar} alApagar={() => setUsarCamara(false)} />
          ) : (
            <div className="camara">
              <div className="apagada">
                <Icono nombre="escanear" />
                <p>Escanea el código QR del ficho con la cámara de este dispositivo.</p>
                <button type="button" className="btn btn-primario auto" onClick={() => setUsarCamara(true)}><Icono nombre="camara" />Activar cámara</button>
              </div>
            </div>
          )}
          <div className="separador">o escribe el token</div>
          <form className="campo" onSubmit={(e) => { e.preventDefault(); validar(token); }}>
            <label htmlFor="token-manual">Token del ficho</label>
            <div className="entrada mono">
              <input id="token-manual" value={token} onChange={(e) => setToken(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="off" autoCapitalize="characters" spellCheck="false" maxLength={24} />
            </div>
            <button type="submit" className="btn btn-secundario" disabled={ocupado || !token.trim()} style={{ marginTop: 6 }}>
              {ocupado ? <><span className="girando" aria-hidden="true" />Buscando…</> : <><Icono nombre="buscar" />Buscar ficho</>}
            </button>
          </form>
        </>
      )}

      {vista.paso === 'pedido' && <Pedido datos={vista} ocupado={ocupado} alEntregar={entregar} alCancelar={siguiente} />}

      {vista.paso === 'entregado' && (
        <EstadoPantalla icono="check" tono="ok" titulo="Entrega registrada" alerta={false}
          acciones={<button type="button" className="btn btn-primario" onClick={siguiente}><Icono nombre="escanear" />Escanear siguiente</button>}>
          <p><b>{vista.reserva?.comensal?.nombreCompleto}</b> · {hora(vista.entrega.horaEntrega)}</p>
          <p>El ficho quedó marcado como <b>usado</b>.</p>
        </EstadoPantalla>
      )}

      {vista.paso === 'error' && <ErrorFicho error={vista.error} alSeguir={siguiente} />}
    </div>
  );
}

function Pedido({ datos, ocupado, alEntregar, alCancelar }) {
  const { reserva, ficho } = datos;
  const iniciales = reserva.comensal?.nombreCompleto.split(' ').slice(0, 2).map((p) => p[0]).join('');
  return (
    <>
      <button type="button" className="volver" onClick={alCancelar}><Icono nombre="flecha-izq" />Escanear otro</button>
      <Aviso tono="exito" icono="check-circulo" titulo="Ficho válido" rol="status">Activo · reserva de hoy</Aviso>
      <section className="tarjeta" aria-label="Pedido">
        <div className="perfil" style={{ padding: '0 0 12px' }}>
          <span className="avatar" aria-hidden="true">{iniciales}</span>
          <div><b>{reserva.comensal?.nombreCompleto}</b><span>{reserva.comensal?.nombreRol}</span></div>
        </div>
        <dl className="filas">
          <div className="fila"><dt>Almuerzo</dt><dd>{reserva.tipoAlmuerzo.nombre}</dd></div>
          <div className="fila"><dt>Proteína</dt><dd>{reserva.proteina.nombre}</dd></div>
          <div className="fila"><dt>Acompañamientos</dt><dd>{reserva.acompanamientos.map((a) => <span key={a.idAcompanamiento} style={{ display: 'block' }}>{a.nombre}</span>)}</dd></div>
          <div className="fila">
            <dt>Pago</dt>
            <dd>{reserva.tipoReserva === 'SUBSIDIADA'
              ? <span className="estado ok"><Icono nombre="insignia" />Subsidiado</span>
              : <span className="estado ok"><Icono nombre="check" />Aprobado · {NOMBRE_METODO[reserva.pago?.metodo]} · {dinero(reserva.valorTotal)}</span>}</dd>
          </div>
          <div className="fila"><dt>Token</dt><dd style={{ fontFamily: 'var(--mono)' }}>{ficho.token}</dd></div>
        </dl>
      </section>
      <p className="pista"><Icono nombre="info" /><span>Entrega el almuerzo y luego confirma.</span></p>
      <button type="button" className="btn btn-primario" onClick={alEntregar} disabled={ocupado}>
        {ocupado ? <><span className="girando" aria-hidden="true" />Registrando…</> : <><Icono nombre="entrega" />Registrar entrega</>}
      </button>
    </>
  );
}

function ErrorFicho({ error, alSeguir }) {
  const accion = <button type="button" className="btn btn-primario" onClick={alSeguir}><Icono nombre="escanear" />Escanear otro ficho</button>;
  if (error.codigo === 'FICHO_YA_USADO') {
    const d = error.detalles ?? {};
    return (
      <EstadoPantalla icono="x-circulo" tono="" titulo="Este ficho ya fue usado" acciones={accion}>
        <p><b>No entregues otro almuerzo.</b></p>
        <div className="tarjeta detalle">
          <dl className="filas">
            {d.titular && <div className="fila"><dt>Titular</dt><dd>{d.titular}</dd></div>}
            {d.horaEntrega && <div className="fila"><dt>Entregado</dt><dd>{d.fechaEntrega === hoyEnBogota() ? 'Hoy' : d.fechaEntrega}, {hora(d.horaEntrega)}</dd></div>}
            {d.validador && <div className="fila"><dt>Registró</dt><dd>{d.validador}</dd></div>}
          </dl>
        </div>
      </EstadoPantalla>
    );
  }
  const titulos = {
    FICHO_EXPIRADO: 'Este ficho ya no es válido',
    FICHO_NO_ENCONTRADO: 'No encontramos ese ficho',
    TOKEN_INVALIDO: 'Ese código no es un ficho',
    RESERVA_NO_CONFIRMADA: 'La reserva no está confirmada',
    SIN_CONEXION: 'Sin conexión',
  };
  return (
    <EstadoPantalla icono={error.codigo === 'SIN_CONEXION' ? 'wifi-off' : 'x-circulo'} tono={error.codigo === 'SIN_CONEXION' ? 'neutro' : ''} titulo={titulos[error.codigo] ?? 'No se pudo validar'} acciones={accion}>
      <p>{error.message}</p>
    </EstadoPantalla>
  );
}

/** Lector de QR con la cámara trasera (html5-qrcode). Se carga solo cuando se necesita. */
function Escaner({ alLeer, alApagar }) {
  const [estado, setEstado] = useState('iniciando');
  const [motivo, setMotivo] = useState('');
  const lector = useRef(null);
  const alLeerActual = useRef(alLeer);
  useEffect(() => {
    alLeerActual.current = alLeer;
  }, [alLeer]);

  useEffect(() => {
    let cancelado = false;
    const detener = async () => {
      const l = lector.current;
      lector.current = null;
      if (!l) return;
      try {
        if (l.isScanning) await l.stop();
        l.clear();
      } catch {
        // La cámara ya estaba detenida
      }
    };
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setEstado('error');
        setMotivo('El navegador solo permite la cámara en páginas seguras (HTTPS). Abre la app con "npm run dev:celular" o escribe el token.');
        return;
      }
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelado) return;
        const l = new Html5Qrcode('lector-qr', { verbose: false });
        lector.current = l;
        await l.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
          (texto) => {
            detener();
            alLeerActual.current(texto);
          },
          () => {},
        );
        if (cancelado) await detener();
        else setEstado('activa');
      } catch (e) {
        lector.current = null;
        if (cancelado) return;
        setEstado('error');
        setMotivo(
          e?.name === 'NotAllowedError' || /permission/i.test(String(e))
            ? 'No diste permiso para usar la cámara. Actívalo en el navegador o escribe el token.'
            : e?.name === 'NotFoundError' || /not found|no camera/i.test(String(e))
              ? 'No encontramos una cámara en este dispositivo. Escribe el token.'
              : 'No pudimos usar la cámara. Escribe el token.',
        );
      }
    })();
    return () => {
      cancelado = true;
      detener();
    };
  }, []);

  return (
    <div>
      <div className="camara" aria-live="polite">
        <div id="lector-qr" aria-label="Vista de la cámara" />
        {estado === 'iniciando' && <div className="apagada" style={{ position: 'absolute' }}><span className="girando" aria-hidden="true" />Encendiendo la cámara…</div>}
        {estado === 'error' && (
          <div className="apagada" style={{ position: 'absolute', inset: 0, justifyContent: 'center' }} role="alert">
            <Icono nombre="alerta" />
            <p>{motivo}</p>
            <button type="button" className="btn btn-secundario auto" onClick={alApagar}>Entendido</button>
          </div>
        )}
      </div>
      {estado === 'activa' && (
        <p className="nota-peq" style={{ marginTop: 8 }}>
          Apunta la cámara al código QR del ficho.
          <button type="button" className="btn-texto btn auto" onClick={alApagar}>Apagar cámara</button>
        </p>
      )}
    </div>
  );
}

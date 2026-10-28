import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { llamarApi } from '../api/cliente.js';
import { Icono } from '../componentes/Icono.jsx';

/**
 * Recuperar contraseña. Dos caminos:
 * - Código por correo: llega al correo @udes.edu.co y vence en 15 minutos.
 * - Ayuda del administrador: la persona deja su solicitud y en la caja de la
 *   cafetería, con su documento, le dan un código.
 * En ambos casos el código se escribe aquí junto con la contraseña nueva.
 */
export function RecuperarContrasena() {
  const navegar = useNavigate();
  const [paso, setPaso] = useState('correo');
  const [campos, setCampos] = useState({ correo: '', documento: '', codigo: '', contrasena: '', confirmacion: '' });
  const [errores, setErrores] = useState({});
  const [aviso, setAviso] = useState(null);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [verContrasena, setVerContrasena] = useState(false);
  const titular = useRef(null);

  useEffect(() => {
    titular.current?.focus();
  }, [paso]);

  const cambiar = (campo) => (e) => {
    let valor = e.target.value;
    if (campo === 'documento') valor = valor.replace(/\D/g, '').slice(0, 15);
    if (campo === 'codigo') valor = valor.replace(/\D/g, '').slice(0, 6);
    setCampos((c) => ({ ...c, [campo]: valor }));
    if (errores[campo]) setErrores((x) => ({ ...x, [campo]: undefined }));
  };

  const irA = (nuevo, avisoNuevo = null) => {
    setError(null);
    setErrores({});
    setAviso(avisoNuevo);
    setPaso(nuevo);
  };

  /** Valida lo obligatorio en el navegador; el backend vuelve a validar todo. */
  const exigir = (lista) => {
    const nuevos = {};
    for (const [campo, mensaje] of lista) if (!campos[campo].trim()) nuevos[campo] = mensaje;
    setErrores(nuevos);
    const primero = Object.keys(nuevos)[0];
    if (primero) setTimeout(() => document.getElementById(`recuperar-${primero}`)?.focus(), 0);
    return !primero;
  };

  const enviar = (accion) => async (e) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await accion();
    } catch (err) {
      const delServidor = {};
      if (err.codigo === 'DATOS_INVALIDOS') for (const c of err.detalles?.campos ?? []) delServidor[c.campo] ??= c.mensaje;
      if (err.codigo === 'CODIGO_INVALIDO' || err.codigo === 'CODIGO_AGOTADO') delServidor.codigo = err.message;
      if (Object.keys(delServidor).length) {
        setErrores(delServidor);
        setTimeout(() => document.getElementById(`recuperar-${Object.keys(delServidor)[0]}`)?.focus(), 0);
      } else {
        setError(err);
      }
    } finally {
      setEnviando(false);
    }
  };

  const pedirCodigo = enviar(async () => {
    if (!exigir([['correo', 'Escribe tu correo institucional']])) return;
    const r = await llamarApi('/auth/recuperar/codigo', { metodo: 'POST', cuerpo: { correo: campos.correo.trim() } });
    irA('codigo', r.mensaje);
  });

  const pedirAyuda = enviar(async () => {
    if (!exigir([['correo', 'Escribe tu correo institucional'], ['documento', 'Escribe tu número de documento']])) return;
    const r = await llamarApi('/auth/recuperar/ayuda', { metodo: 'POST', cuerpo: { correo: campos.correo.trim(), documento: campos.documento } });
    irA('ayuda-enviada', r.mensaje);
  });

  const restablecer = enviar(async () => {
    const ok = exigir([
      ['correo', 'Escribe tu correo institucional'],
      ['codigo', 'Escribe el código de 6 dígitos'],
      ['contrasena', 'Crea una contraseña nueva'],
      ['confirmacion', 'Repite la contraseña nueva'],
    ]);
    if (!ok) return;
    if (campos.contrasena !== campos.confirmacion) {
      setErrores({ confirmacion: 'Las contraseñas no coinciden' });
      setTimeout(() => document.getElementById('recuperar-confirmacion')?.focus(), 0);
      return;
    }
    const r = await llamarApi('/auth/recuperar/restablecer', {
      metodo: 'POST',
      cuerpo: { correo: campos.correo.trim(), codigo: campos.codigo, contrasena: campos.contrasena },
    });
    navegar('/ingresar', { replace: true, state: { aviso: r.mensaje } });
  });

  const campo = (id, etiqueta, props = {}, extra = null, ayuda = null) => (
    <div className={`campo ${errores[id] ? 'error' : ''}`}>
      <label htmlFor={`recuperar-${id}`}>{etiqueta}</label>
      <div className="entrada">
        <input
          {...props}
          id={`recuperar-${id}`}
          value={campos[id]}
          onChange={cambiar(id)}
          aria-invalid={errores[id] ? true : undefined}
          aria-describedby={errores[id] ? `recuperar-${id}-error` : ayuda ? `recuperar-${id}-ayuda` : undefined}
        />
        {extra}
      </div>
      {errores[id]
        ? <span className="msg-error" id={`recuperar-${id}-error`}><Icono nombre="alerta" />{errores[id]}</span>
        : ayuda && <span className="ayuda-campo" id={`recuperar-${id}-ayuda`}>{ayuda}</span>}
    </div>
  );

  const campoCorreo = campo('correo', 'Correo', { type: 'email', inputMode: 'email', autoComplete: 'username', placeholder: '@udes.edu.co' });
  const verOcultar = (
    <button type="button" className="accion" onClick={() => setVerContrasena((v) => !v)} aria-pressed={verContrasena}>
      <Icono nombre={verContrasena ? 'ojo-tachado' : 'ojo'} />
      <span className="solo-lectores">{verContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}</span>
    </button>
  );
  const boton = (texto, enCurso) => (
    <button type="submit" className="btn btn-lila" disabled={enviando}>
      {enviando ? <><span className="girando" aria-hidden="true" />{enCurso}</> : texto}
    </button>
  );

  const TITULOS = {
    correo: '¿Olvidaste tu contraseña?',
    codigo: 'Crea tu contraseña nueva',
    ayuda: 'Pedir ayuda al administrador',
    'ayuda-enviada': 'Solicitud enviada',
  };

  return (
    <div className="pantalla-acceso">
      <header className="barra-titulo">
        <div className="interior">
          <Link to="/ingresar" aria-label="Volver a iniciar sesión"><Icono nombre="chev-izq" /></Link>
          <p className="titulo-barra">Recuperar contraseña</p>
        </div>
      </header>
      <main className="acceso-cuerpo">
        <span className="icono-grande info" aria-hidden="true"><Icono nombre="candado" /></span>
        <h1 className="titulo-figma" ref={titular} tabIndex={-1} style={{ color: 'var(--marino)', outline: 'none' }}>{TITULOS[paso]}</h1>

        {aviso && (
          <div className="aviso exito" role="status">
            <Icono nombre={paso === 'ayuda-enviada' ? 'ubicacion' : 'correo'} />
            <span>{aviso}</span>
          </div>
        )}
        {error && (
          <div className="aviso peligro" role="alert">
            <Icono nombre={error.codigo === 'SIN_CONEXION' ? 'wifi-off' : 'x-circulo'} />
            <div><strong>{error.codigo === 'DEMASIADOS_INTENTOS' ? 'Demasiados intentos' : 'No pudimos continuar'}</strong><span>{error.message}</span></div>
          </div>
        )}

        {paso === 'correo' && (
          <form className="tarjeta-acceso" onSubmit={pedirCodigo} noValidate>
            <p className="texto-ayuda">Escribe tu correo institucional y te enviaremos un código de 6 dígitos para crear una contraseña nueva.</p>
            {campoCorreo}
            {boton('Enviarme un código', 'Enviando…')}
            <button type="button" className="enlace" onClick={() => irA('codigo')}>Ya tengo un código</button>
            <button type="button" className="enlace" onClick={() => irA('ayuda')}>No tengo acceso a mi correo: pedir ayuda al administrador</button>
          </form>
        )}

        {paso === 'codigo' && (
          <form className="tarjeta-acceso" onSubmit={restablecer} noValidate>
            {campoCorreo}
            {campo('codigo', 'Código de 6 dígitos', { inputMode: 'numeric', autoComplete: 'one-time-code', placeholder: '123456' }, null,
              'Te llega por correo (vence en 15 minutos) o te lo da el administrador.')}
            {campo('contrasena', 'Contraseña nueva', { type: verContrasena ? 'text' : 'password', autoComplete: 'new-password', maxLength: 72 }, verOcultar,
              'Mínimo 8 caracteres, con letras y números.')}
            {campo('confirmacion', 'Repite la contraseña nueva', { type: verContrasena ? 'text' : 'password', autoComplete: 'new-password', maxLength: 72 })}
            {boton('Cambiar contraseña', 'Guardando…')}
            <button type="button" className="enlace" onClick={() => irA('correo')}>Enviarme otro código</button>
            <button type="button" className="enlace" onClick={() => irA('ayuda')}>No me llegó: pedir ayuda al administrador</button>
          </form>
        )}

        {paso === 'ayuda' && (
          <form className="tarjeta-acceso" onSubmit={pedirAyuda} noValidate>
            <p className="texto-ayuda">El administrador de la cafetería verificará tu identidad con tu documento y te dará un código.</p>
            {campoCorreo}
            {campo('documento', 'Documento', { inputMode: 'numeric', autoComplete: 'off', placeholder: 'Sin puntos' })}
            {boton('Pedir ayuda', 'Enviando…')}
            <button type="button" className="enlace" onClick={() => irA('correo')}>Mejor envíame el código al correo</button>
          </form>
        )}

        {paso === 'ayuda-enviada' && (
          <div className="tarjeta-acceso">
            <p className="texto-ayuda">Lleva tu documento a la caja de la cafetería principal (zona de buses). Cuando tengas el código, escríbelo en el siguiente paso.</p>
            <button type="button" className="btn btn-lila" onClick={() => irA('codigo')}>Ya tengo el código</button>
          </div>
        )}

        <div className="pie-acceso">
          <Link to="/ingresar" className="enlace">Volver a iniciar sesión</Link>
          <Link to="/ayuda" className="enlace">Ver la ayuda</Link>
        </div>
      </main>
    </div>
  );
}

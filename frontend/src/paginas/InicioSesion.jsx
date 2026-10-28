import { useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icono } from '../componentes/Icono.jsx';
import { useSesion } from '../sesion/SesionContexto.jsx';

const TITULOS_DE_ERROR = {
  SIN_CONEXION: 'Sin conexión',
  CUENTA_EN_REVISION: 'Tu cuenta está en revisión',
  CUENTA_RECHAZADA: 'Tu solicitud de cuenta fue rechazada',
  DEMASIADOS_INTENTOS: 'Demasiados intentos',
};

export function InicioSesion() {
  const { iniciarSesion } = useSesion();
  const navegar = useNavigate();
  const { desde, aviso } = useLocation().state ?? {};
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [verContrasena, setVerContrasena] = useState(false);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const alerta = useRef(null);
  const ids = { correo: useId(), contrasena: useId(), error: useId() };

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      // El rol lo decide el backend: no se elige al iniciar sesión (RF01).
      const usuario = await iniciarSesion(correo.trim(), contrasena);
      const esAdmin = usuario.rol === 'ADMINISTRADOR';
      const destino = desde && desde.startsWith('/admin') === esAdmin ? desde : esAdmin ? '/admin' : '/';
      navegar(destino, { replace: true });
    } catch (err) {
      setError(err);
      setTimeout(() => alerta.current?.focus(), 0);
    } finally {
      setEnviando(false);
    }
  };

  const errorCredenciales = error?.codigo === 'CREDENCIALES_INVALIDAS';
  return (
    <div className="pantalla-acceso">
      <header className="barra-titulo">
        <div className="interior">
          <Link to="/registro" aria-label="Volver a la pantalla de registro"><Icono nombre="chev-izq" /></Link>
          <h1>Iniciar Sesión</h1>
        </div>
      </header>
      <main className="acceso-cuerpo">
        <img src="/logo.png" alt="UDES FoodPass" className="logo-grande" width="210" height="210" />

        {aviso && !error && (
          <div className="aviso exito" role="status">
            <Icono nombre="check-circulo" />
            <span>{aviso}</span>
          </div>
        )}
        {desde && desde !== '/' && !error && (
          <div className="aviso" role="status">
            <Icono nombre="info" />
            <span>Inicia sesión para continuar donde ibas.</span>
          </div>
        )}
        {error && (
          <div className={`aviso ${error.codigo === 'CUENTA_EN_REVISION' ? 'alerta' : 'peligro'}`} role="alert" tabIndex={-1} ref={alerta} id={ids.error}>
            <Icono nombre={error.codigo === 'SIN_CONEXION' ? 'wifi-off' : error.codigo === 'CUENTA_EN_REVISION' ? 'reloj' : 'x-circulo'} />
            <div>
              <strong>{TITULOS_DE_ERROR[error.codigo] ?? 'No pudimos iniciar sesión'}</strong>
              <span>{error.message}</span>
              {error.codigo === 'CUENTA_RECHAZADA' && error.detalles?.motivo && <span> Motivo: {error.detalles.motivo}</span>}
            </div>
          </div>
        )}

        <form className="tarjeta-acceso" onSubmit={enviar} noValidate>
          <div className="campo">
            <label htmlFor={ids.correo}>Correo</label>
            <div className="entrada">
              <input
                id={ids.correo}
                type="email"
                inputMode="email"
                autoComplete="username"
                placeholder="@udes.edu.co"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                required
                aria-describedby={error ? ids.error : undefined}
              />
            </div>
          </div>
          <div className={`campo ${errorCredenciales ? 'error' : ''}`}>
            <label htmlFor={ids.contrasena}>Contraseña</label>
            <div className="entrada">
              <input
                id={ids.contrasena}
                type={verContrasena ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Ingresa la contraseña"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                required
                aria-invalid={errorCredenciales || undefined}
              />
              <button type="button" className="accion" onClick={() => setVerContrasena((v) => !v)} aria-pressed={verContrasena}>
                <Icono nombre={verContrasena ? 'ojo-tachado' : 'ojo'} />
                <span className="solo-lectores">{verContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}</span>
              </button>
            </div>
          </div>
          <button type="submit" className="btn btn-lila" disabled={enviando || !correo || !contrasena}>
            {enviando ? <><span className="girando" aria-hidden="true" />Ingresando…</> : 'Ingresar'}
          </button>
          <Link to="/recuperar" className="enlace">¿Olvidaste tu contraseña?</Link>
          <Link to="/registro" className="enlace">Registrarse</Link>
        </form>
        <Link to="/ayuda" className="enlace enlace-ayuda"><Icono nombre="ayuda" />Ayuda y soporte</Link>
        <p className="nota-peq"><Icono nombre="ubicacion" />Cafetería principal · Zona de buses</p>
      </main>
    </div>
  );
}

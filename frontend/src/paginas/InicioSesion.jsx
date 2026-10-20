import { useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icono } from '../componentes/Icono.jsx';
import { useSesion } from '../sesion/SesionContexto.jsx';

export function InicioSesion() {
  const { iniciarSesion } = useSesion();
  const navegar = useNavigate();
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
      // El rol lo decide el backend: no se elige en el login (RF01).
      const usuario = await iniciarSesion(correo.trim(), contrasena);
      navegar(usuario.rol === 'ADMINISTRADOR' ? '/admin' : '/', { replace: true });
    } catch (err) {
      setError(err);
      setTimeout(() => alerta.current?.focus(), 0);
    } finally {
      setEnviando(false);
    }
  };

  const errorCredenciales = error?.codigo === 'CREDENCIALES_INVALIDAS';
  return (
    <div className="pantalla-login">
      <div className="login-heroe">
        <div className="interior">
          <div className="marca">
            <span className="logo"><Icono nombre="cubiertos" /></span>
            <span>UDES FoodPass<small>Universidad de Santander</small></span>
          </div>
          <p>Reserva tu almuerzo y reclámalo sin hacer fila.</p>
        </div>
      </div>
      <main className="login-form">
        <h1 className="titulo-pantalla">Inicia sesión</h1>
        {error && (
          <div className="aviso peligro" role="alert" tabIndex={-1} ref={alerta} id={ids.error}>
            <Icono nombre={error.codigo === 'SIN_CONEXION' ? 'wifi-off' : 'x-circulo'} />
            <div>
              <strong>{error.codigo === 'SIN_CONEXION' ? 'Sin conexión' : 'No pudimos iniciar sesión'}</strong>
              <span>{error.message}</span>
            </div>
          </div>
        )}
        <form onSubmit={enviar} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="campo">
            <label htmlFor={ids.correo}>Correo institucional</label>
            <div className="entrada">
              <Icono nombre="correo" />
              <input
                id={ids.correo}
                type="email"
                inputMode="email"
                autoComplete="username"
                placeholder="nombre.apellido@udes.edu.co"
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
              <Icono nombre="candado" />
              <input
                id={ids.contrasena}
                type={verContrasena ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Escribe tu contraseña"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                required
                aria-invalid={errorCredenciales || undefined}
              />
              <button type="button" className="accion" onClick={() => setVerContrasena((v) => !v)} aria-pressed={verContrasena}>
                <Icono nombre={verContrasena ? 'ojo-tachado' : 'ojo'} />
                {verContrasena ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>
          <button type="submit" className="btn btn-primario" disabled={enviando || !correo || !contrasena}>
            {enviando ? <><span className="girando" aria-hidden="true" />Ingresando…</> : 'Ingresar'}
          </button>
        </form>
        <p className="pista">
          <Icono nombre="info" />
          <span>Tu perfil (estudiante, subsidiado, empleado o administrador) se reconoce automáticamente al ingresar. Solo se aceptan correos <b>@udes.edu.co</b>.</span>
        </p>
      </main>
      <p className="nota-peq pie-login"><Icono nombre="ubicacion" />Cafetería principal · Zona de buses</p>
    </div>
  );
}

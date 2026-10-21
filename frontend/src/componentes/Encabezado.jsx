import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSesion } from '../sesion/SesionContexto.jsx';
import { Icono } from './Icono.jsx';

/** Encabezado del usuario: avatar, nombre y menú desplegable (Inicio, Pagos, QR's y Cerrar Sesión). */
export function Encabezado() {
  const { usuario, cerrarSesion } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const panel = useRef(null);
  const boton = useRef(null);
  const id = useId();
  const ubicacion = useLocation();
  const navegar = useNavigate();

  useEffect(() => setAbierto(false), [ubicacion.pathname]);

  useEffect(() => {
    if (!abierto) return undefined;
    panel.current?.querySelector('a, button')?.focus();
    const alTeclear = (e) => {
      if (e.key === 'Escape') {
        setAbierto(false);
        boton.current?.focus();
      }
      // Mantiene el foco dentro del menú mientras está abierto
      if (e.key === 'Tab' && panel.current) {
        const enfocables = [...panel.current.querySelectorAll('a, button')];
        const primero = enfocables[0];
        const ultimo = enfocables.at(-1);
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [abierto]);

  const salir = () => {
    cerrarSesion();
    navegar('/ingresar', { replace: true });
  };

  return (
    <>
      <header className="app-header">
        <div className="interior">
          <span className="avatar-icono" aria-hidden="true"><Icono nombre="usuario" /></span>
          <span className="nombre-usuario" title={`${usuario?.nombreCompleto} · ${usuario?.nombreRol}`}>{usuario?.nombreCompleto}</span>
          <button
            ref={boton}
            type="button"
            className="btn-hamburguesa"
            aria-expanded={abierto}
            aria-controls={id}
            aria-label={abierto ? 'Cerrar el menú' : 'Abrir el menú'}
            onClick={() => setAbierto((a) => !a)}
          >
            <Icono nombre={abierto ? 'cerrar' : 'menu'} />
          </button>
        </div>
        {abierto && (
          <nav className="desplegable" id={id} aria-label="Menú principal">
            <div className="panel" ref={panel}>
              <NavLink to="/" end className="nav-item">Inicio</NavLink>
              <NavLink to="/pagos" className="nav-item">Pagos</NavLink>
              <NavLink to="/qr" className="nav-item">QR&apos;s</NavLink>
              <button type="button" className="nav-item salir" onClick={salir}>Cerrar Sesión</button>
            </div>
          </nav>
        )}
      </header>
      {abierto && <button type="button" className="velo" aria-label="Cerrar el menú" tabIndex={-1} onClick={() => setAbierto(false)} />}
    </>
  );
}

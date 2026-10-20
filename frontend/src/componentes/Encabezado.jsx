import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSesion } from '../sesion/SesionContexto.jsx';
import { Icono } from './Icono.jsx';

/** Encabezado del usuario con menú desplegable: Inicio, Mis reservas, Mi Ficho y Cerrar sesión. */
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

  const iniciales = `${usuario?.nombre?.[0] ?? ''}${usuario?.apellido?.[0] ?? ''}`;
  const salir = () => {
    cerrarSesion();
    navegar('/ingresar', { replace: true });
  };

  return (
    <>
      <header className="app-header">
        <div className="interior">
          <NavLink to="/" className="marca" aria-label="UDES FoodPass, ir al inicio">
            <span className="logo"><Icono nombre="cubiertos" /></span>
            <span>UDES FoodPass<small>Cafetería principal</small></span>
          </NavLink>
          <button ref={boton} type="button" className="btn-menu" aria-expanded={abierto} aria-controls={id} onClick={() => setAbierto((a) => !a)}>
            <Icono nombre={abierto ? 'cerrar' : 'menu'} />
            {abierto ? 'Cerrar' : 'Menú'}
          </button>
        </div>
        {abierto && (
          <nav className="desplegable" id={id} aria-label="Menú principal">
            <div className="panel" ref={panel}>
              <div className="perfil">
                <span className="avatar" aria-hidden="true">{iniciales}</span>
                <div>
                  <b>{usuario?.nombreCompleto}</b>
                  <span>{usuario?.nombreRol} · {usuario?.correo}</span>
                </div>
              </div>
              <NavLink to="/" end className="nav-item"><Icono nombre="casa" />Inicio</NavLink>
              <NavLink to="/mis-reservas" className="nav-item"><Icono nombre="lista" />Mis reservas</NavLink>
              <NavLink to="/mi-ficho" className="nav-item"><Icono nombre="qr" />Mi Ficho</NavLink>
              <button type="button" className="nav-item salir" onClick={salir}><Icono nombre="salir" />Cerrar sesión</button>
            </div>
          </nav>
        )}
      </header>
      {abierto && <button type="button" className="velo" aria-label="Cerrar el menú" tabIndex={-1} onClick={() => setAbierto(false)} />}
    </>
  );
}

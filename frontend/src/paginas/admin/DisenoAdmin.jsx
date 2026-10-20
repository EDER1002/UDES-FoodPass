import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icono } from '../../componentes/Icono.jsx';
import { useSesion } from '../../sesion/SesionContexto.jsx';
import { sumarDias } from '../../utilidades/formato.js';

const SECCIONES = [
  { ruta: '/admin', nombre: 'Menú del día', icono: 'plato', fin: true },
  { ruta: '/admin/catalogos', nombre: 'Catálogos', icono: 'lista' },
  { ruta: '/admin/horarios', nombre: 'Horarios', icono: 'reloj' },
  { ruta: '/admin/validar', nombre: 'Validar fichos', icono: 'escanear' },
  { ruta: '/admin/entregas', nombre: 'Entregas', icono: 'entrega' },
];

export function DisenoAdmin() {
  const { usuario, cerrarSesion } = useSesion();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const ubicacion = useLocation();
  const navegar = useNavigate();
  useEffect(() => setMenuAbierto(false), [ubicacion.pathname]);

  const salir = () => {
    cerrarSesion();
    navegar('/ingresar', { replace: true });
  };
  const iniciales = `${usuario?.nombre?.[0] ?? ''}${usuario?.apellido?.[0] ?? ''}`;
  return (
    <div className="app-admin">
      <a href="#contenido" className="saltar-contenido">Saltar al contenido</a>
      <header className="admin-header">
        <div className="interior">
          <NavLink to="/admin" className="marca" aria-label="UDES FoodPass Administración, ir al menú del día">
            <span className="logo"><Icono nombre="cubiertos" /></span>
            <span>UDES FoodPass<small>Administración</small></span>
          </NavLink>
          <button type="button" className="btn-menu btn-menu-admin" aria-expanded={menuAbierto} aria-controls="nav-admin" onClick={() => setMenuAbierto((a) => !a)}>
            <Icono nombre={menuAbierto ? 'cerrar' : 'menu'} />{menuAbierto ? 'Cerrar' : 'Menú'}
          </button>
          <nav id="nav-admin" className={`admin-nav ${menuAbierto ? 'abierta' : ''}`} aria-label="Administración">
            {SECCIONES.map((s) => (
              <NavLink key={s.ruta} to={s.ruta} end={s.fin}><Icono nombre={s.icono} />{s.nombre}</NavLink>
            ))}
            <button type="button" className="salir-movil" onClick={salir}><Icono nombre="salir" />Cerrar sesión</button>
          </nav>
          <div className="admin-usuario">
            <span className="avatar chico" aria-hidden="true">{iniciales}</span>
            <span><b>{usuario?.nombreCompleto}</b><br /><small>{usuario?.nombreRol}</small></span>
            <button type="button" className="btn-menu" onClick={salir}><Icono nombre="salir" />Cerrar sesión</button>
          </div>
        </div>
      </header>
      <main id="contenido" tabIndex={-1} style={{ outline: 'none', flex: 1 }}>
        <Outlet />
      </main>
    </div>
  );
}

/** Selector de fecha con botones de día anterior y siguiente. */
export function SelectorFecha({ fecha, alCambiar, etiqueta = 'Fecha' }) {
  return (
    <div className="selector-fecha" role="group" aria-label={etiqueta}>
      <button type="button" className="icono-btn sin-borde" onClick={() => alCambiar(sumarDias(fecha, -1))} aria-label="Día anterior"><Icono nombre="chev-izq" /></button>
      <Icono nombre="calendario" />
      <input type="date" value={fecha} onChange={(e) => e.target.value && alCambiar(e.target.value)} aria-label={etiqueta} />
      <button type="button" className="icono-btn sin-borde" onClick={() => alCambiar(sumarDias(fecha, 1))} aria-label="Día siguiente"><Icono nombre="chev-der" /></button>
    </div>
  );
}

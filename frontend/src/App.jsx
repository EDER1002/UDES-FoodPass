import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Encabezado } from './componentes/Encabezado.jsx';
import { useSesion } from './sesion/SesionContexto.jsx';
import { CrearCuenta } from './paginas/CrearCuenta.jsx';
import { InicioSesion } from './paginas/InicioSesion.jsx';
import { MenuDelDia } from './paginas/usuario/MenuDelDia.jsx';
import { MiFicho } from './paginas/usuario/MiFicho.jsx';
import { MisReservas } from './paginas/usuario/MisReservas.jsx';
import { ResumenPago } from './paginas/usuario/ResumenPago.jsx';
import { ResumenSubsidiado } from './paginas/usuario/ResumenSubsidiado.jsx';
import { DisenoAdmin } from './paginas/admin/DisenoAdmin.jsx';
import { MenuAdmin } from './paginas/admin/MenuAdmin.jsx';
import { Catalogos } from './paginas/admin/Catalogos.jsx';
import { Horarios } from './paginas/admin/Horarios.jsx';
import { ValidarFicho } from './paginas/admin/ValidarFicho.jsx';
import { Entregas } from './paginas/admin/Entregas.jsx';
import { Solicitudes } from './paginas/admin/Solicitudes.jsx';

const ADMIN = 'ADMINISTRADOR';

/** Solo deja pasar a usuarios con sesión (y del tipo indicado). El rol viene del backend. */
function Protegida({ admin = false }) {
  const { usuario } = useSesion();
  const ubicacion = useLocation();
  // Se recuerda a dónde iba, para volver ahí después de iniciar sesión.
  if (!usuario) return <Navigate to="/ingresar" replace state={{ desde: ubicacion.pathname }} />;
  if (admin && usuario.rol !== ADMIN) return <Navigate to="/" replace />;
  if (!admin && usuario.rol === ADMIN) return <Navigate to="/admin" replace />;
  return <Outlet />;
}

function DisenoUsuario() {
  return (
    <div className="app-usuario">
      <a href="#contenido" className="saltar-contenido">Saltar al contenido</a>
      <Encabezado />
      <main id="contenido" tabIndex={-1} style={{ outline: 'none', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  );
}

export function App() {
  const { usuario } = useSesion();
  return (
    <Routes>
      <Route path="/ingresar" element={usuario ? <Navigate to={usuario.rol === ADMIN ? '/admin' : '/'} replace /> : <InicioSesion />} />
      <Route path="/registro" element={usuario ? <Navigate to="/" replace /> : <CrearCuenta />} />
      <Route element={<Protegida />}>
        <Route element={<DisenoUsuario />}>
          <Route index element={<MenuDelDia />} />
          <Route path="reserva/confirmar" element={<ResumenSubsidiado />} />
          <Route path="reserva/:id/pago" element={<ResumenPago />} />
          <Route path="qr" element={<MiFicho />} />
          <Route path="pagos" element={<MisReservas />} />
          {/* Direcciones anteriores */}
          <Route path="mi-ficho" element={<Navigate to="/qr" replace />} />
          <Route path="mis-reservas" element={<Navigate to="/pagos" replace />} />
        </Route>
      </Route>
      <Route path="admin" element={<Protegida admin />}>
        <Route element={<DisenoAdmin />}>
          <Route index element={<MenuAdmin />} />
          <Route path="catalogos" element={<Catalogos />} />
          <Route path="horarios" element={<Horarios />} />
          <Route path="validar" element={<ValidarFicho />} />
          <Route path="entregas" element={<Entregas />} />
          <Route path="solicitudes" element={<Solicitudes />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

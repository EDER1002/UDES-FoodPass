import { useEffect, useState } from 'react';
import { Aviso, Cargando, PantallaDeError } from '../../componentes/Comunes.jsx';
import { Icono } from '../../componentes/Icono.jsx';
import { useSesion } from '../../sesion/SesionContexto.jsx';
import { NOMBRE_METODO, fechaLarga, hora, hoyEnBogota, mayuscula } from '../../utilidades/formato.js';
import { useDatos } from '../../utilidades/ganchos.js';
import { SelectorFecha } from './DisenoAdmin.jsx';

/** Entregas del día con resumen y quién validó cada ficho. */
export function Entregas() {
  const { api } = useSesion();
  const [fecha, setFecha] = useState(hoyEnBogota);
  const [buscar, setBuscar] = useState('');
  const [tipo, setTipo] = useState('TODAS');
  const { datos, error, cargando, recargar } = useDatos((senal) => api(`/admin/entregas?fecha=${fecha}`, { senal }), [api, fecha]);

  // Hoy se actualiza solo cada 30 segundos, para seguir la fila en tiempo real.
  useEffect(() => {
    if (fecha !== hoyEnBogota()) return undefined;
    const t = setInterval(recargar, 30_000);
    return () => clearInterval(t);
  }, [fecha, recargar]);

  if (cargando && !datos) return <Cargando texto="Cargando entregas…" />;
  // Si falla una actualización automática, la tabla se conserva y se avisa arriba.
  if (error && !datos) return <div className="admin-cuerpo"><PantallaDeError error={error} alReintentar={recargar} /></div>;

  const { resumen, entregas } = datos;
  const porcentaje = resumen.confirmadas ? Math.round((resumen.entregadas / resumen.confirmadas) * 100) : 0;
  const filtradas = entregas.filter((e) => {
    const r = e.reserva;
    const texto = `${r?.comensal?.nombreCompleto ?? ''} ${e.token}`.toLowerCase();
    return texto.includes(buscar.trim().toLowerCase()) && (tipo === 'TODAS' || r?.tipoReserva === tipo);
  });

  return (
    <div className="admin-cuerpo">
      <div className="titulo-pagina">
        <h1>Entregas del día</h1>
        <SelectorFecha fecha={fecha} alCambiar={setFecha} etiqueta="Fecha de las entregas" />
        <div className="acciones"><button type="button" className="btn btn-secundario chico auto" onClick={recargar}><Icono nombre="actualizar" />Actualizar</button></div>
        <p>{mayuscula(fechaLarga(fecha, { conAnio: true }))}</p>
      </div>
      {error && <Aviso tono="alerta" icono="wifi-off" titulo="No se pudo actualizar" rol="status">Se muestran los últimos datos. {error.message}</Aviso>}
      <div className="kpis">
        <div className="kpi"><span className="lbl"><Icono nombre="check-circulo" />Reservas confirmadas</span><span className="valor">{resumen.confirmadas}</span><span className="sub">{resumen.pendientesDePago} pendientes de pago</span></div>
        <div className="kpi">
          <span className="lbl"><Icono nombre="entrega" />Entregadas</span>
          <span className="valor">{resumen.entregadas} <small>· {porcentaje} %</small></span>
          <div className="progreso" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={porcentaje} aria-label="Avance de entregas"><i style={{ width: `${porcentaje}%` }} /></div>
        </div>
        <div className="kpi"><span className="lbl"><Icono nombre="reloj" />Por entregar</span><span className="valor">{resumen.porEntregar}</span><span className="sub">Fichos activos</span></div>
        <div className="kpi"><span className="lbl"><Icono nombre="insignia" />Subsidiadas</span><span className="valor">{resumen.subsidiadas} <small>de {resumen.confirmadas}</small></span><span className="sub">{resumen.pagadas} pagadas</span></div>
      </div>
      <section className="tarjeta" aria-label="Lista de entregas">
        <div className="barra-filtros">
          <div className="entrada chica"><Icono nombre="buscar" /><input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre o token" aria-label="Buscar por nombre o token" /></div>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de reserva">
            <option value="TODAS">Todos los tipos</option>
            <option value="PAGADA">Pagadas</option>
            <option value="SUBSIDIADA">Subsidiadas</option>
          </select>
        </div>
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr><th scope="col">Hora</th><th scope="col">Usuario</th><th scope="col">Pedido</th><th scope="col">Tipo</th><th scope="col">Validó</th></tr></thead>
            <tbody>
              {filtradas.length === 0 && <tr><td colSpan={5} className="suave">{entregas.length ? 'Ninguna entrega coincide con el filtro.' : 'Todavía no hay entregas en esta fecha.'}</td></tr>}
              {filtradas.map((e) => {
                const r = e.reserva;
                return (
                  <tr key={e.idEntrega}>
                    <td><b>{hora(e.horaEntrega)}</b></td>
                    <td><b>{r?.comensal?.nombreCompleto}</b><br /><span className="suave">{r?.comensal?.nombreRol}</span></td>
                    <td>{r?.tipoAlmuerzo.nombre} · {[r?.proteina.nombre, ...(r?.acompanamientos ?? []).map((a) => a.nombre)].join(', ')}</td>
                    <td>{r?.tipoReserva === 'SUBSIDIADA'
                      ? <span className="estado ok"><Icono nombre="insignia" />Subsidiada</span>
                      : <span className="estado info">Pagada · {NOMBRE_METODO[r?.pago?.metodo]}</span>}</td>
                    <td className="suave">{e.validador}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

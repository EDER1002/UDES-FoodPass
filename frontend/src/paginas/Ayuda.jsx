import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { llamarApi } from '../api/cliente.js';
import { Asistente } from '../componentes/Asistente.jsx';
import { Cargando, PantallaDeError } from '../componentes/Comunes.jsx';
import { Icono } from '../componentes/Icono.jsx';
import { useSesion } from '../sesion/SesionContexto.jsx';
import { useDatos } from '../utilidades/ganchos.js';

const sinTildes = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Ayuda y soporte: preguntas frecuentes por tema, buscador, recuperación de
 * contraseña y contacto. Con sesión también muestra el asistente.
 * Las preguntas vienen del backend (las mismas que usa el asistente).
 */
export function Ayuda() {
  const { usuario, api } = useSesion();
  const { datos, error, cargando, recargar } = useDatos(
    (senal) => (usuario ? api('/soporte/preguntas/todas', { senal }) : llamarApi('/soporte/preguntas', { senal })),
    [usuario, api],
  );
  const [busqueda, setBusqueda] = useState('');

  const filtradas = useMemo(() => {
    if (!datos) return [];
    const q = sinTildes(busqueda.trim());
    return q ? datos.preguntas.filter((p) => sinTildes(`${p.pregunta} ${p.respuesta}`).includes(q)) : datos.preguntas;
  }, [datos, busqueda]);

  const esAdmin = usuario?.rol === 'ADMINISTRADOR';
  const contenedor = esAdmin ? 'admin-cuerpo angosto ayuda' : 'contenedor ayuda';

  return (
    <div className={contenedor}>
      <div>
        <h1 className="titulo-pantalla">Ayuda y soporte</h1>
        <p className="pista">Respuestas rápidas sobre tu cuenta, tus reservas, los pagos y el ficho QR.</p>
      </div>

      {usuario && <Asistente />}

      {!usuario && (
        <Link to="/recuperar" className="tarjeta accion-ayuda">
          <span className="icono-grande info" aria-hidden="true"><Icono nombre="candado" /></span>
          <span><b>¿Olvidaste tu contraseña?</b><span>Recupérala con un código por correo o con ayuda del administrador.</span></span>
          <Icono nombre="chev-der" />
        </Link>
      )}

      <section className="seccion" aria-labelledby="ayuda-preguntas">
        <h2 id="ayuda-preguntas" className="subtitulo-seccion">Preguntas frecuentes</h2>
        <div className="campo">
          <label htmlFor="ayuda-buscar" className="solo-lectores">Buscar en las preguntas frecuentes</label>
          <div className="entrada">
            <Icono nombre="buscar" />
            <input id="ayuda-buscar" type="search" placeholder="Buscar: contraseña, pago, QR…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
        </div>

        {cargando && !datos && <Cargando texto="Cargando preguntas…" />}
        {error && !datos && <PantallaDeError error={error} alReintentar={recargar} />}
        {datos && busqueda && (
          <p className="pista" role="status">{filtradas.length === 0 ? 'No encontramos preguntas con esas palabras.' : `${filtradas.length} ${filtradas.length === 1 ? 'resultado' : 'resultados'}`}</p>
        )}
        {datos && datos.temas.map((tema) => {
          const delTema = filtradas.filter((p) => p.tema === tema.id);
          if (!delTema.length) return null;
          return (
            <div key={tema.id} className="tema-ayuda">
              <h3>{tema.nombre}</h3>
              {delTema.map((p) => (
                <details key={p.id} className="pregunta-ayuda" open={Boolean(busqueda) && delTema.length === 1}>
                  <summary>{p.pregunta}</summary>
                  <p>{p.respuesta}</p>
                </details>
              ))}
            </div>
          );
        })}
      </section>

      <section className="tarjeta" aria-labelledby="ayuda-contacto">
        <h2 id="ayuda-contacto">¿Necesitas más ayuda?</h2>
        <p className="pista"><Icono nombre="ubicacion" /><span>Acércate a la caja de la <b>cafetería principal de la UDES, zona de buses</b>, dentro de su horario de atención. El personal administra el menú, las cuentas y las entregas.</span></p>
        {!usuario && <Link to="/ingresar" className="btn btn-secundario">Volver a iniciar sesión</Link>}
      </section>
    </div>
  );
}

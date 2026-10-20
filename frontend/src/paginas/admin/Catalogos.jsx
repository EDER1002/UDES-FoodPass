import { useEffect, useState } from 'react';
import { Aviso, Cargando, PantallaDeError } from '../../componentes/Comunes.jsx';
import { Icono } from '../../componentes/Icono.jsx';
import { useSesion } from '../../sesion/SesionContexto.jsx';
import { dinero } from '../../utilidades/formato.js';
import { useDatos } from '../../utilidades/ganchos.js';
import { imagenDePlato, tinteDePlato } from '../../utilidades/platos.js';

const IMAGENES = ['pechuga', 'bistec', 'tilapia', 'arroz', 'frijoles', 'maduro', 'ensalada'].map((n) => `/platos/${n}.svg`);

const PESTANAS = {
  proteinas: { ruta: 'proteinas', clave: 'idProteina', singular: 'proteína', nueva: 'Nueva proteína', titulo: 'Proteínas', nuevo: () => ({ nombre: '', descripcion: '', estado: 'ACTIVO', imagenUrl: '', cantidadDisponible: 0 }) },
  acompanamientos: { ruta: 'acompanamientos', clave: 'idAcompanamiento', singular: 'acompañamiento', nueva: 'Nuevo acompañamiento', titulo: 'Acompañamientos', nuevo: () => ({ nombre: '', descripcion: '', estado: 'ACTIVO', imagenUrl: '' }) },
  tipos: { ruta: 'tipos-almuerzo', clave: 'idTipoAlmuerzo', singular: 'tipo de almuerzo', nueva: 'Nuevo tipo de almuerzo', titulo: 'Tipos de almuerzo', nuevo: () => ({ nombre: '', descripcion: '', precio: '', tipoServicio: '', maxAcompanamientos: 2 }) },
};

/** Catálogos de proteínas, acompañamientos y tipos de almuerzo (RF02). */
export function Catalogos() {
  const { api } = useSesion();
  const [pestana, setPestana] = useState('proteinas');
  const { datos, error, cargando, recargar } = useDatos(
    async (senal) => {
      const [p, a, t] = await Promise.all([api('/admin/proteinas', { senal }), api('/admin/acompanamientos', { senal }), api('/admin/tipos-almuerzo', { senal })]);
      return { proteinas: p.proteinas, acompanamientos: a.acompanamientos, tipos: t.tipos };
    },
    [api],
  );
  const [edicion, setEdicion] = useState(null);
  const [errorForm, setErrorForm] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [buscar, setBuscar] = useState('');

  useEffect(() => {
    setEdicion(null);
    setErrorForm(null);
    setBuscar('');
  }, [pestana]);

  if (cargando && !datos) return <Cargando texto="Cargando catálogos…" />;
  if (error) return <div className="admin-cuerpo"><PantallaDeError error={error} alReintentar={recargar} /></div>;

  const conf = PESTANAS[pestana];
  const lista = datos[pestana].filter((x) => x.nombre.toLowerCase().includes(buscar.trim().toLowerCase()));
  const abrir = (item) => {
    setMensaje(null);
    setErrorForm(null);
    setEdicion(item ? { ...item, imagenUrl: item.imagenUrl ?? '', descripcion: item.descripcion ?? '', tipoServicio: item.tipoServicio ?? '' } : conf.nuevo());
  };

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setErrorForm(null);
    const id = edicion[conf.clave];
    const cuerpo = { ...edicion };
    delete cuerpo[conf.clave];
    try {
      await api(`/admin/${conf.ruta}${id ? `/${id}` : ''}`, { metodo: id ? 'PUT' : 'POST', cuerpo });
      setMensaje(`${id ? 'Se guardaron los cambios de' : 'Se creó'} "${edicion.nombre}".`);
      setEdicion(null);
      recargar();
    } catch (err) {
      setErrorForm(err);
    } finally {
      setGuardando(false);
    }
  };

  const campo = (nombre) => ({
    id: `cat-${nombre}`,
    value: edicion[nombre] ?? '',
    onChange: (e) => setEdicion((x) => ({ ...x, [nombre]: e.target.value })),
    'aria-invalid': errorForm?.detalles?.campos?.[0]?.campo === nombre || undefined,
  });

  return (
    <div className="admin-cuerpo">
      <div className="titulo-pagina">
        <h1>Catálogos</h1>
        <div className="acciones"><button type="button" className="btn btn-primario chico auto" onClick={() => abrir(null)}><Icono nombre="mas" />{conf.nueva}</button></div>
      </div>
      <div className="pestanas" role="tablist" aria-label="Catálogos">
        {Object.entries(PESTANAS).map(([clave, p]) => (
          <button key={clave} type="button" role="tab" className="pestana" aria-selected={pestana === clave} aria-controls="panel-catalogo" onClick={() => setPestana(clave)}>
            {p.titulo} <span className="cuenta">{datos[clave].length}</span>
          </button>
        ))}
      </div>
      {mensaje && <Aviso tono="exito" icono="check-circulo" titulo={mensaje} rol="status" />}

      <div className="rejilla lateral" id="panel-catalogo" role="tabpanel">
        <section className="tarjeta" aria-label={conf.titulo}>
          <div className="barra-filtros">
            <div className="entrada chica"><Icono nombre="buscar" /><input type="search" placeholder={`Buscar ${conf.singular}`} value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label={`Buscar ${conf.singular}`} /></div>
          </div>
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  {pestana === 'tipos' ? <><th scope="col">Precio</th><th scope="col">Acompañamientos</th><th scope="col">Servicio</th></> : <><th scope="col">Descripción</th><th scope="col">Estado</th></>}
                  <th scope="col"><span className="solo-lectores">Editar</span></th>
                </tr>
              </thead>
              <tbody>
                {lista.length === 0 && <tr><td colSpan={5} className="suave">No hay elementos que coincidan.</td></tr>}
                {lista.map((x) => (
                  <tr key={x[conf.clave]} className={edicion?.[conf.clave] === x[conf.clave] ? 'marcada' : ''}>
                    <td>
                      <span className="con-ilus">
                        {pestana !== 'tipos' && <span className="ilus peq" style={{ background: tinteDePlato(x.imagenUrl) }}><img src={imagenDePlato(x.imagenUrl)} alt="" width="36" height="36" /></span>}
                        {x.nombre}
                      </span>
                    </td>
                    {pestana === 'tipos' ? (
                      <><td>{dinero(x.precio)}</td><td>máx. {x.maxAcompanamientos}</td><td className="suave">{x.tipoServicio ?? '—'}</td></>
                    ) : (
                      <>
                        <td className="suave">{x.descripcion ?? '—'}</td>
                        <td>{x.estado === 'ACTIVO' ? <span className="estado ok">Activa</span> : <span className="estado neutro">Inactiva</span>}</td>
                      </>
                    )}
                    <td><button type="button" className="icono-btn" onClick={() => abrir(x)} aria-label={`Editar ${x.nombre}`}><Icono nombre="editar" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {edicion ? (
          <form className="tarjeta" onSubmit={guardar} aria-labelledby="titulo-edicion" noValidate>
            <h2 id="titulo-edicion">
              {edicion[conf.clave] ? `Editar ${conf.singular}` : conf.nueva}
              <button type="button" className="icono-btn" onClick={() => setEdicion(null)} aria-label="Cerrar el formulario"><Icono nombre="cerrar" /></button>
            </h2>
            {errorForm && <Aviso tono="peligro" icono="x-circulo" titulo={errorForm.message} rol="alert" />}
            <div className="campo"><label htmlFor="cat-nombre">Nombre</label><div className="entrada chica"><input {...campo('nombre')} required maxLength={80} /></div></div>
            <div className="campo"><label htmlFor="cat-descripcion">Descripción</label><textarea className="area" {...campo('descripcion')} maxLength={200} /></div>
            {pestana === 'tipos' ? (
              <>
                <div className="form-rejilla">
                  <div className="campo"><label htmlFor="cat-precio">Precio (COP)</label><div className="entrada chica"><input {...campo('precio')} type="number" min="100" step="100" inputMode="numeric" /></div></div>
                  <div className="campo"><label htmlFor="cat-maxAcompanamientos">Máx. acompañamientos</label><div className="entrada chica"><input {...campo('maxAcompanamientos')} type="number" min="1" max="5" inputMode="numeric" /></div></div>
                </div>
                <div className="campo"><label htmlFor="cat-tipoServicio">Tipo de servicio</label><div className="entrada chica"><input {...campo('tipoServicio')} placeholder="Ej.: sopa, seco y jugo" maxLength={60} /></div></div>
              </>
            ) : (
              <>
                <div className="campo">
                  <label htmlFor="cat-imagenUrl">Imagen</label>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span className="ilus" style={{ background: tinteDePlato(edicion.imagenUrl) }}><img src={imagenDePlato(edicion.imagenUrl)} alt={`Vista previa de la imagen de ${edicion.nombre || 'la opción'}`} width="54" height="54" /></span>
                    <div className="entrada chica" style={{ flex: 1 }}>
                      <input {...campo('imagenUrl')} list="imagenes-platos" placeholder="/platos/arroz.svg o https://…" />
                    </div>
                    <datalist id="imagenes-platos">{IMAGENES.map((i) => <option key={i} value={i} />)}</datalist>
                  </div>
                  <span className="ayuda">Ruta de una ilustración incluida o dirección http(s) de una imagen.</span>
                </div>
                {pestana === 'proteinas' && (
                  <div className="campo"><label htmlFor="cat-cantidadDisponible">Existencias de referencia (informativo)</label><div className="entrada chica"><input {...campo('cantidadDisponible')} type="number" min="0" inputMode="numeric" /></div><span className="ayuda">Las porciones que se venden se definen en el menú de cada día.</span></div>
                )}
                <div className="campo">
                  <span className="rotulo">Estado</span>
                  <label className="interruptor">
                    <input type="checkbox" checked={edicion.estado === 'ACTIVO'} onChange={(e) => setEdicion((x) => ({ ...x, estado: e.target.checked ? 'ACTIVO' : 'INACTIVO' }))} />
                    <i aria-hidden="true" />
                    {edicion.estado === 'ACTIVO' ? 'Activa: se puede agregar al menú' : 'Inactiva: no aparece en el menú'}
                  </label>
                </div>
              </>
            )}
            <div className="fila-botones">
              <button type="button" className="btn btn-secundario chico" onClick={() => setEdicion(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primario chico" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        ) : (
          <section className="tarjeta">
            <h2>Edición</h2>
            <p className="pista"><Icono nombre="info" /><span>Elige un elemento de la lista para editarlo o crea uno nuevo. En lugar de borrar, inactívalo: así se conserva el historial de reservas.</span></p>
          </section>
        )}
      </div>
    </div>
  );
}

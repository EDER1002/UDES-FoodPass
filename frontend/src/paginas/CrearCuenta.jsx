import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EstadoPantalla } from '../componentes/Comunes.jsx';
import { Icono } from '../componentes/Icono.jsx';
import { useSesion } from '../sesion/SesionContexto.jsx';

const ROLES = [
  { valor: 'ESTUDIANTE_REGULAR', nombre: 'Estudiante regular' },
  { valor: 'EMPLEADO_UDES', nombre: 'Empleado UDES' },
  { valor: 'ESTUDIANTE_SUBSIDIADO', nombre: 'Estudiante subsidiado' },
  { valor: 'ADMINISTRADOR', nombre: 'Administrador' },
];

const VACIO = { nombre: '', apellido: '', documento: '', telefono: '', correo: '', contrasena: '', confirmacion: '', rol: '' };

const OBLIGATORIOS = [
  ['nombre', 'Escribe tu nombre'],
  ['apellido', 'Escribe tu apellido'],
  ['documento', 'Escribe tu número de documento'],
  ['correo', 'Escribe tu correo institucional'],
  ['contrasena', 'Crea una contraseña'],
  ['confirmacion', 'Repite la contraseña'],
  ['rol', 'Elige tu rol'],
];

/** Crear Cuenta: cada persona se registra con su correo @udes.edu.co, su contraseña y su rol. */
export function CrearCuenta() {
  const { registrarse } = useSesion();
  const navegar = useNavigate();
  const [campos, setCampos] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [enRevision, setEnRevision] = useState(null);
  const [verContrasena, setVerContrasena] = useState(false);
  const alerta = useRef(null);

  const cambiar = (campo) => (e) => {
    let valor = e.target.value;
    if (campo === 'documento') valor = valor.replace(/\D/g, '').slice(0, 15);
    if (campo === 'telefono') valor = valor.replace(/\D/g, '').slice(0, 10);
    setCampos((c) => ({ ...c, [campo]: valor }));
    if (errores[campo]) setErrores((x) => ({ ...x, [campo]: undefined }));
  };

  const enfocarPrimerError = (lista) => {
    const primero = OBLIGATORIOS.map(([c]) => c).find((c) => lista[c]) ?? Object.keys(lista)[0];
    setTimeout(() => document.getElementById(`registro-${primero}`)?.focus(), 0);
  };

  const enviar = async (e) => {
    e.preventDefault();
    setErrorGeneral(null);
    const nuevos = {};
    for (const [campo, mensaje] of OBLIGATORIOS) if (!campos[campo].trim()) nuevos[campo] = mensaje;
    if (!nuevos.contrasena && !nuevos.confirmacion && campos.contrasena !== campos.confirmacion) {
      nuevos.confirmacion = 'Las contraseñas no coinciden';
    }
    if (Object.keys(nuevos).length) {
      setErrores(nuevos);
      enfocarPrimerError(nuevos);
      return;
    }
    setEnviando(true);
    try {
      const { confirmacion, ...datos } = campos;
      const resultado = await registrarse({ ...datos, correo: datos.correo.trim(), telefono: datos.telefono || undefined });
      if (resultado.estadoCuenta === 'ACTIVA') navegar('/', { replace: true });
      else setEnRevision(resultado);
    } catch (err) {
      const delServidor = {};
      if (err.codigo === 'DATOS_INVALIDOS') for (const c of err.detalles?.campos ?? []) delServidor[c.campo] ??= c.mensaje;
      if (err.codigo === 'CORREO_REGISTRADO') delServidor.correo = err.message;
      if (err.codigo === 'DOCUMENTO_REGISTRADO') delServidor.documento = err.message;
      if (Object.keys(delServidor).length) {
        setErrores(delServidor);
        enfocarPrimerError(delServidor);
      } else {
        setErrorGeneral(err);
        setTimeout(() => alerta.current?.focus(), 0);
      }
    } finally {
      setEnviando(false);
    }
  };

  if (enRevision) {
    return (
      <div className="pantalla-acceso">
        <main className="acceso-cuerpo">
          <img src="/logo.svg" alt="UDES FoodPass" className="logo-mediano" width="96" height="96" />
          <EstadoPantalla icono="reloj" tono="info" titulo="Tu cuenta está en revisión" alerta={false}
            acciones={<Link to="/ingresar" className="btn btn-lila ancho">Ir a iniciar sesión</Link>}>
            <p>{enRevision.mensaje}</p>
            <p>Rol solicitado: <b>{enRevision.usuario.nombreRol}</b>.</p>
          </EstadoPantalla>
        </main>
      </div>
    );
  }

  const requiereVerificacion = campos.rol && campos.rol !== 'ESTUDIANTE_REGULAR';
  const campo = (id, etiqueta, props = {}, extra = null) => (
    <div className={`campo ${errores[id] ? 'error' : ''}`}>
      <label htmlFor={`registro-${id}`}>{etiqueta}</label>
      <div className="entrada">
        <input
          {...props}
          id={`registro-${id}`}
          value={campos[id]}
          onChange={cambiar(id)}
          aria-invalid={errores[id] ? true : undefined}
          aria-describedby={errores[id] ? `registro-${id}-error` : props['aria-describedby']}
        />
        {extra}
      </div>
      {errores[id] && <span className="msg-error" id={`registro-${id}-error`}><Icono nombre="alerta" />{errores[id]}</span>}
    </div>
  );

  return (
    <div className="pantalla-acceso registro">
      <main className="acceso-cuerpo">
        <img src="/logo.svg" alt="UDES FoodPass" className="logo-mediano" width="96" height="96" />
        <h1 className="titulo-figma" style={{ color: 'var(--marino)' }}>Crear Cuenta</h1>

        {errorGeneral && (
          <div className="aviso peligro" role="alert" tabIndex={-1} ref={alerta}>
            <Icono nombre={errorGeneral.codigo === 'SIN_CONEXION' ? 'wifi-off' : 'x-circulo'} />
            <div><strong>No pudimos crear tu cuenta</strong><span>{errorGeneral.message}</span></div>
          </div>
        )}

        <form className="form-registro" onSubmit={enviar} noValidate>
          <div className="dos-campos">
            {campo('nombre', 'Nombre', { autoComplete: 'given-name', maxLength: 80 })}
            {campo('apellido', 'Apellido', { autoComplete: 'family-name', maxLength: 80 })}
          </div>
          <div className="dos-campos">
            {campo('documento', 'Documento', { inputMode: 'numeric', autoComplete: 'off', placeholder: 'Sin puntos' })}
            {campo('telefono', 'Celular (opcional)', { type: 'tel', inputMode: 'numeric', autoComplete: 'tel-national', placeholder: '3001234567' })}
          </div>
          {campo('correo', 'Correo', { type: 'email', inputMode: 'email', autoComplete: 'email', placeholder: '@udes.edu.co' })}
          {campo(
            'contrasena',
            'Contraseña',
            { type: verContrasena ? 'text' : 'password', autoComplete: 'new-password', placeholder: 'Ingresa una contraseña', maxLength: 72, 'aria-describedby': 'registro-contrasena-ayuda' },
            <button type="button" className="accion" onClick={() => setVerContrasena((v) => !v)} aria-pressed={verContrasena}>
              <Icono nombre={verContrasena ? 'ojo-tachado' : 'ojo'} />
              <span className="solo-lectores">{verContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}</span>
            </button>,
          )}
          {!errores.contrasena && <span className="ayuda" id="registro-contrasena-ayuda" style={{ fontSize: 13, color: 'var(--texto-suave)', marginTop: -6 }}>Mínimo 8 caracteres, con letras y números.</span>}
          {campo('confirmacion', 'Repite la contraseña', { type: verContrasena ? 'text' : 'password', autoComplete: 'new-password', maxLength: 72 })}

          <div className={`campo ${errores.rol ? 'error' : ''}`}>
            <label htmlFor="registro-rol">Rol</label>
            <div className="entrada">
              <select id="registro-rol" value={campos.rol} onChange={cambiar('rol')} aria-invalid={errores.rol ? true : undefined}
                aria-describedby={errores.rol ? 'registro-rol-error' : requiereVerificacion ? 'registro-rol-aviso' : undefined}>
                <option value="">Elige tu rol</option>
                {ROLES.map((r) => <option key={r.valor} value={r.valor}>{r.nombre}</option>)}
              </select>
            </div>
            {errores.rol && <span className="msg-error" id="registro-rol-error"><Icono nombre="alerta" />{errores.rol}</span>}
          </div>
          {requiereVerificacion && (
            <p className="aviso-rol" id="registro-rol-aviso" role="status">
              <Icono nombre="insignia" />
              <span>Este rol se verifica: un administrador revisará tus datos antes de activar tu cuenta.</span>
            </p>
          )}

          <button type="submit" className="btn btn-lila" disabled={enviando}>
            {enviando ? <><span className="girando" aria-hidden="true" />Creando cuenta…</> : 'Crear cuenta'}
          </button>
        </form>
        <div className="pie-acceso">
          <Link to="/ingresar" className="enlace">Ya tengo una cuenta</Link>
        </div>
      </main>
    </div>
  );
}

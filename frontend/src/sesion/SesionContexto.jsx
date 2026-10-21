import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { llamarApi } from '../api/cliente.js';
import { almacen } from '../utilidades/almacen.js';

const SesionContexto = createContext(null);
const CLAVE = 'foodpass.sesion';

export function ProveedorSesion({ children }) {
  const [sesion, setSesion] = useState(() => almacen.leer(localStorage, CLAVE));

  const cerrarSesion = useCallback(() => {
    almacen.borrar(localStorage, CLAVE);
    almacen.limpiar(sessionStorage);
    setSesion(null);
  }, []);

  const guardar = useCallback((token, usuario) => {
    const nueva = { token, usuario };
    almacen.guardar(localStorage, CLAVE, nueva);
    setSesion(nueva);
  }, []);

  const iniciarSesion = useCallback(async (correo, contrasena) => {
    const { token, usuario } = await llamarApi('/auth/login', { metodo: 'POST', cuerpo: { correo, contrasena } });
    guardar(token, usuario);
    return usuario;
  }, [guardar]);

  /**
   * Crea la cuenta. El estudiante regular queda con sesión iniciada; los
   * demás roles quedan en revisión hasta que un administrador los apruebe.
   */
  const registrarse = useCallback(async (datos) => {
    const resultado = await llamarApi('/auth/registro', { metodo: 'POST', cuerpo: datos });
    if (resultado.token) guardar(resultado.token, resultado.usuario);
    return resultado;
  }, [guardar]);

  /** Llama a la API con el token. Si la sesión venció, la cierra. */
  const api = useCallback(
    async (ruta, opciones = {}) => {
      try {
        return await llamarApi(ruta, { ...opciones, token: sesion?.token });
      } catch (error) {
        if (error.codigo === 'NO_AUTENTICADO') cerrarSesion();
        throw error;
      }
    },
    [sesion?.token, cerrarSesion],
  );

  const valor = useMemo(
    () => ({ usuario: sesion?.usuario ?? null, token: sesion?.token ?? null, iniciarSesion, registrarse, cerrarSesion, api }),
    [sesion, iniciarSesion, registrarse, cerrarSesion, api],
  );
  return <SesionContexto.Provider value={valor}>{children}</SesionContexto.Provider>;
}

export function useSesion() {
  const contexto = useContext(SesionContexto);
  if (!contexto) throw new Error('useSesion debe usarse dentro de ProveedorSesion');
  return contexto;
}

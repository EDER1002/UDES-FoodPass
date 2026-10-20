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

  const iniciarSesion = useCallback(async (correo, contrasena) => {
    const { token, usuario } = await llamarApi('/auth/login', { metodo: 'POST', cuerpo: { correo, contrasena } });
    const nueva = { token, usuario };
    almacen.guardar(localStorage, CLAVE, nueva);
    setSesion(nueva);
    return usuario;
  }, []);

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
    () => ({ usuario: sesion?.usuario ?? null, token: sesion?.token ?? null, iniciarSesion, cerrarSesion, api }),
    [sesion, iniciarSesion, cerrarSesion, api],
  );
  return <SesionContexto.Provider value={valor}>{children}</SesionContexto.Provider>;
}

export function useSesion() {
  const contexto = useContext(SesionContexto);
  if (!contexto) throw new Error('useSesion debe usarse dentro de ProveedorSesion');
  return contexto;
}

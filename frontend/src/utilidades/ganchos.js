import { useCallback, useEffect, useMemo, useState } from 'react';
import { segundosDelDia } from './formato.js';

/**
 * Carga datos asíncronos con estado de carga, error y recarga. Si una recarga
 * falla, conserva los datos anteriores junto con el error.
 */
export function useDatos(cargar, dependencias) {
  const [estado, setEstado] = useState({ datos: null, error: null, cargando: true });
  const [version, setVersion] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cargarMemo = useCallback(cargar, dependencias);

  useEffect(() => {
    const controlador = new AbortController();
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    cargarMemo(controlador.signal)
      .then((datos) => !controlador.signal.aborted && setEstado({ datos, error: null, cargando: false }))
      .catch((error) => {
        if (error.name !== 'AbortError' && !controlador.signal.aborted) setEstado((e) => ({ datos: e.datos, error, cargando: false }));
      });
    return () => controlador.abort();
  }, [cargarMemo, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { ...estado, recargar };
}

/**
 * Segundos que faltan para el cierre de reservas, según la hora del servidor
 * (no la del celular, que puede estar desfasada). Se actualiza cada 15 s.
 */
export function useCuentaRegresiva(contexto) {
  const [ahora, setAhora] = useState(() => Date.now());
  const base = useMemo(() => (contexto ? { inicio: Date.now(), segundos: segundosDelDia(contexto.hora) } : null), [contexto]);
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!base || !contexto?.horario?.fin) return null;
  return segundosDelDia(contexto.horario.fin) - (base.segundos + (ahora - base.inicio) / 1000);
}

import { useEffect, useId, useRef, useState } from 'react';
import { useSesion } from '../sesion/SesionContexto.jsx';
import { Icono } from './Icono.jsx';

const SUGERENCIAS = {
  usuario: ['¿Qué hay de menú hoy?', '¿Hasta qué hora puedo reservar?', '¿Cómo reclamo mi almuerzo?'],
  admin: ['¿Cómo ayudo a alguien que olvidó su contraseña?', '¿Cómo valido un ficho?', '¿Cómo publico el menú del día?'],
};

/**
 * Asistente de la app: un chat pequeño que responde con las preguntas
 * frecuentes y con datos reales del día (menú, horario y tu reserva). Las
 * respuestas las arma el backend; la conversación no se guarda.
 */
export function Asistente() {
  const { api, usuario } = useSesion();
  const esAdmin = usuario?.rol === 'ADMINISTRADOR';
  const [mensajes, setMensajes] = useState(() => [
    { de: 'asistente', texto: `Hola, ${usuario?.nombre ?? ''}. Soy el asistente de UDES FoodPass. ¿En qué te ayudo?`, relacionadas: [] },
  ]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const lista = useRef(null);
  const entrada = useRef(null);
  const id = useId();

  useEffect(() => {
    lista.current?.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
  }, [mensajes]);

  const preguntar = async (pregunta) => {
    const limpio = pregunta.trim();
    if (!limpio || enviando) return;
    setMensajes((m) => [...m, { de: 'persona', texto: limpio }]);
    setTexto('');
    setEnviando(true);
    try {
      const r = await api('/soporte/asistente', { metodo: 'POST', cuerpo: { mensaje: limpio } });
      setMensajes((m) => [...m, { de: 'asistente', texto: r.respuesta, relacionadas: r.relacionadas ?? [] }]);
    } catch (err) {
      setMensajes((m) => [...m, { de: 'asistente', texto: err.message, error: true, relacionadas: [] }]);
    } finally {
      setEnviando(false);
      entrada.current?.focus();
    }
  };

  const ultimo = mensajes.at(-1);
  const chips = mensajes.length === 1 ? SUGERENCIAS[esAdmin ? 'admin' : 'usuario'] : (ultimo.relacionadas ?? []).map((r) => r.pregunta);

  return (
    <section className="tarjeta asistente" aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`}>
        <span className="asistente-titulo"><span className="asistente-avatar" aria-hidden="true"><Icono nombre="chat" /></span>Asistente FoodPass</span>
      </h2>
      <div className="asistente-mensajes" ref={lista} role="log" tabIndex={0} aria-live="polite" aria-label="Conversación con el asistente">
        {mensajes.map((m, i) => (
          <p key={i} className={`burbuja de-${m.de} ${m.error ? 'error' : ''}`}>
            <span className="solo-lectores">{m.de === 'persona' ? 'Tú: ' : 'Asistente: '}</span>
            {m.texto}
          </p>
        ))}
        {enviando && <p className="burbuja de-asistente escribiendo"><span className="solo-lectores">El asistente está escribiendo</span><span aria-hidden="true">…</span></p>}
      </div>
      {chips.length > 0 && !enviando && (
        <div className="asistente-chips" role="group" aria-label={mensajes.length === 1 ? 'Preguntas sugeridas' : 'Preguntas relacionadas'}>
          {chips.map((c) => <button key={c} type="button" className="chip-boton" onClick={() => preguntar(c)}>{c}</button>)}
        </div>
      )}
      <form className="asistente-form" onSubmit={(e) => { e.preventDefault(); preguntar(texto); }}>
        <label htmlFor={`${id}-entrada`} className="solo-lectores">Escribe tu pregunta</label>
        <div className="entrada">
          <input ref={entrada} id={`${id}-entrada`} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300}
            placeholder="Escribe tu pregunta" autoComplete="off" />
        </div>
        <button type="submit" className="btn btn-primario chico auto" disabled={enviando || !texto.trim()}>
          <Icono nombre="flecha-der" />Enviar
        </button>
      </form>
      <p className="pista"><Icono nombre="info" /><span>Asistente automático: responde con la información de la app. Si no resuelve tu duda, acércate a la caja de la cafetería.</span></p>
    </section>
  );
}

// Íconos de línea (24 × 24) usados en toda la interfaz. Son decorativos:
// el texto que los acompaña es el que leen los lectores de pantalla.
const TRAZOS = {
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  cerrar: <path d="M6 6l12 12M18 6 6 18" />,
  reloj: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>),
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  'check-circulo': (<><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></>),
  alerta: (<><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4.5M12 17.3v.2" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.2" /></>),
  'x-circulo': (<><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>),
  'wifi-off': (<><path d="M3 3l18 18" /><path d="M8.6 16.4a5 5 0 0 1 6.8 0" /><path d="M5.2 12.9a10 10 0 0 1 4.6-2.6" /><path d="M18.8 12.9a10 10 0 0 0-2.2-1.6" /><path d="M2 9.2a15 15 0 0 1 3.9-2.6" /><path d="M22 9.2A15 15 0 0 0 10.7 5" /><path d="M12 20h.01" /></>),
  usuario: (<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
  grupo: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" /></>),
  casa: (<><path d="M3 11 12 4l9 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-6h4v6" /></>),
  lista: <path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  qr: (<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20.5 14v.01M14 20.5h.01M17.5 20.5H21V17" /></>),
  salir: (<><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" /><path d="M15 7l5 5-5 5" /><path d="M20 12H9" /></>),
  tarjeta: (<><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" /></>),
  banco: (<><path d="M3 9.5 12 4l9 5.5" /><path d="M4 9.5h16M6 10v7M10 10v7M14 10v7M18 10v7M3 20h18" /></>),
  celular: (<><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M11 18h2" /></>),
  escanear: <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16" />,
  cubiertos: (<><path d="M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3" /><path d="M17 21V3c-2.2 1.3-3.5 3.9-3.5 7.2V13H17" /></>),
  'flecha-der': <path d="M5 12h14M13 6l6 6-6 6" />,
  'flecha-izq': <path d="M19 12H5M11 6l-6 6 6 6" />,
  ojo: (<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  'ojo-tachado': (<><path d="M3 3l18 18" /><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>),
  calendario: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  ubicacion: (<><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>),
  escudo: (<><path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>),
  editar: (<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>),
  mas: <path d="M12 5v14M5 12h14" />,
  basura: <path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13" />,
  buscar: (<><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>),
  insignia: (<><circle cx="12" cy="9" r="6" /><path d="M8.5 13.8 7 21l5-3 5 3-1.5-7.2" /></>),
  actualizar: (<><path d="M20 12a8 8 0 1 1-2.4-5.7" /><path d="M20 4v4.5h-4.5" /></>),
  candado: (<><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>),
  correo: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></>),
  'chev-izq': <path d="M15 6l-6 6 6 6" />,
  'chev-der': <path d="M9 6l6 6-6 6" />,
  imagen: (<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>),
  plato: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /></>),
  entrega: (<><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>),
  campana: (<><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>),
  camara: (<><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>),
};

export function Icono({ nombre, className = '', titulo }) {
  return (
    <svg
      className={`ico ${className}`}
      viewBox="0 0 24 24"
      aria-hidden={titulo ? undefined : 'true'}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      focusable="false"
    >
      {TRAZOS[nombre]}
    </svg>
  );
}

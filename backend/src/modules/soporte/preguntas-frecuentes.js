// Preguntas frecuentes de UDES FoodPass. Las usan la página de Ayuda y el
// asistente (con IA o, sin llave, buscando aquí la respuesta más parecida).
// `palabras` ayuda a la búsqueda sin IA: sinónimos y formas de preguntarlo.

export const TEMAS = [
  { id: 'cuenta', nombre: 'Cuenta y contraseña' },
  { id: 'reservas', nombre: 'Reservas y horario' },
  { id: 'pagos', nombre: 'Pagos' },
  { id: 'ficho', nombre: 'Ficho QR' },
  { id: 'subsidio', nombre: 'Subsidio' },
  { id: 'admin', nombre: 'Administración', soloAdmin: true },
  { id: 'contacto', nombre: 'Contacto y problemas técnicos' },
];

export const PREGUNTAS = [
  // --- Cuenta y contraseña -------------------------------------------
  {
    id: 'olvide-contrasena',
    tema: 'cuenta',
    pregunta: '¿Qué hago si olvidé mi contraseña?',
    respuesta:
      'En la pantalla de inicio de sesión toca "¿Olvidaste tu contraseña?". Escribe tu correo @udes.edu.co y te enviaremos un código de 6 dígitos que vence en 15 minutos. Escríbelo junto con tu contraseña nueva. Si el correo no te llega, en esa misma pantalla elige "Pedir ayuda al administrador": acércate a la caja de la cafetería con tu documento y te darán un código.',
    palabras: ['olvide', 'olvidé', 'recuperar', 'perdi', 'perdí', 'contraseña', 'clave', 'restablecer', 'cambiar', 'acceso', 'no puedo entrar'],
  },
  {
    id: 'codigo-no-llega',
    tema: 'cuenta',
    pregunta: 'No me llega el código para recuperar la contraseña',
    respuesta:
      'Revisa la carpeta de spam o correo no deseado y confirma que escribiste bien tu correo institucional. Puedes pedir hasta 3 códigos cada 15 minutos; solo sirve el último. Si sigue sin llegar, usa "Pedir ayuda al administrador" y acércate a la caja de la cafetería con tu documento.',
    palabras: ['codigo', 'código', 'no llega', 'correo', 'spam', 'email', 'recuperacion', 'recuperación'],
  },
  {
    id: 'crear-cuenta',
    tema: 'cuenta',
    pregunta: '¿Cómo creo mi cuenta?',
    respuesta:
      'En la pantalla de inicio toca "Registrarse". Llena tus datos con tu correo @udes.edu.co, crea una contraseña de al menos 8 caracteres con letras y números y elige tu rol. Si eres estudiante regular entras de una vez; si eres estudiante subsidiado, empleado o administrador, un administrador revisa tus datos antes de activar la cuenta.',
    palabras: ['registro', 'registrarme', 'crear', 'cuenta', 'nueva', 'inscribirme'],
  },
  {
    id: 'cuenta-en-revision',
    tema: 'cuenta',
    pregunta: 'Mi cuenta dice "en revisión", ¿qué significa?',
    respuesta:
      'Los roles de estudiante subsidiado, empleado UDES y administrador se verifican. Un administrador de la cafetería revisa tus datos y aprueba o rechaza la cuenta. Mientras tanto no puedes iniciar sesión. Si se demora, acércate a la caja de la cafetería.',
    palabras: ['revision', 'revisión', 'pendiente', 'aprobacion', 'aprobación', 'activar', 'rechazada'],
  },
  {
    id: 'correo-institucional',
    tema: 'cuenta',
    pregunta: '¿Puedo usar un correo personal?',
    respuesta: 'No. Solo se aceptan correos institucionales que terminan en @udes.edu.co.',
    palabras: ['gmail', 'hotmail', 'personal', 'correo', 'institucional'],
  },

  // --- Reservas y horario --------------------------------------------
  {
    id: 'como-reservar',
    tema: 'reservas',
    pregunta: '¿Cómo reservo mi almuerzo?',
    respuesta:
      'En Inicio verás el menú del día. Elige el tipo de almuerzo, una proteína y tus acompañamientos y toca "Continuar al pago" (o "Confirmar con subsidio" si eres subsidiado). Al confirmar recibes tu ficho QR en la sección QR\'s.',
    palabras: ['reservar', 'reserva', 'reservo', 'pedir', 'menu', 'menú', 'elegir'],
  },
  {
    id: 'horario',
    tema: 'reservas',
    pregunta: '¿Hasta qué hora puedo reservar?',
    respuesta:
      'Solo puedes reservar dentro del horario que configura la cafetería para tu rol. La hora límite de hoy aparece arriba del menú del día. Al llegar esa hora las reservas se cierran.',
    palabras: ['hora', 'horario', 'limite', 'límite', 'cierre', 'cerrado', 'tarde', 'fuera de horario'],
  },
  {
    id: 'una-reserva',
    tema: 'reservas',
    pregunta: '¿Puedo hacer más de una reserva al día?',
    respuesta: 'No. Cada persona puede tener una sola reserva activa por día (pendiente de pago o confirmada).',
    palabras: ['dos', 'otra', 'segunda', 'varias', 'mas de una', 'más de una', 'dos almuerzos', 'dos reservas', 'reservar dos', 'otro almuerzo'],
  },
  {
    id: 'cancelar',
    tema: 'reservas',
    pregunta: '¿Cómo cancelo mi reserva?',
    respuesta:
      'Ve a Pagos, busca la reserva y toca "Cancelar reserva". Solo puedes cancelar antes de la hora límite. Si la pagaste, el pago queda como reembolsado; si usaste subsidio, el beneficio del día vuelve a quedar libre.',
    palabras: ['cancelar', 'anular', 'devolver', 'arrepenti', 'arrepentí', 'no voy'],
  },
  {
    id: 'agotado',
    tema: 'reservas',
    pregunta: 'Dice que una opción está agotada',
    respuesta:
      'Cada proteína y acompañamiento tiene un número de porciones. Cuando se acaban no se pueden elegir. Elige otra opción del menú. Si se agotó justo después de pagar, la reserva se cancela y el pago se reembolsa.',
    palabras: ['agotado', 'agotada', 'agoto', 'agotó', 'se agoto', 'se agotó', 'no hay', 'porciones', 'se acabo', 'se acabó'],
  },

  // --- Pagos ------------------------------------------------------------
  {
    id: 'medios-pago',
    tema: 'pagos',
    pregunta: '¿Con qué puedo pagar?',
    respuesta: 'Con Nequi, PSE o tarjeta. El total lo calcula el sistema según el tipo de almuerzo. Nunca guardamos los datos de tu tarjeta.',
    palabras: ['pagar', 'pago', 'nequi', 'pse', 'tarjeta', 'credito', 'crédito', 'debito', 'débito', 'efectivo', 'medios'],
  },
  {
    id: 'pago-rechazado',
    tema: 'pagos',
    pregunta: 'Mi pago fue rechazado',
    respuesta:
      'La pantalla te muestra el motivo (por ejemplo, fondos insuficientes). La reserva se cancela y no se cobra nada. Puedes volver al menú y reservar de nuevo con otro medio de pago si aún estás dentro del horario.',
    palabras: ['rechazado', 'rechazo', 'fallo', 'falló', 'no paso', 'no pasó', 'error', 'declinado'],
  },
  {
    id: 'cobro-doble',
    tema: 'pagos',
    pregunta: '¿Me pueden cobrar dos veces si se cae el internet?',
    respuesta:
      'No. Si se corta la conexión mientras pagas, puedes tocar "Reintentar" con tranquilidad: el sistema reconoce el mismo intento de pago y nunca cobra dos veces.',
    palabras: ['dos veces', 'doble', 'cobro', 'internet', 'conexion', 'conexión', 'reintentar', 'se cayo', 'se cayó'],
  },
  {
    id: 'pse-pendiente',
    tema: 'pagos',
    pregunta: 'Mi pago con PSE quedó pendiente',
    respuesta:
      'Algunos bancos tardan en responder. La pantalla dice "Tu banco está procesando el pago" y se actualiza sola. Cuando el banco confirme, recibirás tu ficho QR; si el banco lo rechaza, la reserva se cancela sin cobro.',
    palabras: ['pendiente', 'procesando', 'pse', 'banco', 'esperando'],
  },
  {
    id: 'tiempo-pagar',
    tema: 'pagos',
    pregunta: '¿Cuánto tiempo tengo para pagar?',
    respuesta: 'Tienes 15 minutos desde que eliges tu almuerzo. Si no pagas en ese tiempo, la reserva vence y las porciones vuelven al menú.',
    palabras: ['tiempo', 'minutos', 'vence', 'vencio', 'venció', 'expiro', 'expiró'],
  },
  {
    id: 'reembolso',
    tema: 'pagos',
    pregunta: '¿Cómo me devuelven el dinero?',
    respuesta:
      'Si cancelas antes de la hora límite o se agotó el plato después de pagar, el pago queda como reembolsado en la sección Pagos. Si tienes dudas sobre la devolución, acércate a la caja de la cafetería.',
    palabras: ['reembolso', 'devolucion', 'devolución', 'dinero', 'plata', 'reembolsado'],
  },

  // --- Ficho QR --------------------------------------------------------
  {
    id: 'reclamar',
    tema: 'ficho',
    pregunta: '¿Cómo reclamo mi almuerzo?',
    respuesta:
      'Abre la sección QR\'s y muestra el código QR en la caja de la cafetería principal (zona de buses). El administrador lo escanea, revisa tu pedido y registra la entrega. Si la cámara no lee el QR, puede escribir el token que aparece debajo.',
    palabras: ['reclamar', 'recoger', 'recojo', 'reclamo mi almuerzo', 'retirar', 'qr', 'ficho', 'entregar', 'mostrar', 'caja'],
  },
  {
    id: 'ficho-uso-unico',
    tema: 'ficho',
    pregunta: '¿Puedo usar el ficho más de una vez?',
    respuesta: 'No. El ficho es de uso único: después de entregarte el almuerzo queda como usado y un segundo escaneo se rechaza. También vence al final del día del menú.',
    palabras: ['otra vez', 'dos veces', 'usado', 'unico', 'único', 'vence', 'mañana'],
  },
  {
    id: 'sin-ficho',
    tema: 'ficho',
    pregunta: 'No veo mi ficho QR',
    respuesta:
      'El ficho aparece cuando la reserva está confirmada: después de un pago aprobado o al aplicar el subsidio. Si tu pago con PSE está pendiente, espera la respuesta del banco. Revisa también la sección Pagos para ver el estado de tu reserva.',
    palabras: ['no veo', 'no aparece', 'ficho', 'qr', 'perdi', 'perdí', 'donde', 'dónde'],
  },
  {
    id: 'compartir-ficho',
    tema: 'ficho',
    pregunta: '¿Puede otra persona reclamar mi almuerzo?',
    respuesta: 'El ficho funciona una sola vez para quien lo presente. No lo compartas: si otra persona lo usa primero, ya no podrás reclamar tu almuerzo.',
    palabras: ['otra persona', 'amigo', 'compartir', 'prestar', 'captura', 'pantallazo'],
  },

  // --- Subsidio ---------------------------------------------------------
  {
    id: 'subsidio-como',
    tema: 'subsidio',
    pregunta: '¿Cómo funciona el subsidio?',
    respuesta:
      'Si tu cuenta es de estudiante subsidiado y tu beneficio está vigente, reservas sin pagar: el resumen dice "Subsidio aplicado, total $0". El subsidio cubre una reserva por día.',
    palabras: ['subsidio', 'subsidiado', 'gratis', 'beneficio', 'bienestar', 'sin pagar'],
  },
  {
    id: 'subsidio-no-disponible',
    tema: 'subsidio',
    pregunta: 'Dice "Subsidio no disponible"',
    respuesta:
      'Puede ser porque ya usaste el subsidio hoy, porque tu beneficio venció o porque aún no está activo. Para revisar la vigencia de tu beneficio, acércate a la caja de la cafetería o a Bienestar Universitario.',
    palabras: ['no disponible', 'subsidio', 'vencido', 'vencio', 'venció', 'ya use', 'ya usé'],
  },

  // --- Administración (solo administradores) ---------------------------
  {
    id: 'admin-recuperacion',
    tema: 'admin',
    pregunta: '¿Cómo ayudo a alguien que olvidó su contraseña?',
    respuesta:
      'En Solicitudes, sección "Recuperar contraseña", aparecen quienes pidieron ayuda. Pide su documento, verifica que coincida con el de la tarjeta y toca "Generar código". Dale el código de 6 dígitos (vence en 60 minutos) para que lo escriba en "¿Olvidaste tu contraseña?" junto con su contraseña nueva.',
    palabras: ['ayudar', 'olvido', 'olvidó', 'contraseña', 'codigo', 'código', 'recuperar', 'generar'],
  },
  {
    id: 'admin-validar',
    tema: 'admin',
    pregunta: '¿Cómo valido un ficho?',
    respuesta:
      'En Validar fichos escanea el QR con la cámara o escribe el token a mano. Revisa el pedido que aparece y toca registrar la entrega. Un ficho usado, vencido o de otro día se rechaza con un mensaje claro.',
    palabras: ['validar', 'escanear', 'camara', 'cámara', 'token', 'entrega', 'ficho'],
  },
  {
    id: 'admin-menu',
    tema: 'admin',
    pregunta: '¿Cómo publico el menú del día?',
    respuesta:
      'En Menú del día elige la fecha, agrega las proteínas y acompañamientos con sus porciones, define la ventana de reservas y publícalo. Un menú con reservas no se puede eliminar, solo cerrar.',
    palabras: ['publicar', 'menu', 'menú', 'porciones', 'crear menu', 'editar'],
  },

  // --- Contacto ---------------------------------------------------------
  {
    id: 'contacto',
    tema: 'contacto',
    pregunta: '¿Con quién hablo si tengo un problema?',
    respuesta:
      'Acércate a la caja de la cafetería principal de la UDES, en la zona de buses, dentro de su horario de atención. El personal de la cafetería administra el menú, las cuentas y las entregas.',
    palabras: ['contacto', 'hablar', 'ayuda', 'soporte', 'queja', 'reclamo', 'problema', 'telefono', 'teléfono'],
  },
  {
    id: 'sin-conexion',
    tema: 'contacto',
    pregunta: 'La aplicación dice "Sin conexión"',
    respuesta:
      'Revisa tus datos móviles o el Wi‑Fi y toca "Reintentar". Reintentar es seguro: nunca se cobra dos veces. Si el problema sigue, puede que el sistema esté en mantenimiento; inténtalo en unos minutos.',
    palabras: ['sin conexion', 'sin conexión', 'internet', 'wifi', 'no carga', 'caido', 'caído', 'lento'],
  },
  {
    id: 'camara-celular',
    tema: 'contacto',
    pregunta: 'La pantalla del QR se ve muy oscura o pequeña',
    respuesta: 'Sube el brillo de tu celular al mostrar el QR y no lo tapes con los dedos. Si no se lee, el administrador puede escribir el token que aparece debajo del código.',
    palabras: ['brillo', 'oscuro', 'no lee', 'no escanea', 'pequeño', 'pantalla'],
  },
];

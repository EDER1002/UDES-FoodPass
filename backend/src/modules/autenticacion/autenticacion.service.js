import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { ErrorAplicacion, conflicto, esViolacionUnica, noAutenticado, noEncontrado } from '../../compartido/errores.js';
import { NOMBRES_DE_ROL, ROLES } from '../../compartido/roles.js';

/**
 * AutenticacionService: controla el acceso y diferencia los perfiles (RF01).
 * Oculta las contraseñas, los tokens y los datos internos de Usuario y Rol.
 */
export class AutenticacionService {
  #hashFalso = null;
  #alAprobar = null;

  constructor({ db, repositorio, config, reloj }) {
    this.db = db;
    this.repositorio = repositorio;
    this.config = config;
    this.reloj = reloj;
  }

  /**
   * Registra lo que debe pasar en otros módulos al aprobar una cuenta (por
   * ejemplo, crear el beneficio del subsidiado) dentro de la misma transacción.
   */
  conectarAlAprobar(fn) {
    this.#alAprobar = fn;
  }

  /** Verifica correo y contraseña y entrega un JWT con expiración. El rol lo decide el backend. */
  async iniciarSesion(correo, contrasena) {
    const usuario = await this.repositorio.buscarPorCorreo(correo.toLowerCase());
    // Se compara aunque el usuario no exista, para no revelar qué correos están registrados.
    const coincide = await bcrypt.compare(contrasena, usuario?.contrasena_hash ?? this.#obtenerHashFalso());
    if (!usuario || !coincide) {
      throw new ErrorAplicacion('CREDENCIALES_INVALIDAS', 'El correo o la contraseña no son correctos.', 401);
    }
    exigirCuentaActiva(usuario);
    return { token: this.#emitirToken(usuario), usuario: aUsuarioPublico(usuario) };
  }

  /**
   * Crea la cuenta con el rol que la persona elige. El estudiante regular
   * queda activo y con sesión iniciada; los demás roles quedan PENDIENTE
   * hasta que un administrador verifique sus datos.
   */
  async registrarse(datos) {
    const estadoCuenta = datos.rol === ROLES.REGULAR ? 'ACTIVA' : 'PENDIENTE';
    let usuario;
    try {
      usuario = await this.repositorio.crear({
        ...datos,
        contrasenaHash: await bcrypt.hash(datos.contrasena, this.config.bcryptRondas),
        estadoCuenta,
      });
    } catch (error) {
      if (esViolacionUnica(error, 'usuario_correo_key')) {
        throw conflicto('CORREO_REGISTRADO', 'Ya existe una cuenta con ese correo. Inicia sesión.');
      }
      if (esViolacionUnica(error, 'usuario_documento_key')) {
        throw conflicto('DOCUMENTO_REGISTRADO', 'Ya existe una cuenta con ese número de documento.');
      }
      throw error;
    }
    if (estadoCuenta === 'ACTIVA') {
      return { estadoCuenta, token: this.#emitirToken(usuario), usuario: aUsuarioPublico(usuario) };
    }
    return { estadoCuenta, usuario: aUsuarioPublico(usuario), mensaje: MENSAJE_EN_REVISION };
  }

  /** Cuentas que esperan verificación, de la más antigua a la más reciente. */
  async listarSolicitudes() {
    return (await this.repositorio.listarPorEstado('PENDIENTE')).map(aUsuarioPublico);
  }

  /** Aprueba una cuenta PENDIENTE: desde ese momento puede iniciar sesión con su rol. */
  async aprobarCuenta(idUsuario, idRevisor, datos = {}) {
    return this.db.transaccion(async (tx) => {
      const usuario = await this.#bloquearPendiente(idUsuario, tx);
      await this.#alAprobar?.(aUsuarioPublico(usuario), datos, tx);
      const aprobado = await this.repositorio.revisar(idUsuario, { estado: 'ACTIVA', idRevisor, fecha: this.#ahora() }, tx);
      return aUsuarioPublico(aprobado);
    });
  }

  async rechazarCuenta(idUsuario, idRevisor, motivo) {
    return this.db.transaccion(async (tx) => {
      await this.#bloquearPendiente(idUsuario, tx);
      const rechazado = await this.repositorio.revisar(idUsuario, { estado: 'RECHAZADA', idRevisor, motivo, fecha: this.#ahora() }, tx);
      return aUsuarioPublico(rechazado);
    });
  }

  /**
   * Valida el JWT y devuelve el usuario autenticado. El rol se vuelve a leer
   * de la base de datos: si cambió o el usuario ya no existe, se nota de inmediato.
   */
  async validarToken(token) {
    let datos;
    try {
      datos = jwt.verify(token, this.config.jwt.secreto, { algorithms: ['HS256'] });
    } catch {
      throw noAutenticado('Tu sesión venció o no es válida. Inicia sesión de nuevo.');
    }
    const idUsuario = Number(datos.sub);
    if (!Number.isInteger(idUsuario) || idUsuario <= 0 || idUsuario > 2_147_483_647) throw noAutenticado();
    const usuario = await this.repositorio.buscarPorId(idUsuario);
    if (!usuario || usuario.estado_cuenta !== 'ACTIVA') throw noAutenticado('Tu sesión ya no es válida. Inicia sesión de nuevo.');
    return { id: usuario.id_usuario, idRol: usuario.id_rol, rol: usuario.nombre_rol };
  }

  async obtenerRol(idUsuario) {
    const usuario = await this.repositorio.buscarPorId(idUsuario);
    if (!usuario) throw noEncontrado('USUARIO_NO_ENCONTRADO', 'No encontramos ese usuario.');
    return usuario.nombre_rol;
  }

  async obtenerUsuario(idUsuario) {
    const usuario = await this.repositorio.buscarPorId(idUsuario);
    if (!usuario) throw noEncontrado('USUARIO_NO_ENCONTRADO', 'No encontramos ese usuario.');
    return aUsuarioPublico(usuario);
  }

  /** Devuelve un Map id → usuario público. */
  async obtenerUsuarios(ids) {
    const unicos = [...new Set(ids.filter(Boolean))];
    const filas = await this.repositorio.buscarPorIds(unicos);
    return new Map(filas.map((u) => [u.id_usuario, aUsuarioPublico(u)]));
  }

  async buscarUsuarios(texto) {
    return (await this.repositorio.buscar(texto)).map(aUsuarioPublico);
  }

  async listarRoles() {
    return (await this.repositorio.listarRoles()).map((r) => ({
      idRol: r.id_rol,
      nombreRol: r.nombre_rol,
      nombre: NOMBRES_DE_ROL[r.nombre_rol],
      descripcion: r.descripcion,
    }));
  }

  #emitirToken(usuario) {
    return jwt.sign({ rol: usuario.nombre_rol }, this.config.jwt.secreto, {
      subject: String(usuario.id_usuario),
      expiresIn: this.config.jwt.expiracion,
      algorithm: 'HS256',
    });
  }

  async #bloquearPendiente(idUsuario, tx) {
    const usuario = await this.repositorio.bloquear(idUsuario, tx);
    if (!usuario) throw noEncontrado('USUARIO_NO_ENCONTRADO', 'No encontramos esa solicitud.');
    if (usuario.estado_cuenta !== 'PENDIENTE') {
      throw conflicto('SOLICITUD_YA_REVISADA', 'Esta solicitud ya fue revisada.');
    }
    return usuario;
  }

  #ahora() {
    return new Date(this.reloj ? this.reloj.ahora() : Date.now());
  }

  #obtenerHashFalso() {
    this.#hashFalso ??= bcrypt.hashSync('contrasena-que-nunca-coincide', this.config.bcryptRondas);
    return this.#hashFalso;
  }
}

const MENSAJE_EN_REVISION =
  'Tu cuenta quedó en revisión. Un administrador verificará tus datos y tu rol; cuando la apruebe podrás iniciar sesión.';

/** Solo las cuentas ACTIVA pueden iniciar sesión (se revisa después de la contraseña). */
function exigirCuentaActiva(usuario) {
  if (usuario.estado_cuenta === 'PENDIENTE') {
    throw new ErrorAplicacion('CUENTA_EN_REVISION', MENSAJE_EN_REVISION, 403, { rolSolicitado: NOMBRES_DE_ROL[usuario.nombre_rol] });
  }
  if (usuario.estado_cuenta === 'RECHAZADA') {
    throw new ErrorAplicacion('CUENTA_RECHAZADA', 'Tu solicitud de cuenta fue rechazada.', 403, { motivo: usuario.motivo_rechazo });
  }
}

function aUsuarioPublico(u) {
  return {
    idUsuario: u.id_usuario,
    nombre: u.nombre,
    apellido: u.apellido,
    nombreCompleto: `${u.nombre} ${u.apellido}`,
    correo: u.correo,
    documento: u.documento,
    telefono: u.telefono,
    idRol: u.id_rol,
    rol: u.nombre_rol,
    nombreRol: NOMBRES_DE_ROL[u.nombre_rol],
    estadoCuenta: u.estado_cuenta,
    fechaRegistro: u.fecha_registro,
  };
}

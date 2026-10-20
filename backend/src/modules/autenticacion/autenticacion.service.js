import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { ErrorAplicacion, noAutenticado, noEncontrado } from '../../compartido/errores.js';
import { NOMBRES_DE_ROL } from '../../compartido/roles.js';

/**
 * AutenticacionService: controla el acceso y diferencia los perfiles (RF01).
 * Oculta las contraseñas, los tokens y los datos internos de Usuario y Rol.
 */
export class AutenticacionService {
  #hashFalso = null;

  constructor({ repositorio, config }) {
    this.repositorio = repositorio;
    this.config = config;
  }

  /** Verifica correo y contraseña y entrega un JWT con expiración. El rol lo decide el backend. */
  async iniciarSesion(correo, contrasena) {
    const usuario = await this.repositorio.buscarPorCorreo(correo.toLowerCase());
    // Se compara aunque el usuario no exista, para no revelar qué correos están registrados.
    const coincide = await bcrypt.compare(contrasena, usuario?.contrasena_hash ?? this.#obtenerHashFalso());
    if (!usuario || !coincide) {
      throw new ErrorAplicacion('CREDENCIALES_INVALIDAS', 'El correo o la contraseña no son correctos.', 401);
    }
    const token = jwt.sign({ rol: usuario.nombre_rol }, this.config.jwt.secreto, {
      subject: String(usuario.id_usuario),
      expiresIn: this.config.jwt.expiracion,
      algorithm: 'HS256',
    });
    return { token, usuario: aUsuarioPublico(usuario) };
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
    const usuario = await this.repositorio.buscarPorId(Number(datos.sub));
    if (!usuario) throw noAutenticado('Tu sesión ya no es válida. Inicia sesión de nuevo.');
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

  #obtenerHashFalso() {
    this.#hashFalso ??= bcrypt.hashSync('contrasena-que-nunca-coincide', this.config.bcryptRondas);
    return this.#hashFalso;
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
    rol: u.nombre_rol,
    nombreRol: NOMBRES_DE_ROL[u.nombre_rol],
  };
}

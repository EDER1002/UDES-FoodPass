export const ROLES = Object.freeze({
  REGULAR: 'ESTUDIANTE_REGULAR',
  SUBSIDIADO: 'ESTUDIANTE_SUBSIDIADO',
  EMPLEADO: 'EMPLEADO_UDES',
  ADMIN: 'ADMINISTRADOR',
});

/** Roles que reservan almuerzo (todos menos el administrador). */
export const ROLES_COMENSALES = Object.freeze([ROLES.REGULAR, ROLES.SUBSIDIADO, ROLES.EMPLEADO]);

/** Roles que pagan en línea. El subsidiado no paga: usa su beneficio. */
export const ROLES_QUE_PAGAN = Object.freeze([ROLES.REGULAR, ROLES.EMPLEADO]);

export const NOMBRES_DE_ROL = Object.freeze({
  [ROLES.REGULAR]: 'Estudiante regular',
  [ROLES.SUBSIDIADO]: 'Estudiante subsidiado',
  [ROLES.EMPLEADO]: 'Empleado UDES',
  [ROLES.ADMIN]: 'Administrador',
});

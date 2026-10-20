-- =====================================================================
-- 001 · Identidad, roles y configuración
-- Tablas: rol, usuario, configuracion_reserva, beneficio_subsidiado
-- Módulo dueño: Autenticación y Roles (rol, usuario) y
--               Reservas y Pagos (configuracion_reserva, beneficio_subsidiado)
-- =====================================================================

CREATE TABLE rol (
  id_rol      SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre_rol  VARCHAR(30)  NOT NULL UNIQUE,
  descripcion VARCHAR(200),
  CONSTRAINT ck_rol_nombre CHECK (nombre_rol IN
    ('ESTUDIANTE_REGULAR', 'ESTUDIANTE_SUBSIDIADO', 'EMPLEADO_UDES', 'ADMINISTRADOR'))
);

-- Los cuatro roles son datos de referencia del sistema (no datos de ejemplo).
INSERT INTO rol (nombre_rol, descripcion) VALUES
  ('ESTUDIANTE_REGULAR',    'Estudiante que paga su almuerzo en línea'),
  ('ESTUDIANTE_SUBSIDIADO', 'Estudiante con beneficio diario de almuerzo'),
  ('EMPLEADO_UDES',         'Profesor o personal administrativo de la UDES'),
  ('ADMINISTRADOR',         'Gestiona el menú, los horarios y la entrega de almuerzos');

CREATE TABLE usuario (
  id_usuario      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre          VARCHAR(80)  NOT NULL,
  apellido        VARCHAR(80)  NOT NULL,
  documento       VARCHAR(20)  NOT NULL UNIQUE,
  correo          VARCHAR(120) NOT NULL UNIQUE,
  contrasena_hash VARCHAR(100) NOT NULL,
  telefono        VARCHAR(20),
  id_rol          SMALLINT     NOT NULL REFERENCES rol (id_rol),
  CONSTRAINT ck_usuario_correo_minusculas CHECK (correo = lower(correo))
);
CREATE INDEX ix_usuario_rol ON usuario (id_rol);

-- Horario de reserva para un rol o para un usuario puntual (nunca ambos).
CREATE TABLE configuracion_reserva (
  id_configuracion      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_rol                SMALLINT REFERENCES rol (id_rol),
  id_usuario            INTEGER  REFERENCES usuario (id_usuario) ON DELETE CASCADE,
  hora_inicio           TIME     NOT NULL,
  hora_fin              TIME     NOT NULL,
  fecha_inicio_vigencia DATE     NOT NULL,
  fecha_fin_vigencia    DATE,
  estado                VARCHAR(10) NOT NULL DEFAULT 'ACTIVO',
  CONSTRAINT ck_config_rol_o_usuario CHECK ((id_rol IS NULL) <> (id_usuario IS NULL)),
  CONSTRAINT ck_config_horas CHECK (hora_inicio < hora_fin),
  CONSTRAINT ck_config_vigencia CHECK (fecha_fin_vigencia IS NULL OR fecha_inicio_vigencia <= fecha_fin_vigencia),
  CONSTRAINT ck_config_estado CHECK (estado IN ('ACTIVO', 'INACTIVO'))
);
CREATE INDEX ix_config_rol ON configuracion_reserva (id_rol) WHERE id_rol IS NOT NULL;
CREATE INDEX ix_config_usuario ON configuracion_reserva (id_usuario) WHERE id_usuario IS NOT NULL;

-- Beneficio diario del estudiante subsidiado.
-- Las fechas de vigencia y el estado se agregaron por la decisión 5 (CLAUDE.md, sección 13).
CREATE TABLE beneficio_subsidiado (
  id_beneficio          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_rol                SMALLINT    NOT NULL REFERENCES rol (id_rol),
  id_usuario            INTEGER     NOT NULL REFERENCES usuario (id_usuario) ON DELETE CASCADE,
  codigo_qr_diario      VARCHAR(64) NOT NULL UNIQUE,
  fecha_inicio_vigencia DATE        NOT NULL,
  fecha_fin_vigencia    DATE,
  estado                VARCHAR(10) NOT NULL DEFAULT 'ACTIVO',
  CONSTRAINT ck_beneficio_vigencia CHECK (fecha_fin_vigencia IS NULL OR fecha_inicio_vigencia <= fecha_fin_vigencia),
  CONSTRAINT ck_beneficio_estado CHECK (estado IN ('ACTIVO', 'INACTIVO'))
);
CREATE INDEX ix_beneficio_usuario ON beneficio_subsidiado (id_usuario);

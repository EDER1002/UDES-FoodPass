-- =====================================================================
-- 007 · Recuperación de contraseña
-- Tabla: usuario (módulo Autenticación y Roles)
--
-- Se mantienen las 16 tablas: el código de recuperación vive en la misma
-- fila del usuario. Solo se guarda su hash (bcrypt), nunca el código.
--
-- Dos caminos:
--   - Por correo: la persona pide un código y le llega a su correo.
--   - Con ayuda del administrador: la persona deja una solicitud de ayuda;
--     el administrador verifica su documento en persona y le genera el código.
-- =====================================================================

ALTER TABLE usuario
  ADD COLUMN codigo_recuperacion_hash     VARCHAR(100),
  ADD COLUMN codigo_recuperacion_expira   TIMESTAMPTZ,
  ADD COLUMN codigo_recuperacion_intentos SMALLINT     NOT NULL DEFAULT 0,
  ADD COLUMN fecha_solicitud_ayuda        TIMESTAMPTZ,
  ADD CONSTRAINT ck_usuario_codigo_recuperacion
    CHECK ((codigo_recuperacion_hash IS NULL) = (codigo_recuperacion_expira IS NULL)),
  ADD CONSTRAINT ck_usuario_intentos_recuperacion CHECK (codigo_recuperacion_intentos >= 0);

-- Solicitudes de ayuda por atender (pantalla Solicitudes del administrador).
CREATE INDEX ix_usuario_ayuda_pendiente ON usuario (fecha_solicitud_ayuda) WHERE fecha_solicitud_ayuda IS NOT NULL;

-- =====================================================================
-- 005 · Registro de cuentas con verificación del rol
-- Tabla: usuario (módulo Autenticación y Roles)
--
-- Cada persona crea su cuenta y elige su rol (decisión 8, CLAUDE.md,
-- sección 13). El estudiante regular queda ACTIVA de inmediato; el
-- subsidiado, el empleado y el administrador quedan PENDIENTE hasta que
-- un administrador los apruebe. Mientras tanto no pueden iniciar sesión.
-- =====================================================================

ALTER TABLE usuario
  ADD COLUMN estado_cuenta  VARCHAR(10)  NOT NULL DEFAULT 'ACTIVA',
  ADD COLUMN fecha_registro TIMESTAMPTZ  NOT NULL DEFAULT now(),
  ADD COLUMN fecha_revision TIMESTAMPTZ,
  ADD COLUMN id_revisor     INTEGER      REFERENCES usuario (id_usuario) ON DELETE SET NULL,
  ADD COLUMN motivo_rechazo VARCHAR(200),
  ADD CONSTRAINT ck_usuario_estado_cuenta CHECK (estado_cuenta IN ('PENDIENTE', 'ACTIVA', 'RECHAZADA')),
  ADD CONSTRAINT ck_usuario_rechazo CHECK (estado_cuenta <> 'RECHAZADA' OR motivo_rechazo IS NOT NULL);

-- Solicitudes por revisar (pantalla del administrador).
CREATE INDEX ix_usuario_pendientes ON usuario (fecha_registro) WHERE estado_cuenta = 'PENDIENTE';

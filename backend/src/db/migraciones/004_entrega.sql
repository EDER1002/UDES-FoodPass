-- =====================================================================
-- 004 · Entrega
-- Tablas: ficho_qr, entrega
-- Módulo dueño: Validación QR
-- =====================================================================

-- codigo_qr guarda la imagen del QR (data URL SVG). El QR contiene solo el token.
-- El UNIQUE de token_unico sirve de índice para la búsqueda al escanear (RNF01).
CREATE TABLE ficho_qr (
  id_ficho         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_reserva       INTEGER     NOT NULL UNIQUE REFERENCES reserva (id_reserva),
  token_unico      VARCHAR(19) NOT NULL UNIQUE,
  codigo_qr        TEXT        NOT NULL,
  fecha_generacion TIMESTAMPTZ NOT NULL,
  fecha_expiracion TIMESTAMPTZ NOT NULL,
  estado           VARCHAR(10) NOT NULL DEFAULT 'ACTIVO',
  fecha_uso        TIMESTAMPTZ,
  CONSTRAINT ck_ficho_estado CHECK (estado IN ('ACTIVO', 'USADO', 'EXPIRADO')),
  CONSTRAINT ck_ficho_uso CHECK ((estado = 'USADO') = (fecha_uso IS NOT NULL)),
  CONSTRAINT ck_ficho_fechas CHECK (fecha_generacion <= fecha_expiracion)
);

-- id_usuario_empleado es el administrador que valida el ficho.
-- El UNIQUE de id_ficho impide registrar dos entregas del mismo ficho.
CREATE TABLE entrega (
  id_entrega          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_ficho            INTEGER     NOT NULL UNIQUE REFERENCES ficho_qr (id_ficho),
  id_usuario_empleado INTEGER     NOT NULL REFERENCES usuario (id_usuario),
  fecha_entrega       DATE        NOT NULL,
  hora_entrega        TIME        NOT NULL,
  estado_entrega      VARCHAR(12) NOT NULL DEFAULT 'ENTREGADO',
  CONSTRAINT ck_entrega_estado CHECK (estado_entrega IN ('ENTREGADO'))
);
CREATE INDEX ix_entrega_fecha ON entrega (fecha_entrega);

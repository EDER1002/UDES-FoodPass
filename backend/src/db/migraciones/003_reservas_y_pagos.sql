-- =====================================================================
-- 003 · Reservas y pagos
-- Tablas: reserva, reserva_proteina, reserva_acompanamiento, pago
-- Módulo dueño: Reservas y Pagos
-- =====================================================================

-- fecha_reserva y hora_reserva se guardan en hora de Colombia (America/Bogota).
CREATE TABLE reserva (
  id_reserva       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_usuario       INTEGER     NOT NULL REFERENCES usuario (id_usuario),
  id_menu          INTEGER     NOT NULL REFERENCES menu (id_menu),
  id_tipo_almuerzo SMALLINT    NOT NULL REFERENCES tipo_almuerzo (id_tipo_almuerzo),
  fecha_reserva    DATE        NOT NULL,
  hora_reserva     TIME        NOT NULL,
  estado           VARCHAR(15) NOT NULL,
  tipo_reserva     VARCHAR(12) NOT NULL,
  valor_total      INTEGER     NOT NULL,
  CONSTRAINT ck_reserva_estado CHECK (estado IN ('PENDIENTE_PAGO', 'CONFIRMADA', 'ENTREGADA', 'CANCELADA')),
  CONSTRAINT ck_reserva_tipo CHECK (tipo_reserva IN ('PAGADA', 'SUBSIDIADA')),
  CONSTRAINT ck_reserva_valor CHECK (valor_total >= 0),
  CONSTRAINT ck_reserva_subsidiada_gratis CHECK (tipo_reserva <> 'SUBSIDIADA' OR valor_total = 0)
);
-- Historial del usuario y reglas del día (RNF01)
CREATE INDEX ix_reserva_usuario_fecha ON reserva (id_usuario, fecha_reserva);
-- Resumen del menú del día para el administrador
CREATE INDEX ix_reserva_menu_estado ON reserva (id_menu, estado);
-- Regla 6 (decisión 2): una sola reserva activa por usuario y por día.
CREATE UNIQUE INDEX ux_reserva_activa_por_dia ON reserva (id_usuario, id_menu)
  WHERE estado IN ('PENDIENTE_PAGO', 'CONFIRMADA');
-- Regla 5: máximo una reserva subsidiada por día (las canceladas no cuentan).
CREATE UNIQUE INDEX ux_reserva_subsidiada_por_dia ON reserva (id_usuario, id_menu)
  WHERE tipo_reserva = 'SUBSIDIADA' AND estado <> 'CANCELADA';

-- Una proteína por reserva (regla 3).
CREATE TABLE reserva_proteina (
  id_reserva_proteina INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_reserva          INTEGER NOT NULL REFERENCES reserva (id_reserva) ON DELETE CASCADE,
  id_proteina         INTEGER NOT NULL REFERENCES proteina (id_proteina),
  CONSTRAINT uq_reserva_proteina UNIQUE (id_reserva)
);

CREATE TABLE reserva_acompanamiento (
  id_reserva_acompanamiento INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_reserva                INTEGER NOT NULL REFERENCES reserva (id_reserva) ON DELETE CASCADE,
  id_acompanamiento         INTEGER NOT NULL REFERENCES acompanamiento (id_acompanamiento),
  CONSTRAINT uq_reserva_acompanamiento UNIQUE (id_reserva, id_acompanamiento)
);

-- Solo existe si la reserva es PAGADA. REEMBOLSADO se agregó por la regla 9.
-- Nunca se guardan números de tarjeta ni otros datos sensibles de pago.
CREATE TABLE pago (
  id_pago                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_reserva             INTEGER     NOT NULL UNIQUE REFERENCES reserva (id_reserva),
  monto                  INTEGER     NOT NULL,
  fecha_pago             TIMESTAMPTZ NOT NULL,
  estado_pago            VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE',
  -- Se deriva de la clave de idempotencia: un reintento encuentra el mismo pago (RNF05).
  referencia_transaccion VARCHAR(80) NOT NULL UNIQUE,
  metodo_pago            VARCHAR(8)  NOT NULL,
  CONSTRAINT ck_pago_monto CHECK (monto > 0),
  CONSTRAINT ck_pago_estado CHECK (estado_pago IN ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'REEMBOLSADO')),
  CONSTRAINT ck_pago_metodo CHECK (metodo_pago IN ('PSE', 'TARJETA', 'NEQUI'))
);

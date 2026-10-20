-- =====================================================================
-- 002 · Catálogo del menú
-- Tablas: menu, tipo_almuerzo, proteina, acompanamiento,
--         menu_proteina, menu_acompanamiento
-- Módulo dueño: Gestión de Menú
-- Precios en pesos colombianos (COP), sin centavos.
-- =====================================================================

-- Un menú por fecha (decisión técnica). El UNIQUE también sirve de índice
-- para la consulta más frecuente: el menú de hoy (RNF01).
CREATE TABLE menu (
  id_menu             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha               DATE        NOT NULL UNIQUE,
  estado              VARCHAR(10) NOT NULL DEFAULT 'BORRADOR',
  hora_inicio_reserva TIME        NOT NULL,
  hora_fin_reserva    TIME        NOT NULL,
  -- Total de platos del día (decisión 4)
  cantidad_disponible INTEGER     NOT NULL,
  CONSTRAINT ck_menu_estado CHECK (estado IN ('BORRADOR', 'PUBLICADO', 'CERRADO')),
  CONSTRAINT ck_menu_horas CHECK (hora_inicio_reserva < hora_fin_reserva),
  CONSTRAINT ck_menu_cantidad CHECK (cantidad_disponible >= 0)
);

-- max_acompanamientos se agregó por la decisión 1 (CLAUDE.md, sección 13).
CREATE TABLE tipo_almuerzo (
  id_tipo_almuerzo    SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre              VARCHAR(60)  NOT NULL UNIQUE,
  descripcion         VARCHAR(200),
  precio              INTEGER      NOT NULL,
  tipo_servicio       VARCHAR(60),
  max_acompanamientos SMALLINT     NOT NULL DEFAULT 2,
  CONSTRAINT ck_tipo_precio CHECK (precio > 0),
  CONSTRAINT ck_tipo_max_acomp CHECK (max_acompanamientos BETWEEN 1 AND 5)
);

-- imagen_url se agregó por la decisión 3. cantidad_disponible es informativa (decisión 4).
CREATE TABLE proteina (
  id_proteina         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre              VARCHAR(80)  NOT NULL UNIQUE,
  descripcion         VARCHAR(200),
  cantidad_disponible INTEGER      NOT NULL DEFAULT 0,
  estado              VARCHAR(10)  NOT NULL DEFAULT 'ACTIVO',
  imagen_url          VARCHAR(300),
  CONSTRAINT ck_proteina_cantidad CHECK (cantidad_disponible >= 0),
  CONSTRAINT ck_proteina_estado CHECK (estado IN ('ACTIVO', 'INACTIVO'))
);

CREATE TABLE acompanamiento (
  id_acompanamiento INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre            VARCHAR(80)  NOT NULL UNIQUE,
  descripcion       VARCHAR(200),
  estado            VARCHAR(10)  NOT NULL DEFAULT 'ACTIVO',
  imagen_url        VARCHAR(300),
  CONSTRAINT ck_acomp_estado CHECK (estado IN ('ACTIVO', 'INACTIVO'))
);

-- Porciones de cada opción en el menú de un día. El CHECK >= 0 es la última
-- barrera contra la sobreventa (RNF03).
CREATE TABLE menu_proteina (
  id_menu_proteina    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_menu             INTEGER NOT NULL REFERENCES menu (id_menu) ON DELETE CASCADE,
  id_proteina         INTEGER NOT NULL REFERENCES proteina (id_proteina),
  cantidad_disponible INTEGER NOT NULL,
  CONSTRAINT ck_menu_proteina_cantidad CHECK (cantidad_disponible >= 0),
  CONSTRAINT uq_menu_proteina UNIQUE (id_menu, id_proteina)
);

CREATE TABLE menu_acompanamiento (
  id_menu_acompanamiento INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_menu                INTEGER NOT NULL REFERENCES menu (id_menu) ON DELETE CASCADE,
  id_acompanamiento      INTEGER NOT NULL REFERENCES acompanamiento (id_acompanamiento),
  cantidad_disponible    INTEGER NOT NULL,
  CONSTRAINT ck_menu_acomp_cantidad CHECK (cantidad_disponible >= 0),
  CONSTRAINT uq_menu_acompanamiento UNIQUE (id_menu, id_acompanamiento)
);

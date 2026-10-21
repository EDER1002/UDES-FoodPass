-- =====================================================================
-- 006 · Nombres del catálogo únicos sin distinguir mayúsculas
-- Tablas: tipo_almuerzo, proteina, acompanamiento (módulo Gestión de Menú)
--
-- Evita tener "Arroz blanco" y "ARROZ BLANCO" como dos opciones distintas.
-- =====================================================================

CREATE UNIQUE INDEX ux_tipo_almuerzo_nombre_ci ON tipo_almuerzo (lower(nombre));
CREATE UNIQUE INDEX ux_proteina_nombre_ci ON proteina (lower(nombre));
CREATE UNIQUE INDEX ux_acompanamiento_nombre_ci ON acompanamiento (lower(nombre));

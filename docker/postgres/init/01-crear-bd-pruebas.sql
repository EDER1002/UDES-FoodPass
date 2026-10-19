-- Se ejecuta una sola vez, cuando Docker crea la base de datos por primera vez.
-- Crea la base de datos aparte que usan las pruebas automáticas del backend
-- (ver DATABASE_URL_TEST en .env.example).
CREATE DATABASE udes_foodpass_test;

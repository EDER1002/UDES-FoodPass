import { describe, expect, it } from 'vitest';
import { horaLegible, relojFijo, sumarDias } from '../src/compartido/reloj.js';
import { EstrategiaPago } from '../src/modules/reservas-pagos/pagos/EstrategiaPago.js';
import { ProcesadorDePagos } from '../src/modules/reservas-pagos/pagos/ProcesadorDePagos.js';
import { crearEstrategias } from '../src/modules/reservas-pagos/pagos/estrategias/index.js';
import { pasaLuhn } from '../src/modules/reservas-pagos/pagos/estrategias/PagoTarjeta.js';
import { PasarelaSandbox } from '../src/modules/reservas-pagos/pagos/pasarela/PasarelaSandbox.js';
import { firmar, verificarFirma } from '../src/modules/reservas-pagos/pagos/webhook.js';
import { generarToken, normalizarToken } from '../src/modules/validacion-qr/token.js';

describe('Token del ficho', () => {
  it('tiene 16 caracteres de Crockford en grupos de 4 y no se repite', () => {
    const tokens = new Set([...Array(2000)].map(generarToken));
    expect(tokens.size).toBe(2000);
    for (const t of [...tokens].slice(0, 50)) expect(t).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  });

  it('normaliza lo que escribe el administrador', () => {
    expect(normalizarToken('7k3q 9xwa 2m4d h8pn')).toBe('7K3Q-9XWA-2M4D-H8PN');
    expect(normalizarToken('ABCD-EFGH-JKMN-PQRO')).toBe('ABCD-EFGH-JKMN-PQR0');
    expect(normalizarToken('UUUU-UUUU-UUUU-UUUU')).toBeNull();
    expect(normalizarToken('corto')).toBeNull();
    expect(normalizarToken(42)).toBeNull();
  });
});

describe('Reloj en America/Bogota', () => {
  it('convierte instantes a fecha y hora de Bogotá', () => {
    const reloj = relojFijo('2026-10-19', '23:30:00');
    expect(reloj.partes()).toEqual({ fecha: '2026-10-19', hora: '23:30:00' });
    expect(reloj.ahora().toISOString()).toBe('2026-10-20T04:30:00.000Z');
    expect(reloj.finDelDia('2026-10-19').toISOString()).toBe('2026-10-20T04:59:59.999Z');
  });

  it('formatea horas y suma días', () => {
    expect(horaLegible('06:00:00')).toBe('6:00 a. m.');
    expect(horaLegible('12:14:00')).toBe('12:14 p. m.');
    expect(horaLegible('00:05:00')).toBe('12:05 a. m.');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('Patrón Strategy de pagos', () => {
  const reloj = relojFijo('2026-10-19', '09:00:00');
  const estrategias = crearEstrategias({ pasarela: new PasarelaSandbox(), reloj });

  it('hay una estrategia por medio de pago y todas implementan EstrategiaPago', () => {
    expect(estrategias.metodos()).toEqual(['NEQUI', 'PSE', 'TARJETA']);
    for (const m of estrategias.metodos()) expect(estrategias.obtener(m)).toBeInstanceOf(EstrategiaPago);
    expect(() => estrategias.obtener('BITCOIN')).toThrow(/medio de pago válido/);
  });

  it('el procesador exige una estrategia válida', async () => {
    const procesador = new ProcesadorDePagos({ db: null, pagoRepositorio: null });
    await expect(procesador.ejecutarPago({})).rejects.toThrow(/estrategia/);
    expect(() => procesador.establecerEstrategia({ procesarTransaccion() {} })).toThrow(TypeError);
  });

  it('valida los datos de cada medio', () => {
    expect(estrategias.obtener('NEQUI').validarDatos({ telefono: '300-123-4567' })).toEqual({ telefono: '3001234567' });
    expect(() => estrategias.obtener('NEQUI').validarDatos({ telefono: '2001234567' })).toThrow();
    expect(() => estrategias.obtener('PSE').validarDatos({ banco: '9', tipoPersona: 'NATURAL', documento: '12345' })).toThrow();
    expect(estrategias.obtener('TARJETA').validarDatos({ numero: '4242 4242 4242 4242', titular: 'Ana', vencimiento: '10/26', cvc: '123' }).cuotas).toBe(1);
  });

  it('algoritmo de Luhn', () => {
    expect(pasaLuhn('4242424242424242')).toBe(true);
    expect(pasaLuhn('4111111111111111')).toBe(true);
    expect(pasaLuhn('4242424242424241')).toBe(false);
  });
});

describe('Firma del webhook', () => {
  it('acepta la firma correcta y rechaza cualquier otra', () => {
    const cuerpo = Buffer.from('{"referencia":"FP-1-abc","estado":"APROBADO"}');
    expect(() => verificarFirma(cuerpo, firmar(cuerpo, 'secreto-123456789'), 'secreto-123456789')).not.toThrow();
    expect(() => verificarFirma(cuerpo, firmar(cuerpo, 'otro-secreto-12345'), 'secreto-123456789')).toThrow(/firma/);
    expect(() => verificarFirma(cuerpo, undefined, 'secreto-123456789')).toThrow(/firma/);
  });
});

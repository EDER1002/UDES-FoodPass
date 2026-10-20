import crypto from 'node:crypto';
import QRCode from 'qrcode';

// Base32 de Crockford: sin I, L, O ni U para que el token se pueda dictar sin confusiones.
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Token del ficho: 80 bits aleatorios de crypto.randomBytes (no adivinable),
 * escrito como XXXX-XXXX-XXXX-XXXX para poder digitarlo a mano.
 */
export function generarToken() {
  let bits = 0n;
  for (const byte of crypto.randomBytes(10)) bits = (bits << 8n) | BigInt(byte);
  let texto = '';
  for (let i = 0; i < 16; i++) {
    texto = ALFABETO[Number(bits & 31n)] + texto;
    bits >>= 5n;
  }
  return formatear(texto);
}

/**
 * Normaliza lo que escanea o escribe el administrador: mayúsculas, sin
 * espacios ni guiones, y corrige las letras que se confunden (I/L → 1, O → 0).
 * Devuelve null si no tiene la forma de un token.
 */
export function normalizarToken(entrada) {
  if (typeof entrada !== 'string') return null;
  const limpio = entrada.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(limpio) ? formatear(limpio) : null;
}

/** Imagen del QR (data URL SVG). El QR contiene SOLO el token, nunca datos personales. */
export async function generarImagenQR(token) {
  const svg = await QRCode.toString(token, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: '#0B1B3AFF', light: '#FFFFFFFF' },
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const formatear = (texto) => texto.match(/.{4}/g).join('-');

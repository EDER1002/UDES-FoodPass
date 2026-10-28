import nodemailer from 'nodemailer';

/**
 * Envío de correos (por ahora solo el código para recuperar la contraseña).
 *
 * - Con SMTP configurado en .env usa ese servidor (por ejemplo Gmail con una
 *   clave de aplicación).
 * - Sin SMTP, en desarrollo escribe el correo en la consola de la API para
 *   poder probar el flujo. En producción no muestra nada: el código solo
 *   llega por correo o con ayuda del administrador.
 */
export function crearCorreo(config) {
  if (config.correo) {
    const transporte = nodemailer.createTransport({
      host: config.correo.host,
      port: config.correo.puerto,
      secure: config.correo.puerto === 465,
      auth: { user: config.correo.usuario, pass: config.correo.clave },
    });
    return {
      configurado: true,
      async enviar({ para, asunto, texto }) {
        await transporte.sendMail({ from: config.correo.remitente, to: para, subject: asunto, text: texto });
      },
    };
  }
  return {
    configurado: false,
    async enviar({ para, asunto, texto }) {
      if (config.entorno !== 'development') return;
      console.log(`\n[correo de desarrollo, sin SMTP] Para: ${para}\nAsunto: ${asunto}\n${texto}\n`);
    },
  };
}

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'mitrabajotdf@gmail.com',         // <-- Tu correo de Gmail acá
        pass: 'yfuw tmez qsxd xwvc'   // <-- Contraseña de aplicación de Gmail (NO tu contraseña normal)
    }
});

async function enviarAlertaAdmin(datos) {
    try {
        if (!process.env.RESEND_API_KEY) return;
        await transporter.sendMail({
            from: 'onboarding@resend.dev',
            to: 'tu-correo@ejemplo.com',
            subject: 'Nueva postulación recibida',
            text: `Nuevo candidato: ${datos.nombre}`
        });
    } catch (e) {
        console.log("Aviso mail admin omitido:", e.message);
    }
}

async function enviarConfirmacionCandidato(email, nombre) {
    try {
        if (!process.env.RESEND_API_KEY || !email) return;
        await transporter.sendMail({
            from: 'onboarding@resend.dev',
            to: email,
            subject: 'Postulación recibida - Mi Trabajo TDF',
            text: `Hola ${nombre}, recibimos tus datos correctamente.`
        });
    } catch (e) {
        console.log("Aviso mail candidato omitido:", e.message);
    }
}

module.exports = { enviarAlertaAdmin, enviarConfirmacionCandidato };

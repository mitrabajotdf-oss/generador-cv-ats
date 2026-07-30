const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'mitrabajotdf@gmail.com',
        pass: 'yfuw tmez qsxd xwvc'
    }
});

async function enviarAlertaAdmin(datos) {
    try {
        await transporter.sendMail({
            from: 'mitrabajotdf@gmail.com',
            to: 'mitrabajotdf@gmail.com',
            subject: 'Nueva postulación recibida',
            text: `Nuevo candidato registrado: ${datos.nombre} - Teléfono: ${datos.telefono} - Email: ${datos.email}`
        });
        console.log("Alerta enviada al administrador con éxito.");
    } catch (e) {
        console.log("Error enviando alerta admin:", e.message);
    }
}

async function enviarConfirmacionCandidato(email, nombre) {
    try {
        if (!email) return;
        await transporter.sendMail({
            from: 'mitrabajotdf@gmail.com',
            to: email,
            subject: 'Postulación recibida - Mi Trabajo TDF',
            text: `Hola ${nombre},\n\nRecibimos tus datos correctamente en el sistema de Mi Trabajo TDF. Nos pondremos en contacto si tu perfil coincide con alguna búsqueda activa.\n\n¡Muchas gracias por postularte!`
        });
        console.log("Correo de confirmación enviado al candidato con éxito.");
    } catch (e) {
        console.log("Error enviando confirmación candidato:", e.message);
    }
}

module.exports = { enviarAlertaAdmin, enviarConfirmacionCandidato };

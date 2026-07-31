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
            subject: '📋 Nuevo Postulante Registrado en la Base',
            text: `Se ha cargado un nuevo postulante al sistema:\n\n- Nombre: ${datos.nombre}\n- DNI: ${datos.dni || 'No especificado'}\n- Teléfono: ${datos.telefono}\n- Email: ${datos.email}\n\nIngresá al panel de control para ver su perfil completo y filtros ATS.`
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
            subject: 'Postulación Recibida - Mi Trabajo TDF',
            text: `Hola ${nombre},\n\n¡Recibimos tus datos correctamente en nuestra base de datos!\n\nTe avisamos que cuando haya una búsqueda activa que coincida con tus habilidades y perfil ATS, nos pondremos en contacto.\n\nMuchas gracias por confiar en Mi Trabajo TDF.`
        });
        console.log("Correo de confirmación enviado al candidato con éxito.");
    } catch (e) {
        console.log("Error enviando confirmación candidato:", e.message);
    }
}

module.exports = { enviarAlertaAdmin, enviarConfirmacionCandidato };

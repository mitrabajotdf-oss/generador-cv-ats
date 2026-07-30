
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const enviarAlertaAdmin = async (datosCandidato) => {
    try {
        await transporter.sendMail({
            from: `"Mi Trabajo TDF" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject: "🚀 Nuevo CV cargado en la plataforma",
            html: `
                <h3>¡Nuevo candidato registrado!</h3>
                <p>Se ha cargado un nuevo currículum en el sistema con los siguientes datos:</p>
                <ul>
                    <li><b>Nombre:</b> ${datosCandidato.nombre}</li>
                    <li><b>Email:</b> ${datosCandidato.email}</li>
                    <li><b>Teléfono:</b> ${datosCandidato.telefono}</li>
                </ul>
            `
        });
        console.log("Alerta enviada al administrador.");
    } catch (error) {
        console.error("Error al enviar alerta:", error);
    }
};

const enviarConfirmacionCandidato = async (emailCandidato, nombreCandidato) => {
    try {
        await transporter.sendMail({
            from: `"Mi Trabajo TDF" <${process.env.EMAIL_USER}>`,
            to: emailCandidato,
            subject: "Recepción de CV - Mi Trabajo TDF 🚀",
            html: `
                <p>¡Hola <b>${nombreCandidato}</b>!</p>
                <p>Te escribo desde <b>Mi Trabajo TDF</b> para confirmarte que tu currículum ya quedó correctamente cargado en nuestra base de datos exclusiva para la provincia.</p>
                <p>Cuando se active una búsqueda en la industria que coincida con tus habilidades, te tendremos en cuenta de inmediato.</p>
                <br>
                <p><b>Mi Trabajo TDF</b></p>
            `
        });
        console.log("Confirmación enviada al candidato.");
    } catch (error) {
        console.error("Error al enviar al candidato:", error);
    }
};

module.exports = { enviarAlertaAdmin, enviarConfirmacionCandidato };

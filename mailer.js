const { Resend } = require('resend');

// Usamos la API key directamente o mediante variables de entorno
const resend = new Resend(process.env.RESEND_API_KEY || 're_123456789');

async function enviarAlertaAdmin(candidato) {
    try {
        await resend.emails.send({
            from: 'Portal ATS <onboarding@resend.dev>',
            to: ['mitrabajotdf@gmail.com'], // O tu correo de administración
            subject: `Nueva Postulación Recibida: ${candidato.nombre}`,
            html: `
                <h2>¡Nuevo Candidato Registrado!</h2>
                <p><strong>Nombre:</strong> ${candidato.nombre}</p>
                <p><strong>DNI:</strong> ${candidato.dni}</p>
                <p><strong>Email:</strong> ${candidato.email}</p>
                <p><strong>Teléfono:</strong> ${candidato.telefono}</p>
                <p>Ingresa al <a href="https://generador-cv-ats-1.onrender.com/">Panel de Gestión</a> para ver los detalles completos y descargar su CV.</p>
            `
        });
    } catch (error) {
        console.error("Error al enviar alerta al admin:", error);
    }
}

async function enviarConfirmacionCandidato(emailCandidato, nombreCandidato) {
    if (!emailCandidato) return;
    try {
        await resend.emails.send({
            from: 'Mi Trabajo TDF <onboarding@resend.dev>',
            to: [emailCandidato],
            subject: '¡Postulación Recibida con Éxito - Mi Trabajo TDF!',
            html: `
                <h2>¡Hola ${nombreCandidato}!</h2>
                <p>Hemos recibido correctamente tu postulación y tu CV optimizado en nuestro sistema.</p>
                <p>Tus datos ya se encuentran disponibles en nuestra base para los procesos de selección activos.</p>
                <br>
                <p>Atentamente,</p>
                <p><strong>Equipo de Reclutamiento - Mi Trabajo TDF</strong></p>
            `
        });
    } catch (error) {
        console.error("Error al enviar confirmación al candidato:", error);
    }
}

module.exports = { enviarAlertaAdmin, enviarConfirmacionCandidato };

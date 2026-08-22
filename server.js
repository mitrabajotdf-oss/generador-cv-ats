const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const basicAuth = require('express-basic-auth');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const nodemailer = require('nodemailer'); 

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔒 Protección del Panel de Gestión
const authMiddleware = basicAuth({
    users: { 'MitrabajoTDF': 'EmpleoRG' },
    challenge: true,
    realm: 'Portal de Reclutamiento Protegido - Mi Trabajo TDF'
});

app.get('/', authMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ FORMULARIO OPERATIVO (Mantenimiento desactivado)
app.get('/formulario.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'formulario.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// 📂 Almacenamiento en memoria para convertir archivos directamente a Base64
const upload = multer({ storage: multer.memoryStorage() });

// 🚀 Conexión a MongoDB (SEGURIDAD APLICADA: Contraseña oculta en variables de entorno)
const mongoURI = process.env.MONGODB_URI;

mongoose.connect(mongoURI)
    .then(() => console.log('✅ Base de datos MongoDB conectada con éxito.'))
    .catch(err => console.error('❌ Error al conectar a MongoDB:', err));

const candidatoSchema = new mongoose.Schema({
    id: Number,
    puestoRequerido: String,
    nombre: String,
    dni: String,
    email: String,
    telefono: String,
    direccion: String,
    disponibilidad: String,
    resumen: String,
    experiencia: String,
    estudios: String,
    habilidades: String,
    cvData: String,           
    cvContentType: String,
    nombreArchivoCV: String,
    fotoData: String,         
    fotoContentType: String,
    textoExtraidoCV: String, 
    fecha: String,
    pagado: { type: Boolean, default: false }
});

const Candidato = mongoose.model('Candidato', candidatoSchema);

// ✉️ Configuración de Nodemailer usando las variables de Render
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Función auxiliar para enviar la alerta por email
async function enviarAlertaEmail(candidato) {
    try {
        const mailOptions = {
            from: '"Mi Trabajo TDF" <mitrabajotdf@gmail.com>',
            to: 'mitrabajotdf@gmail.com',
            subject: `🔔 ¡Nuevo CV Cargado: ${candidato.nombre} (${candidato.puestoRequerido})!`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px;">
                    <h2 style="color: #0284c7; margin-top: 0;">¡Nuevo Postulante Registrado! 🚀</h2>
                    <p>Se ha recibido una nueva postulación en la plataforma:</p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">
                    <p><strong>👤 Nombre:</strong> ${candidato.nombre}</p>
                    <p><strong>💼 Puesto / Subcarpeta:</strong> ${candidato.puestoRequerido}</p>
                    <p><strong>📄 DNI:</strong> ${candidato.dni || 'No especificado'}</p>
                    <p><strong>📧 Email:</strong> ${candidato.email || 'No especificado'}</p>
                    <p><strong>📞 Teléfono:</strong> ${candidato.telefono || 'No especificado'}</p>
                    <p><strong>📅 Fecha:</strong> ${candidato.fecha}</p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">
                    <p style="text-align: center; margin-top: 20px;">
                        <a href="https://generador-cv-ats-1.onrender.com" style="background: #0284c7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Ingresar al Panel de Gestión</a>
                    </p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
        console.log('✅ Alerta por email enviada con éxito a mitrabajotdf@gmail.com');
    } catch (error) {
        console.error('⚠️ Error al enviar el correo de alerta:', error);
    }
}

// 🧠 Motor avanzado de limpieza y corrección ortográfica / tipográfica para ATS
function limpiarYCorregirTexto(texto) {
    if (!texto) return '';
    let limpio = texto
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '') // Elimina caracteres invisibles o corruptos de PDFs
        .trim();

    const correcciones = [
        { error: /\bexperiencia\b/gi, bien: 'Experiencia' },
        { error: /\beducacion\b/gi, bien: 'Educación' },
        { error: /\bestudios\b/gi, bien: 'Estudios' },
        { error: /\bhabilidades\b/gi, bien: 'Habilidades' },
        { error: /\badminstrativo\b/gi, bien: 'administrativo' },
        { error: /\bcompuacion\b/gi, bien: 'computación' },
        { error: /\bgeston\b/gi, bien: 'gestión' }
    ];

    correcciones.forEach(c => {
        limpio = limpio.replace(c.error, c.bien);
    });

    return limpio;
}

// 🌐 Endpoint auxiliar optimizado para extraer y limpiar texto al adjuntar el CV
app.post('/api/extraer-cv', upload.single('cvFile'), async (req, res) => {
    try {
        if (!req.file) return res.json({ success: false, error: 'No file' });
        const buffer = req.file.buffer;
        let texto = '';

        if (req.file.mimetype === 'application/pdf') {
            const dataPdf = await pdfParse(buffer);
            texto = dataPdf.text;
        } else if (req.file.mimetype.includes('wordprocessingml') || req.file.originalname.endsWith('.docx')) {
            const resultWord = await mammoth.extractRawText({ buffer: buffer });
            texto = resultWord.value;
        }

        const textoLimpio = limpiarYCorregirTexto(texto);
        return res.json({ success: true, texto: textoLimpio });
    } catch (e) {
        return res.json({ success: false, error: e.message });
    }
});

// 🌐 Endpoint de Recepción de Postulación con procesamiento de lectura robusto
app.post('/api/enviar-postulacion', upload.any(), async (req, res) => {
    try {
        let { puestoRequerido, nombre, dni, email, telefono, direccion, disponibilidad, resumen, experiencia, estudios, habilidades } = req.body;
        
        puestoRequerido = limpiarYCorregirTexto(puestoRequerido);
        nombre = limpiarYCorregirTexto(nombre);
        dni = limpiarYCorregirTexto(dni);
        email = limpiarYCorregirTexto(email);
        telefono = limpiarYCorregirTexto(telefono);
        direccion = limpiarYCorregirTexto(direccion);
        disponibilidad = limpiarYCorregirTexto(disponibilidad);
        resumen = limpiarYCorregirTexto(resumen);
        experiencia = limpiarYCorregirTexto(experiencia);
        estudios = limpiarYCorregirTexto(estudios);
        habilidades = limpiarYCorregirTexto(habilidades);

        let cvData = '';
        let cvContentType = '';
        let nombreArchivoOriginal = '';
        let fotoData = '';
        let fotoContentType = '';
        let textoExtraidoCV = '';

        if (req.files && req.files.length > 0) {
            const cvFile = req.files.find(f => f.fieldname === 'cvFile') || req.files[0];
            const fotoPerfil = req.files.find(f => f.fieldname === 'fotoPerfil');

            if (cvFile) {
                cvData = cvFile.buffer.toString('base64');
                cvContentType = cvFile.mimetype;
                nombreArchivoOriginal = cvFile.originalname;
                try {
                    const buffer = cvFile.buffer;
                    if (cvFile.mimetype === 'application/pdf') {
                        const dataPdf = await pdfParse(buffer);
                        textoExtraidoCV = limpiarYCorregirTexto(dataPdf.text);
                    } else if (cvFile.mimetype.includes('wordprocessingml') || cvFile.originalname.endsWith('.docx')) {
                        const resultWord = await mammoth.extractRawText({ buffer: buffer });
                        textoExtraidoCV = limpiarYCorregirTexto(resultWord.value);
                    }
                } catch (readError) {
                    console.error('⚠️ No se pudo extraer texto completo del CV:', readError);
                }
            }
            if (fotoPerfil) {
                fotoData = fotoPerfil.buffer.toString('base64');
                fotoContentType = fotoPerfil.mimetype;
            }
        }

        const candidatoId = Date.now();

        const nuevoCandidato = new Candidato({
            id: candidatoId,
            puestoRequerido: puestoRequerido || 'General / Sin especificar',
            nombre: nombre || 'Postulante',
            dni: dni || '',
            email: email || '',
            telefono: telefono || '',
            direccion: direccion || '',
            disponibilidad: disponibilidad || 'Inmediata',
            resumen: resumen || '',
            experiencia: experiencia || '',
            estudios: estudios || '',
            habilidades: habilidades || '',
            cvData: cvData,
            cvContentType: cvContentType,
            nombreArchivoCV: nombreArchivoOriginal,
            fotoData: fotoData,
            fotoContentType: fotoContentType,
            textoExtraidoCV: textoExtraidoCV || '',
            fecha: new Date().toLocaleString(),
            pagado: false
        });

        await nuevoCandidato.save();
        enviarAlertaEmail(nuevoCandidato);

        return res.json({ success: true, candidatoId: candidatoId, message: '¡Postulación guardada con éxito!' });

    } catch (error) {
        console.error("Error crítico:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ✏️ Endpoint para editar los datos de un candidato desde el Panel de Gestión
app.post('/api/candidatos/editar/:id', authMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { puestoRequerido, nombre, dni, email, telefono, direccion, disponibilidad, resumen, experiencia, estudios, habilidades } = req.body;

        const candidato = await Candidato.findOne({ id: id });
        if (!candidato) return res.json({ success: false, error: 'Candidato no encontrado' });

        if (puestoRequerido !== undefined) candidato.puestoRequerido = limpiarYCorregirTexto(puestoRequerido);
        if (nombre !== undefined) candidato.nombre = limpiarYCorregirTexto(nombre);
        if (dni !== undefined) candidato.dni = limpiarYCorregirTexto(dni);
        if (email !== undefined) candidato.email = limpiarYCorregirTexto(email);
        if (telefono !== undefined) candidato.telefono = limpiarYCorregirTexto(telefono);
        if (direccion !== undefined) candidato.direccion = limpiarYCorregirTexto(direccion);
        if (disponibilidad !== undefined) candidato.disponibilidad = limpiarYCorregirTexto(disponibilidad);
        if (resumen !== undefined) candidato.resumen = limpiarYCorregirTexto(resumen);
        if (experiencia !== undefined) candidato.experiencia = limpiarYCorregirTexto(experiencia);
        if (estudios !== undefined) candidato.estudios = limpiarYCorregirTexto(estudios);
        if (habilidades !== undefined) candidato.habilidades = limpiarYCorregirTexto(habilidades);

        await candidato.save();
        return res.json({ success: true, message: 'Legajo editado y actualizado correctamente.' });

    } catch (error) {
        console.error("Error al editar candidato:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// 🌐 Endpoint para actualizar / subir archivos desde el Panel de Gestión
app.post('/api/candidatos/actualizar-archivos/:id', authMiddleware, upload.any(), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });
        
        if (!candidato) return res.json({ success: false, error: 'Candidato no encontrado' });

        if (req.files && req.files.length > 0) {
            const cvFile = req.files.find(f => f.fieldname === 'cvFile' || f.fieldname.includes('Cv'));
            const fotoPerfil = req.files.find(f => f.fieldname === 'fotoPerfil' || f.fieldname.includes('Foto'));

            if (cvFile) {
                candidato.cvData = cvFile.buffer.toString('base64');
                candidato.cvContentType = cvFile.mimetype;
                candidato.nombreArchivoCV = cvFile.originalname;
            }

            if (fotoPerfil) {
                candidato.fotoData = fotoPerfil.buffer.toString('base64');
                candidato.fotoContentType = fotoPerfil.mimetype;
            }

            await candidato.save();
            return res.json({ success: true, message: 'Archivos actualizados con éxito' });
        }
        return res.json({ success: false, error: 'No se detectaron archivos' });
    } catch (error) {
        console.error("Error en actualización desde panel:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// 👁️ Endpoint dinámico para servir la foto de perfil
app.get('/api/foto/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });
        if (!candidato || !candidato.fotoData) return res.status(404).send('Foto no encontrada');

        const imgBuffer = Buffer.from(candidato.fotoData, 'base64');
        res.setHeader('Content-Type', candidato.fotoContentType || 'image/jpeg');
        return res.send(imgBuffer);
    } catch (e) {
        return res.status(500).send('Error al cargar la foto');
    }
});

// 🏢 Endpoint: Genera el CV con Foto para Empresas
app.get('/api/cv-empresa/:id', authMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });

        if (!candidato) return res.status(404).send('Candidato no encontrado.');

        const fotoSrc = candidato.fotoData ? `/api/foto/${candidato.id}` : '';

        const htmlCV = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>CV Corporativo con Foto - ${candidato.nombre}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; color: #333; line-height: 1.6; max-width: 800px; margin: 40px auto; }
                .header { display: flex; align-items: center; gap: 25px; border-bottom: 2px solid #0056b3; padding-bottom: 20px; margin-bottom: 20px; }
                .foto { width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #0056b3; }
                .info h1 { margin: 0; color: #0056b3; font-size: 24px; text-transform: uppercase; }
                .section { margin-bottom: 20px; }
                .section h3 { border-bottom: 1px solid #ddd; padding-bottom: 5px; color: #333; font-size: 15px; text-transform: uppercase; }
                .btn-print { margin-top: 30px; padding: 10px 20px; background: #0056b3; color: white; border: none; border-radius: 5px; cursor: pointer; display: block; margin: 30px auto; }
                @media print { .btn-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="header">
                ${fotoSrc ? `<img src="${fotoSrc}" class="foto" alt="Foto de perfil">` : ''}
                <div class="info">
                    <h1>${candidato.nombre}</h1>
                    <p><strong>Puesto al que aplica:</strong> ${candidato.puestoRequerido}</p>
                    <p>📧 ${candidato.email} | 📞 ${candidato.telefono} | 📍 ${candidato.direccion}</p>
                    <p><strong>Disponibilidad:</strong> ${candidato.disponibilidad}</p>
                </div>
            </div>
            <div class="section"><h3>Resumen Profesional</h3><p>${candidato.resumen || 'No especificado'}</p></div>
            <div class="section"><h3>Experiencia Laboral</h3><p style="white-space: pre-line;">${candidato.experiencia || candidato.textoExtraidoCV || 'No especificada'}</p></div>
            <div class="section"><h3>Estudios y Formación</h3><p style="white-space: pre-line;">${candidato.estudios || 'No especificados'}</p></div>
            <div class="section"><h3>Habilidades</h3><p>${candidato.habilidades || 'No especificadas'}</p></div>
            <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
        </body>
        </html>`;
        return res.send(htmlCV);
    } catch (error) {
        return res.status(500).send('Error al generar el CV corporativo.');
    }
});

// 📥 Endpoint para descargar el CV original
app.get('/api/descargar-cv/:id', authMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });
        
        if (!candidato || !candidato.cvData) return res.status(404).send('Archivo de CV no disponible.');

        const cvBuffer = Buffer.from(candidato.cvData, 'base64');
        res.setHeader('Content-Type', candidato.cvContentType || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${candidato.nombreArchivoCV || 'CV_Postulante.pdf'}"`);
        return res.send(cvBuffer);
    } catch (error) {
        return res.status(500).send('Error al procesar la descarga.');
    }
});

// 🚀 EL ARREGLO MÁGICO DE MEMORIA: Enviar la lista de candidatos sin incluir los pesados PDFs
app.get('/api/candidatos', authMiddleware, async (req, res) => {
    try {
        const listaCandidatos = await Candidato.find().select('-cvData -fotoData').sort({ id: -1 }).lean();
        
        const listaOptimizada = listaCandidatos.map(c => ({
            ...c,
            cvData: c.nombreArchivoCV ? 'true' : '',
            fotoData: c.fotoContentType ? 'true' : ''
        }));

        return res.json({ success: true, candidatos: listaOptimizada });
    } catch (error) {
        console.error("🚨 Error al obtener lista de candidatos:", error);
        return res.json({ success: false, error: error.message });
    }
});

app.delete('/api/candidatos/:id', authMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        await Candidato.deleteOne({ id: id });
        return res.json({ success: true });
    } catch (error) {
        return res.json({ success: false });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const basicAuth = require('express-basic-auth');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 🔒 Protección del Panel de Gestión
const authMiddleware = basicAuth({
    users: { 'MitrabajoTDF': 'EmpleoRG' },
    challenge: true,
    realm: 'Portal de Reclutamiento Protegido - Mi Trabajo TDF'
});

app.get('/', authMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/formulario.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'formulario.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const mongoURI = process.env.MONGODB_URI;

mongoose.connect(mongoURI)
    .then(() => console.log('✅ Base de datos MongoDB conectada con éxito.'))
    .catch(err => console.error('❌ Error al conectar a MongoDB:', err));

const candidatoSchema = new mongoose.Schema({
    id: Number,
    empresa: String,
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
    habilidadesDuras: String,     
    habilidadesBlandas: String,   
    cvData: String,           
    cvContentType: String,
    nombreArchivoCV: String,
    fotoData: String,         
    fotoContentType: String,
    cartaData: String,        
    cartaContentType: String,
    nombreArchivoCarta: String,
    textoExtraidoCV: String, 
    fecha: String,
    pagado: { type: Boolean, default: false }
});

const Candidato = mongoose.model('Candidato', candidatoSchema);

async function enviarAlertaEmail(candidato) {
    try {
        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Mi Trabajo TDF <onboarding@resend.dev>',
                to: ['mitrabajotdf@gmail.com'],
                subject: `🔔 ¡Nuevo CV Cargado: ${candidato.nombre} (${candidato.puestoRequerido})!`,
                html: `<div style="font-family: Arial, sans-serif; padding: 20px;"><h2>¡Nuevo Postulante Registrado! 🚀</h2><p><strong>👤 Nombre:</strong> ${candidato.nombre}</p><p><strong>💼 Puesto:</strong> ${candidato.puestoRequerido}</p></div>`
            })
        });
    } catch (error) {
        console.error('Error al enviar alerta email:', error);
    }
}

function limpiarYCorregirTexto(texto) {
    if (!texto) return '';
    return texto.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
}

function limpiarNombreArchivo(nombre, porDefecto) {
    const base = nombre || porDefecto;
    return base
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function fusionarYOptimizarCVConGemini({ cvBuffer, cvMimeType, textoPlanoExtraido, cartaBuffer, cartaMimeType, textoCartaExtraido, datosFormulario }) {
    if (!process.env.GEMINI_API_KEY) return null;
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `Eres un experto en Reclutamiento y Sistemas ATS (Applicant Tracking Systems).
Tu objetivo es crear un CV ATS Optimizado, completo, lineal y profesional para el candidato, fusionando TODA la información disponible en tres fuentes:
1) El documento de CV original adjunto (que puede tener diseño en columnas, tablas o texto desordenado).
2) La Carta de Recomendación o Referencias Laborales adjunta (si el candidato subió una).
3) Los datos que el candidato escribió manualmente en el formulario web.

REGLAS ESTRICTAS DE FUSIÓN:
- NO omitas ninguna experiencia laboral, empresa, año, curso, capacitación, licencia, carnet o habilidad que figure en el CV adjunto, en la Carta de Recomendación O en los campos manuales del formulario.
- Si el candidato adjuntó una Carta de Recomendación o Referencias, extrae qué empresa o referente lo recomienda, qué puesto o tareas avala, sus fortalezas destacadas y agrégalo claramente dentro de la sección de "experiencia" y menciona ese respaldo en el "resumen".
- Si el candidato escribió poco en el formulario, COMPLEMENTA Y EXPANDE esa información con todo el historial laboral, cursos y conocimientos que aparecen en los documentos adjuntos.
- Corrige errores de tipeo y redacta de forma profesional y lineal para lectura ATS.

DATOS ESCRITOS MANUALMENTE EN EL FORMULARIO:
- Puesto al que aplica: ${datosFormulario.puestoRequerido || ''}
- Resumen escrito en formulario: ${datosFormulario.resumen || ''}
- Experiencia escrita en formulario: ${datosFormulario.experiencia || ''}
- Estudios escritos en formulario: ${datosFormulario.estudios || ''}
- Habilidades escritas en formulario: ${datosFormulario.habilidades || ''}

${textoPlanoExtraido ? `TEXTO EXTRAÍDO AUXILIAR DEL CV:\n${textoPlanoExtraido}\n` : ''}
${textoCartaExtraido ? `TEXTO EXTRAÍDO DE LA CARTA DE RECOMENDACIÓN:\n${textoCartaExtraido}\n` : ''}

Devuelve ESTRICTAMENTE un objeto JSON con esta estructura exacta:
{
  "resumen": "Perfil profesional integral de 3 a 5 líneas destacando años de experiencia, rubros, especialidades, licencias clave y si cuenta con carta de recomendación/referencias comprobables.",
  "experiencia": "Lista cronológica lineal en renglones separados (usando viñetas •) con TODAS las experiencias laborales (del CV, formulario y avales/referencias de la carta de recomendación), indicando período/duración, puesto, empresa y funciones.",
  "estudios": "Lista secuencial en renglones separados (usando viñetas •) con nivel de estudios, TODOS los cursos realizados, capacitaciones técnicas y carnets habilitantes.",
  "habilidades": "Todas las habilidades técnicas, operativas, licencias, manejo de maquinaria/software y competencias separadas por ' • '.",
  "habilidadesDuras": "Habilidades técnicas, herramientas, maquinaria, carnets e idiomas separados por ' • '.",
  "habilidadesBlandas": "Competencias interpersonales y actitudes laborales (incluyendo cualidades destacadas en la carta de recomendación) separadas por ' • '.",
  "textoCompletoIntegrado": "Transcripción completa de toda la información del candidato y su carta de recomendación para el motor de búsqueda interno."
}`;

        const parts = [prompt];

        if (cvBuffer && (cvMimeType === 'application/pdf' || (cvMimeType && cvMimeType.startsWith('image/')))) {
            parts.push({
                inlineData: {
                    data: cvBuffer.toString('base64'),
                    mimeType: cvMimeType
                }
            });
        }

        if (cartaBuffer && (cartaMimeType === 'application/pdf' || (cartaMimeType && cartaMimeType.startsWith('image/')))) {
            parts.push({
                inlineData: {
                    data: cartaBuffer.toString('base64'),
                    mimeType: cartaMimeType
                }
            });
        }

        const result = await model.generateContent(parts);
        const textResponse = result.response.text().trim();
        return JSON.parse(textResponse);
    } catch (error) {
        console.error("Error al fusionar y optimizar CV con Gemini:", error);
        return null;
    }
}

app.post('/api/enviar-postulacion', upload.any(), async (req, res) => {
    try {
        let { empresa, puestoRequerido, nombre, dni, email, telefono, direccion, disponibilidad, resumen, experiencia, estudios, habilidades, habilidadesDuras, habilidadesBlandas } = req.body;
        
        let cvData = '', cvContentType = '', nombreArchivoOriginal = '';
        let cvBuffer = null;
        let fotoData = '', fotoContentType = '';
        let cartaData = '', cartaContentType = '', nombreArchivoCarta = '';
        let cartaBuffer = null;
        let textoPlanoExtraido = '';
        let textoCartaExtraido = '';

        if (req.files && req.files.length > 0) {
            const cvFile = req.files.find(f => f.fieldname === 'cvFile');
            const fotoPerfil = req.files.find(f => f.fieldname === 'fotoPerfil');
            const cartaFile = req.files.find(f => f.fieldname === 'cartaRecomendacion');

            if (cvFile) {
                cvBuffer = cvFile.buffer;
                cvData = cvFile.buffer.toString('base64');
                cvContentType = cvFile.mimetype;
                nombreArchivoOriginal = cvFile.originalname;

                try {
                    if (cvContentType === 'application/pdf') {
                        const pdfDataParsed = await pdfParse(cvFile.buffer);
                        textoPlanoExtraido = pdfDataParsed.text;
                    } else if (cvContentType.includes('wordprocessingml') || nombreArchivoOriginal.endsWith('.docx')) {
                        const wordResult = await mammoth.extractRawText({ buffer: cvFile.buffer });
                        textoPlanoExtraido = wordResult.value;
                    }
                } catch (err) {
                    console.error('Aviso: extracción de texto auxiliar de CV omitida:', err.message);
                }
            }

            if (fotoPerfil) {
                fotoData = fotoPerfil.buffer.toString('base64');
                fotoContentType = fotoPerfil.mimetype;
            }

            if (cartaFile) {
                cartaBuffer = cartaFile.buffer;
                cartaData = cartaFile.buffer.toString('base64');
                cartaContentType = cartaFile.mimetype;
                nombreArchivoCarta = cartaFile.originalname;

                try {
                    if (cartaContentType === 'application/pdf') {
                        const pdfCartaParsed = await pdfParse(cartaFile.buffer);
                        textoCartaExtraido = pdfCartaParsed.text;
                    } else if (cartaContentType.includes('wordprocessingml') || nombreArchivoCarta.endsWith('.docx')) {
                        const wordCartaResult = await mammoth.extractRawText({ buffer: cartaFile.buffer });
                        textoCartaExtraido = wordCartaResult.value;
                    }
                } catch (err) {
                    console.error('Aviso: extracción de texto auxiliar de Carta omitida:', err.message);
                }
            }
        }

        const resultadoGemini = await fusionarYOptimizarCVConGemini({
            cvBuffer,
            cvMimeType: cvContentType,
            textoPlanoExtraido,
            cartaBuffer,
            cartaMimeType: cartaContentType,
            textoCartaExtraido,
            datosFormulario: { puestoRequerido, resumen, experiencia, estudios, habilidades }
        });

        if (resultadoGemini) {
            resumen = resultadoGemini.resumen || resumen;
            experiencia = resultadoGemini.experiencia || experiencia;
            estudios = resultadoGemini.estudios || estudios;
            habilidades = resultadoGemini.habilidades || habilidades;
            habilidadesDuras = resultadoGemini.habilidadesDuras || habilidadesDuras || habilidades;
            habilidadesBlandas = resultadoGemini.habilidadesBlandas || habilidadesBlandas;
            if (resultadoGemini.textoCompletoIntegrado) {
                textoPlanoExtraido = `${textoPlanoExtraido}\n${textoCartaExtraido}\n${resultadoGemini.textoCompletoIntegrado}`.trim();
            }
        }

        const candidatoId = Date.now();
        const nuevoCandidato = new Candidato({
            id: candidatoId,
            empresa: limpiarYCorregirTexto(empresa) || 'Base de Datos General',
            puestoRequerido: limpiarYCorregirTexto(puestoRequerido) || 'General',
            nombre: limpiarYCorregirTexto(nombre) || 'Postulante',
            dni: limpiarYCorregirTexto(dni),
            email: limpiarYCorregirTexto(email),
            telefono: limpiarYCorregirTexto(telefono),
            direccion: limpiarYCorregirTexto(direccion),
            disponibilidad: limpiarYCorregirTexto(disponibilidad) || 'Inmediata',
            resumen: limpiarYCorregirTexto(resumen),
            experiencia: limpiarYCorregirTexto(experiencia),
            estudios: limpiarYCorregirTexto(estudios),
            habilidades: limpiarYCorregirTexto(habilidades),
            habilidadesDuras: limpiarYCorregirTexto(habilidadesDuras),
            habilidadesBlandas: limpiarYCorregirTexto(habilidadesBlandas),
            cvData, cvContentType, nombreArchivoCV: nombreArchivoOriginal,
            fotoData, fotoContentType,
            cartaData, cartaContentType, nombreArchivoCarta,
            textoExtraidoCV: limpiarYCorregirTexto(textoPlanoExtraido || `${resumen} ${experiencia} ${estudios} ${habilidades}`),
            fecha: new Date().toLocaleString(),
            pagado: false
        });

        await nuevoCandidato.save();
        enviarAlertaEmail(nuevoCandidato);

        return res.json({ success: true, candidatoId, message: '¡Postulación procesada y estructurada con IA!' });
    } catch (error) {
        console.error("Error crítico en postulación:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/candidatos/editar/:id', authMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { empresa, puestoRequerido, nombre, dni, email, telefono, direccion, resumen, experiencia, estudios, habilidades } = req.body;
        const candidato = await Candidato.findOne({ id: id });
        if (!candidato) return res.json({ success: false, error: 'Candidato no encontrado' });

        if (empresa !== undefined) candidato.empresa = limpiarYCorregirTexto(empresa);
        if (puestoRequerido !== undefined) candidato.puestoRequerido = limpiarYCorregirTexto(puestoRequerido);
        if (nombre !== undefined) candidato.nombre = limpiarYCorregirTexto(nombre);
        if (dni !== undefined) candidato.dni = limpiarYCorregirTexto(dni);
        if (email !== undefined) candidato.email = limpiarYCorregirTexto(email);
        if (telefono !== undefined) candidato.telefono = limpiarYCorregirTexto(telefono);
        if (direccion !== undefined) candidato.direccion = limpiarYCorregirTexto(direccion);
        if (resumen !== undefined) candidato.resumen = limpiarYCorregirTexto(resumen);
        if (experiencia !== undefined) candidato.experiencia = limpiarYCorregirTexto(experiencia);
        if (estudios !== undefined) candidato.estudios = limpiarYCorregirTexto(estudios);
        if (habilidades !== undefined) candidato.habilidades = limpiarYCorregirTexto(habilidades);

        await candidato.save();
        return res.json({ success: true, message: 'Legajo editado correctamente.' });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/candidatos/actualizar-archivos/:id', authMiddleware, upload.any(), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });
        if (!candidato) return res.json({ success: false, error: 'Candidato no encontrado' });

        if (req.files && req.files.length > 0) {
            const cvFile = req.files.find(f => f.fieldname === 'cvFile');
            const fotoPerfil = req.files.find(f => f.fieldname === 'fotoPerfil');
            const cartaFile = req.files.find(f => f.fieldname === 'cartaRecomendacion');

            if (cvFile) {
                candidato.cvData = cvFile.buffer.toString('base64');
                candidato.cvContentType = cvFile.mimetype;
                candidato.nombreArchivoCV = cvFile.originalname;
            }
            if (fotoPerfil) {
                candidato.fotoData = fotoPerfil.buffer.toString('base64');
                candidato.fotoContentType = fotoPerfil.mimetype;
            }
            if (cartaFile) {
                candidato.cartaData = cartaFile.buffer.toString('base64');
                candidato.cartaContentType = cartaFile.mimetype;
                candidato.nombreArchivoCarta = cartaFile.originalname;
            }
            await candidato.save();
            return res.json({ success: true, message: 'Archivos actualizados con éxito' });
        }
        return res.json({ success: false, error: 'No se detectaron archivos' });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

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

app.get('/api/descargar-foto/:id', authMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });
        if (!candidato || !candidato.fotoData) return res.status(404).send('Foto de perfil no disponible.');
        const fotoBuffer = Buffer.from(candidato.fotoData, 'base64');
        const ext = candidato.fotoContentType ? (candidato.fotoContentType.split('/')[1] || 'jpg').replace(/[^a-zA-Z0-9]/g, '') : 'jpg';
        const nombreSeguro = limpiarNombreArchivo(`Foto_${candidato.nombre || id}.${ext}`, `Foto_${id}.jpg`);
        res.setHeader('Content-Type', candidato.fotoContentType || 'image/jpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${nombreSeguro}"`);
        return res.send(fotoBuffer);
    } catch (error) {
        return res.status(500).send('Error al procesar la descarga de la foto.');
    }
});

app.get('/api/descargar-carta/:id', authMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });
        if (!candidato || !candidato.cartaData) return res.status(404).send('Carta de recomendación no disponible.');
        const cartaBuffer = Buffer.from(candidato.cartaData, 'base64');
        const nombreSeguro = limpiarNombreArchivo(candidato.nombreArchivoCarta, `Carta_${candidato.nombre || id}.pdf`);
        res.setHeader('Content-Type', candidato.cartaContentType || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${nombreSeguro}"`);
        return res.send(cartaBuffer);
    } catch (error) {
        return res.status(500).send('Error al procesar la descarga.');
    }
});

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
            <title>CV Corporativo - ${candidato.nombre}</title>
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
                    <p>📧 ${candidato.email} | 📞 ${candidato.telefono} | 📍 ${candidato.direccion || 'No especificada'}</p>
                    <p><strong>Disponibilidad:</strong> ${candidato.disponibilidad}</p>
                </div>
            </div>
            <div class="section"><h3>Resumen Profesional</h3><p>${candidato.resumen || 'No especificado'}</p></div>
            <div class="section"><h3>Experiencia Laboral</h3><p style="white-space: pre-line;">${candidato.experiencia || 'No especificada'}</p></div>
            <div class="section"><h3>Estudios y Formación</h3><p style="white-space: pre-line;">${candidato.estudios || 'No especificados'}</p></div>
            <div class="section"><h3>Habilidades Técnicas (Duras)</h3><p>${candidato.habilidadesDuras || candidato.habilidades || 'No especificadas'}</p></div>
            <div class="section"><h3>Habilidades y Competencias (Blandas)</h3><p>${candidato.habilidadesBlandas || 'No especificadas'}</p></div>
            <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
        </body>
        </html>`;
        return res.send(htmlCV);
    } catch (error) {
        return res.status(500).send('Error al generar el CV corporativo.');
    }
});

app.get('/api/descargar-cv/:id', authMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });
        if (!candidato || !candidato.cvData) return res.status(404).send('Archivo de CV no disponible.');
        const cvBuffer = Buffer.from(candidato.cvData, 'base64');
        const nombreSeguro = limpiarNombreArchivo(candidato.nombreArchivoCV, `CV_${candidato.nombre || id}.pdf`);
        res.setHeader('Content-Type', candidato.cvContentType || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${nombreSeguro}"`);
        return res.send(cvBuffer);
    } catch (error) {
        console.error('Error al descargar CV:', error);
        return res.status(500).send('Error al procesar la descarga.');
    }
});

app.post('/api/analizar-requisitos', authMiddleware, upload.single('archivoRequisitos'), async (req, res) => {
    try {
        if (!req.file) return res.json({ success: false, error: 'No se subió ningún archivo' });
        let textoPlano = '';
        if (req.file.mimetype === 'application/pdf') {
            try {
                const pdfData = await pdfParse(req.file.buffer);
                textoPlano = pdfData.text;
            } catch (e) {}
        } else if (req.file.mimetype.includes('wordprocessingml') || req.file.originalname.endsWith('.docx')) {
            const wordResult = await mammoth.extractRawText({ buffer: req.file.buffer });
            textoPlano = wordResult.value;
        }

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `Analiza la siguiente descripción de puesto o requisitos enviados por una empresa. Extrae el título sugerido del puesto y las palabras clave más importantes (habilidades duras, herramientas, certificaciones y competencias clave) separadas por un espacio, para usarlas en un motor de búsqueda ATS. Responde ESTRICTAMENTE en formato JSON puro:
        {"titulo": "Título del puesto (ej: Ayudante de Cocina)", "keywords": "palabra1 palabra2 palabra3..."}
        ${textoPlano ? `Texto extraído: ${textoPlano}` : ''}`;

        const parts = [prompt];
        if (req.file.mimetype === 'application/pdf') {
            parts.push({
                inlineData: {
                    data: req.file.buffer.toString('base64'),
                    mimeType: 'application/pdf'
                }
            });
        }

        const result = await model.generateContent(parts);
        const textResponse = result.response.text().trim();
        return res.json({ success: true, datos: JSON.parse(textResponse) });
    } catch (error) {
        console.error("Error al analizar requisitos:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/autocompletar-cv', upload.single('cvFile'), async (req, res) => {
    try {
        if (!req.file) return res.json({ success: false, error: 'No se subió archivo' });
        let textoPlano = '';
        if (req.file.mimetype === 'application/pdf') {
            try {
                const pdfData = await pdfParse(req.file.buffer);
                textoPlano = pdfData.text;
            } catch (e) {}
        } else if (req.file.mimetype.includes('wordprocessingml') || req.file.originalname.endsWith('.docx')) {
            const wordResult = await mammoth.extractRawText({ buffer: req.file.buffer });
            textoPlano = wordResult.value;
        }

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `Analiza este CV completo (incluso si tiene diseño en columnas, tablas o recuadros) y extrae toda la información estructurada de forma lineal para un sistema ATS en formato JSON puro. Si no encuentras un dato personal, déjalo vacío ("").
        {
          "nombre": "Nombre y apellido completo",
          "dni": "Documento DNI (solo números, sin puntos)",
          "email": "Correo electrónico",
          "telefono": "Número de teléfono",
          "direccion": "Domicilio y localidad",
          "resumen": "Resumen profesional integral redactado en base a toda su trayectoria, conocimientos y perfil",
          "experiencia": "Todas las experiencias laborales detalladas en renglones separados con viñetas (•), incluyendo empresa, puesto, duración/años y tareas",
          "estudios": "Todos los estudios, cursos realizados, capacitaciones técnicas y carnets en renglones separados con viñetas (•)",
          "habilidades": "Lista completa de habilidades técnicas, conocimientos, licencias y aptitudes separadas por ' • '"
        }
        ${textoPlano ? `Texto auxiliar del CV: ${textoPlano}` : ''}`;

        const parts = [prompt];
        if (req.file.mimetype === 'application/pdf') {
            parts.push({
                inlineData: {
                    data: req.file.buffer.toString('base64'),
                    mimeType: 'application/pdf'
                }
            });
        }

        const result = await model.generateContent(parts);
        const textResponse = result.response.text().trim();
        return res.json({ success: true, datos: JSON.parse(textResponse) });
    } catch (error) {
        console.error("Error en autocompletado:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// 🔄 RUTA DE MIGRADOR AUTOMÁTICO SEGURO (Procesa uno por uno en segundo plano sin saturar memoria ni cortar la página)
let migracionEnCurso = false;

app.get('/api/migrar-legajos-ia', authMiddleware, async (req, res) => {
    if (migracionEnCurso) {
        return res.json({
            success: true,
            message: '⏳ La migración ya se está ejecutando en segundo plano. Podés ver el avance en los Logs de Render o recargar tu panel en 2 minutos.'
        });
    }

    migracionEnCurso = true;
    res.json({
        success: true,
        message: '🚀 ¡Migración iniciada en segundo plano! Tus 38 legajos se están actualizando uno por uno de forma segura. En unos 2 minutos recargá tu Panel de Gestión (CTRL + F5) para ver todos los CVs optimizados.'
    });

    (async () => {
        try {
            const listaIds = await Candidato.find({}, { id: 1, nombre: 1 }).lean();
            let actualizados = 0;
            console.log(`🔄 Iniciando migración segura de ${listaIds.length} legajos...`);

            for (const item of listaIds) {
                try {
                    const candidato = await Candidato.findOne({ id: item.id });
                    if (candidato && (candidato.cvData || candidato.cartaData)) {
                        const cvBuffer = candidato.cvData ? Buffer.from(candidato.cvData, 'base64') : null;
                        const cartaBuffer = candidato.cartaData ? Buffer.from(candidato.cartaData, 'base64') : null;

                        let textoPlanoExtraido = candidato.textoExtraidoCV || '';
                        let textoCartaExtraido = '';

                        if (cvBuffer && (candidato.cvContentType?.includes('wordprocessingml') || candidato.nombreArchivoCV?.endsWith('.docx'))) {
                            try {
                                const wordResult = await mammoth.extractRawText({ buffer: cvBuffer });
                                textoPlanoExtraido = wordResult.value || textoPlanoExtraido;
                            } catch (e) {}
                        }

                        if (cartaBuffer && (candidato.cartaContentType?.includes('wordprocessingml') || candidato.nombreArchivoCarta?.endsWith('.docx'))) {
                            try {
                                const wordCarta = await mammoth.extractRawText({ buffer: cartaBuffer });
                                textoCartaExtraido = wordCarta.value || '';
                            } catch (e) {}
                        }

                        const resultadoGemini = await fusionarYOptimizarCVConGemini({
                            cvBuffer,
                            cvMimeType: candidato.cvContentType || 'application/pdf',
                            textoPlanoExtraido,
                            cartaBuffer,
                            cartaMimeType: candidato.cartaContentType || 'application/pdf',
                            textoCartaExtraido,
                            datosFormulario: {
                                puestoRequerido: candidato.puestoRequerido,
                                resumen: candidato.resumen,
                                experiencia: candidato.experiencia,
                                estudios: candidato.estudios,
                                habilidades: candidato.habilidades
                            }
                        });

                        if (resultadoGemini) {
                            candidato.resumen = limpiarYCorregirTexto(resultadoGemini.resumen || candidato.resumen);
                            candidato.experiencia = limpiarYCorregirTexto(resultadoGemini.experiencia || candidato.experiencia);
                            candidato.estudios = limpiarYCorregirTexto(resultadoGemini.estudios || candidato.estudios);
                            candidato.habilidades = limpiarYCorregirTexto(resultadoGemini.habilidades || candidato.habilidades);
                            candidato.habilidadesDuras = limpiarYCorregirTexto(resultadoGemini.habilidadesDuras || candidato.habilidadesDuras);
                            candidato.habilidadesBlandas = limpiarYCorregirTexto(resultadoGemini.habilidadesBlandas || candidato.habilidadesBlandas);

                            if (resultadoGemini.textoCompletoIntegrado) {
                                candidato.textoExtraidoCV = limpiarYCorregirTexto(resultadoGemini.textoCompletoIntegrado);
                            }

                            await candidato.save();
                            actualizados++;
                            console.log(`✅ [${actualizados}/${listaIds.length}] Legajo actualizado: ${candidato.nombre}`);
                        }
                        // Pausa breve de 2 segundos entre cada candidato para cuidar el límite de la API gratuita de Gemini
                        await new Promise(r => setTimeout(r, 2000));
                    }
                } catch (errIndividual) {
                    console.error(`⚠️ Error al migrar legajo ${item.nombre}:`, errIndividual.message);
                }
            }
            console.log(`🎉 ¡Migración finalizada! Se actualizaron ${actualizados} legajos con éxito.`);
        } catch (errorGeneral) {
            console.error('❌ Error general en migración:', errorGeneral);
        } finally {
            migracionEnCurso = false;
        }
    })();
});

app.get('/api/candidatos', authMiddleware, async (req, res) => {
    try {
        const rawCandidatos = await Candidato.find({}, {
            id: 1, empresa: 1, puestoRequerido: 1, nombre: 1, dni: 1, email: 1,
            telefono: 1, direccion: 1, disponibilidad: 1, resumen: 1, experiencia: 1,
            estudios: 1, habilidades: 1, habilidadesDuras: 1, habilidadesBlandas: 1,
            cvContentType: 1, nombreArchivoCV: 1, fotoContentType: 1,
            cartaContentType: 1, nombreArchivoCarta: 1, textoExtraidoCV: 1, fecha: 1, pagado: 1,
            tieneCV: { $gt: [{ $strLenCP: { $ifNull: ["$cvData", ""] } }, 0] },
            tieneFoto: { $gt: [{ $strLenCP: { $ifNull: ["$fotoData", ""] } }, 0] },
            tieneCarta: { $gt: [{ $strLenCP: { $ifNull: ["$cartaData", ""] } }, 0] }
        }).lean();

        const listaCandidatos = rawCandidatos.map(c => ({
            ...c,
            cvData: c.tieneCV ? 'disponible' : '',
            fotoData: c.tieneFoto ? 'disponible' : '',
            cartaData: c.tieneCarta ? 'disponible' : ''
        })).sort((a, b) => b.id - a.id);

        return res.json({ success: true, candidatos: listaCandidatos });
    } catch (error) {
        return res.json({ success: false, error: error.message });
    }
});

app.delete('/api/candidatos/:id', authMiddleware, async (req, res) => {
    try {
        await Candidato.deleteOne({ id: Number(req.params.id) });
        return res.json({ success: true });
    } catch (error) {
        return res.json({ success: false });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor de Mi Trabajo TDF corriendo en puerto ${PORT}`);
});

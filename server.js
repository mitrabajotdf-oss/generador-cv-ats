const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const basicAuth = require('express-basic-auth');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

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

app.get('/formulario.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'formulario.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage() });

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
    habilidadesDuras: String,     // 🛠️ Habilidades Técnicas (Duras)
    habilidadesBlandas: String,   // 💡 Habilidades y Competencias (Blandas)
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

// 🧠 Análisis inteligente de CVs con Google Gemini (Estable y seguro mediante fetch)
async function analizarCVConGemini(textoCrudo) {
    if (!process.env.GEMINI_API_KEY || !textoCrudo || textoCrudo.length < 20) return null;
    try {
        const prompt = `Analiza el siguiente texto de un currículum vitae y extrae la información estructurada estrictamente en formato JSON puro (sin bloques de código markdown, solo el objeto JSON):
        {
          "resumen": "Resumen profesional o perfil redactado.",
          "experiencia": "Experiencia laboral detallada.",
          "estudios": "Estudios y formaciones.",
          "habilidadesDuras": "Habilidades técnicas, herramientas o software.",
          "habilidadesBlandas": "Competencias interpersonales y aptitudes."
        }
        Texto del CV:
        ${textoCrudo}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) return null;

        const data = await response.json();
        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            let textResponse = data.candidates[0].content.parts[0].text.trim();
            if (textResponse.startsWith('```json')) {
                textResponse = textResponse.replace(/^```json/, '').replace(/```$/, '').trim();
            } else if (textResponse.startsWith('```')) {
                textResponse = textResponse.replace(/^```/, '').replace(/```$/, '').trim();
            }
            return JSON.parse(textResponse);
        }
        return null;
    } catch (error) {
        console.error("Error al procesar con la IA de Gemini:", error);
        return null;
    }
}

// 🌐 Endpoint de Recepción de Postulación con procesamiento ATS por IA
app.post('/api/enviar-postulacion', upload.any(), async (req, res) => {
    try {
        let { puestoRequerido, nombre, dni, email, telefono, direccion, disponibilidad, resumen, experiencia, estudios, habilidades, habilidadesDuras, habilidadesBlandas } = req.body;
        
        let cvData = '', cvContentType = '', nombreArchivoOriginal = '';
        let fotoData = '', fotoContentType = '';
        let cartaData = '', cartaContentType = '', nombreArchivoCarta = '';
        let textoPlanoExtraido = '';

        if (req.files && req.files.length > 0) {
            const cvFile = req.files.find(f => f.fieldname === 'cvFile');
            const fotoPerfil = req.files.find(f => f.fieldname === 'fotoPerfil');
            const cartaFile = req.files.find(f => f.fieldname === 'cartaRecomendacion');

            if (cvFile) {
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
                    console.error('Error al extraer texto del documento:', err);
                }
            }

            if (fotoPerfil) {
                fotoData = fotoPerfil.buffer.toString('base64');
                fotoContentType = fotoPerfil.mimetype;
            }
            if (cartaFile) {
                cartaData = cartaFile.buffer.toString('base64');
                cartaContentType = cartaFile.mimetype;
                nombreArchivoCarta = cartaFile.originalname;
            }
        }

        // Ejecutar IA para estructurar el perfil ATS si se extrajo texto del archivo
        if (textoPlanoExtraido) {
            const resultadoGemini = await analizarCVConGemini(textoPlanoExtraido);
            if (resultadoGemini) {
                if (!resumen) resumen = resultadoGemini.resumen;
                if (!experiencia) experiencia = resultadoGemini.experiencia;
                if (!estudios) estudios = resultadoGemini.estudios;
                if (!habilidadesDuras) habilidadesDuras = resultadoGemini.habilidadesDuras;
                if (!habilidadesBlandas) habilidadesBlandas = resultadoGemini.habilidadesBlandas;
            } else {
                experiencia = experiencia || textoPlanoExtraido;
            }
        }

        const candidatoId = Date.now();
        const nuevoCandidato = new Candidato({
            id: candidatoId,
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
            textoExtraidoCV: textoPlanoExtraido || experiencia || '',
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

app.get('/api/candidatos', authMiddleware, async (req, res) => {
    try {
        const lista = await Candidato.find().select('-cvData -fotoData -cartaData').sort({ id: -1 }).lean();
        return res.json({ success: true, candidatos: lista });
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

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
        const urlResend = ['https:', '', 'api.resend.com', 'emails'].join('/');
        await fetch(urlResend, {
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

function extraerJSONLimpio(texto) {
    if (!texto) return null;
    let limpio = texto.trim();
    limpio = limpio.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
    const inicio = limpio.indexOf('{');
    const fin = limpio.lastIndexOf('}');
    if (inicio !== -1 && fin !== -1) {
        limpio = limpio.substring(inicio, fin + 1);
    }
    return JSON.parse(limpio);
}

// Detecta si un buffer binario es un archivo PDF real mirando su cabecera "%PDF"
function esBufferPDF(buffer) {
    if (!buffer || buffer.length < 4) return false;
    return buffer.slice(0, 4).toString() === '%PDF';
}

// Elimina bloques crudos anteriores si un legajo había usado el respaldo local antes
function limpiarTextoPrevioFormulario(texto) {
    if (!texto) return '';
    return texto.split('--- DETALLE COMPLETO EXTRAÍDO DEL CV ORIGINAL ---')[0]
                .split('--- CARTA DE RECOMENDACIÓN / REFERENCIAS ADJUNTAS ---')[0]
                .trim();
}

let modelosDisponiblesCache = null;

// Consulta directamente a la API de Google qué modelos Gemini están activos en tu cuenta
async function obtenerModelosActivos() {
    if (modelosDisponiblesCache && modelosDisponiblesCache.length > 0) return modelosDisponiblesCache;
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    const baseApi = ['https:', '', 'generativelanguage.googleapis.com', 'v1beta', 'models'].join('/');
    try {
        const resp = await fetch(baseApi + '?key=' + apiKey);
        const data = await resp.json();
        if (data && Array.isArray(data.models)) {
            const soportados = data.models
                .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name.replace('models/', ''));

            const preferidos = [
                'gemini-2.5-flash',
                'gemini-2.0-flash',
                'gemini-2.5-pro',
                'gemini-2.0-flash-lite',
                'gemini-flash-latest'
            ];

            const ordenados = preferidos.filter(p => soportados.includes(p));
            const otros = soportados.filter(s => s.includes('gemini') && !ordenados.includes(s));
            modelosDisponiblesCache = [...ordenados, ...otros];
            if (modelosDisponiblesCache.length > 0) {
                console.log('✅ Modelos Gemini activos detectados:', modelosDisponiblesCache.slice(0, 3));
                return modelosDisponiblesCache;
            }
        }
    } catch (e) {
        console.warn('Aviso al consultar lista de modelos:', e.message);
    }
    return ['gemini-2.5-flash', 'gemini-2.0-flash'];
}

// Llamada directa por fetch nativo a la API REST de Google Gemini (sin depender de versiones viejas del SDK)
async function generarConGeminiSeguro(partsConArchivos, promptSoloTexto) {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) throw new Error("Falta configurar GEMINI_API_KEY en Render");

    const modelos = await obtenerModelosActivos();
    const baseApi = ['https:', '', 'generativelanguage.googleapis.com', 'v1beta', 'models'].join('/');
    let ultimoError = null;

    const partsREST = partsConArchivos.map(p => {
        if (typeof p === 'string') return { text: p };
        if (p.inlineData) {
            return {
                inline_data: {
                    mime_type: p.inlineData.mimeType,
                    data: p.inlineData.data
                }
            };
        }
        return p;
    });

    for (const modelo of modelos.slice(0, 3)) {
        const url = baseApi + '/' + modelo + ':generateContent?key=' + apiKey;

        // 1. Intento multimodal (leyendo visualmente el PDF/imagen + texto)
        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: partsREST }],
                    generationConfig: { temperature: 0.2 }
                })
            });
            const data = await resp.json();
            if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                return extraerJSONLimpio(data.candidates[0].content.parts[0].text);
            }
            if (data.error) throw new Error(data.error.message);
        } catch (err) {
            ultimoError = err;
            console.warn(`Aviso multimodal con ${modelo}:`, err.message);

            // 2. Si el adjunto binario dio error, intentamos con el texto completo extraído del PDF
            if (promptSoloTexto) {
                try {
                    const respTexto = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: promptSoloTexto }] }],
                            generationConfig: { temperature: 0.2 }
                        })
                    });
                    const dataTexto = await respTexto.json();
                    if (dataTexto.candidates && dataTexto.candidates[0]?.content?.parts?.[0]?.text) {
                        return extraerJSONLimpio(dataTexto.candidates[0].content.parts[0].text);
                    }
                    if (dataTexto.error) throw new Error(dataTexto.error.message);
                } catch (err2) {
                    ultimoError = err2;
                }
            }
        }
    }
    throw ultimoError || new Error("No se pudo conectar con Gemini");
}

async function fusionarYOptimizarCVConGemini({ cvBuffer, cvMimeType, textoPlanoExtraido, cartaBuffer, cartaMimeType, textoCartaExtraido, datosFormulario }) {
    const expLimpia = limpiarTextoPrevioFormulario(datosFormulario.experiencia);
    const resLimpio = limpiarTextoPrevioFormulario(datosFormulario.resumen);
    const estLimpio = limpiarTextoPrevioFormulario(datosFormulario.estudios);
    const habLimpia = limpiarTextoPrevioFormulario(datosFormulario.habilidades);

    const prompt = `Eres un experto en Reclutamiento y Sistemas ATS (Applicant Tracking Systems).
Tu objetivo es crear un CV ATS Optimizado, completo, lineal y profesional para el candidato, fusionando y clasificando correctamente TODA la información disponible en tres fuentes:
1) El documento de CV original adjunto (y su texto extraído).
2) La Carta de Recomendación o Referencias Laborales adjunta (si el candidato subió una).
3) Los datos que el candidato escribió manualmente en el formulario web.

REGLAS ESTRICTAS DE CLASIFICACIÓN Y FUSIÓN:
- NO omitas ninguna experiencia laboral, empresa, duración/años, curso, capacitación, licencia, carnet o habilidad que figure en el CV adjunto, en la Carta de Recomendación O en el formulario.
- Clasifica cada dato en su sección correspondiente:
  • En "resumen": Redacta un perfil profesional integral de 3 a 5 líneas que resuma sus años totales de trayectoria, puestos clave, especialidades, disponibilidad, licencias/carnets y si cuenta con referencias o carta de recomendación. (Si en el CV figuran datos útiles como CUIL, edad o un segundo teléfono alternativo, menciónalos discretamente al final del resumen).
  • En "experiencia": Coloca ÚNICAMENTE la historia laboral y las referencias de cartas de recomendación en renglones separados con viñetas (•). Incluye TODAS las empresas del PDF (por ejemplo, si en el formulario puso 2 trabajos pero en el PDF hay 4 empresas como Santista Textil, Tecnomyl, TeoGrande, Com & Log, pon las 4 completas combinando las fechas del formulario con los detalles y sectores del PDF). NO metas cursos ni datos personales sueltos aquí.
  • En "estudios": Coloca el nivel educativo (ej. Secundario Completo, Terciario, Universitario) y ABSOLUTAMENTE TODOS los cursos, capacitaciones técnicas, módulos y formaciones que aparezcan en el PDF y en el formulario, en renglones separados con viñetas (•) indicando año e institución si figuran.
  • En "habilidades": Coloca TODAS las habilidades técnicas (conocimientos, manejo de autoelevador/maquinaria, carnets, licencias de conducir como B1, sistemas como Intex, PC, idiomas) y las habilidades blandas (responsabilidad, puntualidad, trabajo en equipo, adaptación) separadas por " • ".

DATOS PREVIOS DEL FORMULARIO:
- Puesto objetivo: ${datosFormulario.puestoRequerido || ''}
- Resumen formulario: ${resLimpio}
- Experiencia formulario: ${expLimpia}
- Estudios formulario: ${estLimpio}
- Habilidades formulario: ${habLimpia}

${textoPlanoExtraido ? `TEXTO COMPLETO EXTRAÍDO DEL PDF DEL CV:\n${textoPlanoExtraido}\n` : ''}
${textoCartaExtraido ? `TEXTO EXTRAÍDO DE LA CARTA DE RECOMENDACIÓN:\n${textoCartaExtraido}\n` : ''}

Devuelve ESTRICTAMENTE un objeto JSON puro (sin bloques markdown) con esta estructura exacta:
{
  "resumen": "Perfil profesional integral redactado.",
  "experiencia": "• Período/Duración - Puesto en Empresa: Detalle de funciones y sectores.\n• ...",
  "estudios": "• Nivel de estudios.\n• Año - Nombre del curso o capacitación - Institución.\n• ...",
  "habilidades": "Habilidad 1 • Habilidad 2 • Licencia/Carnet • Competencia...",
  "habilidadesDuras": "Habilidades técnicas, herramientas, maquinaria, carnets e idiomas separados por ' • '.",
  "habilidadesBlandas": "Competencias interpersonales y actitudes laborales separadas por ' • '.",
  "textoCompletoIntegrado": "Resumen de palabras clave, empresas, cargos, cursos y datos para el buscador interno."
}`;

    const parts = [prompt];

    if (cvBuffer) {
        const esPDF = esBufferPDF(cvBuffer) || cvMimeType === 'application/pdf';
        if (esPDF) {
            parts.push({
                inlineData: {
                    data: cvBuffer.toString('base64'),
                    mimeType: 'application/pdf'
                }
            });
        } else if (cvMimeType && cvMimeType.startsWith('image/')) {
            parts.push({
                inlineData: {
                    data: cvBuffer.toString('base64'),
                    mimeType: cvMimeType
                }
            });
        }
    }

    if (cartaBuffer) {
        const esCartaPDF = esBufferPDF(cartaBuffer) || cartaMimeType === 'application/pdf';
        if (esCartaPDF) {
            parts.push({
                inlineData: {
                    data: cartaBuffer.toString('base64'),
                    mimeType: 'application/pdf'
                }
            });
        } else if (cartaMimeType && cartaMimeType.startsWith('image/')) {
            parts.push({
                inlineData: {
                    data: cartaBuffer.toString('base64'),
                    mimeType: cartaMimeType
                }
            });
        }
    }

    return await generarConGeminiSeguro(parts, prompt);
}

async function optimizarCandidatoExistente(candidato) {
    const cvBuffer = candidato.cvData ? Buffer.from(candidato.cvData, 'base64') : null;
    const cartaBuffer = candidato.cartaData ? Buffer.from(candidato.cartaData, 'base64') : null;

    let textoPlanoExtraido = '';
    let textoCartaExtraido = '';

    if (cvBuffer) {
        try {
            if (esBufferPDF(cvBuffer) || candidato.cvContentType === 'application/pdf' || candidato.nombreArchivoCV?.toLowerCase().endsWith('.pdf')) {
                const pdfDataParsed = await pdfParse(cvBuffer);
                textoPlanoExtraido = pdfDataParsed.text || '';
            } else if (candidato.cvContentType?.includes('wordprocessingml') || candidato.nombreArchivoCV?.toLowerCase().endsWith('.docx')) {
                const wordResult = await mammoth.extractRawText({ buffer: cvBuffer });
                textoPlanoExtraido = wordResult.value || '';
            }
        } catch (e) {
            console.warn(`Aviso extrayendo texto de ${candidato.nombre}:`, e.message);
        }
    }

    if (!textoPlanoExtraido && candidato.textoExtraidoCV) {
        textoPlanoExtraido = limpiarTextoPrevioFormulario(candidato.textoExtraidoCV);
    }

    if (cartaBuffer) {
        try {
            if (esBufferPDF(cartaBuffer) || candidato.cartaContentType === 'application/pdf' || candidato.nombreArchivoCarta?.toLowerCase().endsWith('.pdf')) {
                const pdfCarta = await pdfParse(cartaBuffer);
                textoCartaExtraido = pdfCarta.text || '';
            } else if (candidato.cartaContentType?.includes('wordprocessingml') || candidato.nombreArchivoCarta?.toLowerCase().endsWith('.docx')) {
                const wordCarta = await mammoth.extractRawText({ buffer: cartaBuffer });
                textoCartaExtraido = wordCarta.value || '';
            }
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
            candidato.textoExtraidoCV = limpiarYCorregirTexto(`${textoPlanoExtraido}\n${textoCartaExtraido}\n${resultadoGemini.textoCompletoIntegrado}`);
        }

        await candidato.save();
        return true;
    }
    return false;
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
                    if (esBufferPDF(cvFile.buffer) || cvContentType === 'application/pdf') {
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
                    if (esBufferPDF(cartaFile.buffer) || cartaContentType === 'application/pdf') {
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

        try {
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
        } catch (errIA) {
            console.error("Aviso IA en postulación:", errIA.message);
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

// ⚡ Optimizar UN legajo específico con IA en el acto
app.post('/api/candidatos/optimizar-ia/:id', authMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });
        if (!candidato) return res.status(404).json({ success: false, error: 'Candidato no encontrado' });

        await optimizarCandidatoExistente(candidato);

        return res.json({
            success: true,
            nombre: candidato.nombre,
            resumen: candidato.resumen,
            experiencia: candidato.experiencia,
            estudios: candidato.estudios,
            habilidades: candidato.habilidades
        });
    } catch (error) {
        console.error(`Error al optimizar legajo ${req.params.id}:`, error);
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
        if (esBufferPDF(req.file.buffer) || req.file.mimetype === 'application/pdf') {
            try {
                const pdfData = await pdfParse(req.file.buffer);
                textoPlano = pdfData.text;
            } catch (e) {}
        } else if (req.file.mimetype.includes('wordprocessingml') || req.file.originalname.endsWith('.docx')) {
            const wordResult = await mammoth.extractRawText({ buffer: req.file.buffer });
            textoPlano = wordResult.value;
        }

        const prompt = `Analiza la siguiente descripción de puesto o requisitos enviados por una empresa. Extrae el título sugerido del puesto y las palabras clave más importantes (habilidades duras, herramientas, certificaciones y competencias clave) separadas por un espacio, para usarlas en un motor de búsqueda ATS. Responde ESTRICTAMENTE en formato JSON puro:
        {"titulo": "Título del puesto (ej: Ayudante de Cocina)", "keywords": "palabra1 palabra2 palabra3..."}
        ${textoPlano ? `Texto extraído: ${textoPlano}` : ''}`;

        const parts = [prompt];
        if (esBufferPDF(req.file.buffer) || req.file.mimetype === 'application/pdf') {
            parts.push({
                inlineData: {
                    data: req.file.buffer.toString('base64'),
                    mimeType: 'application/pdf'
                }
            });
        }

        const datos = await generarConGeminiSeguro(parts, prompt);
        return res.json({ success: true, datos });
    } catch (error) {
        console.error("Error al analizar requisitos:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/autocompletar-cv', upload.single('cvFile'), async (req, res) => {
    try {
        if (!req.file) return res.json({ success: false, error: 'No se subió archivo' });
        let textoPlano = '';
        if (esBufferPDF(req.file.buffer) || req.file.mimetype === 'application/pdf') {
            try {
                const pdfData = await pdfParse(req.file.buffer);
                textoPlano = pdfData.text;
            } catch (e) {}
        } else if (req.file.mimetype.includes('wordprocessingml') || req.file.originalname.endsWith('.docx')) {
            const wordResult = await mammoth.extractRawText({ buffer: req.file.buffer });
            textoPlano = wordResult.value;
        }

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
        if (esBufferPDF(req.file.buffer) || req.file.mimetype === 'application/pdf') {
            parts.push({
                inlineData: {
                    data: req.file.buffer.toString('base64'),
                    mimeType: 'application/pdf'
                }
            });
        }

        const datos = await generarConGeminiSeguro(parts, prompt);
        return res.json({ success: true, datos });
    } catch (error) {
        console.error("Error en autocompletado:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
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

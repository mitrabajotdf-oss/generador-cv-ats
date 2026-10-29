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
    datosPersonalesExtra: String,
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

// 📂 Esquema de Subcarpetas de Búsquedas/Vacantes (Guarda Empresa, Subcarpeta Puesto, Keywords, Texto WhatsApp y Archivo PDF/Word/Flyer)
const busquedaSchema = new mongoose.Schema({
    id: Number,
    empresa: String,
    titulo: String,
    keywords: String,
    textoAviso: String,
    archivoData: String,
    archivoContentType: String,
    nombreArchivo: String,
    fechaCreacion: String
});

const Busqueda = mongoose.model('Busqueda', busquedaSchema);

async function fetchConTimeout(url, options = {}, timeoutMs = 18000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(url, { ...options, signal: controller.signal });
        return resp;
    } finally {
        clearTimeout(timer);
    }
}

async function enviarAlertaEmail(candidato) {
    try {
        const urlResend = ['https:', '', 'api.resend.com', 'emails'].join('/');
        await fetchConTimeout(urlResend, {
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
        }, 8000);
    } catch (error) {
        console.error('Error al enviar alerta email:', error.message);
    }
}

function limpiarYCorregirTexto(texto) {
    if (!texto) return '';
    return texto.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
}

function limpiarSimbolosDecorativos(texto) {
    if (!texto) return '';
    return texto.replace(/[✓✔☑➢➤►▪▫□■]/g, '').replace(/[ \t]+/g, ' ').trim();
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

function esBufferPDF(buffer) {
    if (!buffer || buffer.length < 4) return false;
    return buffer.slice(0, 4).toString() === '%PDF';
}

function limpiarTextoPrevioFormulario(texto) {
    if (!texto) return '';
    let t = texto
        .split('--- DETALLE COMPLETO EXTRAÍDO DEL CV ORIGINAL ---')[0]
        .split('--- CARTA DE RECOMENDACIÓN / REFERENCIAS ADJUNTAS ---')[0]
        .trim();

    t = t.replace(/^Perfil postulado para [^.]+\.\s*/gi, '')
         .replace(/^Postulante para [^.]+\.\s*/gi, '')
         .replace(/^Perfil profesional con sólida trayectoria[^.]+\.\s*/gi, '')
         .replace(/Perfil con historial laboral detallado en legajo\.*/gi, '')
         .replace(/Cuenta con sólida experiencia comprobable en el sector[^.]*\./gi, '')
         .replace(/Cuenta con amplia experiencia operativa comprobable y formación continua\.?/gi, '')
         .replace(/Datos adicionales:.*$/gi, '')
         .replace(/\.{2,}/g, '.')
         .trim();

    return t;
}

function unirRenglonesCortados(lineasCrudas) {
    const resultado = [];
    for (let raw of lineasCrudas) {
        const tieneMarcadorNuevo = /^[✓✔☑➢➤►•*]|^\d{4}\s*[-–]/.test(raw.trim());
        let limpia = limpiarSimbolosDecorativos(raw).replace(/^[-•*]\s*/, '').trim();
        if (!limpia) continue;

        if (resultado.length === 0 || tieneMarcadorNuevo) {
            resultado.push(limpia);
        } else {
            const anterior = resultado[resultado.length - 1];
            const empiezaMinusculaOParentesis = /^[a-záéíóúñ0-9()]/.test(limpia);
            const anteriorTerminaAbierto = /[-–(/:,]$|\b(de|del|en|el|la|los|las|para|por|con|y|o|a|su|propia|sector|capacitación|charla|buenas)$/i.test(anterior);
            const esContinuacionCorta = limpia.length < 42 && !limpia.endsWith('.');

            if (empiezaMinusculaOParentesis || anteriorTerminaAbierto || esContinuacionCorta) {
                resultado[resultado.length - 1] = `${anterior} ${limpia}`.replace(/\s+/g, ' ');
            } else {
                resultado.push(limpia);
            }
        }
    }
    return resultado;
}

let modelosDisponiblesCache = null;

async function obtenerModelosActivos() {
    if (modelosDisponiblesCache && modelosDisponiblesCache.length > 0) return modelosDisponiblesCache;
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    const baseApi = ['https:', '', 'generativelanguage.googleapis.com', 'v1beta', 'models'].join('/');
    try {
        const resp = await fetchConTimeout(baseApi + '?key=' + apiKey, {}, 6000);
        const data = await resp.json();
        if (data && Array.isArray(data.models)) {
            const soportados = data.models
                .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name.replace('models/', ''));

            const preferidos = [
                'gemini-2.0-flash',
                'gemini-2.5-flash',
                'gemini-2.0-flash-lite',
                'gemini-flash-latest'
            ];

            const ordenados = preferidos.filter(p => soportados.includes(p));
            const otros = soportados.filter(s => s.includes('flash') && !ordenados.includes(s));
            modelosDisponiblesCache = [...ordenados, ...otros];
            if (modelosDisponiblesCache.length > 0) return modelosDisponiblesCache;
        }
    } catch (e) {
        console.warn('Aviso al listar modelos:', e.message);
    }
    return ['gemini-2.0-flash', 'gemini-2.5-flash'];
}

async function generarConGeminiSeguro(partsConArchivos, promptSoloTexto, tieneTextoSuficiente = false) {
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

    for (const modelo of modelos.slice(0, 2)) {
        const url = baseApi + '/' + modelo + ':generateContent?key=' + apiKey;

        if (tieneTextoSuficiente && promptSoloTexto) {
            try {
                const respTexto = await fetchConTimeout(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: promptSoloTexto }] }],
                        generationConfig: { temperature: 0.2 }
                    })
                }, 16000);
                const dataTexto = await respTexto.json();
                if (dataTexto.candidates && dataTexto.candidates[0]?.content?.parts?.[0]?.text) {
                    return extraerJSONLimpio(dataTexto.candidates[0].content.parts[0].text);
                }
            } catch (errFast) {
                ultimoError = errFast;
                console.warn(`Aviso texto rápido con ${modelo}:`, errFast.message);
            }
        }

        try {
            const resp = await fetchConTimeout(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: partsREST }],
                    generationConfig: { temperature: 0.2 }
                })
            }, 18000);
            const data = await resp.json();
            if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                return extraerJSONLimpio(data.candidates[0].content.parts[0].text);
            }
            if (data.error) throw new Error(data.error.message);
        } catch (err) {
            ultimoError = err;
            console.warn(`Aviso multimodal con ${modelo}:`, err.message);
        }
    }
    throw ultimoError || new Error("Tiempo de espera agotado con Gemini");
}

function clasificarCVLocalmente({ textoPlanoExtraido, textoCartaExtraido, datosFormulario }) {
    const lineas = (textoPlanoExtraido || '').split('\n').map(l => l.trim()).filter(Boolean);
    const expCruda = [];
    const estCruda = [];
    const habCruda = [];
    const datosExtra = [];

    let seccionActual = 'personal';

    for (const linea of lineas) {
        const lUpper = linea.toUpperCase().replace(/\s+/g, ' ');
        const sinSimbolos = limpiarSimbolosDecorativos(linea);
        if (!sinSimbolos) continue;

        if (/^CURRICUL[U]?M\s+VITAE/i.test(lUpper) || /^DATOS\s+PERSONALES$/i.test(lUpper)) {
            seccionActual = 'personal';
            continue;
        }

        if (/^(CEL\.?|TEL\.?|TEL[EÉ]FONO|C\.?U\.?I\.?L\.?|FECHA DE NACIMIENTO|EDAD|ESTADO CIVIL|NACIONALIDAD)\s*[:.]/i.test(sinSimbolos)) {
            const normalizado = sinSimbolos.replace(/\s+/g, ' ');
            if (!datosExtra.some(d => d.toLowerCase() === normalizado.toLowerCase())) {
                datosExtra.push(normalizado);
            }
            continue;
        }

        if (/^(ESTUDIOS|ESTUDIOS CURSADOS|FORMACI[OÓ]N|FORMACI[OÓ]N ACAD[EÉ]MICA|EDUCACI[OÓ]N|CURSOS REALIZADOS.*|PERIODO EN .*|CAPACITACIONES)$/i.test(lUpper)) {
            seccionActual = 'estudios';
            if (/^PERIODO EN /i.test(lUpper)) {
                estCruda.push('• Capacitaciones en ' + sinSimbolos.replace(/^PERIODO EN\s*/i, ''));
            }
            continue;
        }
        if (/^(ANTECEDENTES LABORALES|EXPERIENCIA LABORAL|EXPERIENCIA|HISTORIAL LABORAL|TRAYECTORIA LABORAL)$/i.test(lUpper)) {
            seccionActual = 'experiencia';
            continue;
        }
        if (/^(CONOCIMIENTOS|HABILIDADES|ACTITUDES Y HABILIDADES|APTITUDES|COMPETENCIAS|IDIOMAS|INFORM[AÁ]TICA)$/i.test(lUpper)) {
            seccionActual = 'habilidades';
            continue;
        }

        if (seccionActual === 'estudios') {
            estCruda.push(linea);
        } else if (seccionActual === 'experiencia') {
            expCruda.push(linea);
        } else if (seccionActual === 'habilidades') {
            habCruda.push(linea);
        }
    }

    const expUnida = unirRenglonesCortados(expCruda);
    const estUnida = unirRenglonesCortados(estCruda);
    const habUnida = unirRenglonesCortados(habCruda);

    const formExpRaw = limpiarTextoPrevioFormulario((datosFormulario.experiencia || '').replace(/=/g, ': '));
    const formEstRaw = limpiarTextoPrevioFormulario((datosFormulario.estudios || '').replace(/=/g, ': '));
    const formHabRaw = limpiarTextoPrevioFormulario(datosFormulario.habilidades || '');

    const lineasFormExp = formExpRaw.split('\n')
        .filter(l => !l.trim().startsWith('•'))
        .map(l => limpiarSimbolosDecorativos(l).replace(/^[-•*]\s*/, '').trim())
        .filter(l => l && !expUnida.some(e => e.toLowerCase().includes(l.substring(0, 15).toLowerCase())));

    const expFinal = [...lineasFormExp, ...expUnida].map(e => `• ${e}`);

    if (textoCartaExtraido) {
        expFinal.push(`• Referencia / Carta de Recomendación adjunta: ${limpiarYCorregirTexto(limpiarSimbolosDecorativos(textoCartaExtraido))}`);
    }

    const lineasFormEst = formEstRaw.split('\n')
        .filter(l => !l.trim().startsWith('•') && !/^(CEL\.?|TEL\.?|PERIODO EN)/i.test(l.trim()))
        .map(l => limpiarSimbolosDecorativos(l).replace(/^[-•*]\s*/, '').trim())
        .filter(l => l && !estUnida.some(e => e.toLowerCase().includes(l.substring(0, 15).toLowerCase())));

    const estUnicos = [];
    for (const item of [...estUnida, ...lineasFormEst]) {
        if (!/^(CEL\.?|TEL\.?|PERIODO EN)/i.test(item) && !estUnicos.includes(item)) {
            estUnicos.push(item);
        }
    }
    const estFinal = estUnicos.map(e => `• ${e}`);

    const itemsFormHab = formHabRaw.split(/[•,]|\s-\s/).map(h => limpiarSimbolosDecorativos(h).trim())
        .filter(h => h && h.length > 2 && !habUnida.some(x => x.toLowerCase().includes(h.toLowerCase())));

    const habUnicas = [];
    for (const h of [...itemsFormHab, ...habUnida]) {
        const limpiaH = h.replace(/\.$/, '').trim();
        if (limpiaH && !habUnicas.some(u => u.toLowerCase() === limpiaH.toLowerCase())) {
            habUnicas.push(limpiaH);
        }
    }

    const puesto = datosFormulario.puestoRequerido && datosFormulario.puestoRequerido !== 'General'
        ? datosFormulario.puestoRequerido
        : 'operaciones, producción y servicios';

    const listaExperienciasTexto = [...expUnida, ...lineasFormExp]
        .map(e => e.replace(/^[-•*]\s*/, '').trim())
        .filter(Boolean);

    const detalleTrayectoria = listaExperienciasTexto.length > 0
        ? `A lo largo de su trayectoria laboral se ha desempeñado en ${listaExperienciasTexto.slice(0, 4).join('; ')}, desarrollando sólido dominio operativo y cumplimiento de estándares de calidad y seguridad.`
        : `Cuenta con experiencia comprobable en el sector, adaptándose con rapidez a entornos dinámicos y exigentes.`;

    const nivelEstudios = estUnicos.slice(0, 2).join(', ');
    const principalesHabilidades = habUnicas.slice(0, 6).join(', ');

    const resumenDesarrollado = [
        `Perfil profesional orientado al área de ${puesto}, con sólida trayectoria comprobable en procesos operativos, productivos y logísticos.`,
        detalleTrayectoria,
        nivelEstudios ? `Posee formación en ${nivelEstudios} junto a capacitación técnica continua en prevención de riesgos, operación de maquinaria y mejora de procesos.` : '',
        principalesHabilidades ? `Destaca por sus competencias en ${principalesHabilidades}, aportando compromiso, eficiencia y disponibilidad ${datosFormulario.disponibilidad || 'inmediata'}.` : '',
        textoCartaExtraido ? `Cuenta además con referencias laborales comprobables mediante Carta de Recomendación adjunta.` : ''
    ].filter(Boolean).join(' ');

    return {
        datosPersonalesExtra: datosExtra.join(' | '),
        resumen: limpiarYCorregirTexto(resumenDesarrollado),
        experiencia: expFinal.length > 0 ? expFinal.join('\n') : (formExpRaw || 'No especificada'),
        estudios: estFinal.length > 0 ? estFinal.join('\n') : (formEstRaw || 'Secundario Completo'),
        habilidades: habUnicas.length > 0 ? habUnicas.join(' • ') : (formHabRaw || 'Responsabilidad • Puntualidad • Trabajo en equipo'),
        habilidadesDuras: habUnicas.join(' • '),
        habilidadesBlandas: 'Responsabilidad • Puntualidad • Adaptación a normas y equipos de trabajo',
        textoCompletoIntegrado: `${datosExtra.join(' | ')}\n${resumenDesarrollado}\n${expFinal.join('\n')}\n${estFinal.join('\n')}\n${habUnicas.join(' • ')}`
    };
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

REGLAS ESTRICTAS DE CLASIFICACIÓN Y FORMATO:
- NO omitas ninguna experiencia laboral, empresa, duración/años, nivel de estudios (ej. Secundarios Completos, Terciario Incompleto), curso, capacitación, licencia, carnet o habilidad que figure en el CV adjunto, en la Carta de Recomendación O en el formulario.
- UNE LOS RENGLONES CORTADOS: Si el PDF cortó una oración en dos renglones, únelos en una sola viñeta coherente.
- ELIMINA símbolos decorativos como ✓, ➢, ☑, ➤. Usa únicamente viñetas limpias "• " al inicio de cada ítem en experiencia y estudios.
- Clasifica cada dato en su sección correspondiente:
  • En "datosPersonalesExtra": Extrae de forma lineal y separada por " | " los datos personales adicionales que figuren en el CV (como Fecha de Nacimiento, Edad, C.U.I.L., Estado Civil, Nacionalidad o teléfonos alternativos). NO pongas estos datos personales dentro del resumen profesional.
  • En "resumen": Redacta un Resumen Profesional ejecutivo, desarrollado y completo (de 4 a 6 líneas) que sintetice su perfil relacionándolo directamente con sus experiencias laborales reales (mencionando las empresas donde trabajó, años de experiencia, funciones en producción/logística/administración/etc., manejo de maquinaria o autoelevador, licencias y estudios), sin incluir números de teléfono ni CUIL aquí.
  • En "experiencia": Coloca ÚNICAMENTE la historia laboral y las referencias de cartas de recomendación en renglones separados con viñetas (•). Incluye TODAS las empresas del PDF combinando las fechas del formulario con los detalles y sectores del PDF.
  • En "estudios": Coloca el nivel educativo (ej. • Secundarios Completos, • Terciario Incompleto) y TODOS los cursos y capacitaciones técnicas del PDF y formulario en renglones completos con viñetas (•). NUNCA pongas números de teléfono ni encabezados sueltos aquí.
  • En "habilidades": Coloca TODAS las habilidades técnicas (licencias B1, manejo de autoelevador, PC, circuito productivo, idiomas) y blandas separadas por " • ", sin cortar frases al medio.

DATOS DEL FORMULARIO:
- Puesto objetivo: ${datosFormulario.puestoRequerido || ''}
- Resumen formulario: ${resLimpio}
- Experiencia formulario: ${expLimpia}
- Estudios formulario: ${estLimpio}
- Habilidades formulario: ${habLimpia}

${textoPlanoExtraido ? `TEXTO COMPLETO EXTRAÍDO DEL PDF DEL CV:\n${textoPlanoExtraido}\n` : ''}
${textoCartaExtraido ? `TEXTO EXTRAÍDO DE LA CARTA DE RECOMENDACIÓN:\n${textoCartaExtraido}\n` : ''}

Devuelve ESTRICTAMENTE un objeto JSON puro (sin bloques markdown) con esta estructura exacta:
{
  "datosPersonalesExtra": "Fecha de Nacimiento: ... | Edad: ... | C.U.I.L.: ... | Estado Civil: ... | Tel. Alternativo: ...",
  "resumen": "Resumen profesional amplio y desarrollado, directamente relacionado con sus experiencias laborales, empresas, cargos, formación y competencias clave.",
  "experiencia": "• Período/Duración - Puesto en Empresa: Detalle de funciones y sectores.\\n• ...",
  "estudios": "• Nivel de estudios.\\n• Nombre completo del curso o capacitación - Institución (Duración) Año.\\n• ...",
  "habilidades": "Habilidad 1 • Habilidad 2 • Licencia/Carnet • Competencia...",
  "habilidadesDuras": "Habilidades técnicas, herramientas, maquinaria, carnets e idiomas separados por ' • '.",
  "habilidadesBlandas": "Competencias interpersonales y actitudes laborales separadas por ' • '.",
  "textoCompletoIntegrado": "Resumen de palabras clave, empresas, cargos, cursos y datos para el buscador interno."
}`;

    const parts = [prompt];

    if (cvBuffer) {
        const esPDF = esBufferPDF(cvBuffer) || cvMimeType === 'application/pdf';
        if (esPDF) {
            parts.push({ inlineData: { data: cvBuffer.toString('base64'), mimeType: 'application/pdf' } });
        } else if (cvMimeType && cvMimeType.startsWith('image/')) {
            parts.push({ inlineData: { data: cvBuffer.toString('base64'), mimeType: cvMimeType } });
        }
    }

    if (cartaBuffer) {
        const esCartaPDF = esBufferPDF(cartaBuffer) || cartaMimeType === 'application/pdf';
        if (esCartaPDF) {
            parts.push({ inlineData: { data: cartaBuffer.toString('base64'), mimeType: 'application/pdf' } });
        } else if (cartaMimeType && cartaMimeType.startsWith('image/')) {
            parts.push({ inlineData: { data: cartaBuffer.toString('base64'), mimeType: cartaMimeType } });
        }
    }

    const tieneTextoSuficiente = Boolean(textoPlanoExtraido && textoPlanoExtraido.trim().length > 120);
    const respaldoLocal = clasificarCVLocalmente({ textoPlanoExtraido, textoCartaExtraido, datosFormulario });

    try {
        const respuestaIA = await generarConGeminiSeguro(parts, prompt, tieneTextoSuficiente);
        if (respuestaIA) {
            respuestaIA.datosPersonalesExtra = limpiarSimbolosDecorativos(respuestaIA.datosPersonalesExtra || respaldoLocal.datosPersonalesExtra);
            respuestaIA.resumen = limpiarSimbolosDecorativos(respuestaIA.resumen || respaldoLocal.resumen);
            respuestaIA.experiencia = limpiarSimbolosDecorativos(respuestaIA.experiencia || respaldoLocal.experiencia);
            respuestaIA.estudios = limpiarSimbolosDecorativos(respuestaIA.estudios || respaldoLocal.estudios);
            respuestaIA.habilidades = limpiarSimbolosDecorativos(respuestaIA.habilidades || respaldoLocal.habilidades);
            return respuestaIA;
        }
    } catch (errIA) {
        console.warn("Usando clasificador local inteligente:", errIA.message);
    }
    return respaldoLocal;
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
            disponibilidad: candidato.disponibilidad,
            resumen: candidato.resumen,
            experiencia: candidato.experiencia,
            estudios: candidato.estudios,
            habilidades: candidato.habilidades
        }
    });

    if (resultadoGemini) {
        candidato.datosPersonalesExtra = limpiarYCorregirTexto(resultadoGemini.datosPersonalesExtra || candidato.datosPersonalesExtra || '');
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
        let datosPersonalesExtra = '';
        
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

        const resultadoGemini = await fusionarYOptimizarCVConGemini({
            cvBuffer,
            cvMimeType: cvContentType,
            textoPlanoExtraido,
            cartaBuffer,
            cartaMimeType: cartaContentType,
            textoCartaExtraido,
            datosFormulario: { puestoRequerido, disponibilidad, resumen, experiencia, estudios, habilidades }
        });

        if (resultadoGemini) {
            datosPersonalesExtra = resultadoGemini.datosPersonalesExtra || '';
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
            datosPersonalesExtra: limpiarYCorregirTexto(datosPersonalesExtra),
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

app.post('/api/candidatos/optimizar-ia/:id', authMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });
        if (!candidato) return res.status(404).json({ success: false, error: 'Candidato no encontrado' });

        await optimizarCandidatoExistente(candidato);

        return res.json({
            success: true,
            nombre: candidato.nombre,
            datosPersonalesExtra: candidato.datosPersonalesExtra,
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
                .info h1 { margin: 0 0 6px 0; color: #0056b3; font-size: 24px; text-transform: uppercase; }
                .info p { margin: 4px 0; font-size: 14px; }
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
                    <p>📍 ${candidato.direccion || 'No especificada'} | 📞 ${candidato.telefono || 'S/D'} | 📧 ${candidato.email || 'S/D'} | <strong>DNI:</strong> ${candidato.dni || 'S/D'}</p>
                    ${candidato.datosPersonalesExtra ? `<p>${candidato.datosPersonalesExtra}</p>` : ''}
                    <p><strong>Puesto al que aplica:</strong> ${candidato.puestoRequerido} | <strong>Disponibilidad:</strong> ${candidato.disponibilidad}</p>
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

// 📂 RUTAS CRUD EN MONGODB PARA CARPETAS DE EMPRESAS Y SUBCARPETAS DE PUESTOS
app.get('/api/busquedas', authMiddleware, async (req, res) => {
    try {
        const rawBusquedas = await Busqueda.find({}, {
            id: 1, empresa: 1, titulo: 1, keywords: 1, textoAviso: 1,
            archivoContentType: 1, nombreArchivo: 1, fechaCreacion: 1,
            tieneArchivo: { $gt: [{ $strLenCP: { $ifNull: ["$archivoData", ""] } }, 0] }
        }).lean();

        const busquedas = rawBusquedas.map(b => ({
            ...b,
            archivoData: b.tieneArchivo ? 'disponible' : ''
        })).sort((a, b) => b.id - a.id);

        return res.json({ success: true, busquedas });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/busquedas', authMiddleware, upload.single('archivoAviso'), async (req, res) => {
    try {
        const { id, empresa, titulo, keywords, textoAviso } = req.body;
        const nuevoId = Number(id) || Date.now();
        const existente = await Busqueda.findOne({ id: nuevoId });
        if (existente) return res.json({ success: true, busqueda: existente });

        let archivoData = '', archivoContentType = '', nombreArchivo = '';
        if (req.file) {
            archivoData = req.file.buffer.toString('base64');
            archivoContentType = req.file.mimetype;
            nombreArchivo = req.file.originalname;
        }

        const nueva = new Busqueda({
            id: nuevoId,
            empresa: limpiarYCorregirTexto(empresa) || 'Empresas Generales',
            titulo: limpiarYCorregirTexto(titulo) || 'Vacante General',
            keywords: limpiarYCorregirTexto(keywords || ''),
            textoAviso: limpiarYCorregirTexto(textoAviso || ''),
            archivoData,
            archivoContentType,
            nombreArchivo,
            fechaCreacion: new Date().toLocaleDateString()
        });
        await nueva.save();

        const respuestaLimpia = {
            ...nueva.toObject(),
            archivoData: archivoData ? 'disponible' : ''
        };
        return res.json({ success: true, busqueda: respuestaLimpia });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/busquedas/editar/:id', authMiddleware, upload.single('archivoAviso'), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { empresa, titulo, keywords, textoAviso } = req.body;
        const b = await Busqueda.findOne({ id });
        if (!b) return res.status(404).json({ success: false, error: 'Subcarpeta no encontrada' });

        if (empresa !== undefined) b.empresa = limpiarYCorregirTexto(empresa);
        if (titulo !== undefined) b.titulo = limpiarYCorregirTexto(titulo);
        if (keywords !== undefined) b.keywords = limpiarYCorregirTexto(keywords);
        if (textoAviso !== undefined) b.textoAviso = limpiarYCorregirTexto(textoAviso);

        if (req.file) {
            b.archivoData = req.file.buffer.toString('base64');
            b.archivoContentType = req.file.mimetype;
            b.nombreArchivo = req.file.originalname;
        }

        await b.save();
        const respuestaLimpia = {
            ...b.toObject(),
            archivoData: b.archivoData ? 'disponible' : ''
        };
        return res.json({ success: true, busqueda: respuestaLimpia });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/busquedas/archivo/:id', authMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const b = await Busqueda.findOne({ id });
        if (!b || !b.archivoData) return res.status(404).send('Archivo no disponible en esta subcarpeta.');
        const buffer = Buffer.from(b.archivoData, 'base64');
        const nombreSeguro = limpiarNombreArchivo(b.nombreArchivo, `Aviso_${b.empresa}_${b.titulo}.pdf`);
        res.setHeader('Content-Type', b.archivoContentType || 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${nombreSeguro}"`);
        return res.send(buffer);
    } catch (error) {
        return res.status(500).send('Error al abrir el archivo de la vacante.');
    }
});

app.delete('/api/busquedas/:id', authMiddleware, async (req, res) => {
    try {
        await Busqueda.deleteOne({ id: Number(req.params.id) });
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

function extraerRequisitosLocalmente(texto, puestoContexto = '') {
    const limpio = limpiarYCorregirTexto(`${puestoContexto} ${texto || ''}`);
    const lineas = limpio.split('\n').map(l => l.trim()).filter(Boolean);

    let empresa = '';
    let titulo = puestoContexto || '';

    for (const l of lineas) {
        if (!empresa && /^(empresa|cliente|organización|comercio|restaurante|hotel|planta|fábrica)\s*[:.-]/i.test(l)) {
            empresa = l.replace(/^(empresa|cliente|organización|comercio|restaurante|hotel|planta|fábrica)\s*[:.-]\s*/i, '').trim();
        }
        if (!titulo && /^(puesto|vacante|búsqueda|busca|buscamos|cargo|perfil|se solicita|solicitamos)\s*[:.-]/i.test(l)) {
            titulo = l.replace(/^(puesto|vacante|búsqueda|busca|buscamos|cargo|perfil|se solicita|solicitamos)\s*[:.-]\s*/i, '').trim();
        }
    }

    if (!titulo && lineas.length > 0) {
        titulo = lineas[0].substring(0, 60);
    }

    const stopWords = new Set(['para', 'con', 'los', 'las', 'del', 'una', 'por', 'que', 'mas', 'más', 'sin', 'sobre', 'entre', 'hasta', 'desde', 'como', 'pero', 'sus', 'este', 'esta', 'estos', 'estas', 'todo', 'toda', 'todos', 'todas', 'otro', 'otra', 'otros', 'otras', 'mismo', 'misma', 'importante', 'empresa', 'busca', 'buscamos', 'incorporar', 'personal', 'puesto', 'vacante', 'requisitos', 'excluyente', 'deseable', 'experiencia', 'años', 'año', 'zona', 'horario', 'enviar', 'correo', 'asunto', 'disponibilidad', 'inmediata', 'trabajo', 'laboral', 'minima', 'mínima', 'comprobable', 'tierra', 'fuego', 'grande', 'ushuaia', 'hola', 'buenas', 'dias', 'tardes']);

    const palabras = limpio
        .toLowerCase()
        .replace(/[^\wáéíóúñü\s]/g, ' ')
        .split(/\s+/)
        .filter(p => p.length > 3 && !stopWords.has(p) && !/^\d+$/.test(p));

    const unicas = [];
    if (puestoContexto && puestoContexto.trim().includes(' ')) {
        unicas.push(puestoContexto.trim().toLowerCase().replace(/\s+/g, '_'));
    }
    for (const p of palabras) {
        if (!unicas.includes(p) && unicas.length < 15) unicas.push(p);
    }

    return {
        empresa: empresa || 'Empresas Generales',
        titulo: titulo || 'Vacante General',
        keywords: unicas.join(' ')
    };
}

app.post('/api/analizar-requisitos', authMiddleware, upload.single('archivoRequisitos'), async (req, res) => {
    try {
        const textoDirecto = req.body.textoRequisitos ? req.body.textoRequisitos.trim() : '';
        const puestoContexto = req.body.puestoContexto ? req.body.puestoContexto.trim() : '';
        const empresaContexto = req.body.empresaContexto ? req.body.empresaContexto.trim() : '';

        if (!req.file && !textoDirecto && !puestoContexto) {
            return res.json({ success: false, error: 'Subí un archivo (PDF, Word o Imagen) o pegá el texto de la búsqueda.' });
        }

        let textoPlano = textoDirecto;
        if (req.file) {
            if (esBufferPDF(req.file.buffer) || req.file.mimetype === 'application/pdf') {
                try {
                    const pdfData = await pdfParse(req.file.buffer);
                    textoPlano = `${textoPlano}\n${pdfData.text || ''}`.trim();
                } catch (e) {}
            } else if (req.file.mimetype.includes('wordprocessingml') || req.file.originalname.endsWith('.docx')) {
                try {
                    const wordResult = await mammoth.extractRawText({ buffer: req.file.buffer });
                    textoPlano = `${textoPlano}\n${wordResult.value || ''}`.trim();
                } catch (e) {}
            }
        }

        const prompt = `Analiza la siguiente búsqueda laboral para la empresa "${empresaContexto || 'Cliente'}" y el puesto "${puestoContexto || 'Vacante'}".
Extrae las palabras clave técnicas, oficios, herramientas, funciones, licencias y competencias más importantes para filtrar CVs en un motor ATS, separadas por espacio.
Para el nombre del puesto o términos compuestos usa guion bajo (ej: "jefe_de_cocina", "pastelero", "panaderia", "reposteria", "manipulacion_de_alimentos") además de las palabras sueltas clave. Si el aviso aclara algo excluyente que NO quieren, agrégalo con signo menos delante.

Responde ESTRICTAMENTE en formato JSON puro:
{
  "empresa": "${empresaContexto || 'Nombre de la Empresa'}",
  "titulo": "${puestoContexto || 'Título del puesto'}",
  "keywords": "palabra1 palabra2 frase_compuesta...",
  "textoExtraido": "Resumen claro de los requisitos leídos del archivo o imagen"
}
${textoPlano ? `\nTexto del pedido:\n${textoPlano}` : ''}`;

        const parts = [prompt];
        if (req.file) {
            if (esBufferPDF(req.file.buffer) || req.file.mimetype === 'application/pdf') {
                parts.push({ inlineData: { data: req.file.buffer.toString('base64'), mimeType: 'application/pdf' } });
            } else if (req.file.mimetype && req.file.mimetype.startsWith('image/')) {
                parts.push({ inlineData: { data: req.file.buffer.toString('base64'), mimeType: req.file.mimetype } });
            }
        }

        try {
            const datos = await generarConGeminiSeguro(parts, prompt, Boolean(textoPlano && textoPlano.length > 40));
            if (datos && datos.keywords) {
                return res.json({ success: true, datos });
            }
        } catch (errIA) {
            console.warn("Usando extractor local de requisitos:", errIA.message);
        }

        const datosRespaldo = extraerRequisitosLocalmente(textoPlano, puestoContexto);
        return res.json({ success: true, datos: datosRespaldo });
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
            parts.push({ inlineData: { data: req.file.buffer.toString('base64'), mimeType: 'application/pdf' } });
        }

        const datos = await generarConGeminiSeguro(parts, prompt, Boolean(textoPlano && textoPlano.length > 100));
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
            telefono: 1, direccion: 1, disponibilidad: 1, datosPersonalesExtra: 1,
            resumen: 1, experiencia: 1, estudios: 1, habilidades: 1, habilidadesDuras: 1, habilidadesBlandas: 1,
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

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

// 📂 Esquema de Subcarpetas de Búsquedas/Vacantes
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

async function fetchConTimeout(url, options = {}, timeoutMs = 20000) {
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
    return texto
        .replace(/\r\n/g, '\n')
        // Separa palabras pegadas por salto de PDF como "2026Capacitación" -> "2026 - Capacitación"
        .replace(/(\d{4})([A-ZÁÉÍÓÚÑ])/g, '$1 - $2')
        .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ]{3,})/g, '$1 - $2')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();
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
         .replace(/^Perfil profesional orientado al área de [^.]+\.\s*/gi, '')
         .replace(/^Perfil profesional con sólida trayectoria[^.]+\.\s*/gi, '')
         .replace(/A lo largo de su trayectoria laboral se ha desempeñado en[\s\S]*?estándares de calidad y seguridad\./gi, '')
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
            const esContinuacionCorta = limpia.length < 42 && !limpia.endsWith('.') && anterior.length < 110;

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

function armarConfiguracionModelo(modelo) {
    const config = {
        temperature: 0.25,
        responseMimeType: 'application/json'
    };
    // Evita que gemini-2.5-flash consuma segundos extra razonando internamente
    if (modelo.includes('2.5')) {
        config.thinkingConfig = { thinkingBudget: 0 };
    }
    return config;
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

    for (const modelo of modelos.slice(0, 3)) {
        const url = baseApi + '/' + modelo + ':generateContent?key=' + apiKey;
        const generationConfig = armarConfiguracionModelo(modelo);

        if (tieneTextoSuficiente && promptSoloTexto) {
            try {
                const respTexto = await fetchConTimeout(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: promptSoloTexto }] }],
                        generationConfig
                    })
                }, 18000);
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
                    generationConfig
                })
            }, 20000);
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

// Extrae solo el título/empresa corto de un ítem de experiencia para mencionarlo en el Resumen sin copiar las tareas
function resumirTitularExperiencia(lineaExp) {
    let limpia = lineaExp.replace(/^[-•*]\s*/, '').trim();
    // Cortamos en el primer punto seguido o dos puntos si viene seguido de una lista larga de funciones
    const cortePunto = limpia.split(/\.\s+/)[0];
    if (cortePunto.length <= 75) return cortePunto.replace(/[.;:,]+$/, '');
    return limpia.substring(0, 70).replace(/\s+\S*$/, '').replace(/[.;:,]+$/, '');
}

// Deduce las áreas profesionales reales del candidato cuando el puesto dice "General / Sin especificar"
function deducirAreasPrincipales(textoTotal, puestoFormulario) {
    const p = (puestoFormulario || '').trim();
    if (p && !/^(general|sin especificar|general\s*\/\s*sin especificar|postulaci[oó]n espont[aá]nea|base de datos general)$/i.test(p)) {
        return p;
    }

    const t = (textoTotal || '').toLowerCase();
    const areasDetectadas = [];
    if (/log[ií]stica|dep[oó]sito|autoelevador|stock|inventario|carga y descarga/.test(t)) areasDetectadas.push('logística y gestión de depósitos');
    if (/aduana|aduaner|comercio exterior|despachante/.test(t)) areasDetectadas.push('operaciones aduaneras');
    if (/administraci[oó]n|administrativ|contable|facturaci[oó]n|documental/.test(t)) areasDetectadas.push('gestión administrativa y documental');
    if (/producci[oó]n|operario|planta|maquinista|hilander[ií]a|industrial/.test(t)) areasDetectadas.push('producción industrial');
    if (/cocina|gastronom|pasteler|panader|chef/.test(t)) areasDetectadas.push('gastronomía y producción culinaria');
    if (/ventas|comercial|atenci[oó]n al cliente|cajer/.test(t)) areasDetectadas.push('atención al cliente y gestión comercial');
    if (/supervis|encargad|jefe|liderazgo/.test(t)) areasDetectadas.push('supervisión de equipos operativos');
    if (/seguridad privada|vigilancia|control de accesos/.test(t)) areasDetectadas.push('seguridad patrimonial');
    if (/mantenimiento|refrigeraci[oó]n|alba[ñn]il|t[eé]cnico/.test(t)) areasDetectadas.push('mantenimiento y servicios técnicos');

    if (areasDetectadas.length > 0) {
        return areasDetectadas.slice(0, 3).join(', ');
    }
    return 'operaciones, gestión administrativa y servicios generales';
}

// 🛡️ Clasificador local mejorado: reconoce cualquier encabezado compuesto y redacta un Resumen Ejecutivo sintético (NUNCA repite las tareas de experiencia)
function clasificarCVLocalmente({ textoPlanoExtraido, textoCartaExtraido, datosFormulario }) {
    // Si una línea trae pegado un encabezado al final (ej: "...materiales. ESTUDIOS Y FORMACIÓN"), lo separamos en dos líneas
    const textoPreprocesado = (textoPlanoExtraido || '')
        .replace(/\s+(ESTUDIOS Y FORMACI[OÓ]N|EDUCACI[OÓ]N Y FORMACI[OÓ]N|HABILIDADES Y COMPETENCIAS(?:\s+CLAVE)?|EXPERIENCIA LABORAL|ANTECEDENTES LABORALES|RESUMEN PROFESIONAL)\b/gi, '\n$1\n');

    const lineas = textoPreprocesado.split('\n').map(l => l.trim()).filter(Boolean);
    const expCruda = [];
    const estCruda = [];
    const habCruda = [];
    const datosExtra = [];

    let seccionActual = 'personal';

    for (const linea of lineas) {
        const lUpper = linea.toUpperCase().replace(/\s+/g, ' ');
        const sinSimbolos = limpiarSimbolosDecorativos(linea);
        if (!sinSimbolos) continue;

        if (/^(CURRICUL[U]?M\s+VITAE|DATOS\s+PERSONALES|INFORMACI[OÓ]N\s+PERSONAL)$/i.test(lUpper)) {
            seccionActual = 'personal';
            continue;
        }
        if (/^(RESUMEN(\s+PROFESIONAL)?|PERFIL(\s+PROFESIONAL)?|SOBRE\s+M[IÍ]|OBJETIVO(\s+LABORAL|\s+PROFESIONAL)?)$/i.test(lUpper)) {
            seccionActual = 'resumen_original';
            continue;
        }

        if (/^(CEL\.?|TEL\.?|TEL[EÉ]FONO|C\.?U\.?I\.?L\.?|FECHA DE NACIMIENTO|EDAD|ESTADO CIVIL|NACIONALIDAD)\s*[:.]/i.test(sinSimbolos)) {
            const normalizado = sinSimbolos.replace(/\s+/g, ' ');
            if (!datosExtra.some(d => d.toLowerCase() === normalizado.toLowerCase())) {
                datosExtra.push(normalizado);
            }
            continue;
        }

        // Detecta encabezados simples y compuestos ("ESTUDIOS Y FORMACIÓN", "HABILIDADES Y COMPETENCIAS CLAVE", etc.)
        if (/^(ESTUDIOS(\s+Y\s+FORMACI[OÓ]N|\s+CURSADOS|\s+ACAD[EÉ]MICOS)?|FORMACI[OÓ]N(\s+ACAD[EÉ]MICA|\s+Y\s+CURSOS)?|EDUCACI[OÓ]N(\s+Y\s+FORMACI[OÓ]N)?|CURSOS(\s+REALIZADOS.*|\s+Y\s+CAPACITACIONES)?|PERIODO EN .*|CAPACITACIONES)$/i.test(lUpper)) {
            seccionActual = 'estudios';
            if (/^PERIODO EN /i.test(lUpper)) {
                estCruda.push('• Capacitaciones en ' + sinSimbolos.replace(/^PERIODO EN\s*/i, ''));
            }
            continue;
        }
        if (/^(ANTECEDENTES(\s+LABORALES)?|EXPERIENCIA(\s+LABORAL|\s+PROFESIONAL)?|HISTORIAL\s+LABORAL|TRAYECTORIA(\s+LABORAL)?)$/i.test(lUpper)) {
            seccionActual = 'experiencia';
            continue;
        }
        if (/^(CONOCIMIENTOS(\s+T[EÉ]CNICOS)?|HABILIDADES(\s+Y\s+COMPETENCIAS(\s+CLAVE)?|\s+T[EÉ]CNICAS|\s+CLAVE)?|ACTITUDES(\s+Y\s+HABILIDADES)?|APTITUDES|COMPETENCIAS(\s+CLAVE|\s+LABORALES)?|IDIOMAS|INFORM[AÁ]TICA|HERRAMIENTAS(\s+DIGITALES)?)$/i.test(lUpper)) {
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

    const expFinal = [...lineasFormExp, ...expUnida]
        .filter(e => !/^(ESTUDIOS|HABILIDADES|EDUCACI[OÓ]N)/i.test(e))
        .map(e => `• ${e}`);

    if (textoCartaExtraido) {
        expFinal.push(`• Referencia / Carta de Recomendación adjunta: ${limpiarYCorregirTexto(limpiarSimbolosDecorativos(textoCartaExtraido))}`);
    }

    const lineasFormEst = formEstRaw.split('\n')
        .filter(l => !l.trim().startsWith('•') && !/^(CEL\.?|TEL\.?|PERIODO EN)/i.test(l.trim()))
        .map(l => limpiarSimbolosDecorativos(l).replace(/^[-•*]\s*/, '').trim())
        .filter(l => l && !estUnida.some(e => e.toLowerCase().includes(l.substring(0, 15).toLowerCase())));

    const estUnicos = [];
    for (const item of [...estUnida, ...lineasFormEst]) {
        const itemSeparado = limpiarYCorregirTexto(item);
        if (!/^(CEL\.?|TEL\.?|PERIODO EN|HABILIDADES)/i.test(itemSeparado) && !estUnicos.includes(itemSeparado)) {
            estUnicos.push(itemSeparado);
        }
    }
    const estFinal = estUnicos.map(e => `• ${e}`);

    const itemsFormHab = formHabRaw.split(/[•,]|\s-\s/).map(h => limpiarSimbolosDecorativos(h).trim())
        .filter(h => h && h.length > 2 && !habUnida.some(x => x.toLowerCase().includes(h.toLowerCase())));

    const habUnicas = [];
    for (const h of [...itemsFormHab, ...habUnida]) {
        // Si viene una tira con "•", la abrimos en habilidades individuales limpias
        const subItems = h.split('•').map(s => s.replace(/\.$/, '').trim()).filter(Boolean);
        for (const sub of subItems) {
            if (sub.length > 2 && !habUnicas.some(u => u.toLowerCase() === sub.toLowerCase())) {
                habUnicas.push(sub);
            }
        }
    }

    // ✍️ Redacción ejecutiva sintética (NUNCA copia y pega las funciones largas de Experiencia Laboral)
    const textoGlobalParaAnalisis = `${textoPlanoExtraido}\n${formExpRaw}\n${formEstRaw}\n${formHabRaw}`;
    const areasPerfil = deducirAreasPrincipales(textoGlobalParaAnalisis, datosFormulario.puestoRequerido);

    const titularesCortos = [...expUnida, ...lineasFormExp]
        .map(resumirTitularExperiencia)
        .filter(t => t.length > 3);

    const sintesisRoles = titularesCortos.length > 0
        ? `Cuenta con recorrido laboral comprobable ocupando roles como ${titularesCortos.slice(0, 4).join(', ')}, aportando capacidad de organización, control operativo y cumplimiento de objetivos.`
        : `Cuenta con experiencia práctica comprobable, adaptándose con solvencia a equipos de trabajo y estándares operativos exigentes.`;

    const formacionDestacada = estUnicos.length > 0
        ? `Complementa su perfil con formación en ${resumirTitularExperiencia(estUnicos[0])}${estUnicos.length > 1 ? ' y capacitación continua aplicable al puesto' : ''}.`
        : '';

    const skillsCortas = habUnicas
        .map(s => s.replace(/^[^:]+:\s*/, '').trim())
        .filter(s => s.length > 2 && s.length < 45)
        .slice(0, 5);

    const cierreCompetencias = skillsCortas.length > 0
        ? `Sobresale por su manejo en ${skillsCortas.join(', ')}, con disponibilidad ${datosFormulario.disponibilidad || 'inmediata'}.`
        : `Posee marcada orientación a resultados, responsabilidad y disponibilidad ${datosFormulario.disponibilidad || 'inmediata'}.`;

    const resumenSintetico = [
        `Perfil versátil con sólida experiencia en ${areasPerfil}.`,
        sintesisRoles,
        formacionDestacada,
        cierreCompetencias,
        textoCartaExtraido ? `Dispone de referencias laborales comprobables adjuntas en su legajo.` : ''
    ].filter(Boolean).join(' ');

    return {
        datosPersonalesExtra: datosExtra.join(' | '),
        resumen: limpiarYCorregirTexto(resumenSintetico),
        experiencia: expFinal.length > 0 ? expFinal.join('\n') : (formExpRaw || 'No especificada'),
        estudios: estFinal.length > 0 ? estFinal.join('\n') : (formEstRaw || 'Secundario Completo'),
        habilidades: habUnicas.length > 0 ? habUnicas.join(' • ') : (formHabRaw || 'Responsabilidad • Puntualidad • Trabajo en equipo'),
        habilidadesDuras: habUnicas.join(' • '),
        habilidadesBlandas: 'Responsabilidad • Puntualidad • Adaptación a normas y equipos de trabajo',
        textoCompletoIntegrado: `${datosExtra.join(' | ')}\n${resumenSintetico}\n${expFinal.join('\n')}\n${estFinal.join('\n')}\n${habUnicas.join(' • ')}`
    };
}

async function fusionarYOptimizarCVConGemini({ cvBuffer, cvMimeType, textoPlanoExtraido, cartaBuffer, cartaMimeType, textoCartaExtraido, datosFormulario }) {
    const expLimpia = limpiarTextoPrevioFormulario(datosFormulario.experiencia);
    const resLimpio = limpiarTextoPrevioFormulario(datosFormulario.resumen);
    const estLimpio = limpiarTextoPrevioFormulario(datosFormulario.estudios);
    const habLimpia = limpiarTextoPrevioFormulario(datosFormulario.habilidades);

    const puestoLimpio = (datosFormulario.puestoRequerido || '').replace(/general\s*\/\s*sin especificar/i, '').trim();

    const prompt = `Eres un Consultor Senior en Selección de Personal y Redacción Ejecutiva de CVs ATS.
Tu tarea es estructurar y optimizar el CV completo del postulante unificando toda la información de su CV adjunto, su Carta de Recomendación (si tiene) y el formulario.

REGLAS CRÍTICAS DE ORO (CUMPLIMIENTO OBLIGATORIO):
1) DIFERENCIA TOTAL ENTRE "resumen" Y "experiencia":
   - PROHIBIDO copiar y pegar la lista de trabajos o las descripciones de tareas dentro del "resumen".
   - El "resumen" debe ser un PÁRRAFO EJECUTIVO DE SÍNTESIS (de 4 a 5 líneas fluidas, máx. 95 palabras) que defina quién es profesionalmente el candidato, qué rubros domina (ej. logística fiscal, gestión aduanera, supervisión operativa, gastronomía, etc.), cuál es su valor diferencial, su formación principal y su disponibilidad. NUNCA escribas frases como "orientado al área de General / Sin especificar"; deduce su especialidad real a partir de su trayectoria.
2) SECCIÓN "experiencia" (DETALLADA Y SEPARADA POR EMPRESA):
   - Aquí va CADA puesto o empresa en su PROPIA viñeta "• " en un renglón aparte (NUNCA mezcles dos empresas distintas en la misma viñeta).
   - Formato de cada viñeta: "• Cargo — Empresa (Período si figura): Descripción clara y concreta de responsabilidades y logros."
   - JAMÁS incluyas estudios, escuelas ni listas de habilidades al final de "experiencia".
3) SECCIÓN "estudios":
   - Cada título académico, curso o certificación va en su PROPIA viñeta "• " en renglones separados (ej: "• Asistente Aduanero — Instituto ICA (Agosto 2026)"). Separa cualquier texto que haya venido pegado.
4) SECCIÓN "datosPersonalesExtra":
   - Solo datos filiatorios adicionales que estén en el CV (Fecha de nacimiento, Edad, CUIL, Estado civil, Teléfono alternativo) separados por " | ". Si no hay datos extra, devuelve "".
5) SECCIÓN "habilidades":
   - Competencias técnicas, sistemas, normativas, carnets y habilidades blandas limpias, separadas por " • ".

DATOS DEL FORMULARIO:
- Vacante / Objetivo declarado: ${puestoLimpio || 'Deducir según experiencia'}
- Disponibilidad: ${datosFormulario.disponibilidad || 'Inmediata'}
- Resumen previo: ${resLimpio}
- Experiencia previa: ${expLimpia}
- Estudios previos: ${estLimpio}
- Habilidades previas: ${habLimpia}

${textoPlanoExtraido ? `TEXTO EXTRAÍDO DEL ARCHIVO DE CV:\n${textoPlanoExtraido}\n` : ''}
${textoCartaExtraido ? `TEXTO DE CARTA DE RECOMENDACIÓN:\n${textoCartaExtraido}\n` : ''}

Devuelve ÚNICAMENTE un objeto JSON válido con estas claves exactas:
{
  "datosPersonalesExtra": "",
  "resumen": "",
  "experiencia": "",
  "estudios": "",
  "habilidades": "",
  "habilidadesDuras": "",
  "habilidadesBlandas": "",
  "textoCompletoIntegrado": ""
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

    const tieneTextoSuficiente = Boolean(textoPlanoExtraido && textoPlanoExtraido.trim().length > 100);
    const respaldoLocal = clasificarCVLocalmente({ textoPlanoExtraido, textoCartaExtraido, datosFormulario });

    try {
        const respuestaIA = await generarConGeminiSeguro(parts, prompt, tieneTextoSuficiente);
        if (respuestaIA && respuestaIA.resumen && respuestaIA.experiencia) {
            respuestaIA.datosPersonalesExtra = limpiarSimbolosDecorativos(respuestaIA.datosPersonalesExtra || respaldoLocal.datosPersonalesExtra);
            respuestaIA.resumen = limpiarSimbolosDecorativos(respuestaIA.resumen);
            respuestaIA.experiencia = limpiarSimbolosDecorativos(respuestaIA.experiencia);
            respuestaIA.estudios = limpiarSimbolosDecorativos(respuestaIA.estudios || respaldoLocal.estudios);
            respuestaIA.habilidades = limpiarSimbolosDecorativos(respuestaIA.habilidades || respaldoLocal.habilidades);
            return respuestaIA;
        }
    } catch (errIA) {
        console.warn("Usando clasificador local sintético:", errIA.message);
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
        candidato.datosPersonalesExtra = limpiarYCorregirTexto(resultadoGemini.datosPersonalesExtra || '');
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
          "resumen": "Resumen ejecutivo sintético de 4 líneas (sin copiar las experiencias palabra por palabra)",
          "experiencia": "Todas las experiencias laborales detalladas en renglones separados con viñetas (•), una viñeta por empresa",
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

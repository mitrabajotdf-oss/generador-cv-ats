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

async function fetchConTimeout(url, options = {}, timeoutMs = 25000) {
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

// Limpia solo las frases plantilleras viejas sin borrar lo que el usuario haya editado manualmente
function limpiarTextoPrevioFormulario(texto) {
    if (!texto) return '';
    let t = texto
        .split('--- DETALLE COMPLETO EXTRAÍDO DEL CV ORIGINAL ---')[0]
        .split('--- CARTA DE RECOMENDACIÓN / REFERENCIAS ADJUNTAS ---')[0]
        .trim();

    t = t.replace(/^Perfil versátil con sólida experiencia en[\s\S]*$/gi, '')
         .replace(/^Perfil postulado para [^.]+\.\s*/gi, '')
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

// Detecta si un renglón es el comienzo de un nuevo puesto laboral o un nuevo estudio para NO pegarlo al anterior
function pareceNuevoItemLaboralOEstudio(linea) {
    const l = linea.trim();
    if (/^[✓✔☑➢➤►•*]|^\d{4}\s*[-–/]/.test(l)) return true;
    if (/^(Administrativo|Supervisor|Operario|Operador|Encargado|Jefe|Ayudante|Auxiliar|Técnico|Vendedor|Cajero|Recepcionista|Chofer|Seguridad Privada|Personal de|Carga y Descarga| Atención al Cliente| Analista| Asistente| Coordinador| Gerente| Pastelero| Pastelera| Panadero| Cocinero| Bachero| Mozo| Camarera)/i.test(l)) {
        return true;
    }
    if (/^(Primario Completo|Primario Incompleto|Secundario Completo|Secundarios Completos|Secundario Incompleto|Terciario|Universitario|Licenciatura|Tecnicatura|Curso |Capacitación|Certificación|Instituto |Escuela |Colegio )/i.test(l)) {
        return true;
    }
    return false;
}

function unirRenglonesCortados(lineasCrudas) {
    const resultado = [];
    for (let raw of lineasCrudas) {
        let limpia = limpiarSimbolosDecorativos(raw).replace(/^[-•*]\s*/, '').trim();
        if (!limpia) continue;

        // Si en medio del mismo renglón quedó pegado "Secundario Incompleto" o similar después de una ciudad, lo partimos
        if (/\b(Primario Completo|Secundario Completo|Secundario Incompleto|Terciario Completo|Terciario Incompleto)\b/i.test(limpia) && limpia.length > 45) {
            const partesEst = limpia.split(/(?=\b(?:Primario|Secundario|Terciario|Universitario)\s+(?:Completo|Incompleto)\b)/i).map(s => s.trim()).filter(Boolean);
            if (partesEst.length > 1) {
                for (const p of partesEst) resultado.push(p);
                continue;
            }
        }

        if (resultado.length === 0 || pareceNuevoItemLaboralOEstudio(raw)) {
            resultado.push(limpia);
        } else {
            const anterior = resultado[resultado.length - 1];
            const empiezaMinusculaOParentesis = /^[a-záéíóúñ0-9()]/.test(limpia);
            const anteriorTerminaAbierto = /[-–(/:,]$\vert{}\b(de\vert{}del\vert{}en\vert{}el\vert{}la\vert{}los\vert{}las\vert{}para\vert{}por\vert{}con\vert{}y\vert{}o\vert{}a\vert{}su\vert{}propia\vert{}sector\vert{}capacitación\vert{}charla\vert{}buenas\vert{}taller\vert{}escuela\vert{}dr\.\vert{}sra\.\vert{}ing\.)$/i.test(anterior);
            const anteriorTerminaEnPuntoFinal = /\.$/.test(anterior) && !/\b(S\.A\.\vert{}S\.R\.L\.\vert{}Dr\.\vert{}Sr\.\vert{}Sra\.\vert{}Lic\.\vert{}Ing\.\vert{}N\.°\vert{}N°\.)$/i.test(anterior);

            if (!anteriorTerminaEnPuntoFinal && (empiezaMinusculaOParentesis || anteriorTerminaAbierto || anterior.length < 75)) {
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

            // Priorizamos gemini-2.5-flash y gemini-1.5-flash que son los más estables y activos hoy
            const preferidos = [
                'gemini-2.5-flash',
                'gemini-2.5-flash-lite',
                'gemini-1.5-flash',
                'gemini-2.0-flash'
            ];

            const ordenados = preferidos.filter(p => soportados.includes(p));
            const otros = soportados.filter(s => s.includes('flash') && !ordenados.includes(s));
            modelosDisponiblesCache = [...ordenados, ...otros];
            if (modelosDisponiblesCache.length > 0) return modelosDisponiblesCache;
        }
    } catch (e) {
        console.warn('Aviso al listar modelos:', e.message);
    }
    return ['gemini-2.5-flash', 'gemini-1.5-flash'];
}

// Configuración limpia compatible con TODOS los modelos v1beta sin causar Error 400
async function generarConGeminiSeguro(partsConArchivos, promptSoloTexto, tieneTextoSuficiente = false) {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) throw new Error("Falta configurar GEMINI_API_KEY en Render");

    const modelos = await obtenerModelosActivos();
    const baseApi = ['https:', '', 'generativelanguage.googleapis.com', 'v1beta', 'models'].join('/');
    let ultimoError = null;

    const generationConfig = {
        temperature: 0.2,
        responseMimeType: 'application/json'
    };

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

        if (tieneTextoSuficiente && promptSoloTexto) {
            try {
                const respTexto = await fetchConTimeout(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: promptSoloTexto }] }],
                        generationConfig
                    })
                }, 22000);
                const dataTexto = await respTexto.json();
                if (dataTexto.candidates && dataTexto.candidates[0]?.content?.parts?.[0]?.text) {
                    return extraerJSONLimpio(dataTexto.candidates[0].content.parts[0].text);
                }
                if (dataTexto.error) {
                    console.warn(`Aviso API texto (${modelo}):`, dataTexto.error.message);
                }
            } catch (errFast) {
                ultimoError = errFast;
                console.warn(`Aviso timeout texto (${modelo}):`, errFast.message);
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
            }, 25000);
            const data = await resp.json();
            if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                return extraerJSONLimpio(data.candidates[0].content.parts[0].text);
            }
            if (data.error) throw new Error(data.error.message);
        } catch (err) {
            ultimoError = err;
            console.warn(`Aviso multimodal (${modelo}):`, err.message);
        }
    }
    throw ultimoError || new Error("Tiempo de espera agotado con Gemini");
}

// Extrae titular corto respetando abreviaturas como Dr., S.A., S.R.L., Ing., Lic.
function resumirTitularExperiencia(lineaExp) {
    let limpia = lineaExp.replace(/^[-•*]\s*/, '').trim();
    // Protegemos abreviaturas temporalmente para no cortar en "Dr." o "S.R.L."
    const protegida = limpia
        .replace(/\b(Dr|Sr|Sra|Lic|Ing|Prof|Tec)\./gi, '$1_PUNTO_')
        .replace(/S\.R\.L\./gi, 'SRL_PUNTO_')
        .replace(/S\.A\./gi, 'SA_PUNTO_');

    const primerBloque = protegida.split(/\.\s+|:\s+/)[0]
        .replace(/_PUNTO_/g, '.');

    if (primerBloque.length <= 75) return primerBloque.replace(/[.;:,]+$/, '').trim();
    return limpia.substring(0, 68).replace(/\s+\S*$/, '').replace(/[.;:,]+$/, '').trim();
}

function deducirAreasPrincipales(textoTotal, puestoFormulario) {
    const p = (puestoFormulario || '').trim();
    if (p && !/^(general|sin especificar|general\s*\/\s*sin especificar|postulaci[oó]n espont[aá]nea|base de datos general)$/i.test(p)) {
        return p;
    }

    const t = (textoTotal || '').toLowerCase();
    const areasDetectadas = [];
    if (/log[ií]stica|dep[oó]sito|autoelevador|stock|inventario|carga y descarga/.test(t)) areasDetectadas.push('Operaciones Logísticas y Depósito Fiscal');
    if (/aduana|aduaner|comercio exterior|despachante/.test(t)) areasDetectadas.push('Gestión Aduanera');
    if (/administraci[oó]n|administrativ|contable|facturaci[oó]n|documental/.test(t)) areasDetectadas.push('Administración Documental');
    if (/producci[oó]n|operario|planta|maquinista|hilander[ií]a|industrial/.test(t)) areasDetectadas.push('Producción Industrial');
    if (/cocina|gastronom|pasteler|panader|chef/.test(t)) areasDetectadas.push('Gastronomía y Pastelería');
    if (/ventas|comercial|atenci[oó]n al cliente|cajer/.test(t)) areasDetectadas.push('Atención al Cliente y Ventas');
    if (/supervis|encargad|jefe|liderazgo/.test(t)) areasDetectadas.push('Supervisión de Equipos');
    if (/seguridad privada|vigilancia|control de accesos/.test(t)) areasDetectadas.push('Seguridad Patrimonial');

    if (areasDetectadas.length > 0) {
        return areasDetectadas.slice(0, 3).join(', ');
    }
    return 'Operaciones, Administración y Servicios';
}

// 🛡️ Clasificador local mejorado (respeta ediciones manuales del panel y nunca corta abreviaturas ni une empresas distintas)
function clasificarCVLocalmente({ textoPlanoExtraido, textoCartaExtraido, datosFormulario }) {
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

        if (/^(ESTUDIOS(\s+Y\s+FORMACI[OÓ]N|\s+CURSADOS|\s+ACAD[EÉ]MICOS)?|FORMACI[OÓ]N(\s+ACAD[EÉ]MICA|\s+Y\s+CURSOS)?|EDUCACI[OÓ]N(\s+Y\s+FORMACI[OÓ]N)?|CURSOS(\s+REALIZADOS.*|\s+Y\s+CAPACITACIONES)?|PERIODO EN .*|CAPACITACIONES)$/i.test(lUpper)) {
            seccionActual = 'estudios';
            if (/^PERIODO EN /i.test(lUpper)) {
                estCruda.push('Capacitaciones en ' + sinSimbolos.replace(/^PERIODO EN\s*/i, ''));
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

    const expUnidaPDF = unirRenglonesCortados(expCruda);
    const estUnidaPDF = unirRenglonesCortados(estCruda);
    const habUnidaPDF = unirRenglonesCortados(habCruda);

    const formExpRaw = limpiarTextoPrevioFormulario((datosFormulario.experiencia || '').replace(/=/g, ': '));
    const formEstRaw = limpiarTextoPrevioFormulario((datosFormulario.estudios || '').replace(/=/g, ': '));
    const formHabRaw = limpiarTextoPrevioFormulario(datosFormulario.habilidades || '');
    const formResRaw = limpiarTextoPrevioFormulario(datosFormulario.resumen || '');

    // Respetamos los renglones editados en el panel (aunque tengan "•"), evitando duplicados con el PDF
    const lineasFormExp = formExpRaw.split('\n')
        .map(l => limpiarSimbolosDecorativos(l).replace(/^[-•*]\s*/, '').trim())
        .filter(l => l && !/^(ESTUDIOS|HABILIDADES|EDUCACI[OÓ]N)/i.test(l));

    const expCombinada = [...lineasFormExp];
    for (const itemPDF of expUnidaPDF) {
        const prefijo = itemPDF.substring(0, 20).toLowerCase();
        if (!expCombinada.some(x => x.toLowerCase().includes(prefijo))) {
            expCombinada.push(itemPDF);
        }
    }
    const expFinal = expCombinada.map(e => `• ${e}`);

    if (textoCartaExtraido) {
        const textoCartaLimpio = limpiarYCorregirTexto(limpiarSimbolosDecorativos(textoCartaExtraido));
        if (!expFinal.some(x => x.includes('Carta de Recomendación'))) {
            expFinal.push(`• Referencia / Carta de Recomendación adjunta: ${textoCartaLimpio}`);
        }
    }

    const lineasFormEst = formEstRaw.split('\n')
        .map(l => limpiarSimbolosDecorativos(l).replace(/^[-•*]\s*/, '').trim())
        .filter(l => l && !/^(CEL\.?|TEL\.?|PERIODO EN|HABILIDADES)/i.test(l));

    const estUnicos = [...lineasFormEst];
    for (const item of estUnidaPDF) {
        const itemSeparado = limpiarYCorregirTexto(item);
        const prefijo = itemSeparado.substring(0, 18).toLowerCase();
        if (!/^(CEL\.?|TEL\.?|PERIODO EN|HABILIDADES)/i.test(itemSeparado) && !estUnicos.some(x => x.toLowerCase().includes(prefijo))) {
            estUnicos.push(itemSeparado);
        }
    }
    const estFinal = estUnicos.map(e => `• ${e}`);

    const habUnicas = [];
    for (const fuente of [formHabRaw, ...habUnidaPDF]) {
        const subItems = (fuente || '').split(/[•,]|\s-\s/).map(s => limpiarSimbolosDecorativos(s).replace(/\.$/, '').trim()).filter(Boolean);
        for (const sub of subItems) {
            // Quitamos prefijos de categoría largos como "Logística y Operaciones: Gestión de depósitos" -> "Gestión de depósitos"
            const limpiaSub = sub.replace(/^(Logística y Operaciones|Administración y Aduana|Liderazgo y Trabajo en Campo|Herramientas Digitales)\s*:\s*/i, '').trim();
            if (limpiaSub.length > 2 && !habUnicas.some(u => u.toLowerCase() === limpiaSub.toLowerCase())) {
                habUnicas.push(limpiaSub);
            }
        }
    }

    const textoGlobalParaAnalisis = `${textoPlanoExtraido}\n${formExpRaw}\n${formEstRaw}\n${formHabRaw}`;
    const areasPerfil = deducirAreasPrincipales(textoGlobalParaAnalisis, datosFormulario.puestoRequerido);

    // Si el usuario escribió o editó manualmente un buen Resumen propio en el panel, lo respetamos y pulimos
    let resumenFinal = '';
    if (formResRaw && formResRaw.length > 80) {
        resumenFinal = formResRaw;
    } else {
        const titularesCortos = expCombinada
            .map(resumirTitularExperiencia)
            .filter(t => t.length > 4 && !/^(Coordinación|Gestión|Cumplimiento|Seguimiento|Control|Atención|Recepción)/i.test(t));

        const mencionCargos = titularesCortos.length > 0
            ? `Ha desarrollado funciones clave como ${titularesCortos.slice(0, 3).join(', ')}, garantizando orden documental, control de inventarios y cumplimiento de normativas operativas y de seguridad.`
            : `Aporta experiencia práctica comprobable en control de procesos, organización operativa y cumplimiento de estándares de calidad.`;

        const skillsDestacadas = habUnicas.filter(s => s.length < 40).slice(0, 5);

        resumenFinal = [
            `Perfil profesional especializado en ${areasPerfil}, con sólida trayectoria comprobable en entornos operativos exigentes.`,
            mencionCargos,
            skillsDestacadas.length > 0 ? `Destaca por sus competencias en ${skillsDestacadas.join(', ')}, adaptabilidad al trabajo en equipo y disponibilidad ${datosFormulario.disponibilidad || 'inmediata'}.` : `Posee alta capacidad resolutiva, compromiso y disponibilidad ${datosFormulario.disponibilidad || 'inmediata'}.`
        ].join(' ');
    }

    return {
        puestoSugerido: areasPerfil,
        datosPersonalesExtra: datosExtra.join(' | '),
        resumen: limpiarYCorregirTexto(resumenFinal),
        experiencia: expFinal.length > 0 ? expFinal.join('\n') : (formExpRaw || 'No especificada'),
        estudios: estFinal.length > 0 ? estFinal.join('\n') : (formEstRaw || 'Secundario Completo'),
        habilidades: habUnicas.length > 0 ? habUnicas.join(' • ') : (formHabRaw || 'Responsabilidad • Puntualidad • Trabajo en equipo'),
        habilidadesDuras: habUnicas.join(' • '),
        habilidadesBlandas: 'Responsabilidad • Puntualidad • Trabajo en equipo • Proactividad',
        textoCompletoIntegrado: `${datosExtra.join(' | ')}\n${resumenFinal}\n${expFinal.join('\n')}\n${estFinal.join('\n')}\n${habUnicas.join(' • ')}`
    };
}

async function fusionarYOptimizarCVConGemini({ cvBuffer, cvMimeType, textoPlanoExtraido, cartaBuffer, cartaMimeType, textoCartaExtraido, datosFormulario }) {
    const expLimpia = limpiarTextoPrevioFormulario(datosFormulario.experiencia);
    const resLimpio = limpiarTextoPrevioFormulario(datosFormulario.resumen);
    const estLimpio = limpiarTextoPrevioFormulario(datosFormulario.estudios);
    const habLimpia = limpiarTextoPrevioFormulario(datosFormulario.habilidades);

    const puestoDeclarado = (datosFormulario.puestoRequerido || '').replace(/general(\s*\/\s*sin especificar)?/i, '').trim();

    const prompt = `Eres un Consultor Experto en Recursos Humanos y Redacción de CVs ATS en Argentina.
Debes generar el CV ATS Optimizado del candidato combinando:
1) Los datos editados/cargados en el Panel o Formulario (TIENEN PRIORIDAD si el reclutador agregó cursos, fechas o correcciones).
2) El texto/documento del CV original adjunto.
3) La Carta de Recomendación adjunta (si existe).

REGLAS OBLIGATORIAS DE CALIDAD:
1) "puestoSugerido": Si la vacante declarada está vacía o dice "General", redacta un objetivo profesional corto y preciso acorde a su perfil real (ej: "Logística, Depósito Fiscal y Gestión Aduanera"). Si ya tenía un puesto claro, mantenlo.
2) "datosPersonalesExtra": Únicamente datos personales adicionales del CV (Fecha de nacimiento, Edad, CUIL, Estado civil, Teléfono alternativo) separados por " | ". Si no hay, devuelve "".
3) "resumen": Redacta un Resumen Profesional IMPECABLE, natural y ejecutivo de 4 a 5 líneas (70 a 100 palabras).
   - Sintetiza su perfil profesional, años/solidez de experiencia, rubros principales (ej. operatoria en depósitos fiscales, gestión aduanera, logística, producción, gastronomía, etc.), sus estudios/cursos más relevantes (si hizo cursos recientes, destácalos, NUNCA pongas "Escuela Dr." cortado ni resaltes solo la primaria si tiene cursos técnicos) y sus fortalezas clave.
   - PROHIBIDO copiar listas de tareas o pegar renglones crudos del CV. Debe leerse fluido y 100% profesional.
4) "experiencia": Coloca CADA puesto/empresa en una viñeta "• " separada por salto de línea (\\n).
   - NUNCA juntes dos empresas distintas en la misma viñeta. Si en el texto original estaban pegadas (ej. JOW KON LOGÍSTICA, LOGÍSTICA FUEGUINA, Depósito Fiscal N° 12, Susana Mabel Sanabria, PRESEG, STEAL, Ayudante de Albañil, ANSAL), sepáralas una por una en su propia viñeta "• Cargo — Empresa: Tareas resumidas con claridad.".
5) "estudios": Coloca CADA estudio, nivel educativo o curso en su propia viñeta "• " separada por salto de línea (\\n). Incluye TODOS los estudios/cursos que figuren tanto en "Estudios del Panel/Formulario" como en el CV original, sin cortar nombres de instituciones.
6) "habilidades": Lista limpia de competencias técnicas, herramientas y habilidades blandas separadas por " • " (sin títulos largos adelante como "Logística y Operaciones:").

DATOS DEL PANEL / FORMULARIO (RESPETAR TODA INFORMACIÓN AGREGADA AQUÍ):
- Vacante declarada: ${puestoDeclarado || 'Deducir según perfil'}
- Disponibilidad: ${datosFormulario.disponibilidad || 'Inmediata'}
- Resumen en Panel: ${resLimpio}
- Experiencia en Panel: ${expLimpia}
- Estudios en Panel: ${estLimpio}
- Habilidades en Panel: ${habLimpia}

${textoPlanoExtraido ? `TEXTO EXTRAÍDO DEL ARCHIVO DE CV:\n${textoPlanoExtraido}\n` : ''}
${textoCartaExtraido ? `TEXTO DE CARTA DE RECOMENDACIÓN:\n${textoCartaExtraido}\n` : ''}

Devuelve ESTRICTAMENTE este JSON puro:
{
  "puestoSugerido": "",
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

    const tieneTextoSuficiente = Boolean((textoPlanoExtraido && textoPlanoExtraido.trim().length > 80) || expLimpia.length > 80);
    const respaldoLocal = clasificarCVLocalmente({ textoPlanoExtraido, textoCartaExtraido, datosFormulario });

    try {
        const respuestaIA = await generarConGeminiSeguro(parts, prompt, tieneTextoSuficiente);
        if (respuestaIA && respuestaIA.resumen && respuestaIA.experiencia) {
            respuestaIA.puestoSugerido = limpiarSimbolosDecorativos(respuestaIA.puestoSugerido || respaldoLocal.puestoSugerido);
            respuestaIA.datosPersonalesExtra = limpiarSimbolosDecorativos(respuestaIA.datosPersonalesExtra || respaldoLocal.datosPersonalesExtra);
            respuestaIA.resumen = limpiarSimbolosDecorativos(respuestaIA.resumen);
            respuestaIA.experiencia = limpiarSimbolosDecorativos(respuestaIA.experiencia);
            respuestaIA.estudios = limpiarSimbolosDecorativos(respuestaIA.estudios || respaldoLocal.estudios);
            respuestaIA.habilidades = limpiarSimbolosDecorativos(respuestaIA.habilidades || respaldoLocal.habilidades);
            return respuestaIA;
        }
    } catch (errIA) {
        console.warn("Usando clasificador local mejorado:", errIA.message);
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
        // Si el candidato tenía "General / Sin especificar", le colocamos automáticamente su especialidad real
        if (!candidato.puestoRequerido || /general(\s*\/\s*sin especificar)?/i.test(candidato.puestoRequerido)) {
            if (resultadoGemini.puestoSugerido) {
                candidato.puestoRequerido = limpiarYCorregirTexto(resultadoGemini.puestoSugerido);
            }
        }
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
                    } else if (cartaContentType.includes('

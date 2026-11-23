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

const authMiddleware = basicAuth({
    users: { 'MitrabajoTDF': 'EmpleoRG' },
    challenge: true,
    realm: 'Portal de Reclutamiento Protegido - Mi Trabajo TDF'
});

app.get('/', authMiddleware, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/formulario.html', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'public', 'formulario.html'));
});

app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

mongoose.connect(process.env.MONGODB_URI)
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
    disponibilidadViajar: String,
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
    editadoManualmente: { type: Boolean, default: false },
    pagado: { type: Boolean, default: false }
});

const Candidato = mongoose.model('Candidato', candidatoSchema);

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

async function buscarCandidatoDB(paramId) {
    const limpio = String(paramId || '').trim();
    const numId = Number(limpio);
    if (!Number.isNaN(numId) && limpio !== '') {
        const porId = await Candidato.findOne({ id: numId });
        if (porId) return porId;
    }
    if (mongoose.Types.ObjectId.isValid(limpio)) {
        return await Candidato.findById(limpio);
    }
    return null;
}

async function fetchConTimeout(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
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
                html: `<div style="font-family: Arial, sans-serif; padding: 20px;"><h2>¡Nuevo Postulante Registrado! 🚀</h2><p><strong>👤 Nombre:</strong> ${candidato.nombre}</p><p><strong>💼 Puesto:</strong> ${candidato.puestoRequerido}</p><p><strong>✈️ Disponibilidad para viajar:</strong> ${candidato.disponibilidadViajar || 'No especificada'}</p></div>`
            })
        }, 8000);
    } catch (error) {
        console.error('Error al enviar alerta email:', error.message);
    }
}

function corregirOrtografiaComun(texto) {
    if (!texto) return '';
    let t = String(texto);

    const diccionario = [
        ['logistica', 'logística'],
        ['deposito', 'depósito'],
        ['depositos', 'depósitos'],
        ['administracion', 'administración'],
        ['atencion', 'atención'],
        ['produccion', 'producción'],
        ['recepcion', 'recepción'],
        ['coordinacion', 'coordinación'],
        ['supervision', 'supervisión'],
        ['organizacion', 'organización'],
        ['planificacion', 'planificación'],
        ['comunicacion', 'comunicación'],
        ['resolucion', 'resolución'],
        ['prevencion', 'prevención'],
        ['manipulacion', 'manipulación'],
        ['facturacion', 'facturación'],
        ['computacion', 'computación'],
        ['informatica', 'informática'],
        ['ofimatica', 'ofimática'],
        ['reposteria', 'repostería'],
        ['pasteleria', 'pastelería'],
        ['panaderia', 'panadería'],
        ['gastronomia', 'gastronomía'],
        ['albanil', 'albañil'],
        ['albanileria', 'albañilería'],
        ['refrigeracion', 'refrigeración'],
        ['instalacion', 'instalación'],
        ['instalaciones', 'instalaciones'],
        ['reparacion', 'reparación'],
        ['construccion', 'construcción'],
        ['educacion', 'educación'],
        ['formacion', 'formación'],
        ['capacitacion', 'capacitación'],
        ['capacitaciones', 'capacitaciones'],
        ['certificacion', 'certificación'],
        ['tecnico', 'técnico'],
        ['tecnica', 'técnica'],
        ['practicas', 'prácticas'],
        ['publico', 'público'],
        ['basico', 'básico'],
        ['vehiculo', 'vehículo'],
        ['vehiculos', 'vehículos'],
        ['tramites', 'trámites'],
        ['regimen', 'régimen'],
        ['escribania', 'escribanía'],
        ['profecional', 'profesional'],
        ['experencia', 'experiencia'],
        ['responsavilidad', 'responsabilidad'],
        ['rio grande', 'Río Grande'],
        ['parana', 'Paraná'],
        ['entre rios', 'Entre Ríos'],
        ['asistente aduanero', 'Asistente Aduanero']
    ];

    for (const [mal, bien] of diccionario) {
        const regex = new RegExp(`(^|[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ])(${mal})(?=[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]|$)`, 'gi');
        t = t.replace(regex, (match, p1, palabraOriginal) => {
            if (bien[0] === bien[0].toUpperCase() && mal.includes(' ')) {
                return p1 + bien;
            }
            const esTodoMayus = palabraOriginal === palabraOriginal.toUpperCase() && palabraOriginal.length > 1;
            const empiezaMayus = palabraOriginal[0] === palabraOriginal[0].toUpperCase();
            if (esTodoMayus) return p1 + bien.toUpperCase();
            if (empiezaMayus) return p1 + bien.charAt(0).toUpperCase() + bien.slice(1);
            return p1 + bien;
        });
    }

    t = t.replace(/\bfull[\s-]*(time|tine|tami)\b/gi, 'Full-time')
         .replace(/\bful\s+time\b/gi, 'Full-time')
         .replace(/\bpart[\s-]*time\b/gi, 'Part-time');

    return t;
}

function limpiarYCorregirTexto(texto) {
    if (!texto) return '';
    return corregirOrtografiaComun(
        String(texto)
            .replace(/\r\n/g, '\n')
            .replace(/(\d{4})([A-ZÁÉÍÓÚÑ])/g, '$1 - $2')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .trim()
    );
}

function convertirATextoSeguro(valor, modo = 'lineas') {
    if (!valor) return '';
    if (Array.isArray(valor)) {
        const items = valor.map(item => {
            if (typeof item === 'string') return item.trim();
            if (item && typeof item === 'object') {
                const partes = [item.empresa || item.institucion, item.cargo || item.puesto || item.titulo, item.periodo || item.fecha, item.descripcion || item.funciones || item.detalle].filter(Boolean);
                return partes.join(' — ');
            }
            return String(item || '').trim();
        }).filter(Boolean);
        return modo === 'habilidades' ? items.join(' • ') : items.map(i => i.startsWith('•') ? i : `• ${i}`).join('\n');
    }
    if (typeof valor === 'object') return '';
    return String(valor);
}

function limpiarSimbolosDecorativos(texto) {
    const str = convertirATextoSeguro(texto);
    if (!str) return '';
    return str.replace(/[✓✔☑➢➤►▪▫□■]/g, '').replace(/[ \t]+/g, ' ').trim();
}

function normalizarClaveComparacion(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function capitalizarPrimeraLetra(str) {
    const s = String(str || '').trim();
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// 🧹 Limpiador profundo de Habilidades (elimina subtítulos y fusiona equivalentes/duplicados)
function limpiarYDeduplicarHabilidades(textoCrudo) {
    const base = convertirATextoSeguro(textoCrudo, 'habilidades');
    if (!base) return '';

    let preparado = limpiarSimbolosDecorativos(base)
        .replace(/\.\s*(Administraci[oó]n y Aduana|Log[ií]stica y Operaciones|Liderazgo y Trabajo en Campo|Herramientas Digitales|Habilidades Duras(?:\s*\/\s*T[eé]cnicas)?|Habilidades Blandas|Competencias Clave|Idiomas|Inform[aá]tica)\s*:\s*/gi, ' • ')
        .replace(/\b(Administraci[oó]n y Aduana|Log[ií]stica y Operaciones|Liderazgo y Trabajo en Campo|Herramientas Digitales|Habilidades Duras(?:\s*\/\s*T[eé]cnicas)?|Habilidades Blandas|Competencias Clave)\s*:\s*/gi, ' • ')
        .replace(/\badaptaci[oó]n a ritmos intensos y trabajo en equipo\b/gi, 'Adaptación a ritmos operativos intensos • Trabajo en equipo');

    const fragmentos = preparado
        .split(/[•|;\n]+|,\s*(?![^()]*\))/)
        .map(s => s.replace(/^[-*•\s.]+|[\s.]+$/g, '').trim())
        .filter(s => s.length > 2);

    const resultado = [];

    for (let item of fragmentos) {
        item = item.replace(/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s/]{3,28}:\s*/, '').trim();
        item = corregirOrtografiaComun(capitalizarPrimeraLetra(item));
        if (item.length < 3) continue;

        const claveNueva = normalizarClaveComparacion(item);
        if (!claveNueva) continue;

        let descartar = false;
        for (let i = 0; i < resultado.length; i++) {
            const claveExistente = normalizarClaveComparacion(resultado[i]);
            if (claveExistente === claveNueva) {
                descartar = true;
                break;
            }
            if ((claveNueva.includes('copilot') || claveNueva.includes('inteligencia artificial') || claveNueva.includes('integracion de ia')) &&
                (claveExistente.includes('copilot') || claveExistente.includes('inteligencia artificial') || claveExistente.includes('integracion de ia'))) {
                if (item.length > resultado[i].length) resultado[i] = item;
                descartar = true;
                break;
            }
            if ((claveNueva.includes('atencion al cliente') || claveNueva.includes('atencion a clientes')) &&
                (claveExistente.includes('atencion al cliente') || claveExistente.includes('atencion a clientes'))) {
                if (item.length > resultado[i].length) resultado[i] = item;
                descartar = true;
                break;
            }
            if (claveNueva.includes('control de stock') && claveExistente.includes('control de stock')) {
                resultado[i] = 'Control de Stock, Inventarios y Proveedores';
                descartar = true;
                break;
            }
            if ((claveNueva === 'facturacion' && claveExistente.includes('cobranzas')) ||
                (claveNueva === 'caja y cobranzas' && claveExistente.includes('facturacion'))) {
                resultado[i] = 'Facturación, Caja y Cobranzas';
                descartar = true;
                break;
            }
            if (claveNueva.length >= 10 && claveExistente.includes(claveNueva)) {
                descartar = true;
                break;
            }
            if (claveExistente.length >= 10 && claveNueva.includes(claveExistente)) {
                resultado[i] = item;
                descartar = true;
                break;
            }
        }

        if (!descartar) {
            resultado.push(item);
        }
    }

    return resultado.join(' • ');
}

// 🔪 Separa dos puestos laborales que hayan venido pegados en el mismo renglón (ej. JOW KON + Carga y Descarga LOGÍSTICA FUEGUINA, o STEAL + Ayudante de Albañil)
function partirPuestosPegadosEnLinea(texto) {
    if (!texto) return '';
    let t = texto;

    // Separa si después de un punto seguido arranca un nuevo título de cargo típico seguido de empresa o funciones
    const patronNuevoCargoDespuesDePunto = /\.\s+(?=(?:Carga y Descarga(?: de Camiones)?|Ayudante de (?:Albañil|Cocina|Taller|Panader[ií]a|Pasteler[ií]a)|Administrativo de|Supervisor de|Operario de|Encargado de|Jefe de|Personal de Limpieza|Seguridad Privada|Vendedor(?:a)? y|Atenci[oó]n al P[uú]blico en)\b)/gi;
    t = t.replace(patronNuevoCargoDespuesDePunto, '.\n• ');

    // Separa si hay un asterisco intermedio antes de empresa en mayúsculas
    t = t.replace(/\s+\*\s+(?=[A-ZÁÉÍÓÚÑ0-9])/g, '\n• ')
         .replace(/^\*\s+/gm, '• ');

    return t;
}

// 📐 Da formato ejecutivo uniforme ("• EMPRESA — Cargo | Período: Descripción...") a cada renglón de experiencia cuando le faltan guiones o dos puntos
function estructurarViñetaExperiencia(lineaCruda) {
    let l = corregirOrtografiaComun(lineaCruda.replace(/^[-•*]\s*/, '').trim());
    if (!l) return '';

    // Si ya viene bien estructurada con "—" y ":" o "|", solo pulimos espacios
    if (l.includes('—') && (l.includes(':') || l.includes('|'))) {
        return l.replace(/\s+/g, ' ').trim();
    }

    // Caso 1: Empieza con EMPRESA EN MAYÚSCULAS seguida de Cargo y Período (ej: "ESCRIBANÍA BITSH Asistente de Escrituración... Abril 2024 – Actualidad Promoción...")
    const matchEmpresaPrimero = l.match(/^([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s.&'°º-]{2,38}?)\s+((?:Asistente|Auxiliar|Vendedor|Vendedora|Supervisor|Supervisora|Encargado|Encargada|Jefe|Jefa|Operario|Operaria|Administrativo|Administrativa|Emprendedor|Emprendedora|Titular|Fundador|Fundadora|Cocinero|Cocinera|Pastelero|Pastelera|Cajero|Cajera|Recepcionista|Coordinador|Coordinadora|Analista|Técnico|Técnica)[^0-9\n]{2,55}?)\s+((?:Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre|\d{4})[^.\n]{2,28}?(?:Actualidad|Presente|\d{4}))\s*[:.-]?\s*(.+)$/i);
    if (matchEmpresaPrimero) {
        const [, emp, cargo, periodo, resto] = matchEmpresaPrimero;
        if (emp === emp.toUpperCase()) {
            const desc = resto.replace(/Funciones principales:\s*/gi, '').replace(/\s*Logro destacado:\s*/gi, ' Logro destacado: ').trim();
            return `${emp.trim()} — ${cargo.trim()} | ${periodo.trim()}: ${capitalizarPrimeraLetra(desc)}`;
        }
    }

    // Caso 2: Empieza con Cargo seguido de EMPRESA EN MAYÚSCULAS o Depósito/Institución (ej: "Administrativo de Depósito Fiscal JOW KON LOGÍSTICA S.R.L. Gestión...")
    const matchCargoEmpresaMayus = l.match(/^((?:Administrativo|Supervisor|Operario|Encargado|Jefe|Ayudante|Personal|Seguridad|Carga y Descarga|Vendedor|Cajero|Auxiliar|Técnico)[a-záéíóúñA-ZÁÉÍÓÚÑ0-9\s°º/]{2,50}?)\s+([A-ZÁÉÍÓÚÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ.]{2,})*(?:\s+S\.R\.L\.|\s+S\.A\.)?)\s+(?=[A-ZÁÉÍÓÚÑ][a-záéíóúñ])(.+)$/);
    if (matchCargoEmpresaMayus) {
        const [, cargo, emp, resto] = matchCargoEmpresaMayus;
        return `${emp.trim()} — ${cargo.trim()}: ${capitalizarPrimeraLetra(resto.trim())}`;
    }

    // Caso 3: Cargo en Depósito Fiscal N° X + Persona/Despachante o Descripción directa
    const matchDeposito = l.match(/^((?:Administrativo|Supervisor|Operario)\s+de\s+Depósito\s+Fiscal\s+N[°º.]*\s*\d+)(?:\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}\s+Despachante de Aduana(?:\s+y\s+ATA)?))?\s+((?:Supervisión|Gestión|Control|Recepción|Coordinación).+)$/i);
    if (matchDeposito) {
        const [, cargoDep, empleador, resto] = matchDeposito;
        const titulo = empleador ? `${empleador.trim()} — ${cargoDep.trim()}` : cargoDep.trim();
        return `${titulo}: ${capitalizarPrimeraLetra(resto.trim())}`;
    }

    // Caso 4: Oficio independiente (ej: "Ayudante de Albañil Apoyo en tareas generales...")
    const matchOficio = l.match(/^((?:Ayudante de Albañil|Ayudante de Cocina|Servicio Doméstico| Emprendedor Independiente))\s+((?:Apoyo|Asistencia|Preparación|Atención|Gestión|Realización).+)$/i);
    if (matchOficio) {
        return `${matchOficio[1].trim()}: ${capitalizarPrimeraLetra(matchOficio[2].trim())}`;
    }

    return capitalizarPrimeraLetra(l);
}

function limpiarYOrdenarExperiencia(textoCrudo) {
    const base = convertirATextoSeguro(textoCrudo, 'lineas');
    if (!base) return '';

    const pre = partirPuestosPegadosEnLinea(base);
    const lineas = pre.split('\n')
        .map(l => limpiarSimbolosDecorativos(l).replace(/^[-•*]\s*/, '').trim())
        .filter(Boolean);

    const consolidadas = [];
    for (const l of lineas) {
        if (/^(EXPERIENCIA(\s+LABORAL)?|ANTECEDENTES(\s+LABORALES)?|ESTUDIOS(\s+Y\s+FORMACI[OÓ]N)?|FORMACI[OÓ]N\s+ACAD[EÉ]MICA|CURSOS(\s+Y\s+CAPACITACIONES)?|HABILIDADES.*)$/i.test(l)) {
            continue;
        }

        const esInicioPuestoClaro =
            /\b(19\d{2}|20\d{2}|Actualidad|Presente|S\.R\.L\.|S\.A\.)\b/i.test(l) ||
            /^[A-ZÁÉÍÓÚÑ0-9\s.&'-]{4,35}\s*[—–-]/.test(l) ||
            /^(Administrativo|Supervisor|Operario|Carga y Descarga|Seguridad Privada|Personal de Limpieza|Ayudante de)\b/i.test(l) ||
            /^[A-ZÁÉÍÓÚÑ]{4,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,})+/.test(l);

        const pareceTareaSuelta = !esInicioPuestoClaro && consolidadas.length > 0 &&
            /^(Facturaci[oó]n|Manejo de|Implementaci[oó]n|Coordinaci[oó]n|Atenci[oó]n|Control de|Gesti[oó]n de|Preparaci[oó]n|Solicitud|Seguimiento|Organizaci[oó]n|Apertura|Administraci[oó]n|Promoci[oó]n|Recepci[oó]n|Cumplimiento|Logro destacado)/i.test(l);

        if (pareceTareaSuelta) {
            const ant = consolidadas[consolidadas.length - 1].replace(/\.*$/, '');
            consolidadas[consolidadas.length - 1] = `${ant}. ${l}`;
        } else {
            consolidadas.push(l);
        }
    }

    const estructuradas = [];
    const vistas = new Set();
    for (const item of consolidadas) {
        const formateado = estructurarViñetaExperiencia(item);
        const clave = normalizarClaveComparacion(formateado).substring(0, 38);
        if (clave && !vistas.has(clave)) {
            vistas.add(clave);
            estructuradas.push(formateado);
        }
    }

    // Ordena cronológicamente si tienen fechas; si ninguno tiene años (como un CV funcional), conserva el orden natural
    const algunoTieneFecha = estructuradas.some(t => /\b(actualidad|presente|19\d{2}|20\d{2})\b/i.test(t));
    if (algunoTieneFecha) {
        estructuradas.sort((a, b) => {
            const score = (txt) => {
                const tieneAct = /\b(actualidad|presente|en curso)\b/i.test(txt) ? 10000 : 0;
                const anios = (txt.match(/\b(19\d{2}|20\d{2})\b/g) || []).map(Number);
                const maxAnio = anios.length > 0 ? Math.max(...anios) : 0;
                return tieneAct + maxAnio;
            };
            return score(b) - score(a);
        });
    }

    return estructuradas.map(u => `• ${u}`).join('\n');
}

// 📐 Formatea cada estudio separando claramente Título — Institución (Detalle/Año)
function estructurarViñetaEstudio(lineaCruda) {
    let l = corregirOrtografiaComun(lineaCruda.replace(/^[-•*:]+\s*/, '').trim())
        .replace(/\bCURSOS Y\s*$/i, '')
        .replace(/^CAPACITACIONES\s*/i, '')
        .trim();

    if (!l) return '';
    if (l.includes('—')) return l;

    // Separa instituciones conocidas cuando quedaron pegadas sin guión
    l = l.replace(/\s+(Colegio Provincial|Escuela|Instituto|Universidad|Centro de Formación|FATSA FORMAR|NNEMELS)\b/i, ' — $1')
         .replace(/\s*–\s*(Modalidad Virtual)\s+([A-ZÁÉÍÓÚÑ]{2,})$/i, ' — $2 ($1)')
         .replace(/\.\s+(Instituto\b)/i, ' — $1');

    return capitalizarPrimeraLetra(l);
}

function limpiarEstudiosYFormacion(textoCrudo) {
    const base = convertirATextoSeguro(textoCrudo, 'lineas');
    if (!base) return '';

    let pre = base
        .replace(/\b(FORMACI[OÓ]N\s+ACAD[EÉ]MICA|CURSOS\s+Y\s+CAPACITACIONES|ESTUDIOS\s+Y\s+FORMACI[OÓ]N|EDUCACI[OÓ]N\s+Y\s+FORMACI[OÓ]N|CURSOS\s+REALIZADOS)\b\s*[:*-]*/gi, '\n')
        .replace(/\bCURSOS\s+Y\s*$/gim, '')
        .replace(/^\s*CAPACITACIONES\b\s*[:*-]*/gim, '')
        .replace(/\s+\*\s+/g, '\n• ')
        .replace(/^\*\s+/gm, '• ');

    const lineas = pre.split('\n')
        .map(l => limpiarSimbolosDecorativos(l).replace(/^[-•*:]+\s*/, '').trim())
        .filter(Boolean);

    const expandidas = [];
    for (const l of lineas) {
        if (l.length > 40 && /\b(Primario|Secundario|Terciario|Universitario)\s+(Completo|Incompleto)\b/i.test(l)) {
            const partes = l.split(/\s+(?=(?:Nivel\s+)?(?:Primario|Secundario|Terciario|Universitario)\s+(?:Completo|Incompleto)\b)/i).map(x => x.trim()).filter(Boolean);
            for (const p of partes) expandidas.push(p);
        } else {
            expandidas.push(l);
        }
    }

    const unicas = [];
    const vistas = new Set();
    for (const item of expandidas) {
        const limpio = estructurarViñetaEstudio(item);
        if (limpio.length < 4) continue;
        if (/^(ESTUDIOS|FORMACI[OÓ]N|CAPACITACIONES|CURSOS|HABILIDADES|EXPERIENCIA)$/i.test(limpio)) continue;

        const clave = normalizarClaveComparacion(limpio);
        if (clave && !vistas.has(clave)) {
            vistas.add(clave);
            unicas.push(`• ${limpio}`);
        }
    }

    return unicas.join('\n');
}

function limpiarNombreArchivo(nombre, porDefecto) {
    const base = nombre || porDefecto;
    return base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function extraerJSONLimpio(texto) {
    if (!texto) return null;
    let limpio = String(texto).trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
    const inicio = limpio.indexOf('{');
    const fin = limpio.lastIndexOf('}');
    if (inicio !== -1 && fin !== -1) limpio = limpio.substring(inicio, fin + 1);
    return JSON.parse(limpio);
}

function esBufferPDF(buffer) {
    return Boolean(buffer && buffer.length >= 4 && buffer.slice(0, 4).toString() === '%PDF');
}

function limpiarTextoPrevioFormulario(texto) {
    if (!texto) return '';
    let t = String(texto)
        .split('--- DETALLE COMPLETO EXTRAÍDO DEL CV ORIGINAL ---')[0]
        .split('--- CARTA DE RECOMENDACIÓN / REFERENCIAS ADJUNTAS ---')[0]
        .trim();

    return t
        .replace(/^Perfil versátil con sólida experiencia en[\s\S]*$/gi, '')
        .replace(/^Perfil profesional especializado en [^.]+\. (?:Ha desarrollado funciones|Cuenta con experiencia)[\s\S]*$/gi, '')
        .replace(/^Cuenta con trayectoria comprobable desempeñándose en[\s\S]*$/gi, '')
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
}

function pareceNuevoItemLaboralOEstudio(linea) {
    const l = linea.trim();
    if (/^[✓✔☑➢➤►•*]|^\d{4}\s*[-–/]/.test(l)) return true;
    if (/^(Administrativo|Supervisor|Operario|Operador|Encargado|Jefe|Ayudante|Auxiliar|Técnico|Tecnico|Vendedor|Cajero|Recepcionista|Chofer|Seguridad Privada|Personal de|Carga y Descarga|Atención al Cliente|Atencion al Cliente|Analista|Asistente|Coordinador|Gerente|Pastelero|Pastelera|Panadero|Cocinero|Bachero|Mozo|Camarera)\b/i.test(l)) return true;
    if (/^(Nivel\s+)?(Primario|Secundario|Secundarios|Terciario|Universitario|Licenciatura|Tecnicatura|Polimodal|Curso\b|Capacitación|Capacitacion|Certificación|Instituto\b|Escuela\b|Colegio\b)/i.test(l)) return true;
    return false;
}

function unirRenglonesCortados(lineasCrudas) {
    const resultado = [];
    for (const raw of lineasCrudas) {
        const limpia = limpiarSimbolosDecorativos(raw).replace(/^[-•*]\s*/, '').trim();
        if (!limpia) continue;

        if (/\b(Primario Completo|Secundario Completo|Secundario Incompleto|Terciario Completo|Terciario Incompleto)\b/i.test(limpia) && limpia.length > 40) {
            const partesEst = limpia.split(/\s+(?=(?:Nivel\s+)?(?:Primario|Secundario|Terciario|Universitario)\s+(?:Completo|Incompleto)\b)/i).map(s => s.trim()).filter(Boolean);
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
            const anteriorTerminaAbierto = /[-–(/:,]$|\b(de|del|en|el|la|los|las|para|por|con|y|o|a|su|propia|sector|capacitación|charla|buenas|taller|refrigeración|escuela|dr\.|sra\.|ing\.)$/i.test(anterior);
            const anteriorTerminaEnPuntoFinal = /\.$/.test(anterior) && !/\b(S\.A\.|S\.R\.L\.|Dr\.|Sr\.|Sra\.|Lic\.|Ing\.|N\.°|N°\.)$/i.test(anterior);

            if (!anteriorTerminaEnPuntoFinal || empiezaMinusculaOParentesis || anteriorTerminaAbierto) {
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
    const apiKey = (process.env.GEMINI_API_KEY || '').replace(/["'\s]/g, '');
    const baseApi = ['https:', '', 'generativelanguage.googleapis.com', 'v1beta', 'models'].join('/');
    try {
        const resp = await fetchConTimeout(baseApi + '?key=' + apiKey, {}, 6000);
        const data = await resp.json();
        if (data && Array.isArray(data.models)) {
            const soportados = data.models
                .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name.replace('models/', ''));
            const preferidos = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-1.5-flash'];
            const ordenados = preferidos.filter(p => soportados.includes(p));
            const otros = soportados.filter(s => s.includes('flash') && !ordenados.includes(s));
            modelosDisponiblesCache = [...ordenados, ...otros];
            if (modelosDisponiblesCache.length > 0) return modelosDisponiblesCache;
        }
    } catch (e) {
        console.warn('Aviso al listar modelos:', e.message);
    }
    return ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
}

async function generarConGeminiSeguro(partsConArchivos, promptSoloTexto) {
    const apiKey = (process.env.GEMINI_API_KEY || '').replace(/["'\s]/g, '');
    if (!apiKey) throw new Error('Falta configurar GEMINI_API_KEY en Render');

    const modelos = await obtenerModelosActivos();
    const baseApi = ['https:', '', 'generativelanguage.googleapis.com', 'v1beta', 'models'].join('/');
    const generationConfig = { temperature: 0.25, responseMimeType: 'application/json' };
    let ultimoError = null;

    const partsREST = partsConArchivos.map(p => {
        if (typeof p === 'string') return { text: p };
        if (p.inlineData) return { inline_data: { mime_type: p.inlineData.mimeType, data: p.inlineData.data } };
        return p;
    });

    for (const modelo of modelos.slice(0, 4)) {
        const url = baseApi + '/' + modelo + ':generateContent?key=' + apiKey;

        try {
            const resp = await fetchConTimeout(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: partsREST }], generationConfig })
            }, 32000);
            const data = await resp.json();
            if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                console.log(`✅ Optimización IA exitosa con ${modelo}`);
                return extraerJSONLimpio(data.candidates[0].content.parts[0].text);
            }
            if (data.error) {
                console.warn(`Aviso Gemini (${modelo}):`, data.error.message);
                ultimoError = new Error(data.error.message);
            }
        } catch (err) {
            ultimoError = err;
            console.warn(`Aviso conexión (${modelo}):`, err.message);
        }

        if (promptSoloTexto && partsREST.length > 1) {
            try {
                const respTexto = await fetchConTimeout(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: promptSoloTexto }] }], generationConfig })
                }, 24000);
                const dataTexto = await respTexto.json();
                if (dataTexto.candidates && dataTexto.candidates[0]?.content?.parts?.[0]?.text) {
                    console.log(`✅ Optimización IA exitosa (modo texto) con ${modelo}`);
                    return extraerJSONLimpio(dataTexto.candidates[0].content.parts[0].text);
                }
            } catch (errFast) {
                ultimoError = errFast;
            }
        }
    }
    throw ultimoError || new Error('Tiempo de espera agotado con Gemini');
}

// ✍️ Redactor ejecutivo completo de respaldo (genera un Resumen Profesional rico de 5 a 6 líneas reales sin truncar nombres de empresas)
function redactarResumenEjecutivoLocal({ expFinal, estFinal, habFinal, disponibilidad, disponibilidadViajar }) {
    const textoTotal = `${expFinal}\n${estFinal}\n${habFinal}`.toLowerCase();

    // 1. Detectamos especialidades reales para abrir con fuerza profesional
    const especialidades = [];
    if (/dep[oó]sito fiscal|aduana|aduaner|despachante|comercio exterior/.test(textoTotal)) especialidades.push('Operatoria en Depósitos Fiscales y Gestión Aduanera');
    if (/log[ií]stica|stock|inventario|recepci[oó]n y despacho|cargas/.test(textoTotal)) especialidades.push('Logística Operativa y Control de Inventarios');
    if (/supervis|conducci[oó]n de equipos|jefe|encargad/.test(textoTotal)) especialidades.push('Supervisión de Equipos de Trabajo');
    if (/escriban[ií]a|notarial|registral/.test(textoTotal)) especialidades.push('Gestión Notarial y Documental');
    if (/administraci[oó]n|administrativ|facturaci[oó]n|tango/.test(textoTotal)) especialidades.push('Gestión Administrativa');
    if (/reclutamiento|selecci[oó]n|ats/.test(textoTotal)) especialidades.push('Reclutamiento Digital');
    if (/pasteler|panader|reposter|cocina|gastronom/.test(textoTotal)) especialidades.push('Producción Gastronómica y Pastelería');
    if (/seguridad privada|vigilancia|control de accesos/.test(textoTotal)) especialidades.push('Seguridad Patrimonial');
    if (/mantenimiento|refrigeraci[oó]n|construcci[oó]n|alba[ñn]il/.test(textoTotal)) especialidades.push('Mantenimiento Técnico y Servicios Operativos');
    if (/ventas|vendedor|comercial|caja/.test(textoTotal)) especialidades.push('Atención Comercial y Gestión de Caja');

    const aperturaAreas = especialidades.length > 0
        ? especialidades.slice(0, 3).join(', ')
        : 'Gestión Operativa, Administrativa y Atención al Cliente';

    // 2. Extraemos los encabezados limpios ("Empresa — Cargo") de sus experiencias ya estructuradas
    const cabecerasPuestos = expFinal
        .split('\n')
        .map(l => l.replace(/^•\s*/, '').split(':')[0].split('|')[0].trim())
        .filter(c => c.length > 4 && c.length <= 85);

    const oracionTrayectoria = cabecerasPuestos.length > 0
        ? `Cuenta con sólida trayectoria laboral comprobable habiéndose desempeñado en ${cabecerasPuestos.slice(0, 4).join('; ')}, donde desarrolló solvencia en el seguimiento de procesos, control documental, coordinación operativa y cumplimiento estricto de normativas de calidad y seguridad.`
        : `Cuenta con sólida trayectoria práctica comprobable en entornos dinámicos, garantizando orden operativo, cumplimiento de procedimientos y orientación a resultados.`;

    // 3. Mencionamos cursos técnicos o formación superior relevante (evitando mencionar "Primario" o "Incompleto" en el resumen)
    const cursosRelevantes = estFinal
        .split('\n')
        .map(l => l.replace(/^•\s*/, '').trim())
        .filter(e => e.length > 5 && !/\b(primario|incompleto)\b/i.test(e));

    const oracionFormacion = cursosRelevantes.length > 0
        ? `Complementa su experiencia con capacitación específica en ${cursosRelevantes.slice(0, 2).join(' y ')}, fortaleciendo su perfil técnico para el puesto.`
        : '';

    // 4. Competencias destacadas + disponibilidad
    const skills = habFinal.split(' • ').map(s => s.trim()).filter(s => s.length > 3 && s.length <= 48).slice(0, 5);
    const dispTexto = corregirOrtografiaComun(disponibilidad || 'Full-time');
    const viajeTexto = disponibilidadViajar === 'Sí' ? ' y disponibilidad para viajar' : '';

    const oracionCierre = skills.length > 0
        ? `Se destaca por su dominio en ${skills.join(', ')}, aportando responsabilidad, rápida adaptación al trabajo en equipo, disponibilidad ${dispTexto}${viajeTexto}.`
        : `Se destaca por su compromiso, capacidad resolutiva, trabajo colaborativo y disponibilidad ${dispTexto}${viajeTexto}.`;

    return [
        `Perfil profesional con amplia experiencia en ${aperturaAreas}.`,
        oracionTrayectoria,
        oracionFormacion,
        oracionCierre
    ].filter(Boolean).join(' ');
}

function clasificarCVLocalmente({ textoPlanoExtraido, textoCartaExtraido, datosFormulario, respetarEdicionManual = false }) {
    const textoPreprocesado = (textoPlanoExtraido || '')
        .replace(/\s+(ESTUDIOS Y FORMACI[OÓ]N|EDUCACI[OÓ]N Y FORMACI[OÓ]N|FORMACI[OÓ]N ACAD[EÉ]MICA|CURSOS Y CAPACITACIONES|HABILIDADES Y COMPETENCIAS(?:\s+CLAVE)?|EXPERIENCIA LABORAL|ANTECEDENTES LABORALES|RESUMEN PROFESIONAL)\b/gi, '\n$1\n')
        .replace(/\s+\*\s+(?=[A-ZÁÉÍÓÚÑ0-9])/g, '\n• ');

    const lineas = textoPreprocesado.split('\n').map(l => l.trim()).filter(Boolean);
    const expCruda = [], estCruda = [], habCruda = [], datosExtra = [];
    let seccionActual = 'personal';

    for (const linea of lineas) {
        const lUpper = linea.toUpperCase().replace(/\s+/g, ' ');
        const sinSimbolos = limpiarSimbolosDecorativos(linea);
        if (!sinSimbolos) continue;

        if (/^(CURRICUL[U]?M\s+VITAE|DATOS\s+PERSONALES|INFORMACI[OÓ]N\s+PERSONAL)$/i.test(lUpper)) { seccionActual = 'personal'; continue; }
        if (/^(RESUMEN(\s+PROFESIONAL)?|PERFIL(\s+PROFESIONAL)?|SOBRE\s+M[IÍ]|OBJETIVO(\s+LABORAL|\s+PROFESIONAL)?)$/i.test(lUpper)) { seccionActual = 'resumen_original'; continue; }

        if (/^(CEL\.?|TEL\.?|TEL[EÉ]FONO|C\.?U\.?I\.?L\.?|FECHA DE NACIMIENTO|EDAD|ESTADO CIVIL|NACIONALIDAD)\s*[:.]/i.test(sinSimbolos)) {
            const norm = sinSimbolos.replace(/\s+/g, ' ');
            if (!datosExtra.some(d => d.toLowerCase() === norm.toLowerCase())) datosExtra.push(norm);
            continue;
        }

        if (/^(ESTUDIOS(\s+Y\s+FORMACI[OÓ]N|\s+CURSADOS|\s+ACAD[EÉ]MICOS)?|FORMACI[OÓ]N(\s+ACAD[EÉ]MICA|\s+Y\s+CURSOS)?|EDUCACI[OÓ]N(\s+Y\s+FORMACI[OÓ]N)?|CURSOS(\s+REALIZADOS.*|\s+Y\s+CAPACITACIONES)?|PERIODO EN .*|CAPACITACIONES)$/i.test(lUpper)) {
            seccionActual = 'estudios';
            if (/^PERIODO EN /i.test(lUpper)) estCruda.push('Capacitaciones en ' + sinSimbolos.replace(/^PERIODO EN\s*/i, ''));
            continue;
        }
        if (/^(ANTECEDENTES(\s+LABORALES)?|EXPERIENCIA(\s+LABORAL|\s+PROFESIONAL)?|HISTORIAL\s+LABORAL|TRAYECTORIA(\s+LABORAL)?)$/i.test(lUpper)) { seccionActual = 'experiencia'; continue; }
        if (/^(CONOCIMIENTOS(\s+T[EÉ]CNICOS)?|HABILIDADES(\s+Y\s+COMPETENCIAS(\s+CLAVE)?|\s+T[EÉ]CNICAS|\s+CLAVE)?|ACTITUDES(\s+Y\s+HABILIDADES)?|APTITUDES|COMPETENCIAS(\s+CLAVE|\s+LABORALES)?|IDIOMAS|INFORM[AÁ]TICA|HERRAMIENTAS(\s+DIGITALES)?)$/i.test(lUpper)) { seccionActual = 'habilidades'; continue; }

        if (seccionActual === 'estudios') estCruda.push(linea);
        else if (seccionActual === 'experiencia') expCruda.push(linea);
        else if (seccionActual === 'habilidades') habCruda.push(linea);
    }

    const expUnidaPDF = unirRenglonesCortados(expCruda);
    const estUnidaPDF = unirRenglonesCortados(estCruda);
    const habUnidaPDF = unirRenglonesCortados(habCruda);

    const formExpRaw = limpiarTextoPrevioFormulario((datosFormulario.experiencia || '').replace(/=/g, ': '));
    const formEstRaw = limpiarTextoPrevioFormulario((datosFormulario.estudios || '').replace(/=/g, ': '));
    const formHabRaw = limpiarTextoPrevioFormulario(datosFormulario.habilidades || '');
    const formResRaw = limpiarTextoPrevioFormulario(datosFormulario.resumen || '');

    // Si el legajo fue editado manualmente en el Panel, respetamos las listas depuradas (sin volver a meter cursos abandonados del PDF)
    const fuenteExp = (respetarEdicionManual && formExpRaw.trim().length > 15)
        ? formExpRaw
        : `${formExpRaw}\n${expUnidaPDF.join('\n')}${textoCartaExtraido ? `\nReferencia / Carta de Recomendación adjunta: ${limpiarYCorregirTexto(limpiarSimbolosDecorativos(textoCartaExtraido))}` : ''}`;

    const fuenteEst = (respetarEdicionManual && formEstRaw.trim().length > 5)
        ? formEstRaw
        : `${formEstRaw}\n${estUnidaPDF.join('\n')}`;

    const fuenteHab = (respetarEdicionManual && formHabRaw.trim().length > 10)
        ? formHabRaw
        : `${habUnidaPDF.join(' • ')} • ${formHabRaw}`;

    const expFinal = limpiarYOrdenarExperiencia(fuenteExp);
    const estFinal = limpiarEstudiosYFormacion(fuenteEst);
    const habFinal = limpiarYDeduplicarHabilidades(fuenteHab);

    const resumenFinal = (formResRaw && formResRaw.length > 160)
        ? corregirOrtografiaComun(formResRaw)
        : redactarResumenEjecutivoLocal({
            expFinal,
            estFinal,
            habFinal,
            disponibilidad: datosFormulario.disponibilidad,
            disponibilidadViajar: datosFormulario.disponibilidadViajar
        });

    return {
        datosPersonalesExtra: corregirOrtografiaComun(datosExtra.join(' | ')),
        resumen: limpiarYCorregirTexto(resumenFinal),
        experiencia: expFinal || '• No especificada',
        estudios: estFinal || '• Secundario Completo',
        habilidades: habFinal || 'Responsabilidad • Puntualidad • Trabajo en equipo',
        habilidadesDuras: habFinal,
        habilidadesBlandas: 'Responsabilidad • Puntualidad • Trabajo en equipo • Proactividad',
        textoCompletoIntegrado: `${datosExtra.join(' | ')}\n${resumenFinal}\n${expFinal}\n${estFinal}\n${habFinal}`
    };
}

function postProcesarResultadoCV(raw, respaldoLocal) {
    const datosPersonalesExtra = corregirOrtografiaComun(limpiarSimbolosDecorativos(raw.datosPersonalesExtra || respaldoLocal.datosPersonalesExtra));
    let resumen = limpiarYCorregirTexto(limpiarSimbolosDecorativos(raw.resumen || respaldoLocal.resumen));
    if (!resumen || resumen.length < 120) {
        resumen = respaldoLocal.resumen;
    }
    const experiencia = limpiarYOrdenarExperiencia(raw.experiencia || respaldoLocal.experiencia) || respaldoLocal.experiencia;
    const estudios = limpiarEstudiosYFormacion(raw.estudios || respaldoLocal.estudios) || respaldoLocal.estudios;
    const habilidades = limpiarYDeduplicarHabilidades(raw.habilidades || respaldoLocal.habilidades) || respaldoLocal.habilidades;
    const habilidadesDuras = limpiarYDeduplicarHabilidades(raw.habilidadesDuras || habilidades) || habilidades;
    const habilidadesBlandas = limpiarYDeduplicarHabilidades(raw.habilidadesBlandas || respaldoLocal.habilidadesBlandas) || respaldoLocal.habilidadesBlandas;

    return {
        disponibilidadViajarDetectada: convertirATextoSeguro(raw.disponibilidadViajarDetectada || '').trim(),
        datosPersonalesExtra,
        resumen,
        experiencia,
        estudios,
        habilidades,
        habilidadesDuras,
        habilidadesBlandas,
        textoCompletoIntegrado: `${datosPersonalesExtra}\n${resumen}\n${experiencia}\n${estudios}\n${habilidades}`
    };
}

async function fusionarYOptimizarCVConGemini({ cvBuffer, cvMimeType, textoPlanoExtraido, cartaBuffer, cartaMimeType, textoCartaExtraido, datosFormulario, respetarEdicionManual = false }) {
    const expLimpia = limpiarTextoPrevioFormulario(datosFormulario.experiencia);
    const resLimpio = limpiarTextoPrevioFormulario(datosFormulario.resumen);
    const estLimpio = limpiarTextoPrevioFormulario(datosFormulario.estudios);
    const habLimpia = limpiarTextoPrevioFormulario(datosFormulario.habilidades);

    const reglaPrioridadEdicion = respetarEdicionManual
        ? `ATENCIÓN CRÍTICA — LEGAJO DEPURADO POR EL RECLUTADOR EN EL PANEL:
- El reclutador ya editó manualmente este legajo en el Panel para quitar cursos abandonados o habilidades incorrectas.
- Por lo tanto, en "estudios", "experiencia" y "habilidades" incluye ÚNICAMENTE los ítems que están en "DATOS CARGADOS EN EL PANEL" (puedes usar el PDF solo para enriquecer detalles de funciones o fechas de ESOS MISMOS puestos, pero PROHIBIDO volver a agregar estudios, carreras abandonadas o habilidades del PDF que hayan sido quitados del Panel).`
        : `FUSIÓN COMPLETA DE POSTULACIÓN:
- Lee íntegramente el archivo PDF/DOCX de CV subido y lo completado en el Formulario, unificando toda su experiencia, estudios y habilidades reales sin omitir ningún antecedente.`;

    const prompt = `Eres un Consultor Senior en Selección de Personal, Redacción Ejecutiva y Sistemas ATS en Argentina.
${reglaPrioridadEdicion}

REGLAS DE REDACCIÓN Y ESTRUCTURA LINEAL ATS:
1) ORTOGRAFÍA PERFECTA: Corrige tildes, puntuación, mayúsculas de empresas, cargos e instituciones.
2) "datosPersonalesExtra": Solo datos filiatorios extra del PDF (Fecha de nacimiento, Edad, CUIL, Estado civil, Teléfono alternativo) separados por " | ". Si no hay, devuelve "".
3) "resumen": Redacta un RESUMEN PROFESIONAL COMPLETO, SÓLIDO Y EJECUTIVO de 5 a 6 líneas (entre 95 y 135 palabras).
   - Debe tener redacción fluida y profesional: presentar sus especialidades reales, mencionar las principales empresas y cargos donde se desempeñó, destacar sus responsabilidades de mayor valor (supervisión, gestión aduanera, depósitos fiscales, escrituración, administración, gastronomía, etc.), su capacitación vigente y sus competencias clave.
   - PROHIBIDO hacer resúmenes cortos o pobres de 2 renglones y PROHIBIDO cortar nombres de empresas.
4) "experiencia": Separa CADA puesto o empresa en su PROPIA viñeta "• " en un renglón aparte (\\n).
   - JAMÁS dejes dos cargos o empresas pegados en la misma viñeta (por ejemplo, si aparecen JOW KON LOGÍSTICA y Carga y Descarga LOGÍSTICA FUEGUINA, o STEAL y Ayudante de Albañil, van en viñetas separadas).
   - Formato obligatorio de cada viñeta para que quede súper ordenado:
     "• EMPRESA — Cargo | Período (si figura): Redacción profesional y completa de las responsabilidades, operatoria y logros."
   - Ordena de lo más reciente ("Actualidad") a lo más antiguo.
5) "estudios": Cada estudio o capacitación vigente va en su PROPIA viñeta "• " separada por salto de línea (\\n), con formato limpio:
   "• Título o Curso — Institución (Detalle / Año)."
   Sin subtítulos como "FORMACIÓN ACADÉMICA" ni asteriscos.
6) "habilidades": Competencias técnicas y blandas reales del perfil separadas ÚNICAMENTE por " • ", sin repetidos ni subtítulos.

DATOS CARGADOS EN EL PANEL / FORMULARIO:
- Vacante declarada: ${datosFormulario.puestoRequerido || 'Sin especificar'}
- Disponibilidad horaria: ${datosFormulario.disponibilidad || 'Full-time'}
- Disponibilidad para viajar: ${datosFormulario.disponibilidadViajar || 'No especificada'}
- Resumen en Panel: ${resLimpio}
- Experiencia en Panel: ${expLimpia}
- Estudios en Panel: ${estLimpio}
- Habilidades en Panel: ${habLimpia}

${textoPlanoExtraido ? `TEXTO DE REFERENCIA DEL ARCHIVO PDF/DOCX:\n${textoPlanoExtraido}\n` : ''}
${textoCartaExtraido ? `TEXTO DE CARTA DE RECOMENDACIÓN:\n${textoCartaExtraido}\n` : ''}

Devuelve ESTRICTAMENTE este JSON puro (todos los valores como String):
{
  "datosPersonalesExtra": "",
  "disponibilidadViajarDetectada": "",
  "resumen": "",
  "experiencia": "• EMPRESA — Cargo: Descripción...\\n• EMPRESA — Cargo: Descripción...",
  "estudios": "• Título — Institución\\n• Curso — Institución",
  "habilidades": "Habilidad 1 • Habilidad 2 • Habilidad 3",
  "habilidadesDuras": "Habilidad técnica 1 • Habilidad técnica 2",
  "habilidadesBlandas": "Competencia blanda 1 • Competencia blanda 2"
}`;

    const parts = [prompt];
    if (!respetarEdicionManual && cvBuffer) {
        if (esBufferPDF(cvBuffer) || cvMimeType === 'application/pdf') {
            parts.push({ inlineData: { data: cvBuffer.toString('base64'), mimeType: 'application/pdf' } });
        } else if (cvMimeType && cvMimeType.startsWith('image/')) {
            parts.push({ inlineData: { data: cvBuffer.toString('base64'), mimeType: cvMimeType } });
        }
    }
    if (cartaBuffer) {
        if (esBufferPDF(cartaBuffer) || cartaMimeType === 'application/pdf') {
            parts.push({ inlineData: { data: cartaBuffer.toString('base64'), mimeType: 'application/pdf' } });
        } else if (cartaMimeType && cartaMimeType.startsWith('image/')) {
            parts.push({ inlineData: { data: cartaBuffer.toString('base64'), mimeType: cartaMimeType } });
        }
    }

    const respaldoLocal = clasificarCVLocalmente({
        textoPlanoExtraido,
        textoCartaExtraido,
        datosFormulario,
        respetarEdicionManual
    });

    try {
        const respuestaIA = await generarConGeminiSeguro(parts, prompt);
        if (respuestaIA && (respuestaIA.resumen || respuestaIA.experiencia)) {
            return postProcesarResultadoCV(respuestaIA, respaldoLocal);
        }
    } catch (errIA) {
        console.warn('Usando redactor ejecutivo estructurado local:', errIA.message);
    }
    return postProcesarResultadoCV(respaldoLocal, respaldoLocal);
}

async function optimizarCandidatoExistente(candidato) {
    const cvBuffer = candidato.cvData ? Buffer.from(candidato.cvData, 'base64') : null;
    const cartaBuffer = candidato.cartaData ? Buffer.from(candidato.cartaData, 'base64') : null;
    let textoPlanoExtraido = '', textoCartaExtraido = '';

    if (cvBuffer) {
        try {
            if (esBufferPDF(cvBuffer) || candidato.cvContentType === 'application/pdf' || candidato.nombreArchivoCV?.toLowerCase().endsWith('.pdf')) {
                const pdfDataParsed = await pdfParse(cvBuffer);
                textoPlanoExtraido = pdfDataParsed.text || '';
            } else if (candidato.cvContentType?.includes('wordprocessingml') || candidato.nombreArchivoCV?.toLowerCase().endsWith('.docx')) {
                const wordResult = await mammoth.extractRawText({ buffer: cvBuffer });
                textoPlanoExtraido = wordResult.value || '';
            }
        } catch (e) {}
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
        respetarEdicionManual: Boolean(candidato.editadoManualmente),
        datosFormulario: {
            puestoRequerido: candidato.puestoRequerido,
            disponibilidad: candidato.disponibilidad,
            disponibilidadViajar: candidato.disponibilidadViajar,
            resumen: candidato.resumen,
            experiencia: candidato.experiencia,
            estudios: candidato.estudios,
            habilidades: candidato.habilidades
        }
    });

    if (resultadoGemini) {
        if (candidato.puestoRequerido) {
            candidato.puestoRequerido = corregirOrtografiaComun(candidato.puestoRequerido.trim());
        } else {
            candidato.puestoRequerido = 'Sin especificar';
        }

        if (candidato.disponibilidad) {
            candidato.disponibilidad = corregirOrtografiaComun(capitalizarPrimeraLetra(candidato.disponibilidad));
        }
        if (candidato.direccion) {
            candidato.direccion = corregirOrtografiaComun(candidato.direccion);
        }
        if (!candidato.disponibilidadViajar && resultadoGemini.disponibilidadViajarDetectada) {
            candidato.disponibilidadViajar = limpiarYCorregirTexto(resultadoGemini.disponibilidadViajarDetectada);
        }
        candidato.datosPersonalesExtra = resultadoGemini.datosPersonalesExtra || '';
        candidato.resumen = resultadoGemini.resumen || candidato.resumen;
        candidato.experiencia = resultadoGemini.experiencia || candidato.experiencia;
        candidato.estudios = resultadoGemini.estudios || candidato.estudios;
        candidato.habilidades = resultadoGemini.habilidades || candidato.habilidades;
        candidato.habilidadesDuras = resultadoGemini.habilidadesDuras || candidato.habilidades;
        candidato.habilidadesBlandas = resultadoGemini.habilidadesBlandas || candidato.habilidadesBlandas;

        // Si fue editado manualmente, el buscador ATS solo indexa sus datos vigentes (para no matchear cursos abandonados)
        candidato.textoExtraidoCV = candidato.editadoManualmente
            ? `${resultadoGemini.textoCompletoIntegrado}`.trim()
            : `${textoPlanoExtraido}\n${textoCartaExtraido}\n${resultadoGemini.textoCompletoIntegrado}`.trim();

        await candidato.save();
        return true;
    }
    return false;
}

app.post('/api/enviar-postulacion', upload.any(), async (req, res) => {
    try {
        let { empresa, puestoRequerido, nombre, dni, email, telefono, direccion, disponibilidad, disponibilidadViajar, resumen, experiencia, estudios, habilidades, habilidadesDuras, habilidadesBlandas } = req.body;
        let datosPersonalesExtra = '', cvData = '', cvContentType = '', nombreArchivoOriginal = '', cvBuffer = null;
        let fotoData = '', fotoContentType = '', cartaData = '', cartaContentType = '', nombreArchivoCarta = '', cartaBuffer = null;
        let textoPlanoExtraido = '', textoCartaExtraido = '';

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
                        textoPlanoExtraido = (await pdfParse(cvFile.buffer)).text;
                    } else if (cvContentType.includes('wordprocessingml') || nombreArchivoOriginal.endsWith('.docx')) {
                        textoPlanoExtraido = (await mammoth.extractRawText({ buffer: cvFile.buffer })).value;
                    }
                } catch (err) {}
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
                        textoCartaExtraido = (await pdfParse(cartaFile.buffer)).text;
                    } else if (cartaContentType.includes('wordprocessingml') || nombreArchivoCarta.endsWith('.docx')) {
                        textoCartaExtraido = (await mammoth.extractRawText({ buffer: cartaFile.buffer })).value;
                    }
                } catch (err) {}
            }
        }

        const resultadoGemini = await fusionarYOptimizarCVConGemini({
            cvBuffer, cvMimeType: cvContentType, textoPlanoExtraido,
            cartaBuffer, cartaMimeType: cartaContentType, textoCartaExtraido,
            respetarEdicionManual: false,
            datosFormulario: { puestoRequerido, disponibilidad, disponibilidadViajar, resumen, experiencia, estudios, habilidades }
        });

        if (resultadoGemini) {
            if (!disponibilidadViajar && resultadoGemini.disponibilidadViajarDetectada) {
                disponibilidadViajar = resultadoGemini.disponibilidadViajarDetectada;
            }
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

        const puestoFinalRespetado = puestoRequerido && puestoRequerido.trim()
            ? limpiarYCorregirTexto(puestoRequerido)
            : 'Sin especificar';

        const candidatoId = Date.now();
        const nuevoCandidato = new Candidato({
            id: candidatoId,
            empresa: limpiarYCorregirTexto(empresa) || 'Base de Datos General',
            puestoRequerido: puestoFinalRespetado,
            nombre: limpiarYCorregirTexto(nombre) || 'Postulante',
            dni: String(dni || '').trim(),
            email: String(email || '').trim(),
            telefono: String(telefono || '').trim(),
            direccion: limpiarYCorregirTexto(direccion),
            disponibilidad: limpiarYCorregirTexto(capitalizarPrimeraLetra(disponibilidad || 'Inmediata')),
            disponibilidadViajar: limpiarYCorregirTexto(disponibilidadViajar) || 'No especificada',
            datosPersonalesExtra,
            resumen,
            experiencia,
            estudios,
            habilidades,
            habilidadesDuras,
            habilidadesBlandas,
            cvData, cvContentType, nombreArchivoCV: nombreArchivoOriginal,
            fotoData, fotoContentType,
            cartaData, cartaContentType, nombreArchivoCarta,
            textoExtraidoCV: `${textoPlanoExtraido || ''}\n${resumen}\n${experiencia}\n${estudios}\n${habilidades}`.trim(),
            fecha: new Date().toLocaleString(),
            editadoManualmente: false,
            pagado: false
        });

        await nuevoCandidato.save();
        enviarAlertaEmail(nuevoCandidato);
        return res.json({ success: true, candidatoId, message: '¡Postulación procesada y estructurada con IA!' });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/candidatos/optimizar-ia/:id', authMiddleware, async (req, res) => {
    try {
        const candidato = await buscarCandidatoDB(req.params.id);
        if (!candidato) return res.status(404).json({ success: false, error: 'Candidato no encontrado' });
        await optimizarCandidatoExistente(candidato);
        return res.json({
            success: true,
            nombre: candidato.nombre,
            puestoRequerido: candidato.puestoRequerido,
            disponibilidadViajar: candidato.disponibilidadViajar,
            datosPersonalesExtra: candidato.datosPersonalesExtra,
            resumen: candidato.resumen,
            experiencia: candidato.experiencia,
            estudios: candidato.estudios,
            habilidades: candidato.habilidades
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ✏️ Al guardar desde Editar Datos, marca `editadoManualmente = true` para que nunca vuelvan a aparecer datos viejos borrados del PDF
app.post('/api/candidatos/editar/:id', authMiddleware, async (req, res) => {
    try {
        const candidato = await buscarCandidatoDB(req.params.id);
        if (!candidato) return res.status(404).json({ success: false, error: 'Candidato no encontrado en MongoDB' });

        const campos = ['empresa', 'puestoRequerido', 'nombre', 'dni', 'email', 'telefono', 'direccion', 'disponibilidad', 'disponibilidadViajar', 'resumen', 'experiencia', 'estudios', 'habilidades'];
        for (const c of campos) {
            if (req.body[c] !== undefined) {
                candidato[c] = String(req.body[c]).replace(/\r\n/g, '\n').trim();
            }
        }

        if (req.body.experiencia !== undefined) {
            candidato.experiencia = limpiarYOrdenarExperiencia(candidato.experiencia);
        }
        if (req.body.estudios !== undefined) {
            candidato.estudios = limpiarEstudiosYFormacion(candidato.estudios);
        }
        if (req.body.habilidades !== undefined) {
            candidato.habilidades = limpiarYDeduplicarHabilidades(candidato.habilidades);
            candidato.habilidadesDuras = candidato.habilidades;
        }

        candidato.editadoManualmente = true;
        candidato.textoExtraidoCV = `${candidato.resumen || ''}\n${candidato.experiencia || ''}\n${candidato.estudios || ''}\n${candidato.habilidades || ''}`.trim();

        await candidato.save();
        return res.json({
            success: true,
            message: 'Legajo editado correctamente.',
            candidato: {
                id: candidato.id,
                _id: candidato._id,
                empresa: candidato.empresa,
                puestoRequerido: candidato.puestoRequerido,
                nombre: candidato.nombre,
                dni: candidato.dni,
                email: candidato.email,
                telefono: candidato.telefono,
                direccion: candidato.direccion,
                disponibilidad: candidato.disponibilidad,
                disponibilidadViajar: candidato.disponibilidadViajar,
                resumen: candidato.resumen,
                experiencia: candidato.experiencia,
                estudios: candidato.estudios,
                habilidades: candidato.habilidades,
                habilidadesDuras: candidato.habilidadesDuras,
                editadoManualmente: true
            }
        });
    } catch (error) {
        console.error('Error al editar legajo:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/candidatos/actualizar-archivos/:id', authMiddleware, upload.any(), async (req, res) => {
    try {
        const candidato = await buscarCandidatoDB(req.params.id);
        if (!candidato) return res.json({ success: false, error: 'Candidato no encontrado' });
        if (req.files && req.files.length > 0) {
            const cvFile = req.files.find(f => f.fieldname === 'cvFile');
            const fotoPerfil = req.files.find(f => f.fieldname === 'fotoPerfil');
            const cartaFile = req.files.find(f => f.fieldname === 'cartaRecomendacion');
            if (cvFile) {
                candidato.cvData = cvFile.buffer.toString('base64');
                candidato.cvContentType = cvFile.mimetype;
                candidato.nombreArchivoCV = cvFile.originalname;
                // Si se sube un archivo de CV nuevo, habilitamos que vuelva a leer ese PDF nuevo
                candidato.editadoManualmente = false;
            }
            if (fotoPerfil) { candidato.fotoData = fotoPerfil.buffer.toString('base64'); candidato.fotoContentType = fotoPerfil.mimetype; }
            if (cartaFile) { candidato.cartaData = cartaFile.buffer.toString('base64'); candidato.cartaContentType = cartaFile.mimetype; candidato.nombreArchivoCarta = cartaFile.originalname; }
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
        const candidato = await buscarCandidatoDB(req.params.id);
        if (!candidato || !candidato.fotoData) return res.status(404).send('Foto no encontrada');
        res.setHeader('Content-Type', candidato.fotoContentType || 'image/jpeg');
        return res.send(Buffer.from(candidato.fotoData, 'base64'));
    } catch (e) {
        return res.status(500).send('Error al cargar la foto');
    }
});

app.get('/api/descargar-foto/:id', authMiddleware, async (req, res) => {
    try {
        const candidato = await buscarCandidatoDB(req.params.id);
        if (!candidato || !candidato.fotoData) return res.status(404).send('Foto no disponible.');
        const ext = candidato.fotoContentType ? (candidato.fotoContentType.split('/')[1] || 'jpg').replace(/[^a-zA-Z0-9]/g, '') : 'jpg';
        const nombreSeguro = limpiarNombreArchivo(`Foto_${candidato.nombre || req.params.id}.${ext}`, `Foto_${req.params.id}.jpg`);
        res.setHeader('Content-Type', candidato.fotoContentType || 'image/jpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${nombreSeguro}"`);
        return res.send(Buffer.from(candidato.fotoData, 'base64'));
    } catch (error) {
        return res.status(500).send('Error al descargar la foto.');
    }
});

app.get('/api/descargar-carta/:id', authMiddleware, async (req, res) => {
    try {
        const candidato = await buscarCandidatoDB(req.params.id);
        if (!candidato || !candidato.cartaData) return res.status(404).send('Carta no disponible.');
        const nombreSeguro = limpiarNombreArchivo(candidato.nombreArchivoCarta, `Carta_${candidato.nombre || req.params.id}.pdf`);
        res.setHeader('Content-Type', candidato.cartaContentType || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${nombreSeguro}"`);
        return res.send(Buffer.from(candidato.cartaData, 'base64'));
    } catch (error) {
        return res.status(500).send('Error al descargar la carta.');
    }
});

app.get('/api/cv-empresa/:id', authMiddleware, async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        const candidato = await buscarCandidatoDB(req.params.id);
        if (!candidato) return res.status(404).send('Candidato no encontrado.');
        const idRef = candidato.id || candidato._id;
        const fotoSrc = candidato.fotoData ? `/api/foto/${idRef}` : '';
        const htmlCV = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>CV Corporativo - ${candidato.nombre}</title>
        <style>body{font-family:Arial,sans-serif;color:#333;line-height:1.6;max-width:800px;margin:40px auto;padding:0 20px}.header{display:flex;align-items:center;gap:25px;border-bottom:2px solid #0056b3;padding-bottom:20px;margin-bottom:20px}.foto{width:120px;height:120px;border-radius:50%;object-fit:cover;border:3px solid #0056b3}.info h1{margin:0 0 6px 0;color:#0056b3;font-size:24px;text-transform:uppercase}.info p{margin:4px 0;font-size:14px}.section{margin-bottom:20px}.section h3{border-bottom:1px solid #ddd;padding-bottom:5px;color:#333;font-size:15px;text-transform:uppercase}.btn-print{padding:10px 20px;background:#0056b3;color:#fff;border:none;border-radius:5px;cursor:pointer;display:block;margin:30px auto}@media print{.btn-print{display:none}}</style></head>
        <body><div class="header">${fotoSrc ? `<img src="${fotoSrc}" class="foto" alt="Foto">` : ''}<div class="info"><h1>${candidato.nombre}</h1>
        <p>📍 ${candidato.direccion || 'No especificada'} | 📞 ${candidato.telefono || 'S/D'} | 📧 ${candidato.email || 'S/D'} | <strong>DNI:</strong> ${candidato.dni || 'S/D'}</p>
        ${candidato.datosPersonalesExtra ? `<p>${candidato.datosPersonalesExtra}</p>` : ''}
        <p><strong>Puesto al que aplica:</strong> ${candidato.puestoRequerido || 'Sin especificar'} | <strong>Disponibilidad:</strong> ${candidato.disponibilidad || 'Inmediata'} | <strong>Disponibilidad para viajar:</strong> ${candidato.disponibilidadViajar || 'No especificada'}</p></div></div>
        <div class="section"><h3>Resumen Profesional</h3><p style="text-align:justify">${candidato.resumen || 'No especificado'}</p></div>
        <div class="section"><h3>Experiencia Laboral</h3><p style="white-space:pre-line;text-align:justify">${candidato.experiencia || 'No especificada'}</p></div>
        <div class="section"><h3>Estudios y Formación</h3><p style="white-space:pre-line">${candidato.estudios || 'No especificados'}</p></div>
        <div class="section"><h3>Habilidades Técnicas (Duras)</h3><p>${candidato.habilidadesDuras || candidato.habilidades || 'No especificadas'}</p></div>
        <div class="section"><h3>Habilidades y Competencias (Blandas)</h3><p>${candidato.habilidadesBlandas || 'No especificadas'}</p></div>
        <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button></body></html>`;
        return res.send(htmlCV);
    } catch (error) {
        return res.status(500).send('Error al generar el CV corporativo.');
    }
});

app.get('/api/descargar-cv/:id', authMiddleware, async (req, res) => {
    try {
        const candidato = await buscarCandidatoDB(req.params.id);
        if (!candidato || !candidato.cvData) return res.status(404).send('Archivo de CV no disponible.');
        const nombreSeguro = limpiarNombreArchivo(candidato.nombreArchivoCV, `CV_${candidato.nombre || req.params.id}.pdf`);
        res.setHeader('Content-Type', candidato.cvContentType || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${nombreSeguro}"`);
        return res.send(Buffer.from(candidato.cvData, 'base64'));
    } catch (error) {
        return res.status(500).send('Error al procesar la descarga.');
    }
});

app.get('/api/busquedas', authMiddleware, async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        const rawBusquedas = await Busqueda.find({}, {
            id: 1, empresa: 1, titulo: 1, keywords: 1, textoAviso: 1,
            archivoContentType: 1, nombreArchivo: 1, fechaCreacion: 1,
            tieneArchivo: { $gt: [{ $strLenCP: { $ifNull: ['$archivoData', ''] } }, 0] }
        }).lean();
        const busquedas = rawBusquedas.map(b => ({ ...b, archivoData: b.tieneArchivo ? 'disponible' : '' })).sort((a, b) => b.id - a.id);
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
            archivoData, archivoContentType, nombreArchivo,
            fechaCreacion: new Date().toLocaleDateString()
        });
        await nueva.save();
        return res.json({ success: true, busqueda: { ...nueva.toObject(), archivoData: archivoData ? 'disponible' : '' } });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/busquedas/editar/:id', authMiddleware, upload.single('archivoAviso'), async (req, res) => {
    try {
        const b = await Busqueda.findOne({ id: Number(req.params.id) });
        if (!b) return res.status(404).json({ success: false, error: 'Subcarpeta no encontrada' });
        const { empresa, titulo, keywords, textoAviso } = req.body;
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
        return res.json({ success: true, busqueda: { ...b.toObject(), archivoData: b.archivoData ? 'disponible' : '' } });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/busquedas/archivo/:id', authMiddleware, async (req, res) => {
    try {
        const b = await Busqueda.findOne({ id: Number(req.params.id) });
        if (!b || !b.archivoData) return res.status(404).send('Archivo no disponible.');
        const nombreSeguro = limpiarNombreArchivo(b.nombreArchivo, `Aviso_${b.empresa}_${b.titulo}.pdf`);
        res.setHeader('Content-Type', b.archivoContentType || 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${nombreSeguro}"`);
        return res.send(Buffer.from(b.archivoData, 'base64'));
    } catch (error) {
        return res.status(500).send('Error al abrir el archivo.');
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
    const stopWords = new Set(['para', 'con', 'los', 'las', 'del', 'una', 'por', 'que', 'mas', 'más', 'sin', 'sobre', 'entre', 'hasta', 'desde', 'como', 'pero', 'sus', 'este', 'esta', 'importante', 'empresa', 'busca', 'buscamos', 'incorporar', 'personal', 'puesto', 'vacante', 'requisitos', 'excluyente', 'deseable', 'experiencia', 'años', 'zona', 'horario', 'enviar', 'correo', 'asunto', 'disponibilidad', 'inmediata', 'trabajo', 'laboral', 'minima', 'mínima', 'comprobable', 'tierra', 'fuego', 'grande', 'ushuaia', 'hola', 'buenas']);
    const palabras = limpio.toLowerCase().replace(/[^\wáéíóúñü\s]/g, ' ').split(/\s+/).filter(p => p.length > 3 && !stopWords.has(p) && !/^\d+$/.test(p));
    const unicas = [];
    if (puestoContexto && puestoContexto.trim().includes(' ')) unicas.push(puestoContexto.trim().toLowerCase().replace(/\s+/g, '_'));
    for (const p of palabras) {
        if (!unicas.includes(p) && unicas.length < 15) unicas.push(p);
    }
    return { empresa: 'Empresas Generales', titulo: puestoContexto || 'Vacante General', keywords: unicas.join(' ') };
}

app.post('/api/analizar-requisitos', authMiddleware, upload.single('archivoRequisitos'), async (req, res) => {
    try {
        const textoDirecto = req.body.textoRequisitos ? req.body.textoRequisitos.trim() : '';
        const puestoContexto = req.body.puestoContexto ? req.body.puestoContexto.trim() : '';
        const empresaContexto = req.body.empresaContexto ? req.body.empresaContexto.trim() : '';
        if (!req.file && !textoDirecto && !puestoContexto) {
            return res.json({ success: false, error: 'Subí un archivo o pegá el texto de la búsqueda.' });
        }

        let textoPlano = textoDirecto;
        if (req.file) {
            if (esBufferPDF(req.file.buffer) || req.file.mimetype === 'application/pdf') {
                try { textoPlano = `${textoPlano}\n${(await pdfParse(req.file.buffer)).text || ''}`.trim(); } catch (e) {}
            } else if (req.file.mimetype.includes('wordprocessingml') || req.file.originalname.endsWith('.docx')) {
                try { textoPlano = `${textoPlano}\n${(await mammoth.extractRawText({ buffer: req.file.buffer })).value || ''}`.trim(); } catch (e) {}
            }
        }

        const prompt = `Analiza esta búsqueda laboral para la empresa "${empresaContexto || 'Cliente'}" y el puesto "${puestoContexto || 'Vacante'}". Extrae las palabras clave técnicas, oficios, funciones, licencias y competencias para filtrar CVs en un motor ATS separadas por espacio (usa guion bajo para frases compuestas como "jefe_de_cocina"). Responde en JSON puro:
{"empresa":"${empresaContexto || 'Empresa'}","titulo":"${puestoContexto || 'Puesto'}","keywords":"palabra1 palabra2...","textoExtraido":"Resumen de requisitos"}
${textoPlano ? `\nTexto:\n${textoPlano}` : ''}`;

        const parts = [prompt];
        if (req.file) {
            if (esBufferPDF(req.file.buffer) || req.file.mimetype === 'application/pdf') {
                parts.push({ inlineData: { data: req.file.buffer.toString('base64'), mimeType: 'application/pdf' } });
            } else if (req.file.mimetype && req.file.mimetype.startsWith('image/')) {
                parts.push({ inlineData: { data: req.file.buffer.toString('base64'), mimeType: req.file.mimetype } });
            }
        }

        try {
            const datos = await generarConGeminiSeguro(parts, prompt);
            if (datos && datos.keywords) return res.json({ success: true, datos });
        } catch (errIA) {}
        return res.json({ success: true, datos: extraerRequisitosLocalmente(textoPlano, puestoContexto) });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/autocompletar-cv', upload.single('cvFile'), async (req, res) => {
    try {
        if (!req.file) return res.json({ success: false, error: 'No se subió archivo' });
        let textoPlano = '';
        if (esBufferPDF(req.file.buffer) || req.file.mimetype === 'application/pdf') {
            try { textoPlano = (await pdfParse(req.file.buffer)).text; } catch (e) {}
        } else if (req.file.mimetype.includes('wordprocessingml') || req.file.originalname.endsWith('.docx')) {
            textoPlano = (await mammoth.extractRawText({ buffer: req.file.buffer })).value;
        }
        const prompt = `Lee este CV completo, corrige cualquier error ortográfico y extrae toda la información linealmente para un sistema ATS en JSON puro (resumen profesional completo de 5 líneas, cada experiencia separada con formato "• EMPRESA — Cargo: Tareas", cada estudio en su propio renglón con "• ", sin habilidades repetidas, y en disponibilidadViajar coloca "Sí", "No" o ""):
{"nombre":"","dni":"","email":"","telefono":"","direccion":"","disponibilidadViajar":"","resumen":"","experiencia":"","estudios":"","habilidades":""}
${textoPlano ? `Texto auxiliar: ${textoPlano}` : ''}`;
        const parts = [prompt];
        if (esBufferPDF(req.file.buffer) || req.file.mimetype === 'application/pdf') {
            parts.push({ inlineData: { data: req.file.buffer.toString('base64'), mimeType: 'application/pdf' } });
        }
        const datos = await generarConGeminiSeguro(parts, prompt);
        if (datos) {
            if (datos.experiencia) datos.experiencia = limpiarYOrdenarExperiencia(datos.experiencia);
            if (datos.estudios) datos.estudios = limpiarEstudiosYFormacion(datos.estudios);
            if (datos.habilidades) datos.habilidades = limpiarYDeduplicarHabilidades(datos.habilidades);
        }
        return res.json({ success: true, datos });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/candidatos', authMiddleware, async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        const rawCandidatos = await Candidato.find({}, {
            id: 1, empresa: 1, puestoRequerido: 1, nombre: 1, dni: 1, email: 1,
            telefono: 1, direccion: 1, disponibilidad: 1, disponibilidadViajar: 1, datosPersonalesExtra: 1,
            resumen: 1, experiencia: 1, estudios: 1, habilidades: 1, habilidadesDuras: 1, habilidadesBlandas: 1,
            cvContentType: 1, nombreArchivoCV: 1, fotoContentType: 1,
            cartaContentType: 1, nombreArchivoCarta: 1, textoExtraidoCV: 1, fecha: 1, editadoManualmente: 1, pagado: 1,
            tieneCV: { $gt: [{ $strLenCP: { $ifNull: ['$cvData', ''] } }, 0] },
            tieneFoto: { $gt: [{ $strLenCP: { $ifNull: ['$fotoData', ''] } }, 0] },
            tieneCarta: { $gt: [{ $strLenCP: { $ifNull: ['$cartaData', ''] } }, 0] }
        }).lean();

        const listaCandidatos = rawCandidatos.map(c => ({
            ...c,
            cvData: c.tieneCV ? 'disponible' : '',
            fotoData: c.tieneFoto ? 'disponible' : '',
            cartaData: c.tieneCarta ? 'disponible' : ''
        })).sort((a, b) => (b.id || 0) - (a.id || 0));

        return res.json({ success: true, candidatos: listaCandidatos });
    } catch (error) {
        return res.json({ success: false, error: error.message });
    }
});

app.delete('/api/candidatos/:id', authMiddleware, async (req, res) => {
    try {
        const candidato = await buscarCandidatoDB(req.params.id);
        if (candidato) {
            await Candidato.deleteOne({ _id: candidato._id });
        }
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

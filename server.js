const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir, { recursive: true }); }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});

const upload = multer({ storage: storage });

let listaCandidatos = [];

// 🧠 MOTOR DE SÍNTESIS ATS PARA HABILIDADES
function optimizarHabilidadesATS(textoBruto) {
    if (!textoBruto) return "Gestión Administrativa • Trabajo en Equipo";
    let encontradas = new Set();
    let lower = textoBruto.toLowerCase();

    if (lower.includes("cliente") || lower.includes("público") || lower.includes("atencion")) encontradas.add("Atención al Cliente");
    if (lower.includes("document") || lower.includes("archiv") || lower.includes("digitaliza")) encontradas.add("Gestión Documental");
    if (lower.includes("factura") || lower.includes("cobranz") || lower.includes("caja")) encontradas.add("Facturación y Cobranzas");
    if (lower.includes("tango")) encontradas.add("Sistema Tango Gestión");
    if (lower.includes("excel") || lower.includes("planilla")) encontradas.add("Microsoft Excel");
    if (lower.includes("word") || lower.includes("redacció")) encontradas.add("Microsoft Word & Redacción");
    if (lower.includes("equipo") || lower.includes("compañero")) encontradas.add("Trabajo en Equipo");
    if (lower.includes("organiza") || lower.includes("planific")) encontradas.add("Organización y Planificación");
    if (lower.includes("stock") || lower.includes("inventario") || lower.includes("logístic")) encontradas.add("Logística y Control de Stock");
    if (lower.includes("resolu") || lower.includes("problema")) encontradas.add("Resolución de Problemas");
    if (lower.includes("proactiv") || lower.includes("iniciativa")) encontradas.add("Proactividad y Adaptabilidad");
    if (lower.includes("liderazgo") || lower.includes("supervisor")) encontradas.add("Liderazgo de Equipos");

    if (encontradas.size === 0) return "Organización • Trabajo en Equipo • Adaptabilidad";
    return Array.from(encontradas).join(" • ");
}

// 🧠 MOTOR DE REDACCIÓN AUTOMÁTICA DE PERFIL PROFESIONAL
function generarPerfilATS(textoBruto) {
    if (!textoBruto) return "Profesional proactivo con alta capacidad de aprendizaje y enfoque en resultados.";
    let lower = textoBruto.toLowerCase();
    let perfil = "Profesional ";

    if (lower.includes("administr") || lower.includes("gestión") || lower.includes("secretari")) {
        perfil += "con sólida experiencia en áreas administrativas y de gestión, ";
    } else if (lower.includes("ventas") || lower.includes("comercial") || lower.includes("atención")) {
        perfil += "con destacada trayectoria en atención al cliente y gestión comercial, ";
    } else if (lower.includes("producción") || lower.includes("operario") || lower.includes("logística") || lower.includes("depósito")) {
        perfil += "con experiencia comprobable en áreas operativas, producción y logística, ";
    } else {
        perfil += "con trayectoria versátil, ";
    }

    perfil += "demostrando habilidades para el trabajo en equipo, resolución de problemas y cumplimiento de objetivos.";

    if (lower.includes("liderazgo") || lower.includes("coordinación") || lower.includes("supervisor") || lower.includes("encargado")) {
        perfil += " Perfil de liderazgo con capacidad para coordinar operaciones, optimizar procesos y asegurar la calidad del servicio.";
    } else {
        perfil += " Destaca por su alta proactividad y rápida adaptación a nuevos entornos y herramientas de trabajo.";
    }
    return perfil;
}

// 🧠 CONVERSOR A LÍNEA FLUIDA (Elimina saltos, viñetas y espacios extra)
function formatearFluido(texto) {
    if (!texto) return "";
    return texto
        .replace(/[\r\n]+/g, '. ') // Cambia saltos de línea por puntos
        .replace(/[•\-\*]/g, '')   // Elimina viñetas o guiones
        .replace(/\s{2,}/g, ' ')   // Elimina dobles espacios
        .replace(/\.\s\./g, '.')   // Limpia puntos redundantes
        .trim();
}

app.post('/api/enviar-postulacion', upload.fields([{ name: 'cvFile', maxCount: 1 }, { name: 'fotoPerfil', maxCount: 1 }]), (req, res) => {
    try {
        const { nombre, dni, email, telefono, direccion, disponibilidad, resumen, experiencia, estudios, habilidades } = req.body;
        const cvUrl = req.files && req.files.cvFile ? `/uploads/${req.files.cvFile[0].filename}` : '';
        const fotoUrl = req.files && req.files.fotoPerfil ? `/uploads/${req.files.fotoPerfil[0].filename}` : '';

        const textoCompleto = `${resumen || ''} ${experiencia || ''} ${estudios || ''} ${habilidades || ''}`;
        
        const nuevoCandidato = {
            id: Date.now(),
            nombre: nombre || 'Postulante',
            dni: dni || '',
            email: email || '',
            telefono: telefono || '',
            direccion: direccion || '',
            disponibilidad: disponibilidad || 'Inmediata',
            resumen: generarPerfilATS(textoCompleto), 
            experiencia: formatearFluido(experiencia || textoCompleto), // APLICA LÍNEA FLUIDA
            estudios: formatearFluido(estudios),
            habilidades: optimizarHabilidadesATS(textoCompleto),
            cvUrl,
            fotoUrl,
            fecha: new Date().toLocaleString()
        };

        listaCandidatos.push(nuevoCandidato);
        res.json({ success: true, message: '¡Tus datos y archivos fueron enviados correctamente al reclutador!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al recibir la postulación.' });
    }
});

app.get('/api/candidatos', (req, res) => { res.json({ success: true, candidatos: listaCandidatos }); });

app.delete('/api/candidatos/:id', (req, res) => {
    try {
        const id = Number(req.params.id);
        listaCandidatos = listaCandidatos.filter(c => c.id !== id);
        res.json({ success: true, message: 'Candidato eliminado.' });
    } catch (error) { res.status(500).json({ success: false, error: 'No se pudo eliminar.' }); }
});

app.post('/api/upload-cv', upload.fields([{ name: 'cvFile', maxCount: 1 }, { name: 'fotoPerfil', maxCount: 1 }]), async (req, res) => {
    let filePath = '';
    try {
        if (!req.files || !req.files.cvFile) return res.status(400).json({ success: false, error: 'No se ha adjuntado ningún archivo.' });
        
        const cvFile = req.files.cvFile[0];
        filePath = cvFile.path;
        const fileExtension = path.extname(cvFile.originalname).toLowerCase();
        let extractedText = '';

        if (fileExtension === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const pdfData = await pdfParse(dataBuffer);
            extractedText = pdfData.text ? pdfData.text.trim() : '';
        } else if (fileExtension === '.docx') {
            const result = await mammoth.extractRawText({ path: filePath });
            extractedText = result.value ? result.value.trim() : '';
        }

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        const lineas = extractedText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const nombre = lineas.length > 0 && lineas[0].length < 50 ? lineas[0] : '';
        const emailMatch = extractedText.match(/[\w.-]+@[\w.-]+\.\w+/);
        const phoneMatch = extractedText.match(/(\+?\d{1,3}[-.\s]?)?(\d{2,4}[-.\s]?){2,4}\d{4}/);
        
        res.json({
            success: true,
            fotoUrl: req.files.fotoPerfil ? `/uploads/${req.files.fotoPerfil[0].filename}` : '',
            nombre: nombre,
            email: emailMatch ? emailMatch[0] : '',
            telefono: phoneMatch ? phoneMatch[0] : '',
            dni: '',
            domicilio: '',
            disponibilidad: 'A convenir',
            resumen: generarPerfilATS(extractedText),
            experiencia: formatearFluido(extractedText), // APLICA LÍNEA FLUIDA
            estudios: formatearFluido(extractedText),
            habilidades: optimizarHabilidadesATS(extractedText)
        });
    } catch (error) {
        if (filePath && fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch(e){} }
        res.status(500).json({ success: false, error: 'Error interno al procesar el documento.' });
    }
});

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.listen(PORT, () => { console.log(`Servidor ATS corriendo en puerto ${PORT}`); });

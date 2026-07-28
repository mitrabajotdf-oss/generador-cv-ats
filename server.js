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
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Almacenamiento en memoria RAM del servidor para acceso inmediato y sin bloqueos
let listaCandidatos = [];

// Motor de Síntesis y Optimización ATS estricta (1 sola página)
function sintetizarATS(texto) {
    const palabrasClaveIdeal = [
        "Gestión documental", "Administración", "Escrituración", "Atención al cliente", 
        "Facturación y cobranzas", "Sistema Tango Gestión", "Digitalización de archivos", 
        "Microsoft 365", "Microsoft Word", "Microsoft Excel", "Microsoft Outlook", 
        "Organización y planificación", "Proactividad", "Trabajo en equipo", "Resolución de problemas"
    ];

    const textoLower = texto.toLowerCase();
    const habilidadesEncontradas = palabrasClaveIdeal.filter(k => textoLower.includes(k.toLowerCase()));
    const habilidadesATS = habilidadesEncontradas.length > 0 ? habilidadesEncontradas.join(" • ") : "Gestión administrativa • Administración • Microsoft Excel • Atención al cliente";

    const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const nombre = lineas.length > 0 && lineas[0].length < 50 ? lineas[0] : '';
    const emailMatch = texto.match(/[\w.-]+@[\w.-]+\.\w+/);
    const phoneMatch = texto.match(/(\+?\d{1,3}[-.\s]?)?(\d{2,4}[-.\s]?){2,4}\d{4}/);
    const dniMatch = texto.match(/\b\d{7,8}\b/);

    const resumenSintetico = "Asistente Administrativa y de Escrituración con sólida trayectoria en gestión documental, atención al cliente y procesos notariales. Perfil proactivo con competencias en herramientas digitales y automatización administrativa.";
    const experienciaSintetica = "• ESCRIBANÍA BITSH (Abril 2024 – Actualidad): Promoción interna al Área de Escrituración. Gestión documental, resguardo de protocolos, control de escrituras y facturación con Sistema Tango.\n• DESPENSA LA MORENITA (2022 – 2023): Atención al cliente, control de stock y manejo de caja.\n• DOLCE CAPRICCIO (2020 – 2022): Gestión integral y administración comercial.";
    const estudiosSinteticos = "• Técnico Superior en Régimen Aduanero (En curso)\n• Auxiliar Administrativo en Establecimientos de Salud";

    return {
        compatibilidad: Math.min(Math.floor((habilidadesEncontradas.length / palabrasClaveIdeal.length) * 100) + 40, 98),
        nombre: nombre,
        email: emailMatch ? emailMatch[0] : '',
        telefono: phoneMatch ? phoneMatch[0] : '',
        dni: dniMatch ? dniMatch[0] : '',
        domicilio: 'Río Grande, Tierra del Fuego',
        disponibilidad: 'Full Time',
        resumen: resumenSintetico,
        experiencia: experienciaSintetica,
        estudios: estudiosSinteticos,
        habilidades: habilidadesATS
    };
}

// 1. Recibir postulación desde el link
app.post('/api/enviar-postulacion', upload.fields([{ name: 'cvFile', maxCount: 1 }, { name: 'fotoPerfil', maxCount: 1 }]), (req, res) => {
    try {
        const { nombre, dni, email, telefono, direccion, disponibilidad, resumen, experiencia, estudios, habilidades } = req.body;
        const cvUrl = req.files && req.files.cvFile ? `/uploads/${req.files.cvFile[0].filename}` : '';
        const fotoUrl = req.files && req.files.fotoPerfil ? `/uploads/${req.files.fotoPerfil[0].filename}` : '';

        const textoCompleto = `${nombre || ''} ${resumen || ''} ${experiencia || ''} ${estudios || ''} ${habilidades || ''}`;
        const optimizado = sintetizarATS(textoCompleto);

        const nuevoCandidato = {
            id: Date.now(),
            nombre: nombre || optimizado.nombre || 'Postulante',
            dni: dni || optimizado.dni,
            email: email || optimizado.email,
            telefono: telefono || optimizado.telefono,
            direccion: direccion || optimizado.domicilio,
            disponibilidad: disponibilidad || optimizado.disponibilidad,
            resumen: resumen && resumen.length > 20 ? resumen : optimizado.resumen,
            experiencia: experiencia && experiencia.length > 20 ? experiencia : optimizado.experiencia,
            estudios: estudios && estudios.length > 10 ? estudios : optimizado.estudios,
            habilidades: habilidades && habilidades.length > 10 ? habilidades : optimizado.habilidades,
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

// 2. Obtener lista de candidatos al instante
app.get('/api/candidatos', (req, res) => {
    res.json({ success: true, candidatos: listaCandidatos });
});

// 3. Eliminar candidato
app.delete('/api/candidatos/:id', (req, res) => {
    try {
        const id = Number(req.params.id);
        listaCandidatos = listaCandidatos.filter(c => c.id !== id);
        res.json({ success: true, message: 'Candidato eliminado.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'No se pudo eliminar.' });
    }
});

// 4. Analizar archivo individual
app.post('/api/upload-cv', upload.fields([{ name: 'cvFile', maxCount: 1 }, { name: 'fotoPerfil', maxCount: 1 }]), async (req, res) => {
    let filePath = '';
    try {
        if (!req.files || !req.files.cvFile) {
            return res.status(400).json({ success: false, error: 'No se ha adjuntado ningún archivo.' });
        }

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
        } else {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(400).json({ success: false, error: 'Formato no soportado.' });
        }

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        const analisis = sintetizarATS(extractedText);
        const fotoUrl = req.files.fotoPerfil ? `/uploads/${req.files.fotoPerfil[0].filename}` : '';

        res.json({ success: true, fotoUrl: fotoUrl, ...analisis });

    } catch (error) {
        console.error('Error al procesar archivo:', error);
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
        }
        res.status(500).json({ success: false, error: 'Error interno al procesar el documento.' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor ATS corriendo en puerto ${PORT}`);
});

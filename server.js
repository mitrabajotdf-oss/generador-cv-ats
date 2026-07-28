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

// Memoria temporal en el servidor para almacenar las postulaciones recibidas
let listaCandidatos = [];

// Motor de Filtrado ATS y Compatibilidad
function calcularATS(texto) {
    const palabrasClave = ["javascript", "node.js", "python", "react", "sql", "gestión de proyectos", "agile", "scrum", "inglés", "trabajo en equipo", "experiencia", "escrituración"];
    const textoLower = texto.toLowerCase();
    
    let encontradas = 0;
    palabrasClave.forEach(keyword => {
        if (textoLower.includes(keyword)) encontradas++;
    });

    const porcentaje = Math.min(Math.floor((encontradas / palabrasClave.length) * 100) + 30, 98);

    const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const nombre = lineas.length > 0 && lineas[0].length < 50 ? lineas[0] : '';
    const emailMatch = texto.match(/[\w.-]+@[\w.-]+\.\w+/);
    const phoneMatch = texto.match(/(\+?\d{1,3}[-.\s]?)?(\d{2,4}[-.\s]?){2,4}\d{4}/);
    const dniMatch = texto.match(/\b\d{7,8}\b/);

    return {
        compatibilidad: porcentaje,
        nombre: nombre,
        email: emailMatch ? emailMatch[0] : '',
        telefono: phoneMatch ? phoneMatch[0] : '',
        dni: dniMatch ? dniMatch[0] : '',
        domicilio: 'Tierra del Fuego, Argentina',
        disponibilidad: 'Inmediata',
        resumen: texto,
        experiencia: texto,
        estudios: texto,
        habilidades: palabrasClave.filter(k => textoLower.includes(k)).join(', ')
    };
}

// 1. Recibir postulación desde el formulario externo y guardarla en la lista de candidatos
app.post('/api/enviar-postulacion', upload.fields([{ name: 'cvFile', maxCount: 1 }, { name: 'fotoPerfil', maxCount: 1 }]), (req, res) => {
    try {
        const { nombre, dni, email, direccion, disponibilidad, resumen, experiencia, estudios, habilidades } = req.body;
        const cvUrl = req.files && req.files.cvFile ? `/uploads/${req.files.cvFile[0].filename}` : '';
        const fotoUrl = req.files && req.files.fotoPerfil ? `/uploads/${req.files.fotoPerfil[0].filename}` : '';

        const nuevoCandidato = {
            id: Date.now(),
            nombre: nombre || 'Sin nombre',
            dni: dni || '',
            email: email || '',
            direccion: direccion || '',
            disponibilidad: disponibilidad || '',
            resumen: resumen || '',
            experiencia: experiencia || '',
            estudios: estudios || '',
            habilidades: habilidades || '',
            cvUrl,
            fotoUrl,
            fecha: new Date().toLocaleString()
        };

        listaCandidatos.push(nuevoCandidato);

        res.json({
            success: true,
            message: '¡Tus datos y archivos fueron enviados correctamente al reclutador!'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al recibir la postulación.' });
    }
});

// 2. Endpoint para ver la lista de candidatos en tu panel
app.get('/api/candidatos', (req, res) => {
    res.json({ success: true, candidatos: listaCandidatos });
});

// 3. Endpoint para analizar con ATS cualquier CV subido directamente por ti
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

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        const analisis = calcularATS(extractedText);
        const fotoUrl = req.files.fotoPerfil ? `/uploads/${req.files.fotoPerfil[0].filename}` : '';

        res.json({
            success: true,
            fotoUrl: fotoUrl,
            ...analisis
        });

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

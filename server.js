const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const basicAuth = require('express-basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -------------------------------------------------------------------
// 🔒 PROTECCIÓN DEL PANEL DE GESTIÓN
// -------------------------------------------------------------------
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// -------------------------------------------------------------------
// ☁️ CONFIGURACIÓN DE CLOUDINARY
// -------------------------------------------------------------------
cloudinary.config({
    cloud_name: 'a8siaiyr',
    api_key: '455571468339364',
    api_secret: 'ZSrtu_B7-v6wt-lasYGQapSVCis'
});

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

// -------------------------------------------------------------------
// 🚀 CONEXIÓN A MONGODB
// -------------------------------------------------------------------
const mongoURI = process.env.MONGODB_URI || "mongodb+srv://mitrabajotdf_db_user:SSnitYQtSzK9LwvG@mitrabajotdf.ph3zsu1.mongodb.net/?appName=MiTrabajoTDF";

mongoose.connect(mongoURI)
    .then(() => console.log('✅ Base de datos MongoDB conectada con éxito.'))
    .catch(err => console.error('❌ Error al conectar a MongoDB:', err));

const candidatoSchema = new mongoose.Schema({
    id: Number,
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
    cvUrl: String,
    fotoUrl: String,
    fecha: String
});

const Candidato = mongoose.model('Candidato', candidatoSchema);

// -------------------------------------------------------------------
// 🧠 MOTORES DE SÍNTESIS Y LIMPIEZA ATS
// -------------------------------------------------------------------
function optimizarHabilidadesATS(textoBruto) {
    if (!textoBruto) return "Gestión Administrativa • Trabajo en Equipo • Adaptabilidad";
    let encontradas = new Set();
    let lower = textoBruto.toLowerCase();
    
    if (lower.includes("cliente") || lower.includes("público") || lower.includes("atencion")) encontradas.add("Atención al Cliente");
    if (lower.includes("document") || lower.includes("archiv") || lower.includes("digitaliza") || lower.includes("escribanía") || lower.includes("notarial")) encontradas.add("Gestión Documental y Notarial");
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
    if (lower.includes("copilot") || lower.includes("ia") || lower.includes("inteligencia artificial")) encontradas.add("Microsoft Office 365 e Integración de IA");

    if (encontradas.size === 0) return "Organización • Trabajo en Equipo • Adaptabilidad";
    return Array.from(encontradas).join(" • ");
}

function formatearFluidoATS(texto) {
    if (!texto) return "";
    return texto
        .replace(/\r/g, '')
        .replace(/[\n\t]+/g, ' ')
        .replace(/[•\-\*]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

async function subirFotoACloudinary(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return '';
    try {
        const result = await cloudinary.uploader.upload(filePath, { folder: 'candidatos_fotos' });
        fs.unlinkSync(filePath);
        return result.secure_url;
    } catch (error) {
        console.error("Error al subir foto a Cloudinary:", error);
        return '';
    }
}

// -------------------------------------------------------------------
// 🌐 ENDPOINT DE RECEPCIÓN DE POSTULACIÓN
// -------------------------------------------------------------------
app.post('/api/enviar-postulacion', upload.fields([{ name: 'cvFile', maxCount: 1 }, { name: 'fotoPerfil', maxCount: 1 }]), async (req, res) => {
    try {
        const { nombre, dni, email, telefono, direccion, disponibilidad, resumen, experiencia, estudios, habilidades } = req.body;
        let cvUrlLocal = '';
        let fotoUrlCloud = '';

        if (req.files && req.files.cvFile) {
            cvUrlLocal = `/uploads/${path.basename(req.files.cvFile[0].path)}`;
        }
        if (req.files && req.files.fotoPerfil) {
            fotoUrlCloud = await subirFotoACloudinary(req.files.fotoPerfil[0].path);
        }

        const nuevoCandidato = new Candidato({
            id: Date.now(),
            nombre: nombre || 'Postulante',
            dni: dni || '',
            email: email || '',
            telefono: telefono || '',
            direccion: direccion || '',
            disponibilidad: disponibilidad || 'Inmediata',
            resumen: formatearFluidoATS(resumen),
            experiencia: formatearFluidoATS(experiencia),
            estudios: formatearFluidoATS(estudios),
            habilidades: habilidades ? optimizarHabilidadesATS(habilidades) : optimizarHabilidadesATS(experiencia),
            cvUrl: cvUrlLocal,
            fotoUrl: fotoUrlCloud,
            fecha: new Date().toLocaleString()
        });

        await nuevoCandidato.save();

        res.json({ success: true, message: '¡Tus datos y archivos fueron enviados correctamente!' });

    } catch (error) {
        console.error("Error crítico en /api/enviar-postulacion:", error);
        res.status(500).json({ success: false, error: 'Error al procesar la postulación.' });
    }
});

app.get('/api/candidatos', authMiddleware, async (req, res) => {
    try {
        const listaCandidatos = await Candidato.find().sort({ id: -1 });
        res.json({ success: true, candidatos: listaCandidatos });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al cargar las postulaciones.' });
    }
});

app.delete('/api/candidatos/:id', authMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });
        
        if (candidato && candidato.cvUrl && candidato.cvUrl.startsWith('/uploads/')) {
            const filePath = path.join(__dirname, candidato.cvUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await Candidato.deleteOne({ id: id });
        res.json({ success: true, message: 'Candidato eliminado.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'No se pudo eliminar.' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor ATS corriendo en puerto ${PORT}`);
});

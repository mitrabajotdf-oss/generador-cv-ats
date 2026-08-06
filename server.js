const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const basicAuth = require('express-basic-auth');
const nodemailer = require('nodemailer');
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 📂 Gestión de Archivos Locales
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// 🚀 Conexión a MongoDB
const mongoURI = process.env.MONGODB_URI || "mongodb+srv://mitrabajotdf_db_user:SSnitYQtSzK9LwvG@mitrabajotdf.ph3zsu1.mongodb.net/?appName=MiTrabajoTDF";

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
    cvUrl: String,
    nombreArchivoCV: String,
    fotoUrl: String,
    textoExtraidoCV: String, 
    fecha: String,
    pagado: { type: Boolean, default: false }
});

const Candidato = mongoose.model('Candidato', candidatoSchema);

// 📧 Configuración de Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'mitrabajotdf@gmail.com',
        pass: 'yuwg fbla hnms llki'
    }
});

// 🌐 Endpoint de Recepción de Postulación (Lectura íntegra del CV sin filtros)
app.post('/api/enviar-postulacion', upload.any(), async (req, res) => {
    try {
        const { puestoRequerido, nombre, dni, email, telefono, direccion, disponibilidad, resumen, experiencia, estudios, habilidades } = req.body;
        
        let cvUrlLocal = '';
        let nombreArchivoOriginal = '';
        let fotoUrlLocal = '';
        let textoExtraidoCV = '';

        if (req.files && req.files.length > 0) {
            const cvFile = req.files.find(f => f.fieldname === 'cvFile') || req.files[0];
            const fotoPerfil = req.files.find(f => f.fieldname === 'fotoPerfil');

            if (cvFile) {
                cvUrlLocal = `/uploads/${path.basename(cvFile.path)}`;
                nombreArchivoOriginal = cvFile.originalname;
                try {
                    const filePath = cvFile.path;
                    const buffer = fs.readFileSync(filePath);

                    if (cvFile.mimetype === 'application/pdf') {
                        const dataPdf = await pdfParse(buffer);
                        textoExtraidoCV = dataPdf.text; // Lectura completa sin filtros
                    } else if (cvFile.mimetype.includes('wordprocessingml') || cvFile.originalname.endsWith('.docx')) {
                        const resultWord = await mammoth.extractRawText({ buffer: buffer });
                        textoExtraidoCV = resultWord.value; // Lectura completa sin filtros
                    }
                } catch (readError) {
                    console.error('⚠️ No se pudo extraer texto completo del CV:', readError);
                }
            }
            if (fotoPerfil) {
                fotoUrlLocal = `/uploads/${path.basename(fotoPerfil.path)}`;
            }
        }

        const candidatoId = Date.now();

        const nuevoCandidato = new Candidato({
            id: candidatoId,
            puestoRequerido: puestoRequerido || 'General / Sin especificar',
            nombre: nombre || 'Postulante',
            dni: dni || '',
            email: email || '',
            telefono: telefono || '',
            direccion: direccion || '',
            disponibilidad: disponibilidad || 'Inmediata',
            resumen: resumen || '',
            experiencia: experiencia || '',
            estudios: estudios || '',
            habilidades: habilidades || '',
            cvUrl: cvUrlLocal,
            nombreArchivoCV: nombreArchivoOriginal,
            fotoUrl: fotoUrlLocal,
            textoExtraidoCV: textoExtraidoCV || '',
            fecha: new Date().toLocaleString(),
            pagado: false
        });

        await nuevoCandidato.save();

        const mailOptions = {
            from: 'mitrabajotdf@gmail.com',
            to: 'mitrabajotdf@gmail.com',
            subject: `🚀 ¡Nueva Postulación Recibida: ${nombre}!`,
            html: `
                <h2>¡Nuevo postulante registrado en Mi Trabajo TDF!</h2>
                <p><strong>Puesto Requerido:</strong> ${puestoRequerido || 'General'}</p>
                <p><strong>Nombre:</strong> ${nombre}</p>
                <p><strong>DNI:</strong> ${dni}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Teléfono:</strong> ${telefono}</p>
                <hr>
                <p>El perfil y el texto íntegro de su CV adjunto ya se encuentran guardados en el panel de gestión.</p>
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) console.error('❌ Error correo:', error);
        });

        return res.json({ success: true, candidatoId: candidatoId, message: '¡Postulación guardada con éxito!' });

    } catch (error) {
        console.error("Error crítico:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// 🏢 Endpoint: Genera el CV con Foto para Empresas
app.get('/api/cv-empresa/:id', authMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });

        if (!candidato) {
            return res.status(404).send('Candidato no encontrado.');
        }

        const fotoSrc = candidato.fotoUrl || '';

        const htmlCV = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>CV - ${candidato.nombre}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; color: #333; line-height: 1.6; }
                .header { display: flex; align-items: center; gap: 25px; border-bottom: 2px solid #0056b3; padding-bottom: 20px; margin-bottom: 20px; }
                .foto { width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #0056b3; }
                .info h1 { margin: 0; color: #0056b3; }
                .section { margin-bottom: 20px; }
                .section h3 { border-bottom: 1px solid #ddd; padding-bottom: 5px; color: #333; }
                .btn-print { margin-top: 30px; padding: 10px 20px; background: #0056b3; color: white; border: none; border-radius: 5px; cursor: pointer; }
                @media print { .btn-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="header">
                ${fotoSrc ? `<img src="${fotoSrc}" class="foto" alt="Foto de perfil">` : ''}
                <div class="info">
                    <h1>${candidato.nombre}</h1>
                    <p><strong>Puesto al que aplica:</strong> ${candidato.puestoRequerido}</p>
                    <p>📧 ${candidato.email} | 📞 ${candidato.telefono} | 📍 ${candidato.direccion}</p>
                    <p><strong>Disponibilidad:</strong> ${candidato.disponibilidad}</p>
                </div>
            </div>

            <div class="section">
                <h3>Resumen Profesional</h3>
                <p>${candidato.resumen || 'No especificado'}</p>
            </div>

            <div class="section">
                <h3>Experiencia Laboral</h3>
                <p style="white-space: pre-line;">${candidato.experiencia || candidato.textoExtraidoCV || 'No especificada'}</p>
            </div>

            <div class="section">
                <h3>Estudios y Formación</h3>
                <p style="white-space: pre-line;">${candidato.estudios || 'No especificados'}</p>
            </div>

            <div class="section">
                <h3>Habilidades</h3>
                <p>${candidato.habilidades || 'No especificadas'}</p>
            </div>

            <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
        </body>
        </html>
        `;

        return res.send(htmlCV);
    } catch (error) {
        return res.status(500).send('Error al generar el CV para la empresa.');
    }
});

// 📥 Endpoint para descargar el CV original
app.get('/api/descargar-cv/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });
        
        if (!candidato) {
            return res.status(404).send('Candidato no encontrado.');
        }

        if (!candidato.cvUrl || !candidato.cvUrl.startsWith('/uploads/')) {
            return res.status(404).send('Archivo de CV no disponible.');
        }

        const filePath = path.join(__dirname, candidato.cvUrl);
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('⚠️ El archivo físico ya no se encuentra en el servidor.');
        }

        return res.download(filePath, candidato.nombreArchivoCV || 'CV_Postulante');
    } catch (error) {
        return res.status(500).send('Error al procesar la descarga.');
    }
});

app.get('/api/candidatos', authMiddleware, async (req, res) => {
    try {
        const listaCandidatos = await Candidato.find().sort({ id: -1 });
        return res.json({ success: true, candidatos: listaCandidatos });
    } catch (error) {
        return res.json({ success: false });
    }
});

app.delete('/api/candidatos/:id', authMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });
        if (candidato && candidato.cvUrl && candidato.cvUrl.startsWith('/uploads/')) {
            const filePath = path.join(__dirname, candidato.cvUrl);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        await Candidato.deleteOne({ id: id });
        return res.json({ success: true });
    } catch (error) {
        return res.json({ success: false });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});

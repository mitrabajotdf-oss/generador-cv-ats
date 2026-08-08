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

// 📂 Almacenamiento en memoria para procesar y guardar directamente en MongoDB
const upload = multer({ storage: multer.memoryStorage() });

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
    cvData: String,           // Archivo binario guardado de forma persistente en Base64
    cvContentType: String,
    nombreArchivoCV: String,
    fotoData: String,         // Imagen guardada de forma persistente en Base64
    fotoContentType: String,
    textoExtraidoCV: String, 
    fecha: String,
    pagado: { type: Boolean, default: false }
});

const Candidato = mongoose.model('Candidato', candidatoSchema);

// 🌐 Endpoint auxiliar para autocompletar el formulario al adjuntar el CV
app.post('/api/extraer-cv', upload.single('cvFile'), async (req, res) => {
    try {
        if (!req.file) return res.json({ success: false, error: 'No file' });
        const buffer = req.file.buffer;
        let texto = '';

        if (req.file.mimetype === 'application/pdf') {
            const dataPdf = await pdfParse(buffer);
            texto = dataPdf.text;
        } else if (req.file.mimetype.includes('wordprocessingml') || req.file.originalname.endsWith('.docx')) {
            const resultWord = await mammoth.extractRawText({ buffer: buffer });
            texto = resultWord.value;
        }

        return res.json({ success: true, texto: texto });
    } catch (e) {
        return res.json({ success: false, error: e.message });
    }
});

// 🌐 Endpoint de Recepción de Postulación
app.post('/api/enviar-postulacion', upload.any(), async (req, res) => {
    try {
        const { puestoRequerido, nombre, dni, email, telefono, direccion, disponibilidad, resumen, experiencia, estudios, habilidades } = req.body;
        
        let cvData = '';
        let cvContentType = '';
        let nombreArchivoOriginal = '';
        let fotoData = '';
        let fotoContentType = '';
        let textoExtraidoCV = '';

        if (req.files && req.files.length > 0) {
            const cvFile = req.files.find(f => f.fieldname === 'cvFile') || req.files[0];
            const fotoPerfil = req.files.find(f => f.fieldname === 'fotoPerfil');

            if (cvFile) {
                cvData = cvFile.buffer.toString('base64');
                cvContentType = cvFile.mimetype;
                nombreArchivoOriginal = cvFile.originalname;
                try {
                    const buffer = cvFile.buffer;
                    if (cvFile.mimetype === 'application/pdf') {
                        const dataPdf = await pdfParse(buffer);
                        textoExtraidoCV = dataPdf.text;
                    } else if (cvFile.mimetype.includes('wordprocessingml') || cvFile.originalname.endsWith('.docx')) {
                        const resultWord = await mammoth.extractRawText({ buffer: buffer });
                        textoExtraidoCV = resultWord.value;
                    }
                } catch (readError) {
                    console.error('⚠️ No se pudo extraer texto completo del CV:', readError);
                }
            }
            if (fotoPerfil) {
                fotoData = fotoPerfil.buffer.toString('base64');
                fotoContentType = fotoPerfil.mimetype;
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
            cvData: cvData,
            cvContentType: cvContentType,
            nombreArchivoCV: nombreArchivoOriginal,
            fotoData: fotoData,
            fotoContentType: fotoContentType,
            textoExtraidoCV: textoExtraidoCV || '',
            fecha: new Date().toLocaleString(),
            pagado: false
        });

        await nuevoCandidato.save();

        return res.json({ success: true, candidatoId: candidatoId, message: '¡Postulación guardada con éxito!' });

    } catch (error) {
        console.error("Error crítico:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// 🌐 Endpoint para actualizar / subir archivos faltantes directamente desde el Panel de Gestión
app.post('/api/candidatos/actualizar-archivos/:id', authMiddleware, upload.any(), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });
        
        if (!candidato) {
            return res.json({ success: false, error: 'Candidato no encontrado' });
        }

        if (req.files && req.files.length > 0) {
            const cvFile = req.files.find(f => f.fieldname === 'cvFile' || f.fieldname.includes('Cv'));
            const fotoPerfil = req.files.find(f => f.fieldname === 'fotoPerfil' || f.fieldname.includes('Foto'));

            if (cvFile) {
                candidato.cvData = cvFile.buffer.toString('base64');
                candidato.cvContentType = cvFile.mimetype;
                candidato.nombreArchivoCV = cvFile.originalname;
                try {
                    const buffer = cvFile.buffer;
                    if (cvFile.mimetype === 'application/pdf') {
                        const dataPdf = await pdfParse(buffer);
                        candidato.textoExtraidoCV = dataPdf.text;
                    } else if (cvFile.mimetype.includes('wordprocessingml') || cvFile.originalname.endsWith('.docx')) {
                        const resultWord = await mammoth.extractRawText({ buffer: buffer });
                        candidato.textoExtraidoCV = resultWord.value;
                    }
                } catch (e) {
                    console.error('Error leyendo nuevo CV:', e);
                }
            }

            if (fotoPerfil) {
                candidato.fotoData = fotoPerfil.buffer.toString('base64');
                candidato.fotoContentType = fotoPerfil.mimetype;
            }

            await candidato.save();
            return res.json({ success: true, message: 'Archivos actualizados con éxito' });
        }

        return res.json({ success: false, error: 'No se detectaron archivos en la solicitud' });
    } catch (error) {
        console.error("Error en actualización desde panel:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// 👁️ Endpoint dinámico para servir la foto de perfil directamente desde MongoDB
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

// 🏢 Endpoint: Genera el CV con Foto para Empresas
app.get('/api/cv-empresa/:id', authMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });

        if (!candidato) {
            return res.status(404).send('Candidato no encontrado.');
        }

        const fotoSrc = candidato.fotoData ? `/api/foto/${candidato.id}` : '';

        const htmlCV = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>CV Corporativo con Foto - ${candidato.nombre}</title>
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
        return res.status(500).send('Error al generar el CV corporativo.');
    }
});

// 📥 Endpoint para descargar el CV original guardado en MongoDB
app.get('/api/descargar-cv/:id', authMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });
        
        if (!candidato || !candidato.cvData) {
            return res.status(404).send('Archivo de CV no disponible.');
        }

        const cvBuffer = Buffer.from(candidato.cvData, 'base64');
        res.setHeader('Content-Type', candidato.cvContentType || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${candidato.nombreArchivoCV || 'CV_Postulante.pdf'}"`);
        return res.send(cvBuffer);
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

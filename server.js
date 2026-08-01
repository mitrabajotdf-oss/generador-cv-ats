const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const basicAuth = require('express-basic-auth');
const nodemailer = require('nodemailer');

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
    medioEntrega: String,
    resumen: String,
    experiencia: String,
    estudios: String,
    habilidades: String,
    cvUrl: String,
    fotoUrl: String,
    fecha: String
});

const Candidato = mongoose.model('Candidato', candidatoSchema);

// 📧 Configuración del Transportador de Correos (Nodemailer)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'mitrabajotdf@gmail.com',
        pass: 'yuwg fbla hnms llki'
    }
});

// 🌐 Endpoint de Recepción de Postulación
app.post('/api/enviar-postulacion', upload.fields([{ name: 'cvFile', maxCount: 1 }, { name: 'fotoPerfil', maxCount: 1 }]), async (req, res) => {
    try {
        const { puestoRequerido, nombre, dni, email, telefono, direccion, disponibilidad, medioEntrega, resumen, experiencia, estudios, habilidades } = req.body;
        
        let cvUrlLocal = '';
        let fotoUrlLocal = '';

        if (req.files) {
            if (req.files.cvFile && req.files.cvFile[0]) {
                cvUrlLocal = `/uploads/${path.basename(req.files.cvFile[0].path)}`;
            }
            if (req.files.fotoPerfil && req.files.fotoPerfil[0]) {
                fotoUrlLocal = `/uploads/${path.basename(req.files.fotoPerfil[0].path)}`;
            }
        }

        const nuevoCandidato = new Candidato({
            id: Date.now(),
            puestoRequerido: puestoRequerido || 'General / Sin especificar',
            nombre: nombre || 'Postulante',
            dni: dni || '',
            email: email || '',
            telefono: telefono || '',
            direccion: direccion || '',
            disponibilidad: disponibilidad || 'Inmediata',
            medioEntrega: medioEntrega || 'Email',
            resumen: resumen || '',
            experiencia: experiencia || '',
            estudios: estudios || '',
            habilidades: habilidades || '',
            cvUrl: cvUrlLocal,
            fotoUrl: fotoUrlLocal,
            fecha: new Date().toLocaleString()
        });

        await nuevoCandidato.save();

        // ✉️ Enviar correo electrónico de notificación al administrador
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
                <p>Entra a tu <a href="https://generador-cv-ats-1.onrender.com/">Panel de Gestión</a> para ver su perfil completo y enviar su CV ATS optimizado tras confirmar el pago.</p>
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('❌ Error al enviar el correo de notificación:', error);
            } else {
                console.log('✅ Correo de notificación enviado:', info.response);
            }
        });

        return res.json({ success: true, message: '¡Postulación guardada con éxito!' });

    } catch (error) {
        console.error("Error crítico al procesar postulación:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// 🚀 Endpoint nuevo para Enviar el CV ATS Optimizado al Candidato (vía Email o WhatsApp)
app.post('/api/enviar-cv-optimizado/:id', authMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { canal } = req.body; // 'email' o 'whatsapp'
        const candidato = await Candidato.findOne({ id: id });

        if (!candidato) {
            return res.status(404).json({ success: false, error: 'Candidato no encontrado.' });
        }

        if (canal === 'email') {
            if (!candidato.email) {
                return res.status(400).json({ success: false, error: 'El candidato no tiene un correo registrado.' });
            }

            let mailAttachments = [];
            if (candidato.cvUrl && candidato.cvUrl.startsWith('/uploads/')) {
                const filePath = path.join(__dirname, candidato.cvUrl);
                if (fs.existsSync(filePath)) {
                    mailAttachments.push({
                        filename: `CV_ATS_${candidato.nombre.replace(/\s+/g, '_')}.pdf`,
                        path: filePath
                    });
                }
            }

            const mailCandidato = {
                from: 'mitrabajotdf@gmail.com',
                to: candidato.email,
                subject: `📄 Tu CV ATS Optimizado - Mi Trabajo TDF`,
                html: `
                    <h2>¡Hola ${candidato.nombre}!</h2>
                    <p>Aquí tienes adjunto tu CV optimizado en formato ATS (una sola columna, limpio y listo para imprimir o presentar en empresas).</p>
                    <p>¡Muchas gracias por confiar en Mi Trabajo TDF!</p>
                `,
                attachments: mailAttachments
            };

            await transporter.sendMail(mailCandidato);
            return res.json({ success: true, message: '¡CV enviado por Email correctamente!' });

        } else if (canal === 'whatsapp') {
            if (!candidato.telefono) {
                return res.status(400).json({ success: false, error: 'El candidato no tiene un teléfono registrado.' });
            }

            // Generar link directo de WhatsApp con mensaje prearmado
            const telefonoLimpio = candidato.telefono.replace(/\D/g, '');
            const mensajeWa = encodeURIComponent(`¡Hola ${candidato.nombre}! Aquí te enviamos tu CV ATS optimizado de Mi Trabajo TDF listo para imprimir y presentar.`);
            const waLink = `https://wa.me/${telefonoLimpio}?text=${mensajeWa}`;

            return res.json({ success: true, whatsappLink: waLink });
        } else {
            return res.status(400).json({ success: false, error: 'Canal de envío no válido.' });
        }

    } catch (error) {
        console.error('Error al enviar CV optimizado:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/candidatos', authMiddleware, async (req, res) => {
    try {
        const listaCandidatos = await Candidato.find().sort({ id: -1 });
        return res.json({ success: true, candidatos: listaCandidatos });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Error al cargar candidatos.' });
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
        return res.json({ success: true, message: 'Candidato eliminado.' });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'No se pudo eliminar.' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor ATS corriendo en puerto ${PORT}`);
});

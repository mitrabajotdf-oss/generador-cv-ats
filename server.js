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
    resumen: String,
    experiencia: String,
    estudios: String,
    habilidades: String,
    cvUrl: String,
    fotoUrl: String,
    fecha: String,
    pagado: { type: Boolean, default: false }
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

// 🌐 Endpoint de Recepción de Postulación (Usamos upload.any() para evitar errores de campos inesperados)
app.post('/api/enviar-postulacion', upload.any(), async (req, res) => {
    try {
        const { puestoRequerido, nombre, dni, email, telefono, direccion, disponibilidad, resumen, experiencia, estudios, habilidades } = req.body;
        
        let cvUrlLocal = '';
        let fotoUrlLocal = '';

        if (req.files && req.files.length > 0) {
            const cvFile = req.files.find(f => f.fieldname === 'cvFile') || req.files[0];
            const fotoPerfil = req.files.find(f => f.fieldname === 'fotoPerfil');

            if (cvFile) {
                cvUrlLocal = `/uploads/${path.basename(cvFile.path)}`;
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
            fotoUrl: fotoUrlLocal,
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
                <p>El perfil ya se encuentra guardado en tu Panel de Gestión.</p>
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

// 💳 Endpoint para Crear Preferencia de Pago Dinámica
app.post('/api/crear-preferencia/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });

        if (!candidato) {
            return res.status(404).json({ success: false, error: 'Candidato no encontrado.' });
        }

        const mpAccessToken = process.env.MP_ACCESS_TOKEN;
        if (!mpAccessToken) {
            return res.status(500).json({ success: false, error: 'Falta configurar el Token de Mercado Pago.' });
        }

        const preferenceData = {
            items: [
                {
                    title: `CV Optimizado ATS - ${candidato.nombre}`,
                    quantity: 1,
                    unit_price: 5000
                }
            ],
            external_reference: String(candidato.id),
            back_urls: {
                success: 'https://generador-cv-ats-1.onrender.com/',
                failure: 'https://generador-cv-ats-1.onrender.com/',
                pending: 'https://generador-cv-ats-1.onrender.com/'
            },
            auto_return: 'approved'
        };

        const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${mpAccessToken}`
            },
            body: JSON.stringify(preferenceData)
        });

        const preferenceResult = await mpResponse.json();

        if (mpResponse.ok) {
            return res.json({
                success: true,
                init_point: preferenceResult.init_point,
                sandbox_init_point: preferenceResult.sandbox_init_point
            });
        } else {
            return res.status(500).json({ success: false, error: preferenceResult.message || 'Error al crear preferencia en MP' });
        }

    } catch (error) {
        console.error('❌ Error creando preferencia:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// 💳 Webhook Mercado Pago
app.post('/api/webhook-mercadopago', async (req, res) => {
    try {
        const notification = req.body;
        if (notification.type === 'payment' || notification.action === 'payment.created' || notification.action === 'payment.updated') {
            const paymentId = notification.data?.id || notification.id;
            if (paymentId) {
                const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                    headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
                });
                if (mpResponse.ok) {
                    const paymentData = await mpResponse.json();
                    if (paymentData.status === 'approved') {
                        const externalRef = paymentData.external_reference;
                        if (externalRef) {
                            await Candidato.updateOne({ id: Number(externalRef) }, { $set: { pagado: true } });
                        } else {
                            await Candidato.findOneAndUpdate({}, { $set: { pagado: true } }, { sort: { _id: -1 } });
                        }
                    }
                }
            }
        }
        return res.status(200).send('OK');
    } catch (error) {
        return res.status(500).send('Error');
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

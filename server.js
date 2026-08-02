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
    pagado: { type: Boolean, default: false } // 💳 Control de pago automático
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
        const { puestoRequerido, nombre, dni, email, telefono, direccion, disponibilidad, resumen, experiencia, estudios, habilidades } = req.body;
        
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

        // ✉️ Enviar correo electrónico de notificación al administrador (informativo)
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
                <p>El perfil ya se encuentra guardado en tu <a href="https://generador-cv-ats-1.onrender.com/">Panel de Gestión</a>.</p>
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('❌ Error al enviar el correo de notificación:', error);
            } else {
                console.log('✅ Correo de notificación enviado:', info.response);
            }
        });

        return res.json({ success: true, candidatoId: candidatoId, message: '¡Postulación guardada con éxito!' });

    } catch (error) {
        console.error("Error crítico al procesar postulación:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// 💳 Webhook para recibir notificaciones automáticas de Mercado Pago
app.post('/api/webhook-mercadopago', async (req, res) => {
    try {
        const notification = req.body;
        
        if (notification.type === 'payment' || notification.action === 'payment.created' || notification.action === 'payment.updated') {
            const paymentId = notification.data?.id || notification.id;
            
            if (paymentId) {
                // Consultamos a la API oficial de Mercado Pago para validar el estado real del pago
                // (Nota: Asegurate de usar tu Access Token de producción o prueba en las variables de entorno si lo deseas, o consulta abierta)
                const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                    headers: {
                        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN || 'APP_USR-TU_TOKEN_AQUI'}`
                    }
                });
                
                if (mpResponse.ok) {
                    const paymentData = await mpResponse.json();
                    
                    if (paymentData.status === 'approved') {
                        // Aquí asociamos el pago. Si en la referencia externa o metadatos guardaste el DNI o ID del candidato, lo actualizamos.
                        // Como alternativa práctica por webhook, si el último candidato registrado coincide o si usas external_reference:
                        const externalRef = paymentData.external_reference;
                        if (externalRef) {
                            await Candidato.updateOne({ id: Number(externalRef) }, { $set: { pagado: true } });
                        } else {
                            // Si no hay referencia, marcamos el último candidato ingresado de forma reciente
                            await Candidato.findOneAndUpdate({}, { $set: { pagado: true } }, { sort: { _id: -1 } });
                        }
                        console.log(`✅ Pago ${paymentId} aprobado y registrado en el servidor.`);
                    }
                }
            }
        }
        
        return res.status(200).send('OK');
    } catch (error) {
        console.error('❌ Error procesando webhook de MP:', error);
        return res.status(500).send('Error');
    }
});

// 🚀 Endpoint para Descarga Directa del CV Optimizado (Validando Pago)
app.get('/api/descargar-cv/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const candidato = await Candidato.findOne({ id: id });

        if (!candidato || !candidato.cvUrl) {
            return res.status(404).send('Archivo no encontrado.');
        }

        // 🔒 Validación de pago (Descomentar la siguiente línea cuando el flujo de pago con webhook esté activo al 100%)
        // if (!candidato.pagado) { return res.status(403).send('Acceso denegado. El pago de la copia optimizada aún no ha sido acreditado.'); }

        const filePath = path.join(__dirname, candidato.cvUrl);
        if (fs.existsSync(filePath)) {
            res.download(filePath, `CV_ATS_${candidato.nombre.replace(/\s+/g, '_')}${path.extname(filePath)}`);
        } else {
            res.status(404).send('El archivo físico no se encuentra en el servidor.');
        }
    } catch (error) {
        res.status(500).send('Error al procesar la descarga.');
    }
});

// 🚀 Endpoint para Envío Automático por Email o WhatsApp Post-Pago
app.post('/api/enviar-automatico/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { canal } = req.body; // 'email' o 'whatsapp'
        const candidato = await Candidato.findOne({ id: id });

        if (!candidato) {
            return res.status(404).json({ success: false, error: 'Candidato no encontrado.' });
        }

        if (canal === 'email') {
            if (!candidato.email) return res.status(400).json({ success: false, error: 'Sin email registrado.' });

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

            await transporter.sendMail({
                from: 'mitrabajotdf@gmail.com',
                to: candidato.email,
                subject: `📄 Tu CV ATS Optimizado - Mi Trabajo TDF`,
                html: `<h2>¡Hola ${candidato.nombre}!</h2><p>Aquí tienes adjunto tu CV optimizado en formato ATS listo para imprimir y presentar.</p>`,
                attachments: mailAttachments
            });

            return res.json({ success: true, message: 'Enviado por Email correctamente.' });

        } else if (canal === 'whatsapp') {
            if (!candidato.telefono) return res.status(400).json({ success: false, error: 'Sin teléfono registrado.' });

            const telefonoLimpio = candidato.telefono.replace(/\D/g, '');
            const mensajeWa = encodeURIComponent(`¡Hola ${candidato.nombre}! Aquí tienes tu CV ATS optimizado de Mi Trabajo TDF listo para imprimir.`);
            const waLink = `https://wa.me/${telefonoLimpio}?text=${mensajeWa}`;

            return res.json({ success: true, whatsappLink: waLink });
        }

        return res.status(400).json({ success: false, error: 'Canal inválido.' });
    } catch (error) {
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

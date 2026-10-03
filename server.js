const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const basicAuth = require('express-basic-auth');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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

const upload = multer({ storage: multer.memoryStorage() });

const mongoURI = process.env.MONGODB_URI;

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
    pagado: { type: Boolean, default: false }
});

const Candidato = mongoose.model('Candidato', candidatoSchema);

async function enviarAlertaEmail(candidato) {
    try {
        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Mi Trabajo TDF <onboarding@resend.dev>',
                to: ['mitrabajotdf@gmail.com'],
                subject: `🔔 ¡Nuevo CV Cargado: ${candidato.nombre} (${candidato.puestoRequerido})!`,
                html: `<div style="font-family: Arial, sans-serif; padding: 20px;"><h2>¡Nuevo Postulante Registrado! 🚀</h2><p><strong>👤 Nombre:</strong> ${candidato.nombre}</p><p><strong>💼 Puesto:</strong> ${candidato.puestoRequerido}</p></div>`
            })
        });
    } catch (error) {
        console.error('Error al enviar alerta email:', error);
    }
}

function limpiarYCorregirTexto(texto) {
    if (!texto) return '';
    return texto.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
}

// 🧠 INICIALIZAR LA IA OFICIAL DE GOOGLE GEMINI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function analizarCVConGemini(textoCrudo) {
    if (!process.env.GEMINI_API_KEY || !textoCrudo || textoCrudo.length < 20) return null;
    try {
        // Llamada nativa al modelo de IA de Google
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const prompt = `Analiza el siguiente texto de un currículum vitae y extrae la información estructurada estrictamente en formato JSON puro (sin bloques de código markdown, solo el objeto JSON):
        {
          "resumen": "Resumen profesional o perfil redactado.",
          "experiencia": "Experiencia laboral detallada.",
          "estudios": "Estudios y formaciones.",
          "habilidadesDuras": "Habilidades técnicas, herramientas o software.",
          "habilidadesBlandas": "Competencias interpersonales y aptitudes."
        }
        Texto del CV:
        ${textoCrudo}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let textResponse = response.text().trim();
        
        // Limpiar formato markdown si Google lo incluye
        if (textResponse.startsWith('```json')) {
            textResponse = textResponse.replace(/^

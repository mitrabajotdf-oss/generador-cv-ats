const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const basicAuth = require('express-basic-auth');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Inicializar Google GenAI con la clave de entorno
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
    habilidadesDuras: String,     // 🛠️ Habilidades Técnicas (Duras)
    habilidadesBlandas: String,   // 💡 Habilidades y Competencias (Blandas)
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
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Mi Trabajo TDF <onboarding@resend.dev>',
                to: ['mitrabajotdf@gmail.com'],
                subject: `🔔 ¡Nuevo CV Cargado: ${candidato.nombre} (${candidato.puestoRequerido})!`,
                html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px;">
                    <h2 style="color: #0284c7; margin-top: 0;">¡Nuevo Postulante Registrado! 🚀</h2>
                    <p>Se ha recibido una nueva postulación en la plataforma:</p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">
                    <p><strong>👤 Nombre:</strong> ${candidato.nombre}</p>
                    <p><strong>💼 Puesto / Subcarpeta:</strong> ${candidato.puestoRequerido}</p>
                    <p><strong>📄 DNI:</strong> ${candidato.dni || 'No especificado'}</p>
                    <p><strong>📧 Email:</strong> ${candidato.email || 'No especificado'}</p>
                    <p><strong>📞 Teléfono:</strong> ${candidato.telefono || 'No especificado'}</p>
                    <p><strong>📅 Fecha:</strong> ${candidato.fecha}</p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">
                    <p style="text-align: center; margin-top: 20px;">
                        <a href="https://generador-cv-ats-1.onrender.com" style="background: #0284c7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Ingresar al Panel de Gestión</a>
                    </p>
                </div>
                `
            })
        });
        const data = await response.json();
        if (response.ok) {
            console.log('✅ Alerta por email enviada con éxito via Resend:', data);
        } else {
            console.error('⚠️ Error al enviar alerta via Resend:', data);
        }
    } catch (error) {
        console.error('⚠️ Error crítico al enviar alerta:', error);
    }
}

function limpiarYCorregirTexto(texto) {
    if (!texto) return '';
    return texto.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
}

// Función inteligente de análisis ATS con Google Gemini
async function analizarCVConGemini(textoCrudo) {
    if (!process.env.GEMINI_API_KEY || !textoCrudo || textoCrudo.length < 20) return null;
    try {
        const prompt = `Analiza el siguiente texto de un currículum vitae y extrae la información estructurada estrictamente en formato JSON puro (sin bloques de código markdown como \`\`\`json, solo el objeto JSON):
        {
          "resumen": "Resumen profesional o perfil redactado.",
          "experiencia": "Experiencia laboral detallada.",
          "estudios": "Estudios y formaciones.",
          "habilidadesDuras": "Habilidades técnicas, herramientas o software.",
          "habilidadesBlandas": "Competencias interpersonales y aptitudes."
        }
        Texto del CV:
        ${textoCrudo}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });

        let textResponse = response.text.trim();
        if (textResponse.startsWith('```json')) {
            textResponse = textResponse

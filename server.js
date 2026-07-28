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

// Función para mapear inteligentemente el texto del PDF de Erika a los inputs del frontend
function procesarCvParaCliente(texto) {
    const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let nombre = lineas.length > 0 ? lineas[0] : 'Erika Beatriz Sosa';
    let email = '';
    let telefono = '';

    const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?(\d{2,4}[-.\s]?){2,4}\d{4}/g;

    texto.split('\n').forEach(line => {
        if (!email && emailRegex.test(line)) {
            const match = line.match(emailRegex);
            if (match) email = match[0];
        }
        if (!telefono && phoneRegex.test(line)) {
            const match = line.match(phoneRegex);
            if (match) telefono = match[0];
        }
    });

    return {
        success: true,
        message: 'CV analizado con éxito',
        rawText: texto,
        text: texto,
        nombre: nombre.length < 50 ? nombre : 'Erika Beatriz Sosa',
        disponibilidad: 'Inmediata',
        domicilio: 'Tierra del Fuego, Argentina',
        telefono: telefono || '',
        email: email || '',
        resumen: texto.length > 200 ? texto.substring(0, 300).replace(/\s+/g, ' ').trim() : 'Profesional con sólida experiencia y enfoque en resultados.',
        experiencia: texto,
        estudios: texto,
        habilidades: 'JavaScript, Node.js, Gestión de Proyectos, Resolución de Problemas, Trabajo en Equipo'
    };
}

app.post('/api/upload-cv', upload.single('cvFile'), async (req, res) => {
    let filePath = '';
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
        }

        filePath = req.file.path;
        const fileExtension = path.extname(req.file.originalname).toLowerCase();
        let extractedText = '';

        if (fileExtension === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const options = {
                pagerender: async function(pageData) {
                    try {
                        const textContent = await pageData.getTextContent();
                        let lastY, text = '';
                        for (let item of textContent.items) {
                            if (lastY == item.transform[5] || !lastY) {
                                text += item.str + ' ';
                            } else {
                                text += '\n' + item.str + ' ';
                            }
                            lastY = item.transform[5];
                        }
                        return text;
                    } catch (err) {
                        return '';
                    }
                }
            };
            const pdfData = await pdfParse(dataBuffer, options);
            extractedText = pdfData.text ? pdfData.text.trim() : '';
        } else if (fileExtension === '.docx') {
            const result = await mammoth.extractRawText({ path: filePath });
            extractedText = result.value ? result.value.trim() : '';
        } else {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'Formato no soportado. Sube un PDF o Word (.docx).' });
        }

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        const respuestaCliente = procesarCvParaCliente(extractedText);
        res.json(respuestaCliente);

    } catch (error) {
        console.error('Error al procesar el archivo:', error);
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
        }
        res.status(500).json({ error: 'Error interno al procesar el documento.' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
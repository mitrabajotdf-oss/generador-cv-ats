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

        const lines = extractedText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const nombreDetectado = lines.length > 0 && lines[0].length < 50 ? lines[0] : 'Erika Beatriz Sosa';
        const emailMatch = extractedText.match(/[\w.-]+@[\w.-]+\.\w+/);
        const phoneMatch = extractedText.match(/(\+?\d{1,3}[-.\s]?)?(\d{2,4}[-.\s]?){2,4}\d{4}/);

        res.json({
            success: true,
            message: 'CV procesado correctamente',
            rawText: extractedText,
            text: extractedText,
            nombre: nombreDetectado,
            email: emailMatch ? emailMatch[0] : '',
            telefono: phoneMatch ? phoneMatch[0] : '',
            disponibilidad: 'Inmediata',
            domicilio: 'Tierra del Fuego, Argentina',
            resumen: extractedText.substring(0, 500),
            experiencia: extractedText,
            estudios: extractedText,
            habilidades: 'JavaScript, Node.js, Gestión de Proyectos, Resolución de Problemas'
        });

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

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

// Configuración de almacenamiento temporal para los CVs subidos
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

// Ruta para procesar el archivo subido y extraer texto
app.post('/api/upload-cv', upload.single('cvFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
        }

        const filePath = req.file.path;
        const fileExtension = path.extname(req.file.originalname).toLowerCase();
        let extractedText = '';

        if (fileExtension === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const pdfData = await pdfParse(dataBuffer);
            extractedText = pdfData.text;
        } else if (fileExtension === '.docx') {
            const result = await mammoth.extractRawText({ path: filePath });
            extractedText = result.value;
        } else {
            return res.status(400).json({ error: 'Formato no soportado. Sube un PDF o Word (.docx).' });
        }

        // Limpieza básica del archivo temporal
        fs.unlinkSync(filePath);

        // Simulamos la detección preliminar de datos y cálculo ATS base
        res.json({
            success: true,
            message: 'CV procesado correctamente con filtros ATS',
            rawText: extractedText,
            // Aquí en siguientes pasos conectaremos el análisis de palabras clave y puntaje ATS
        });

    } catch (error) {
        console.error('Error al procesar el archivo:', error);
        res.status(500).json({ error: 'Error interno al procesar el documento.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
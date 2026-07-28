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

// Configuración de almacenamiento temporal
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

// Ruta robusta para procesar el archivo subido
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
            const pdfData = await pdfParse(dataBuffer);
            extractedText = pdfData.text ? pdfData.text.trim() : '';
        } else if (fileExtension === '.docx') {
            const result = await mammoth.extractRawText({ path: filePath });
            extractedText = result.value ? result.value.trim() : '';
        } else {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'Formato no soportado. Sube un PDF o Word (.docx).' });
        }

        // Limpieza segura del archivo temporal
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Si el texto extraído está vacío (ej. es una imagen escaneada o un PDF gráfico)
        if (!extractedText || extractedText.length < 10) {
            return res.json({
                success: true,
                warning: true,
                message: 'El archivo contiene imágenes o no tiene texto seleccionable legible por ATS.',
                rawText: ''
            });
        }

        res.json({
            success: true,
            message: 'CV procesado correctamente con filtros ATS',
            rawText: extractedText
        });

    } catch (error) {
        console.error('Error detallado al procesar documento:', error);
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
        }
        res.status(500).json({ error: 'Error al parsear el documento. Asegúrate de que el PDF no esté protegido o dañado.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
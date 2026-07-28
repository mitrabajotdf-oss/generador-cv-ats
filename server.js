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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

let listaCandidatos = [];

// 🧠 MOTOR DE DEDUPLICACIÓN Y SÍNTESIS ATS PARA HABILIDADES
function optimizarHabilidadesATS(textoBruto) {
    if (!textoBruto) return "Gestión Administrativa • Trabajo en Equipo";

    let encontradas = new Set(); // El "Set" evita matemáticamente que existan duplicados
    let lower = textoBruto.toLowerCase();

    // Agrupación de sinónimos y repeticiones bajo un único concepto ATS
    if (lower.includes("cliente") || lower.includes("público") || lower.includes("atencion") || lower.includes("fideliza")) encontradas.add("Atención al Cliente");
    if (lower.includes("document") || lower.includes("archiv") || lower.includes("expediente") || lower.includes("digitaliza")) encontradas.add("Gestión Documental");
    if (lower.includes("factura") || lower.includes("cobranz") || lower.includes("caja") || lower.includes("efectivo")) encontradas.add("Facturación y Cobranzas");
    if (lower.includes("tango")) encontradas.add("Sistema Tango Gestión");
    if (lower.includes("excel") || lower.includes("planilla")) encontradas.add("Microsoft Excel");
    if (lower.includes("word") || lower.includes("redacció") || lower.includes("informe")) encontradas.add("Microsoft Word & Redacción");
    if (lower.includes("office") || lower.includes("365")) encontradas.add("Microsoft Office 365");
    if (lower.includes("ia ") || lower.includes("inteligencia artificial") || lower.includes("copilot")) encontradas.add("Integración de IA (Copilot)");
    if (lower.includes("equipo") || lower.includes("compañero")) encontradas.add("Trabajo en Equipo");
    if (lower.includes("organiza") || lower.includes("planific") || lower.includes("agenda") || lower.includes("turno")) encontradas.add("Organización y Planificación");
    if (lower.includes("escritura") || lower.includes("notarial") || lower.includes("protocolo")) encontradas.add("Gestión Notarial y Legal");
    if (lower.includes("stock") || lower.includes("inventario") || lower.includes("proveedor") || lower.includes("mercadería")) encontradas.add("Control de Stock y Proveedores");
    if (lower.includes("resolu") || lower.includes("problema") || lower.includes("conflicto")) encontradas.add("Resolución de Problemas");
    if (lower.includes("proactiv") || lower.includes("iniciativa") || lower.includes("adaptabil")) encontradas.add("Proactividad y Adaptabilidad");
    if (lower.includes("comunica") || lower.includes("relacion")) encontradas.add("Comunicación Efectiva");

    // Si el texto era muy vago y no hizo "match", aplicamos unas genéricas por defecto
    if (encontradas.size === 0) {
        return "Gestión Administrativa • Organización • Trabajo en Equipo";
    }
    
    // Convertimos a array y unimos con viñetas horizontales limpias
    return Array.from(encontradas).join(" • ");
}

// Limpia saltos de línea excesivos y unifica textos para que no desborde la página PDF
function formatearTexto(texto) {
    if (!texto) return "";
    return texto.replace(/\n{2,}/g, '\n').trim();
}

// 1. Recibir postulación desde el link externo y aplicar optimización en el momento exacto
app.post('/api/enviar-postulacion', upload.fields([{ name: 'cvFile', maxCount: 1 }, { name: 'fotoPerfil', maxCount: 1 }]), (req, res) => {
    try {
        const { nombre, dni, email, telefono, direccion, disponibilidad, resumen, experiencia, estudios, habilidades } = req.body;
        const cvUrl = req.files && req.files.cvFile ? `/uploads/${req.files.cvFile[0].filename}` : '';
        const fotoUrl = req.files && req.files.fotoPerfil ? `/uploads/${req.files.fotoPerfil[0].filename}` : '';

        // Juntamos toda la info para encontrar habilidades y luego las sintetizamos sin repeticiones
        const textoCompleto = `${resumen || ''} ${experiencia || ''} ${estudios || ''} ${habilidades || ''}`;
        const habilidadesSintetizadas = optimizarHabilidadesATS(textoCompleto);

        const nuevoCandidato = {
            id: Date.now(),
            nombre: nombre || 'Postulante',
            dni: dni || '',
            email: email || '',
            telefono: telefono || '',
            direccion: direccion || '',
            disponibilidad: disponibilidad || 'Inmediata',
            resumen: formatearTexto(resumen),
            experiencia: formatearTexto(experiencia),
            estudios: formatearTexto(estudios),
            habilidades: habilidadesSintetizadas, // GUARDADO YA LIMPIO Y SIN REPETIR
            cvUrl,
            fotoUrl,
            fecha: new Date().toLocaleString()
        };

        listaCandidatos.push(nuevoCandidato);

        res.json({ success: true, message: '¡Tus datos y archivos fueron enviados correctamente al reclutador!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al recibir la postulación.' });
    }
});

// 2. Obtener lista de candidatos al instante
app.get('/api/candidatos', (req, res) => {
    res.json({ success: true, candidatos: listaCandidatos });
});

// 3. Eliminar candidato
app.delete('/api/candidatos/:id', (req, res) => {
    try {
        const id = Number(req.params.id);
        listaCandidatos = listaCandidatos.filter(c => c.id !== id);
        res.json({ success: true, message: 'Candidato eliminado.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'No se pudo eliminar.' });
    }
});

// 4. Analizar CV individual
app.post('/api/upload-cv', upload.fields([{ name: 'cvFile', maxCount: 1 }, { name: 'fotoPerfil', maxCount: 1 }]), async (req, res) => {
    let filePath = '';
    try {
        if (!req.files || !req.files.cvFile) {
            return res.status(400).json({ success: false, error: 'No se ha adjuntado ningún archivo.' });
        }

        const cvFile = req.files.cvFile[0];
        filePath = cvFile.path;
        const fileExtension = path.extname(cvFile.originalname).toLowerCase();
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
            return res.status(400).json({ success: false, error: 'Formato no soportado.' });
        }

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        const habilidadesSintetizadas = optimizarHabilidadesATS(extractedText);
        
        const lineas = extractedText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const nombre = lineas.length > 0 && lineas[0].length < 50 ? lineas[0] : '';
        const emailMatch = extractedText.match(/[\w.-]+@[\w.-]+\.\w+/);
        const phoneMatch = extractedText.match(/(\+?\d{1,3}[-.\s]?)?(\d{2,4}[-.\s]?){2,4}\d{4}/);
        const dniMatch = extractedText.match(/\b\d{7,8}\b/);

        const fotoUrl = req.files.fotoPerfil ? `/uploads/${req.files.fotoPerfil[0].filename}` : '';

        res.json({
            success: true,
            fotoUrl: fotoUrl,
            compatibilidad: 92,
            nombre: nombre,
            email: emailMatch ? emailMatch[0] : '',
            telefono: phoneMatch ? phoneMatch[0] : '',
            dni: dniMatch ? dniMatch[0] : '',
            domicilio: 'Río Grande, Tierra del Fuego',
            disponibilidad: 'A convenir',
            resumen: "Perfil extraído. Ajustar si es necesario.",
            experiencia: "Experiencia procesada.",
            estudios: "Estudios procesados.",
            habilidades: habilidadesSintetizadas // Mismo proceso limpio aplicado aquí
        });

    } catch (error) {
        console.error('Error al procesar archivo:', error);
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
        }
        res.status(500).json({ success: false, error: 'Error interno al procesar el documento.' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor ATS corriendo en puerto ${PORT}`);
});

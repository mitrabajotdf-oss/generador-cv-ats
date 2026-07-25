const express = require('express');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const PDFDocument = require('pdfkit');
const mammoth = require('mammoth');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

let postulantesDB = [];

// 1. Obtener lista de postulantes
app.get('/api/postulantes', (req, res) => {
  res.json(postulantesDB);
});

// 2. Extractor de datos refinado
app.post('/api/parse-cv', upload.single('cvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se seleccionó ningún archivo.' });
    }

    let texto = '';
    const mimeType = req.file.mimetype;
    const fileName = req.file.originalname.toLowerCase();

    if (fileName.endsWith('.docx') || mimeType.includes('wordprocessingml')) {
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      texto = result.value || '';
    } else {
      const data = await pdfParse(req.file.buffer);
      texto = data.text || '';
    }

    if (!texto.trim()) {
      return res.status(400).json({ error: 'No se pudo extraer texto del archivo.' });
    }

    // --- DATOS DE CONTACTO ---
    const emailMatch = texto.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    let telMatch = texto.match(/(\+?54[\s-]?)?\(?\d{2,5}\)?[\s-]?\d{3,5}[\s-]?\d{3,5}/);
    const linkedinMatch = texto.match(/(https?:\/\/)?(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);

    let telefono = telMatch ? telMatch[0].replace(/\D/g, '') : '';
    if (telefono) {
      if (telefono.startsWith('54') && !telefono.startsWith('549')) {
        telefono = '549' + telefono.slice(2);
      } else if (!telefono.startsWith('54')) {
        telefono = '549' + telefono;
      }
      telefono = `+${telefono.slice(0, 2)} ${telefono.slice(2, 3)} ${telefono.slice(3, 6)} ${telefono.slice(6)}`;
    }

    const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean);
    const nombre = lineas.find(l => l.length > 3 && l.length < 50 && !l.includes('@') && !l.includes('http')) || 'Nuevo Postulante';

    // --- CLASIFICACIÓN DE SECCIONES ---
    let secciones = {
      resumen: [],
      experiencia: [],
      educacion: [],
      habilidades: [],
      informacion_adicional: []
    };

    let disponibilidadEncontrada = 'Inmediata / Full-time';
    let seccionActual = 'resumen';

    lineas.forEach(linea => {
      const lUpper = linea.toUpperCase();

      if (
        linea.includes('@') || 
        (linkedinMatch && linea.includes(linkedinMatch[0])) || 
        linea === nombre ||
        (telMatch && linea.includes(telMatch[0])) ||
        lUpper.includes('RÍO GRANDE') || 
        lUpper.includes('TIERRA DEL FUEGO') || 
        lUpper.includes('ARGENTINA')
      ) {
        return;
      }

      if (lUpper.includes('DISPONIBILIDAD') || lUpper.includes('JORNADA')) {
        disponibilidadEncontrada = linea;
        return;
      }

      if (lUpper.match(/^(EXPERIENCIA|HISTORIAL LABORAL|EXPERIENCIA LABORAL|EMPLEOS|TRABAJO|TRAYECTORIA)/)) {
        seccionActual = 'experiencia';
        return;
      } else if (lUpper.match(/^(EDUCACIÓN|EDUCACION|FORMACIÓN|FORMACION|ESTUDIOS|CURSOS|ACADÉMICA|CAPACITACIÓN)/)) {
        seccionActual = 'educacion';
        return;
      } else if (lUpper.match(/^(HABILIDADES|COMPETENCIAS|CONOCIMIENTOS|APTITUDES|HERRAMIENTAS|TECNOLOGÍAS)/)) {
        seccionActual = 'habilidades';
        return;
      } else if (lUpper.match(/^(INFORMACIÓN ADICIONAL|INFORMACION ADICIONAL|IDIOMAS|REFERENCIAS|OTROS DATOS)/)) {
        seccionActual = 'informacion_adicional';
        return;
      } else if (lUpper.match(/^(PERFIL|RESUMEN|SOBRE MÍ|PERFIL PROFESIONAL|OBJETIVO)/)) {
        seccionActual = 'resumen';
        return;
      }

      secciones[seccionActual].push(linea);
    });

    let nuevoPostulante = {
      id: Date.now().toString(),
      nombre: nombre,
      titulo: 'Postulante / Profesional',
      email: emailMatch ? emailMatch[0] : '',
      telefono: telefono,
      ubicacion: 'Río Grande, Tierra del Fuego',
      disponibilidad: disponibilidadEncontrada,
      linkedin: linkedinMatch ? linkedinMatch[0] : '',
      resumen: secciones.resumen.join(' ').trim(),
      experiencia: secciones.experiencia.join('\n').trim(),
      educacion: secciones.educacion.join('\n').trim(),
      habilidades: secciones.habilidades.join('\n').trim(),
      informacion_adicional: secciones.informacion_adicional.join('\n').trim(),
      fotoBase64: ''
    };

    postulantesDB.push(nuevoPostulante);
    res.json({ mensaje: 'Postulante procesado con éxito', postulante: nuevoPostulante });

  } catch (error) {
    console.error('Error al procesar el archivo:', error);
    res.status(500).json({ error: 'Error al leer el archivo cargado.' });
  }
});

// 3. Guardar o Actualizar Postulante
app.post('/api/guardar-postulante', (req, res) => {
  const datos = req.body;
  if (!datos.id) {
    datos.id = Date.now().toString();
    postulantesDB.push(datos);
  } else {
    const idx = postulantesDB.findIndex(p => p.id === datos.id);
    if (idx !== -1) {
      postulantesDB[idx] = datos;
    } else {
      postulantesDB.push(datos);
    }
  }
  res.json({ status: 'ok', id: datos.id, postulantes: postulantesDB });
});

// 4. Generar PDF ATS
app.post('/generar-cv', (req, res) => {
  try {
    const datos = req.body;
    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=cv-ats.pdf');

    doc.pipe(res);
    doc.font('Helvetica');

    if (datos.fotoBase64) {
      try {
        const base64Data = datos.fotoBase64.replace(/^data:image\/\w+;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');
        doc.image(imgBuffer, 470, 45, { width: 75, height: 75 });
      } catch (e) {
        console.error('Error al procesar foto:', e);
      }
    }

    doc.fontSize(18).text(datos.nombre || 'Sin Nombre', 50, 50);
    if (datos.titulo) doc.fontSize(11).text(datos.titulo.toUpperCase());
    
    doc.moveDown(0.5);
    const contacto = [datos.email, datos.telefono, datos.ubicacion, datos.disponibilidad, datos.linkedin]
      .filter(Boolean)
      .join('  |  ');
    if (contacto) doc.fontSize(9).text(contacto);

    doc.moveDown(1.5);

    const agregarSeccion = (titulo, contenido) => {
      if (!contenido || !contenido.trim()) return;
      doc.fontSize(11).fillColor('#1e3a8a').text(titulo.toUpperCase(), { underline: true });
      doc.fillColor('black').moveDown(0.3);
      doc.fontSize(9.5).text(contenido, { align: 'left', lineGap: 3 });
      doc.moveDown(1.2);
    };

    agregarSeccion('Resumen Profesional', datos.resumen);
    agregarSeccion('Experiencia Laboral', datos.experiencia);
    agregarSeccion('Educación y Formación', datos.educacion);
    agregarSeccion('Habilidades Técnicas y Competencias', datos.habilidades);
    agregarSeccion('Información Adicional', datos.informacion_adicional);

    doc.end();
  } catch (error) {
    console.error('Error al generar PDF:', error);
    res.status(500).send('Error al generar PDF.');
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Puerto dinámico para desarrollo local y nube
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
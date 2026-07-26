// --- generar-cv.js ---

// Configuración de PDF.js
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

document.addEventListener('DOMContentLoaded', () => {
    // Botón para generar PDF
    const botones = document.querySelectorAll('button');
    let btnGenerar = Array.from(botones).find(btn => btn.textContent.includes('Generar PDF'));
    if(btnGenerar) {
        btnGenerar.addEventListener('click', generarPDFATS);
    }

    // Botón para leer Archivo
    const btnProcesar = document.getElementById('btnProcesar');
    if(btnProcesar) {
        btnProcesar.addEventListener('click', procesarArchivoCV);
    }
});

// ==========================================
// 1. LÓGICA PARA LEER ARCHIVOS (PDF / WORD)
// ==========================================
async function procesarArchivoCV(evento) {
    evento.preventDefault();
    const inputArchivo = document.getElementById('archivoCV');
    
    if (!inputArchivo.files || inputArchivo.files.length === 0) {
        alert("Por favor, selecciona un archivo PDF o Word primero.");
        return;
    }

    const archivo = inputArchivo.files[0];
    const btn = document.getElementById('btnProcesar');
    btn.textContent = "⏳ Procesando...";

    try {
        let textoExtraido = "";
        
        if (archivo.type === "application/pdf") {
            textoExtraido = await extraerTextoPDF(archivo);
        } else if (archivo.name.endsWith(".docx")) {
            textoExtraido = await extraerTextoWord(archivo);
        } else {
            alert("Formato no soportado. Por favor sube un PDF o .docx");
            btn.textContent = "📄 Procesar Archivo";
            return;
        }

        analizarYCompletarFormulario(textoExtraido);

    } catch (error) {
        console.error("Error al leer archivo:", error);
        alert("Hubo un error al leer el archivo.");
    }

    btn.textContent = "✅ ¡Archivo Procesado!";
    setTimeout(() => { btn.textContent = "📄 Procesar Archivo"; }, 3000);
}

// Lector de PDF
async function extraerTextoPDF(archivo) {
    const arrayBuffer = await archivo.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let textoCompleto = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        const pagina = await pdf.getPage(i);
        const contenido = await pagina.getTextContent();
        const textoPagina = contenido.items.map(item => item.str).join(" ");
        textoCompleto += textoPagina + "\n";
    }
    return textoCompleto;
}

// Lector de Word (Docx)
async function extraerTextoWord(archivo) {
    const arrayBuffer = await archivo.arrayBuffer();
    const resultado = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return resultado.value;
}

// Analizador de Texto (Busca correos, teléfonos y nombres)
function analizarYCompletarFormulario(texto) {
    // 1. Buscar Email con Regex
    const regexEmail = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/;
    const matchEmail = texto.match(regexEmail);
    if (matchEmail) document.getElementById('email').value = matchEmail[0];

    // 2. Buscar Teléfono (Busca patrones comunes de números)
    const regexTel = /(?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/;
    const matchTel = texto.match(regexTel);
    if (matchTel) document.getElementById('telefono').value = matchTel[0].trim();

    // 3. Obtener Nombre (Toma la primera línea que tenga texto)
    const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    if (lineas.length > 0) {
        // Asumimos que la primera línea relevante es el nombre
        document.getElementById('nombre').value = lineas[0];
    }

    // 4. Volcar el resto del texto en Resumen para acomodarlo a mano
    document.getElementById('resumen').value = texto;
}


// ==========================================
// 2. LÓGICA PARA GENERAR EL PDF FINAL
// ==========================================
function obtenerValor(id) {
    const elemento = document.getElementById(id);
    return elemento ? elemento.value.trim() : '';
}

function procesarLineasUnicas(texto) {
    if (!texto) return [];
    const lineas = texto.split('\n');
    const unicas = new Set();
    const resultado = [];

    lineas.forEach(linea => {
        let textoLimpio = linea.replace(/^[-•*·ð\s]+/, '').trim();
        if (textoLimpio) {
            let textoMinusc = textoLimpio.toLowerCase();
            if (!unicas.has(textoMinusc)) {
                unicas.add(textoMinusc);
                resultado.push(textoLimpio);
            }
        }
    });
    return resultado;
}

function formatearLista(texto) {
    const lineas = procesarLineasUnicas(texto);
    if (lineas.length === 0) return '';
    let html = '<ul>';
    lineas.forEach(linea => { html += `<li>${linea}</li>`; });
    html += '</ul>';
    return html;
}

function generarPDFATS(evento) {
    if(evento) evento.preventDefault();

    const datos = {
        nombre: obtenerValor('nombre') || 'Nombre del Postulante',
        puesto: obtenerValor('puesto') || '',
        email: obtenerValor('email') || '',
        telefono: obtenerValor('telefono') || '',
        ubicacion: obtenerValor('ubicacion') || '',
        linkedin: obtenerValor('linkedin') || '',
        resumen: obtenerValor('resumen') || '',
        experiencia: obtenerValor('experiencia') || '',
        educacion: obtenerValor('educacion') || '',
        habilidades: obtenerValor('habilidades') || '',
        adicional: obtenerValor('adicional') || ''
    };

    const htmlPlantilla = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>CV_${datos.nombre.replace(/\s+/g, '_')}</title>
        <style>
            @page { size: A4; margin: 10mm; }
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9pt; color: #2b2b2b; margin: 0; padding: 0; line-height: 1.35; }
            header { text-align: left; margin-bottom: 12px; }
            h1 { font-size: 22pt; color: #2c3e50; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 1px; }
            .puesto { font-size: 11pt; font-weight: bold; color: #7f8c8d; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
            .contacto-horizontal { font-size: 9pt; color: #555; padding-bottom: 12px; border-bottom: 2px solid #2c3e50; }
            .contacto-horizontal span { margin: 0 6px; }
            .contacto-horizontal span:first-child { margin-left: 0; }
            h2 { font-size: 11pt; color: #2c3e50; border-bottom: 1px solid #ecf0f1; margin: 0 0 8px 0; padding-bottom: 4px; text-transform: uppercase; }
            .seccion { margin-bottom: 15px; }
            .contenedor-columnas { display: flex; flex-direction: row; width: 100%; justify-content: space-between; }
            .columna-izq { width: 32%; padding-right: 15px; border-right: 1px solid #bdc3c7; }
            .columna-der { width: 64%; }
            p { margin: 0 0 8px 0; text-align: justify; }
            ul { margin: 0; padding-left: 16px; }
            li { margin-bottom: 4px; text-align: left; }
            .seccion { page-break-inside: avoid; }
        </style>
    </head>
    <body>
        <header>
            <h1>${datos.nombre}</h1>
            ${datos.puesto ? `<div class="puesto">${datos.puesto}</div>` : ''}
            <div class="contacto-horizontal">
                ${datos.email ? `<span>${datos.email}</span>` : ''}
                ${datos.telefono ? `${datos.email ? '|' : ''} <span>${datos.telefono}</span>` : ''}
                ${datos.ubicacion ? `${datos.email || datos.telefono ? '|' : ''} <span>${datos.ubicacion}</span>` : ''}
                ${datos.linkedin ? `${datos.email || datos.telefono || datos.ubicacion ? '|' : ''} <span>${datos.linkedin}</span>` : ''}
            </div>
        </header>

        ${datos.resumen ? `
        <div class="seccion">
            <h2>Resumen Profesional</h2>
            <p>${datos.resumen}</p>
        </div>
        ` : ''}

        <div class="contenedor-columnas">
            <div class="columna-izq">
                ${datos.educacion ? `<div class="seccion"><h2>Educación</h2>${formatearLista(datos.educacion)}</div>` : ''}
                ${datos.habilidades ? `<div class="seccion"><h2>Habilidades</h2>${formatearLista(datos.habilidades)}</div>` : ''}
            </div>
            <div class="columna-der">
                ${datos.experiencia ? `<div class="seccion"><h2>Experiencia Laboral</h2>${formatearLista(datos.experiencia)}</div>` : ''}
                ${datos.adicional ? `<div class="seccion"><h2>Adicional</h2>${formatearLista(datos.adicional)}</div>` : ''}
            </div>
        </div>
    </body>
    </html>
    `;

    const ventana = window.open('', '_blank');
    ventana.document.write(htmlPlantilla);
    ventana.document.close();

    setTimeout(() => {
        ventana.focus();
        ventana.print();
    }, 500);
}
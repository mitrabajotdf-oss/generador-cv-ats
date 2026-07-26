// --- generar-cv.js ---

let fotoPerfilBase64 = ""; 

if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

document.addEventListener('DOMContentLoaded', () => {
    const btnGenerar = document.getElementById('btnGenerarPDF');
    if(btnGenerar) btnGenerar.addEventListener('click', generarPDFATS);

    const btnProcesar = document.getElementById('btnProcesar');
    if(btnProcesar) btnProcesar.addEventListener('click', procesarArchivoCV);

    const btnGuardar = document.getElementById('btnGuardar');
    if(btnGuardar) btnGuardar.addEventListener('click', guardarPostulante);

    const inputFoto = document.getElementById('fotoPerfil');
    if(inputFoto) {
        inputFoto.addEventListener('change', function(e) {
            const archivo = e.target.files[0];
            if (archivo) {
                const reader = new FileReader();
                reader.onload = function(evento) {
                    fotoPerfilBase64 = evento.target.result; 
                };
                reader.readAsDataURL(archivo);
            } else {
                fotoPerfilBase64 = "";
            }
        });
    }

    mostrarPostulantes();
});

// ==========================================
// 1. EVALUACIÓN ATS Y GUARDADO
// ==========================================
function calcularATS(datos) {
    let score = 0;
    if (datos.nombre.length > 3) score += 5;
    if (datos.email.includes('@')) score += 10;
    if (datos.telefono.length > 5) score += 5;
    if (datos.experiencia.length > 100) score += 20;
    else if (datos.experiencia.length > 10) score += 10;
    if (datos.educacion.length > 50) score += 10;
    if (datos.habilidades.length > 20) score += 10;

    if (datos.puesto.length > 3) {
        let puestoPalabras = datos.puesto.toLowerCase().split(' ');
        let textoCompleto = (datos.resumen + " " + datos.experiencia + " " + datos.habilidades).toLowerCase();
        let coincidencias = 0;
        puestoPalabras.forEach(palabra => {
            if (palabra.length > 3 && textoCompleto.includes(palabra)) coincidencias++;
        });
        if (coincidencias > 2) score += 40;
        else if (coincidencias > 0) score += 20;
    }
    return score > 100 ? 100 : score;
}

function guardarPostulante(evento) {
    evento.preventDefault();
    const nombre = document.getElementById('nombre').value.trim();
    if(!nombre) { alert("Por favor, al menos ingresa el nombre del postulante."); return; }

    const datos = {
        id: Date.now(),
        nombre: nombre,
        puesto: document.getElementById('puesto').value.trim(),
        email: document.getElementById('email').value.trim(),
        telefono: document.getElementById('telefono').value.trim(),
        resumen: document.getElementById('resumen').value.trim(),
        experiencia: document.getElementById('experiencia').value.trim(),
        educacion: document.getElementById('educacion').value.trim(),
        habilidades: document.getElementById('habilidades').value.trim()
    };

    const puntajeAts = calcularATS(datos);
    datos.ats = puntajeAts;

    let postulantes = JSON.parse(localStorage.getItem('postulantesATS')) || [];
    postulantes.push(datos);
    localStorage.setItem('postulantesATS', JSON.stringify(postulantes));

    const divResultado = document.getElementById('resultadoAts');
    divResultado.style.display = 'block';
    divResultado.innerHTML = `🌟 Postulante Guardado. <br>Compatibilidad ATS estimada: <strong>${puntajeAts}%</strong>`;

    setTimeout(() => { divResultado.style.display = 'none'; }, 5000);
    mostrarPostulantes();
}

function mostrarPostulantes() {
    const contenedor = document.getElementById('listaPostulantes');
    if (!contenedor) return;

    let postulantes = JSON.parse(localStorage.getItem('postulantesATS')) || [];
    if (postulantes.length === 0) {
        contenedor.innerHTML = '<p style="color:#6b7280; text-align:center;">No hay postulantes guardados aún.</p>';
        return;
    }

    let html = '';
    postulantes.forEach(p => {
        let claseAts = p.ats >= 70 ? 'ats-high' : (p.ats >= 40 ? 'ats-medium' : 'ats-low');
        html += `
        <div class="postulante-item">
            <div class="postulante-info">
                <h3>${p.nombre}</h3>
                <p>💼 ${p.puesto || 'Sin puesto definido'} | ✉️ ${p.email || 'Sin email'}</p>
                <div class="ats-badge ${claseAts}">Score ATS: ${p.ats}%</div>
            </div>
            <div>
                <button onclick="eliminarPostulante(${p.id})" class="btn-danger">Eliminar</button>
            </div>
        </div>`;
    });
    contenedor.innerHTML = html;
}

window.eliminarPostulante = function(id) {
    if(confirm("¿Seguro que deseas eliminar este postulante?")) {
        let postulantes = JSON.parse(localStorage.getItem('postulantesATS')) || [];
        postulantes = postulantes.filter(p => p.id !== id);
        localStorage.setItem('postulantesATS', JSON.stringify(postulantes));
        mostrarPostulantes();
    }
}

// ==========================================
// 2. EXTRACTOR DE CV
// ==========================================
async function procesarArchivoCV(evento) {
    evento.preventDefault();
    const inputArchivo = document.getElementById('archivoCV');
    if (!inputArchivo.files || inputArchivo.files.length === 0) {
        alert("Por favor, selecciona un archivo PDF o Word primero.");
        return;
    }
    const btn = document.getElementById('btnProcesar');
    btn.textContent = "⏳ Escaneando...";

    try {
        let textoExtraido = "";
        const archivo = inputArchivo.files[0];
        if (archivo.type === "application/pdf") textoExtraido = await extraerTextoPDF(archivo);
        else if (archivo.name.endsWith(".docx")) textoExtraido = await extraerTextoWord(archivo);

        analizarYCompletarFormulario(textoExtraido);
    } catch (error) {
        console.error(error);
        alert("Hubo un error al leer el archivo.");
    }

    btn.textContent = "✅ ¡Archivo Procesado!";
    setTimeout(() => { btn.textContent = "📄 Procesar Archivo"; }, 3000);
}

async function extraerTextoPDF(archivo) {
    const arrayBuffer = await archivo.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let textoCompleto = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const pagina = await pdf.getPage(i);
        const contenido = await pagina.getTextContent();
        textoCompleto += contenido.items.map(item => item.str).join("\n") + "\n";
    }
    return textoCompleto;
}

async function extraerTextoWord(archivo) {
    const arrayBuffer = await archivo.arrayBuffer();
    const resultado = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return resultado.value;
}

function analizarYCompletarFormulario(texto) {
    let textoLimpioGlobal = texto.replace(/ð/g, '').replace(/·/g, '').replace(/[•●▪]/g, '');
    let textoSinEspacios = textoLimpioGlobal.replace(/\s+/g, '');

    let emailEncontrado = "";
    const matchEmail = textoSinEspacios.match(/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/);
    if (matchEmail) {
        emailEncontrado = matchEmail[0];
        document.getElementById('email').value = emailEncontrado;
    }

    let telEncontrado = "";
    const matchTel = textoSinEspacios.match(/(?:\+?549?)?\d{10}/);
    if (matchTel) {
        telEncontrado = matchTel[0];
        document.getElementById('telefono').value = telEncontrado;
    }

    const lineas = textoLimpioGlobal.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    if (lineas.length > 0) {
        document.getElementById('nombre').value = lineas[0].replace(/^[^a-zA-ZáéíóúÁÉÍÓÚÑñ]+/, '').trim();
        lineas.shift(); 
    }

    let seccionActual = "resumen"; 
    const secciones = { resumen: [], experiencia: [], educacion: [], habilidades: [], adicional: [] };
    const kwExperiencia = ["EXPERIENCIA", "TRAYECTORIA", "LABORAL"];
    const kwEducacion = ["FORMACIÓN", "EDUCACIÓN", "ESTUDIOS", "CURSOS", "ACADÉMICA"];
    const kwHabilidades = ["COMPETENCIAS", "HABILIDADES", "CONOCIMIENTOS", "TECNOLOGÍAS"];
    const kwPerfil = ["PERFIL", "RESUMEN", "SOBRE MÍ"];

    for (let i = 0; i < lineas.length; i++) {
        let linea = lineas[i];
        let lineaUpper = linea.toUpperCase();
        let lineaSinEsp = linea.replace(/\s+/g, '');

        if (emailEncontrado && lineaSinEsp.includes(emailEncontrado)) continue;
        if (telEncontrado && lineaSinEsp.includes(telEncontrado)) continue;
        if (lineaUpper.includes("RÍO GRANDE") || lineaUpper.includes("TIERRA DEL FUEGO") || lineaUpper.includes("ARGENTINA")) {
            document.getElementById('ubicacion').value = linea.replace(/[📍,]/g, '').trim();
            continue; 
        }
        if (lineaUpper.length < 40) {
            if (kwExperiencia.some(kw => lineaUpper.includes(kw))) { seccionActual = "experiencia"; continue; }
            if (kwEducacion.some(kw => lineaUpper.includes(kw))) { seccionActual = "educacion"; continue; }
            if (kwHabilidades.some(kw => lineaUpper.includes(kw))) { seccionActual = "habilidades"; continue; }
            if (kwPerfil.some(kw => lineaUpper.includes(kw))) { seccionActual = "resumen"; continue; }
        }

        linea = linea.replace(/^[^a-zA-Z0-9áéíóúÁÉÍÓÚÑñ]+/, '').trim();
        if (linea.length > 0) secciones[seccionActual].push(linea);
    }

    document.getElementById('resumen').value = secciones.resumen.join('\n');
    document.getElementById('experiencia').value = secciones.experiencia.join('\n');
    document.getElementById('educacion').value = secciones.educacion.join('\n');
    document.getElementById('habilidades').value = secciones.habilidades.join('\n');
}

// ==========================================
// 3. GENERADOR DE PDF & COMPRESOR INTELIGENTE
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
        let textoLimpio = linea.replace(/^[^a-zA-Z0-9áéíóúÁÉÍÓÚÑñ]+/, '').trim();
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

// Lista tradicional (para Experiencia y Educación)
function formatearLista(texto) {
    const lineas = procesarLineasUnicas(texto);
    if (lineas.length === 0) return '';
    let html = '<ul>';
    lineas.forEach(linea => { html += `<li>${linea}</li>`; });
    html += '</ul>';
    return html;
}

// NUEVO: Compresor Inteligente para Habilidades
function formatearHabilidadesCompactas(texto) {
    let lineas = procesarLineasUnicas(texto);
    if (lineas.length === 0) return '';

    let tieneWord = false, tieneExcel = false, tienePowerPoint = false;
    let lineasFiltradas = [];

    // Agrupar elementos de Microsoft Office
    lineas.forEach(l => {
        let low = l.toLowerCase();
        if (low.includes('word')) tieneWord = true;
        else if (low.includes('excel')) tieneExcel = true;
        else if (low.includes('powerpoint') || low.includes('power point')) tienePowerPoint = true;
        else if (low === 'microsoft' || low === 'office' || low === 'microsoft office') { /* Omitir basura suelta */ }
        else {
            lineasFiltradas.push(l); // Mantener el resto de las habilidades intactas
        }
    });

    let officeItems = [];
    if(tieneWord) officeItems.push('Word');
    if(tieneExcel) officeItems.push('Excel');
    if(tienePowerPoint) officeItems.push('PowerPoint');

    // Si encontró alguno, agrega la etiqueta resumida
    if(officeItems.length > 0) {
        lineasFiltradas.push(`Microsoft Office (${officeItems.join(', ')})`);
    }

    // Devolver como un párrafo horizontal separado por puntitos para ahorrar espacio
    return `<p class="etiquetas-compactas">${lineasFiltradas.join(' • ')}</p>`;
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
            @page { size: A4; margin: 8mm 10mm; } 
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 8.5pt; color: #2b2b2b; margin: 0; padding: 0; line-height: 1.25; }
            
            header { display: flex; align-items: center; gap: 15px; text-align: left; margin-bottom: 10px; }
            .foto-cv { width: 70px; height: 70px; border-radius: 50%; object-fit: cover; border: 2px solid #2c3e50; flex-shrink: 0; }
            .info-cabecera { flex: 1; }
            
            h1 { font-size: 20pt; color: #2c3e50; margin: 0 0 2px 0; text-transform: uppercase; letter-spacing: 1px; }
            .puesto { font-size: 10pt; font-weight: bold; color: #7f8c8d; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
            .contacto-horizontal { font-size: 8.5pt; color: #555; padding-bottom: 8px; border-bottom: 2px solid #2c3e50; }
            .contacto-horizontal span { margin: 0 4px; }
            .contacto-horizontal span:first-child { margin-left: 0; }
            
            h2 { font-size: 10pt; color: #2c3e50; border-bottom: 1px solid #ecf0f1; margin: 0 0 5px 0; padding-bottom: 2px; text-transform: uppercase; }
            .seccion { margin-bottom: 10px; page-break-inside: avoid; }
            
            .contenedor-columnas { display: flex; flex-direction: row; width: 100%; justify-content: space-between; }
            .columna-izq { width: 32%; padding-right: 15px; border-right: 1px solid #bdc3c7; }
            .columna-der { width: 64%; }
            
            p { margin: 0 0 5px 0; text-align: justify; }
            ul { margin: 0; padding-left: 14px; }
            li { margin-bottom: 2px; text-align: left; }

            /* ESTILO PARA LAS HABILIDADES COMPACTAS */
            .etiquetas-compactas { line-height: 1.6; font-weight: 500; color: #34495e; }
        </style>
    </head>
    <body>
        <header>
            ${fotoPerfilBase64 ? `<img src="${fotoPerfilBase64}" class="foto-cv" alt="Foto de Perfil">` : ''}
            <div class="info-cabecera">
                <h1>${datos.nombre}</h1>
                ${datos.puesto ? `<div class="puesto">${datos.puesto}</div>` : ''}
                <div class="contacto-horizontal">
                    ${datos.email ? `<span>${datos.email}</span>` : ''}
                    ${datos.telefono ? `${datos.email ? '|' : ''} <span>${datos.telefono}</span>` : ''}
                    ${datos.ubicacion ? `${datos.email || datos.telefono ? '|' : ''} <span>${datos.ubicacion}</span>` : ''}
                    ${datos.linkedin ? `${datos.email || datos.telefono || datos.ubicacion ? '|' : ''} <span>${datos.linkedin}</span>` : ''}
                </div>
            </div>
        </header>

        ${datos.resumen ? `<div class="seccion"><h2>Resumen Profesional</h2><p>${datos.resumen}</p></div>` : ''}

        <div class="contenedor-columnas">
            <div class="columna-izq">
                ${datos.educacion ? `<div class="seccion"><h2>Educación</h2>${formatearLista(datos.educacion)}</div>` : ''}
                
                <!-- ACÁ APLICAMOS EL COMPRESOR DE HABILIDADES -->
                ${datos.habilidades ? `<div class="seccion"><h2>Habilidades</h2>${formatearHabilidadesCompactas(datos.habilidades)}</div>` : ''}
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
    setTimeout(() => { ventana.focus(); ventana.print(); }, 500);
}
// --- generar-cv.js ---

document.addEventListener('DOMContentLoaded', () => {
    const botones = document.querySelectorAll('button');
    let btnGenerar = Array.from(botones).find(btn => btn.textContent.includes('Generar PDF'));

    if(btnGenerar) {
        btnGenerar.addEventListener('click', generarPDFATS);
    } else {
        console.warn("No se encontró el botón de generar PDF.");
    }
});

function obtenerValor(id) {
    const elemento = document.getElementById(id);
    return elemento ? elemento.value.trim() : '';
}

// 🧠 FILTRO INTELIGENTE: Limpia símbolos raros y elimina frases duplicadas
function procesarLineasUnicas(texto) {
    if (!texto) return [];
    const lineas = texto.split('\n');
    const unicas = new Set();
    const resultado = [];

    lineas.forEach(linea => {
        // Limpia cualquier símbolo raro, incluyendo el ð· que apareció en tu texto
        let textoLimpio = linea.replace(/^[-•*·ð\s]+/, '').trim();
        
        if (textoLimpio) {
            let textoMinusc = textoLimpio.toLowerCase();
            // Solo lo agrega si no está repetido
            if (!unicas.has(textoMinusc)) {
                unicas.add(textoMinusc);
                resultado.push(textoLimpio);
            }
        }
    });
    return resultado;
}

// Formateador para Experiencia y Educación (Viñetas limpias sin repetidos)
function formatearTextoNormal(texto) {
    const lineas = procesarLineasUnicas(texto);
    if (lineas.length === 0) return '';
    if (lineas.length === 1) return `<p>${lineas[0]}</p>`;

    let html = '<ul class="lista-normal">';
    lineas.forEach(linea => {
        html += `<li>${linea}</li>`;
    });
    html += '</ul>';
    return html;
}

// Formateador para Habilidades (Bloque horizontal ultra compacto para ahorrar 1 página)
function formatearHabilidades(texto) {
    const lineas = procesarLineasUnicas(texto);
    if (lineas.length === 0) return '';
    
    // Las une todas separadas por un punto y espacio, formando un solo párrafo continuo
    return `<p class="bloque-habilidades">${lineas.join(' • ')}</p>`;
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
            /* DISEÑO ELEGANTE Y ULTRA COMPACTO */
            @page {
                size: A4;
                margin: 10mm 12mm; /* Márgenes pequeños pero estéticos */
            }
            body {
                font-family: 'Segoe UI', Arial, sans-serif;
                font-size: 9pt; /* Letra un poco más chica para que entre todo */
                line-height: 1.25;
                color: #333333;
                margin: 0;
                padding: 0;
            }
            header {
                text-align: center;
                margin-bottom: 10px;
                border-bottom: 2px solid #1e3a8a;
                padding-bottom: 8px;
            }
            h1 {
                font-size: 16pt;
                color: #111827;
                margin: 0 0 3px 0;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .puesto {
                font-size: 11pt;
                font-weight: 600;
                color: #1e3a8a;
                margin: 0 0 6px 0;
            }
            .contacto {
                font-size: 8.5pt;
                color: #555;
            }
            .contacto span {
                margin: 0 6px;
            }
            h2 {
                font-size: 10.5pt;
                text-transform: uppercase;
                color: #1e3a8a;
                border-bottom: 1px solid #d1d5db;
                margin: 10px 0 6px 0;
                padding-bottom: 2px;
            }
            .seccion {
                margin-bottom: 8px;
            }
            p {
                margin: 0 0 4px 0;
                text-align: justify;
            }
            
            .lista-normal {
                margin: 0 0 6px 0;
                padding-left: 15px;
            }
            .lista-normal li {
                margin-bottom: 2px;
                text-align: justify;
            }

            /* Bloque horizontal de habilidades ATS */
            .bloque-habilidades {
                text-align: justify;
                line-height: 1.4;
                font-weight: 500;
                color: #222;
            }

            h2, .seccion, header {
                page-break-after: avoid;
            }
            li, p {
                page-break-inside: avoid;
            }
        </style>
    </head>
    <body>
        <header>
            <h1>${datos.nombre}</h1>
            ${datos.puesto ? `<div class="puesto">${datos.puesto}</div>` : ''}
            <div class="contacto">
                ${datos.email ? `<span>${datos.email}</span>` : ''}
                ${datos.telefono ? `| <span>${datos.telefono}</span>` : ''}
                ${datos.ubicacion ? `| <span>${datos.ubicacion}</span>` : ''}
                ${datos.linkedin ? `| <span>${datos.linkedin}</span>` : ''}
            </div>
        </header>

        ${datos.resumen ? `
        <div class="seccion">
            <h2>Resumen Profesional</h2>
            <p>${datos.resumen}</p>
        </div>
        ` : ''}

        ${datos.experiencia ? `
        <div class="seccion">
            <h2>Experiencia Laboral</h2>
            ${formatearTextoNormal(datos.experiencia)}
        </div>
        ` : ''}

        ${datos.educacion ? `
        <div class="seccion">
            <h2>Educación y Cursos</h2>
            ${formatearTextoNormal(datos.educacion)}
        </div>
        ` : ''}

        ${datos.habilidades ? `
        <div class="seccion">
            <h2>Habilidades Técnicas y Competencias</h2>
            ${formatearHabilidades(datos.habilidades)}
        </div>
        ` : ''}

        ${datos.adicional ? `
        <div class="seccion">
            <h2>Información Adicional</h2>
            ${formatearTextoNormal(datos.adicional)}
        </div>
        ` : ''}
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
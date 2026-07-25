// --- generar-cv.js ---

document.addEventListener('DOMContentLoaded', () => {
    const botones = document.querySelectorAll('button');
    let btnGenerar = Array.from(botones).find(btn => btn.textContent.includes('Generar PDF'));

    if(btnGenerar) {
        btnGenerar.addEventListener('click', generarPDFATS);
    } else {
        console.warn("No se encontró el botón de generar PDF. Revisa tu HTML.");
    }
});

function obtenerValor(id) {
    const elemento = document.getElementById(id);
    return elemento ? elemento.value.trim() : '';
}

// Formateador estándar para Experiencia y Educación
function formatearTextoNormal(texto) {
    if (!texto) return '';
    const lineas = texto.split('\n').filter(l => l.trim() !== '');
    
    if (lineas.length === 1) return `<p>${lineas[0]}</p>`;

    let html = '<ul>';
    lineas.forEach(linea => {
        let textoLimpio = linea.replace(/^[-•*·]\s*/, '').trim();
        if (textoLimpio) html += `<li>${textoLimpio}</li>`;
    });
    html += '</ul>';
    return html;
}

// EL GRAN TRUCO ATS PARA AHORRAR ESPACIO: Bloque horizontal de palabras clave
function formatearHabilidades(texto) {
    if (!texto) return '';
    // Separa por líneas, limpia las viñetas y elimina líneas vacías
    const lineas = texto.split('\n')
        .map(l => l.replace(/^[-•*·]\s*/, '').trim())
        .filter(l => l !== '');
    
    // Une todas las habilidades en un solo párrafo separadas por un punto grueso
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
            /* COMPRESIÓN MÁXIMA PARA 1 PÁGINA */
            @page {
                size: A4;
                margin: 8mm; /* Margen mínimo absoluto */
            }
            body {
                font-family: 'Arial', sans-serif; /* Arial es la más segura para ATS */
                font-size: 8.5pt; /* Reducido para máxima compresión, sigue siendo legible */
                line-height: 1.15;
                color: #000;
                margin: 0;
                padding: 0;
            }
            h1 {
                font-size: 14pt;
                text-align: center;
                margin: 0 0 2px 0;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .puesto {
                text-align: center;
                font-size: 10pt;
                font-weight: bold;
                margin: 0 0 4px 0;
                color: #222;
            }
            .contacto {
                text-align: center;
                font-size: 8pt;
                margin-bottom: 6px;
                padding-bottom: 4px;
                border-bottom: 1px solid #000;
            }
            .contacto span {
                margin: 0 4px;
            }
            h2 {
                font-size: 10pt;
                text-transform: uppercase;
                border-bottom: 1px solid #000;
                margin: 6px 0 3px 0; /* Sin espacios en blanco innecesarios */
                padding-bottom: 1px;
                color: #111;
            }
            .seccion {
                margin-bottom: 4px;
            }
            p {
                margin: 0 0 2px 0;
                text-align: justify;
            }
            ul {
                margin: 0 0 2px 0;
                padding-left: 14px;
            }
            li {
                margin-bottom: 1px; /* Viñetas super pegadas */
                text-align: justify;
            }
            
            /* Estilo específico para el bloque de habilidades */
            .bloque-habilidades {
                text-align: justify;
                line-height: 1.4;
                font-weight: 500;
                color: #222;
            }

            /* Evita cortes de página desastrosos si sobra un renglón */
            h2, .seccion {
                page-break-after: avoid;
            }
            li, p {
                page-break-inside: avoid;
            }
        </style>
    </head>
    <body>
        <h1>${datos.nombre}</h1>
        ${datos.puesto ? `<div class="puesto">${datos.puesto}</div>` : ''}

        <div class="contacto">
            ${datos.email ? `<span>${datos.email}</span>` : ''}
            ${datos.telefono ? `| <span>${datos.telefono}</span>` : ''}
            ${datos.ubicacion ? `| <span>${datos.ubicacion}</span>` : ''}
            ${datos.linkedin ? `| <span>${datos.linkedin}</span>` : ''}
        </div>

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
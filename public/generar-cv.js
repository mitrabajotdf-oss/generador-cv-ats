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

// Añadimos un parámetro 'esHabilidad' para saber si debemos aplicar columnas
function formatearTextoMultilinea(texto, esHabilidad = false) {
    if (!texto) return '';
    const lineas = texto.split('\n').filter(l => l.trim() !== '');
    
    if (lineas.length === 1) return `<p>${lineas[0]}</p>`;

    // Si es la sección de habilidades, le aplicamos la clase especial de columnas
    let claseUl = esHabilidad ? 'class="lista-habilidades"' : 'class="lista-normal"';
    let html = `<ul ${claseUl}>`;
    
    lineas.forEach(linea => {
        let textoLimpio = linea.replace(/^[-•*·]\s*/, '').trim();
        if (textoLimpio) html += `<li>${textoLimpio}</li>`;
    });
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
            /* DISEÑO ULTRA COMPACTO - OPTIMIZADO PARA 1 PÁGINA */
            @page {
                size: A4;
                margin: 8mm 10mm; /* Márgenes súper ajustados (Arriba-Abajo / Lados) */
            }
            body {
                font-family: 'Arial', 'Helvetica', sans-serif;
                font-size: 9pt; /* Letra más pequeña pero legible */
                line-height: 1.15; /* Elimina el aire extra entre líneas */
                color: #000;
                margin: 0;
                padding: 0;
            }
            h1 {
                font-size: 16pt;
                text-align: center;
                margin: 0 0 2px 0;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .puesto {
                text-align: center;
                font-size: 10.5pt;
                font-weight: bold;
                margin: 0 0 4px 0;
                color: #222;
            }
            .contacto {
                text-align: center;
                font-size: 8.5pt;
                margin-bottom: 6px;
                padding-bottom: 4px;
                border-bottom: 1px solid #000;
            }
            .contacto span {
                margin: 0 5px;
            }
            h2 {
                font-size: 10.5pt;
                text-transform: uppercase;
                border-bottom: 1px solid #999;
                margin: 8px 0 4px 0; /* Casi pegado al texto para no desperdiciar espacio */
                padding-bottom: 1px;
                color: #111;
            }
            .seccion {
                margin-bottom: 6px;
            }
            p {
                margin: 0 0 3px 0;
                text-align: justify;
            }
            ul {
                margin: 0 0 4px 0;
                padding-left: 14px;
            }
            li {
                margin-bottom: 2px;
                text-align: justify;
            }
            
            /* TRUCO ATS: Divide la lista larga en 2 columnas visuales */
            .lista-habilidades {
                columns: 2; 
                -webkit-columns: 2;
                -moz-columns: 2;
                column-gap: 15px;
            }

            /* Evita cortes feos si excepcionalmente pasa a 2 páginas */
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
            ${formatearTextoMultilinea(datos.experiencia)}
        </div>
        ` : ''}

        ${datos.educacion ? `
        <div class="seccion">
            <h2>Educación y Cursos</h2>
            ${formatearTextoMultilinea(datos.educacion)}
        </div>
        ` : ''}

        ${datos.habilidades ? `
        <div class="seccion">
            <h2>Habilidades Técnicas y Competencias</h2>
            <!-- Mandamos 'true' para activar las 2 columnas -->
            ${formatearTextoMultilinea(datos.habilidades, true)}
        </div>
        ` : ''}

        ${datos.adicional ? `
        <div class="seccion">
            <h2>Información Adicional</h2>
            ${formatearTextoMultilinea(datos.adicional)}
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
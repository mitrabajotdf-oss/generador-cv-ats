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

// Formateador para Experiencia y Educación (Viñetas limpias)
function formatearTextoNormal(texto) {
    if (!texto) return '';
    const lineas = texto.split('\n').filter(l => l.trim() !== '');
    
    if (lineas.length === 1) return `<p>${lineas[0]}</p>`;

    let html = '<ul class="lista-normal">';
    lineas.forEach(linea => {
        let textoLimpio = linea.replace(/^[-•*·]\s*/, '').trim();
        if (textoLimpio) html += `<li>${textoLimpio}</li>`;
    });
    html += '</ul>';
    return html;
}

// Formateador para Habilidades (3 Columnas ATS-Friendly)
function formatearHabilidades(texto) {
    if (!texto) return '';
    const lineas = texto.split('\n').filter(l => l.trim() !== '');
    
    let html = '<ul class="lista-habilidades">';
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
            /* DISEÑO ELEGANTE Y MODERNO - ATS FRIENDLY */
            @page {
                size: A4;
                margin: 12mm 15mm; /* Márgenes equilibrados que dan respiro */
            }
            body {
                font-family: 'Segoe UI', Arial, sans-serif; /* Fuentes modernas */
                font-size: 9.5pt; 
                line-height: 1.35;
                color: #333333; /* Gris muy oscuro, más suave que el negro puro */
                margin: 0;
                padding: 0;
            }
            header {
                text-align: center;
                margin-bottom: 15px;
                border-bottom: 2px solid #1e3a8a; /* Línea de acento azul elegante */
                padding-bottom: 10px;
            }
            h1 {
                font-size: 18pt;
                color: #111827;
                margin: 0 0 5px 0;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .puesto {
                font-size: 12pt;
                font-weight: 600;
                color: #1e3a8a; /* Azul elegante */
                margin: 0 0 8px 0;
            }
            .contacto {
                font-size: 8.5pt;
                color: #555;
            }
            .contacto span {
                margin: 0 6px;
            }
            h2 {
                font-size: 11pt;
                text-transform: uppercase;
                color: #1e3a8a; /* Color para identificar secciones rápido */
                border-bottom: 1px solid #d1d5db;
                margin: 15px 0 8px 0;
                padding-bottom: 4px;
            }
            .seccion {
                margin-bottom: 12px;
            }
            p {
                margin: 0 0 6px 0;
                text-align: justify;
            }
            
            /* Listas normales para Experiencia y Educación */
            .lista-normal {
                margin: 0 0 8px 0;
                padding-left: 18px;
            }
            .lista-normal li {
                margin-bottom: 4px;
                text-align: justify;
            }

            /* 3 Columnas elegantes para Habilidades */
            .lista-habilidades {
                margin: 0;
                padding-left: 15px;
                columns: 3; 
                -webkit-columns: 3;
                -moz-columns: 3;
                column-gap: 20px;
            }
            .lista-habilidades li {
                margin-bottom: 4px;
                page-break-inside: avoid; /* Evita que una habilidad se corte a la mitad */
            }

            /* Prevención de cortes feos entre páginas */
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
// --- generar-cv.js ---

document.addEventListener('DOMContentLoaded', () => {
    // Busca automáticamente el botón que dice "Generar PDF Final ATS"
    const botones = document.querySelectorAll('button');
    let btnGenerar = Array.from(botones).find(btn => btn.textContent.includes('Generar PDF'));

    if(btnGenerar) {
        btnGenerar.addEventListener('click', generarPDFATS);
    } else {
        console.warn("No se encontró el botón de generar PDF. Revisa tu HTML.");
    }
});

// Función auxiliar para obtener los valores del formulario de manera segura
function obtenerValor(id) {
    const elemento = document.getElementById(id);
    return elemento ? elemento.value.trim() : '';
}

// Función clave para ATS: Convierte el texto plano con guiones en listas reales (<ul><li>)
// Los ATS leen mucho mejor las listas HTML estructuradas que los párrafos largos.
function formatearTextoMultilinea(texto) {
    if (!texto) return '';
    const lineas = texto.split('\n').filter(l => l.trim() !== '');
    
    if (lineas.length === 1) return `<p>${lineas[0]}</p>`;

    let html = '<ul>';
    lineas.forEach(linea => {
        // Limpia guiones, viñetas o puntos al inicio de la línea
        let textoLimpio = linea.replace(/^[-•*·]\s*/, '').trim();
        if (textoLimpio) html += `<li>${textoLimpio}</li>`;
    });
    html += '</ul>';
    return html;
}

// Función principal que genera el PDF compacto
function generarPDFATS(evento) {
    if(evento) evento.preventDefault();

    // 1. Recopilar datos (Asegúrate de que tus campos en el HTML tengan estos IDs)
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

    // 2. Construir la plantilla HTML oculta y estricta
    const htmlPlantilla = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>CV_${datos.nombre.replace(/\s+/g, '_')}</title>
        <style>
            /* CONFIGURACIÓN ESTRICTA PARA 1 O 2 PÁGINAS MÁXIMO */
            @page {
                size: A4;
                margin: 12mm 15mm; /* Márgenes reducidos para maximizar espacio */
            }
            body {
                font-family: 'Arial', 'Helvetica', sans-serif; /* Fuentes estándar, favoritas de los ATS */
                font-size: 10pt; /* Tamaño óptimo para comprimir sin perder legibilidad */
                line-height: 1.35; /* Interlineado ajustado */
                color: #000;
                background: #fff;
                margin: 0;
                padding: 0;
            }
            h1 {
                font-size: 18pt;
                text-align: center;
                margin: 0 0 5px 0;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .puesto {
                text-align: center;
                font-size: 12pt;
                font-weight: bold;
                margin: 0 0 10px 0;
                color: #333;
            }
            .contacto {
                text-align: center;
                font-size: 9pt;
                margin-bottom: 12px;
                padding-bottom: 12px;
                border-bottom: 1px solid #000;
            }
            .contacto span {
                margin: 0 8px;
            }
            h2 {
                font-size: 11.5pt;
                text-transform: uppercase;
                border-bottom: 1px solid #ccc;
                margin: 15px 0 8px 0;
                padding-bottom: 2px;
                color: #222;
            }
            .seccion {
                margin-bottom: 12px;
            }
            p {
                margin: 0 0 6px 0;
                text-align: justify;
            }
            ul {
                margin: 0 0 8px 0;
                padding-left: 18px;
            }
            li {
                margin-bottom: 4px;
                text-align: justify;
            }
            /* REGLAS PARA EVITAR QUE SE CORTEN LOS PÁRRAFOS ENTRE PÁGINAS */
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
            ${formatearTextoMultilinea(datos.habilidades)}
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

    // 3. Abrir plantilla en ventana invisible/nueva y llamar a la impresión nativa
    const ventana = window.open('', '_blank');
    ventana.document.write(htmlPlantilla);
    ventana.document.close();

    // Pequeña pausa para asegurar que se carguen los estilos antes de imprimir
    setTimeout(() => {
        ventana.focus();
        ventana.print();
    }, 500);
}
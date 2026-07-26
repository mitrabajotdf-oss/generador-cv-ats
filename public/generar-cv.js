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

// Filtro inteligente para limpiar viñetas raras y evitar repetidos
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

// Formateador para crear listas limpias
function formatearLista(texto) {
    const lineas = procesarLineasUnicas(texto);
    if (lineas.length === 0) return '';
    
    let html = '<ul>';
    lineas.forEach(linea => {
        html += `<li>${linea}</li>`;
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
            /* DISEÑO: ENCABEZADO ANCHO + 2 COLUMNAS ABAJO */
            @page {
                size: A4;
                margin: 10mm; 
            }
            body {
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                font-size: 9pt;
                color: #2b2b2b;
                margin: 0;
                padding: 0;
                line-height: 1.35;
            }
            
            /* Encabezado y Contacto Horizontal */
            header {
                text-align: left;
                margin-bottom: 12px;
            }
            h1 {
                font-size: 22pt;
                color: #2c3e50;
                margin: 0 0 4px 0;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .puesto {
                font-size: 11pt;
                font-weight: bold;
                color: #7f8c8d;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 6px;
            }
            .contacto-horizontal {
                font-size: 9pt;
                color: #555;
                padding-bottom: 12px;
                border-bottom: 2px solid #2c3e50;
            }
            .contacto-horizontal span {
                margin: 0 6px;
            }
            .contacto-horizontal span:first-child {
                margin-left: 0;
            }

            /* Títulos de sección */
            h2 {
                font-size: 11pt;
                color: #2c3e50;
                border-bottom: 1px solid #ecf0f1;
                margin: 0 0 8px 0;
                padding-bottom: 4px;
                text-transform: uppercase;
            }
            
            .seccion {
                margin-bottom: 15px;
            }

            /* Contenedor Flexbox para las dos columnas inferiores */
            .contenedor-columnas {
                display: flex;
                flex-direction: row;
                width: 100%;
                justify-content: space-between;
            }
            
            /* Columna Izquierda (32%) */
            .columna-izq {
                width: 32%;
                padding-right: 15px;
                border-right: 1px solid #bdc3c7;
            }
            
            /* Columna Derecha (64%) */
            .columna-der {
                width: 64%;
            }

            p {
                margin: 0 0 8px 0;
                text-align: justify;
            }
            
            ul {
                margin: 0;
                padding-left: 16px;
            }
            
            li {
                margin-bottom: 4px;
                text-align: left;
            }

            .seccion { page-break-inside: avoid; }
        </style>
    </head>
    <body>
        <!-- ENCABEZADO Y CONTACTO HORIZONTAL -->
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

        <!-- RESUMEN PROFESIONAL A TODO LO ANCHO -->
        ${datos.resumen ? `
        <div class="seccion">
            <h2>Resumen Profesional</h2>
            <p>${datos.resumen}</p>
        </div>
        ` : ''}

        <!-- COLUMNAS (Educación/Habilidades a la izq, Experiencia a la der) -->
        <div class="contenedor-columnas">
            <!-- COLUMNA IZQUIERDA -->
            <div class="columna-izq">
                ${datos.educacion ? `
                <div class="seccion">
                    <h2>Educación</h2>
                    ${formatearLista(datos.educacion)}
                </div>
                ` : ''}

                ${datos.habilidades ? `
                <div class="seccion">
                    <h2>Habilidades</h2>
                    ${formatearLista(datos.habilidades)}
                </div>
                ` : ''}
            </div>

            <!-- COLUMNA DERECHA -->
            <div class="columna-der">
                ${datos.experiencia ? `
                <div class="seccion">
                    <h2>Experiencia Laboral</h2>
                    ${formatearLista(datos.experiencia)}
                </div>
                ` : ''}

                ${datos.adicional ? `
                <div class="seccion">
                    <h2>Adicional</h2>
                    ${formatearLista(datos.adicional)}
                </div>
                ` : ''}
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
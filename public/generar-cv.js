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
        // Limpia cualquier símbolo extraño (incluyendo el ð·) y viñetas
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

// Formateador para párrafos continuos
function formatearParrafo(texto) {
    const lineas = procesarLineasUnicas(texto);
    if (lineas.length === 0) return '';
    return `<p>${lineas.join('<br>')}</p>`;
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
            /* DISEÑO ELEGANTE DE 2 COLUMNAS (A LA PAR) */
            @page {
                size: A4;
                margin: 10mm; /* Márgenes óptimos */
            }
            body {
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                font-size: 9pt;
                color: #2b2b2b;
                margin: 0;
                padding: 0;
                line-height: 1.3;
            }
            /* Encabezado Principal */
            header {
                text-align: left;
                margin-bottom: 15px;
                padding-bottom: 15px;
                border-bottom: 2px solid #2c3e50;
            }
            h1 {
                font-size: 22pt;
                color: #2c3e50; /* Azul oscuro elegante */
                margin: 0 0 5px 0;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .puesto {
                font-size: 11pt;
                font-weight: bold;
                color: #7f8c8d;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            /* Contenedor Flexbox para las dos columnas */
            .contenedor-columnas {
                display: flex;
                flex-direction: row;
                width: 100%;
                justify-content: space-between;
            }
            
            /* Columna Izquierda (32% del ancho) - Datos cortos */
            .columna-izq {
                width: 32%;
                padding-right: 15px;
                border-right: 1px solid #bdc3c7;
            }
            
            /* Columna Derecha (64% del ancho) - Datos largos */
            .columna-der {
                width: 64%;
            }

            h2 {
                font-size: 11pt;
                color: #2c3e50;
                border-bottom: 1px solid #ecf0f1;
                margin: 0 0 10px 0;
                padding-bottom: 4px;
                text-transform: uppercase;
            }
            
            .seccion {
                margin-bottom: 15px;
            }
            
            /* Estilos de Contacto */
            .contacto-item {
                margin-bottom: 6px;
                font-size: 8.5pt;
                word-wrap: break-word;
            }
            .contacto-item strong {
                display: block;
                color: #2c3e50;
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

            /* Prevención de cortes de página */
            .seccion { page-break-inside: avoid; }
        </style>
    </head>
    <body>
        <header>
            <h1>${datos.nombre}</h1>
            ${datos.puesto ? `<div class="puesto">${datos.puesto}</div>` : ''}
        </header>

        <div class="contenedor-columnas">
            <!-- COLUMNA IZQUIERDA -->
            <div class="columna-izq">
                <div class="seccion">
                    <h2>Contacto</h2>
                    ${datos.email ? `<div class="contacto-item"><strong>Email</strong>${datos.email}</div>` : ''}
                    ${datos.telefono ? `<div class="contacto-item"><strong>Teléfono</strong>${datos.telefono}</div>` : ''}
                    ${datos.ubicacion ? `<div class="contacto-item"><strong>Ubicación</strong>${datos.ubicacion}</div>` : ''}
                    ${datos.linkedin ? `<div class="contacto-item"><strong>LinkedIn/Web</strong>${datos.linkedin}</div>` : ''}
                </div>

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
                ${datos.resumen ? `
                <div class="seccion">
                    <h2>Resumen Profesional</h2>
                    <p>${datos.resumen}</p>
                </div>
                ` : ''}

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
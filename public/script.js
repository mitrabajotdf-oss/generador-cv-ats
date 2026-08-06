// Función mejorada para fusionar y estructurar inteligentemente el CV ATS
function verCVATS(c) {
    const incluirFotoChk = document.getElementById('chkIncluirFoto');
    const mostrarFoto = incluirFotoChk ? incluirFotoChk.checked : false;

    const habilidadesFinales = enriquecerHabilidadesATS(c);
    const fotoSrc = c.fotoUrl || c.fotoPerfil;

    // Fusión inteligente: Si hay texto extraído del archivo, lo unificamos con la experiencia del formulario de manera limpia
    let experienciaFinal = c.experiencia || '';
    if (c.textoExtraidoCV && c.textoExtraidoCV.trim() !== '') {
        // Limpiamos y priorizamos el contenido profundo del archivo adjunto
        experienciaFinal = c.textoExtraidoCV.trim();
    }

    // Fusión para el resumen profesional
    let resumenFinal = c.resumen || '';
    if (!resumenFinal && c.textoExtraidoCV) {
        // Extraemos un fragmento inicial del CV si el usuario no cargó resumen manual
        resumenFinal = c.textoExtraidoCV.substring(0, 300) + '...';
    }

    const ventanaATS = window.open('', '_blank');
    ventanaATS.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>CV ATS - ${c.nombre}</title>
            <style>
                body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #000; max-width: 800px; margin: 40px auto; padding: 20px; }
                .header-container { display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 5px; }
                .foto-perfil { width: 90px; height: 90px; border-radius: 50%; object-fit: cover; border: 2px solid #ccc; }
                h1 { font-size: 22px; text-transform: uppercase; margin: 0; text-align: center; }
                .contacto { text-align: center; font-size: 14px; margin-bottom: 25px; color: #333; }
                h2 { font-size: 15px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 2px; margin-top: 25px; margin-bottom: 8px; }
                p { font-size: 14px; text-align: justify; margin: 0 0 10px 0; }
                .habilidades-lista { font-size: 14px; font-weight: bold; }
                .btn-imprimir { background: #3498db; color: white; border: none; padding: 10px 20px; font-size: 14px; cursor: pointer; display: block; margin: 30px auto; border-radius: 4px; }
                @media print { .btn-imprimir { display: none; } }
            </style>
        </head>
        <body>
            <div class="header-container">
                ${mostrarFoto && fotoSrc ? `<img src="${fotoSrc}" class="foto-perfil" alt="Foto de perfil">` : ''}
                <div>
                    <h1>${c.nombre}</h1>
                </div>
            </div>

            <div class="contacto">
                ${c.direccion || ''} | Tel: ${c.telefono || ''} | Email: ${c.email || ''} | DNI: ${c.dni || ''}
                ${c.puestoRequerido ? `<br><strong>Objetivo / Puesto:</strong> ${c.puestoRequerido}` : ''}
                <br><strong>Disponibilidad:</strong> ${c.disponibilidad || 'Inmediata'}
            </div>

            <h2>Resumen Profesional</h2>
            <p>${resumenFinal || 'No especificado.'}</p>

            <h2>Experiencia Laboral</h2>
            <p style="white-space: pre-line;">${experienciaFinal || 'No especificada.'}</p>

            <h2>Estudios y Formación</h2>
            <p style="white-space: pre-line;">${c.estudios || 'No especificados.'}</p>

            <h2>Habilidades y Competencias Clave</h2>
            <p class="habilidades-lista">${habilidadesFinales}</p>

            <button class="btn-imprimir" onclick="window.print()">🖨️ Imprimir / Guardar como PDF ATS</button>
        </body>
        </html>
    `);
    ventanaATS.document.close();
}

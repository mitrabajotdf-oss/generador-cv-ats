// Lógica para el formulario (si existe en la página)
let globalCandidatoId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Detección automática de retorno de pago desde Mercado Pago
    const urlParams = new URLSearchParams(window.location.search);
    const candidatoIdParam = urlParams.get('id');

    if (candidatoIdParam) {
        const formEl = document.getElementById('formPostulacion');
        if (formEl) formEl.style.display = 'none';
        
        const resultadoSeccion = document.getElementById('resultadoSeccion');
        if (resultadoSeccion) {
            resultadoSeccion.style.display = 'block';
            resultadoSeccion.innerHTML = `
                <h2 style="color: #2980b9; margin-top:0;">⏳ Verificando el estado de tu pago...</h2>
                <p style="font-size: 16px; color: #2c3e50;">Estamos consultando con Mercado Pago la acreditación. En unos segundos se descargará tu CV ATS automáticamente.</p>
            `;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Bucle inteligente para verificar periódicamente si el pago ya impactó
        let intentos = 0;
        const verificarPagoInterval = setInterval(async () => {
            intentos++;
            try {
                const res = await fetch(`/api/estado-pago/${candidatoIdParam}`);
                const data = await res.json();

                if (data.success && data.pagado) {
                    clearInterval(verificarPagoInterval);
                    if (resultadoSeccion) {
                        resultadoSeccion.innerHTML = `
                            <h2 style="color: #27ae60; margin-top:0;">🎉 ¡Pago Acreditado con Éxito!</h2>
                            <p style="font-size: 16px; color: #2c3e50;">Tu pago fue procesado correctamente. Tu CV optimizado en formato ATS ya está listo.</p>
                            <div style="margin: 30px 0;">
                                <a href="/api/descargar-cv/${candidatoIdParam}" class="btn-submit" style="display:inline-block; background:#27ae60; color:white; padding:15px 30px; text-decoration:none; border-radius:8px; font-weight:bold; font-size: 18px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">📥 Descargar mi CV ATS en PDF</a>
                            </div>
                        `;
                    }
                    // Disparar la descarga automática de forma limpia
                    window.location.href = `/api/descargar-cv/${candidatoIdParam}`;
                } else if (intentos > 20) { // ~40 segundos de espera máxima por si el webhook demora
                    clearInterval(verificarPagoInterval);
                    if (resultadoSeccion) {
                        resultadoSeccion.innerHTML = `
                            <h2 style="color: #e67e22; margin-top:0;">📌 Pago en proceso de acreditación</h2>
                            <p style="font-size: 16px; color: #2c3e50;">Si ya abonaste, el sistema puede demorar unos segundos más en impactar. Hacé clic en el botón para descargar tu CV:</p>
                            <div style="margin: 30px 0;">
                                <a href="/api/descargar-cv/${candidatoIdParam}" class="btn-submit" style="display:inline-block; background:#2980b9; color:white; padding:15px 30px; text-decoration:none; border-radius:8px; font-weight:bold; font-size: 18px;">🔄 Descargar mi CV ATS</a>
                            </div>
                        `;
                    }
                }
            } catch (err) {
                console.error('Error verificando pago:', err);
            }
        }, 2000);

        return;
    }
});

const formPostulacion = document.getElementById('formPostulacion');
if (formPostulacion) {
    formPostulacion.addEventListener('submit', async function(e) {
        e.preventDefault();

        const btn = document.getElementById('btnEnviar');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Enviando postulación...';
        }

        const formData = new FormData(this);
        const cvFile = document.getElementById('cvFile').files[0];
        if (cvFile) formData.append('cvFile', cvFile);

        const fotoPerfil = document.getElementById('fotoPerfil').files[0];
        if (fotoPerfil) formData.append('fotoPerfil', fotoPerfil);

        try {
            const res = await fetch('/api/enviar-postulacion', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (data.success) {
                globalCandidatoId = data.candidatoId;
                document.getElementById('formPostulacion').style.display = 'none';
                document.getElementById('resultadoSeccion').style.display = 'block';
                window.scrollTo({ top: 0, behavior: 'smooth' });

                // Generamos el código QR en pantalla
                generarQrYLinkPago(globalCandidatoId);
            } else {
                alert('Hubo un error al enviar: ' + (data.error || 'Desconocido'));
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Enviar Postulación Final';
                }
            }
        } catch (e) {
            console.error(e);
            alert('Error de conexión con el servidor.');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Enviar Postulación Final';
            }
        }
    });
}

// 📱 Función para generar el código QR funcional en pantalla y el link de respaldo
async function generarQrYLinkPago(candidatoId) {
    try {
        const res = await fetch(`/api/crear-preferencia/${candidatoId}`, {
            method: 'POST'
        });
        const data = await res.json();

        if (data.success) {
            const linkPago = data.init_point || data.sandbox_init_point;

            const contenedorQR = document.getElementById('codigoQR');
            if (contenedorQR) {
                contenedorQR.innerHTML = '';
                new QRCode(contenedorQR, {
                    text: linkPago,
                    width: 180,
                    height: 180,
                    colorDark : "#000000",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.H
                });
            }

            const botonMP = document.getElementById('linkBotonMP');
            if (botonMP) {
                botonMP.href = linkPago;
                botonMP.style.display = 'inline-block';
            }
        } else {
            console.error('No se pudo generar la preferencia de pago:', data.error);
        }
    } catch (err) {
        console.error('Error de red al generar el pago:', err);
    }
}

// Lógica para el panel de administración (index.html)
const listaCandidatosDiv = document.getElementById('listaCandidatos');
if (listaCandidatosDiv) {
    async function cargarCandidatos() {
        try {
            const res = await fetch('/api/candidatos');
            const data = await res.json();
            
            if (data.success && data.candidatos.length > 0) {
                let html = '<table border="1" style="width:100%; border-collapse: collapse; margin-top: 10px; background:white;">';
                html += '<tr style="background:#f2f2f2;"><th>Puesto Requerido</th><th>Nombre</th><th>Email / Teléfono</th><th>Fecha</th><th>Acciones ATS</th></tr>';
                
                data.candidatos.forEach(c => {
                    html += `<tr>
                        <td style="padding:10px; font-weight:bold; color:#2980b9;">${c.puestoRequerido || 'General'}</td>
                        <td style="padding:10px;">${c.nombre}<br><small style="color:#7f8c8d;">DNI: ${c.dni}</small></td>
                        <td style="padding:10px;">${c.email}<br><small>${c.telefono}</small></td>
                        <td style="padding:10px;">${c.fecha}</td>
                        <td style="padding:10px; text-align:center;">
                            <button onclick='verCVATS(${JSON.stringify(c)})' style="background:#27ae60; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; margin-bottom:5px;">📄 Ver CV ATS</button><br>
                            <button onclick="eliminarCandidato(${c.id})" style="background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Eliminar</button>
                        </td>
                    </tr>`;
                });
                html += '</table>';
                listaCandidatosDiv.innerHTML = html;
            } else {
                listaCandidatosDiv.innerHTML = '<p>No hay postulantes registrados todavía.</p>';
            }
        } catch (e) {
            listaCandidatosDiv.innerHTML = '<p>Error al cargar la lista de candidatos.</p>';
        }
    }

    cargarCandidatos();
}

// Función para abrir una ventana limpia con el CV formateado estrictamente en formato ATS
function verCVATS(c) {
    const ventanaATS = window.open('', '_blank');
    ventanaATS.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>CV ATS - ${c.nombre}</title>
            <style>
                body { font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #000; max-width: 800px; margin: 40px auto; padding: 20px; }
                h1 { font-size: 22px; text-transform: uppercase; margin-bottom: 5px; text-align: center; }
                .contacto { text-align: center; font-size: 14px; margin-bottom: 25px; color: #333; }
                h2 { font-size: 15px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 2px; margin-top: 25px; margin-bottom: 8px; }
                p { font-size: 14px; text-align: justify; margin: 0 0 10px 0; }
                .habilidades-lista { font-size: 14px; font-weight: bold; }
                .btn-imprimir { background: #3498db; color: white; border: none; padding: 10px 20px; font-size: 14px; cursor: pointer; display: block; margin: 30px auto; border-radius: 4px; }
                @media print { .btn-imprimir { display: none; } }
            </style>
        </head>
        <body>
            <h1>${c.nombre}</h1>
            <div class="contacto">
                ${c.direccion} | Tel: ${c.telefono} | Email: ${c.email} | DNI: ${c.dni}
                ${c.puestoRequerido ? `<br><strong>Objetivo / Puesto:</strong> ${c.puestoRequerido}` : ''}
                <br><strong>Disponibilidad:</strong> ${c.disponibilidad}
            </div>

            <h2>Resumen Profesional</h2>
            <p>${c.resumen || 'No especificado.'}</p>

            <h2>Experiencia Laboral</h2>
            <p>${c.experiencia || 'No especificada.'}</p>

            <h2>Estudios y Formación</h2>
            <p>${c.estudios || 'No especificados.'}</p>

            <h2>Habilidades y Competencias</h2>
            <p class="habilidades-lista">${c.habilidades || 'No especificadas.'}</p>

            <button class="btn-imprimir" onclick="window.print()">🖨️ Imprimir / Guardar como PDF ATS</button>
        </body>
        </html>
    `);
    ventanaATS.document.close();
}

async function eliminarCandidato(id) {
    if (!confirm('¿Estás seguro de eliminar este candidato?')) return;
    try {
        const res = await fetch(`/api/candidatos/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            location.reload();
        } else {
            alert('No se pudo eliminar.');
        }
    } catch (e) {
        alert('Error de conexión.');
    }
}

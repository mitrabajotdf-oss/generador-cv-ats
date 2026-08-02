// Lógica para el envío del formulario de postulación
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
                document.getElementById('formPostulacion').style.display = 'none';
                document.getElementById('resultadoSeccion').style.display = 'block';
                window.scrollTo({ top: 0, behavior: 'smooth' });
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

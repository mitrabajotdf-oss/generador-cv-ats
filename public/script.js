// Lógica para el formulario (si existe en la página)
const formPostulacion = document.getElementById('formPostulacion');
if (formPostulacion) {
    formPostulacion.addEventListener('submit', async function(e) {
        e.preventDefault();

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
            }
        } catch (e) {
            console.error(e);
            alert('Error de conexión con el servidor.');
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
                let html = '<table border="1" style="width:100%; border-collapse: collapse; margin-top: 10px;">';
                html += '<tr style="background:#f2f2f2;"><th>Puesto Requerido</th><th>Nombre</th><th>Email</th><th>DNI</th><th>Fecha</th><th>Acciones</th></tr>';
                
                data.candidatos.forEach(c => {
                    html += `<tr>
                        <td style="padding:10px; font-weight:bold; color:#2980b9;">${c.puestoRequerido || 'General'}</td>
                        <td style="padding:10px;">${c.nombre}</td>
                        <td style="padding:10px;">${c.email}</td>
                        <td style="padding:10px;">${c.dni}</td>
                        <td style="padding:10px;">${c.fecha}</td>
                        <td style="padding:10px; text-align:center;">
                            ${c.cvUrl && c.cvUrl.startsWith('/uploads/') ? `<a href="${c.cvUrl}" target="_blank" style="margin-right:10px;">📂 Ver CV</a>` : ''}
                            <button onclick="eliminarCandidato(${c.id})" style="background:#e74c3c; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Eliminar</button>
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

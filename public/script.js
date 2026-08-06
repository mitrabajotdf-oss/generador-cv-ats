// Función auxiliar original para subir archivos directamente desde el panel
async function subirArchivosDesdePanel(idCandidato) {
    const inputCv = document.getElementById(`panelCv_${idCandidato}`);
    const inputFoto = document.getElementById(`panelFoto_${idCandidato}`);
    
    const formData = new FormData();
    if (inputCv && inputCv.files[0]) formData.append('cvFile', inputCv.files[0]);
    if (inputFoto && inputFoto.files[0]) formData.append('fotoPerfil', inputFoto.files[0]);

    if (!inputCv.files[0] && !inputFoto.files[0]) {
        alert('Por favor selecciona al menos un archivo para subir.');
        return;
    }

    try {
        const res = await fetch(`/api/candidatos/actualizar-archivos/${idCandidato}`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            alert('¡Archivos actualizados correctamente en el legajo!');
            cargarCandidatos();
        } else {
            alert('Error al actualizar: ' + (data.error || 'Desconocido'));
        }
    } catch (e) {
        alert('Error de conexión con el servidor.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadForm') || document.querySelector('form');
    
    if (uploadForm) {
        uploadForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(this);

            try {
                const response = await fetch('/api/upload-cv', {
                    method: 'POST',
                    body: formData
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Asignación de datos personales si los inputs existen en el DOM
                    if (document.getElementById('nombreInput')) document.getElementById('nombreInput').value = data.nombre || '';
                    if (document.getElementById('emailInput')) document.getElementById('emailInput').value = data.email || '';
                    if (document.getElementById('telefonoInput')) document.getElementById('telefonoInput').value = data.telefono || '';
                    if (document.getElementById('domicilioInput')) document.getElementById('domicilioInput').value = data.domicilio || '';
                    if (document.getElementById('disponibilidadInput')) document.getElementById('disponibilidadInput').value = data.disponibilidad || 'Inmediata';
                    
                    // Inyección completa e íntegra del texto en las áreas correspondientes del formulario
                    const textoCV = data.rawText || '';

                    if (document.getElementById('resumenInput')) document.getElementById('resumenInput').value = textoCV;
                    if (document.getElementById('experienciaInput')) document.getElementById('experienciaInput').value = textoCV;
                    if (document.getElementById('estudiosInput')) document.getElementById('estudiosInput').value = textoCV;
                    if (document.getElementById('habilidadesInput')) document.getElementById('habilidadesInput').value = textoCV;

                    alert('¡CV analizado y extraído correctamente!');
                } else {
                    alert('Error: ' + (data.error || 'No se pudo procesar el documento.'));
                }
            } catch (err) {
                console.error(err);
                alert('Error interno al conectar con el servidor.');
            }
        });
    }
});

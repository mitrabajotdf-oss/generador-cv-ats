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
                    // Rellenar datos personales si existen en los inputs
                    if (document.getElementById('nombreInput')) document.getElementById('nombreInput').value = data.nombre || '';
                    if (document.getElementById('emailInput')) document.getElementById('emailInput').value = data.email || '';
                    if (document.getElementById('telefonoInput')) document.getElementById('telefonoInput').value = data.telefono || '';
                    if (document.getElementById('domicilioInput')) document.getElementById('domicilioInput').value = data.domicilio || '';
                    if (document.getElementById('disponibilidadInput')) document.getElementById('disponibilidadInput').value = data.disponibilidad || 'Inmediata';
                    
                    // Inyectar el texto completo extraído del PDF de Erika en las secciones grandes
                    if (document.getElementById('resumenInput')) document.getElementById('resumenInput').value = data.rawText ? data.rawText.substring(0, 500) : '';
                    if (document.getElementById('experienciaInput')) document.getElementById('experienciaInput').value = data.rawText || '';
                    if (document.getElementById('estudiosInput')) document.getElementById('estudiosInput').value = data.rawText || '';
                    if (document.getElementById('habilidadesInput')) document.getElementById('habilidadesInput').value = data.habilidades || 'JavaScript, Node.js, Gestión de Proyectos, Resolución de Problemas';

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

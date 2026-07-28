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
                    // Datos personales y de contacto
                    if (document.getElementById('nombreInput')) document.getElementById('nombreInput').value = data.nombre || '';
                    if (document.getElementById('emailInput')) document.getElementById('emailInput').value = data.email || '';
                    if (document.getElementById('telefonoInput')) document.getElementById('telefonoInput').value = data.telefono || '';
                    if (document.getElementById('domicilioInput')) document.getElementById('domicilioInput').value = data.domicilio || '';
                    if (document.getElementById('disponibilidadInput')) document.getElementById('disponibilidadInput').value = data.disponibilidad || 'Inmediata';
                    
                    // Asignación completa del texto sin recortes para que experiencia, estudios y resumen queden íntegros
                    const textoCompleto = data.rawText || data.text || '';
                    
                    if (document.getElementById('resumenInput')) {
                        document.getElementById('resumenInput').value = textoCompleto.length > 800 ? textoCompleto.substring(0, 800) : textoCompleto;
                    }
                    if (document.getElementById('experienciaInput')) {
                        document.getElementById('experienciaInput').value = textoCompleto;
                    }
                    if (document.getElementById('estudiosInput')) {
                        document.getElementById('estudiosInput').value = textoCompleto;
                    }
                    if (document.getElementById('habilidadesInput')) {
                        document.getElementById('habilidadesInput').value = textoCompleto;
                    }

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

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
                    const setValue = (id, valor) => {
                        const el = document.getElementById(id);
                        if (el) el.value = valor || '';
                    };

                    // Datos personales
                    setValue('nombreInput', data.nombre);
                    setValue('emailInput', data.email);
                    setValue('telefonoInput', data.telefono);
                    setValue('domicilioInput', data.domicilio);
                    setValue('disponibilidadInput', data.disponibilidad || 'Inmediata');
                    
                    // Texto completo extraído sin recortes ni límites de caracteres
                    const textoCV = data.rawText || '';

                    setValue('resumenInput', textoCV);
                    setValue('experienciaInput', textoCV);
                    setValue('estudiosInput', textoCV);
                    setValue('habilidadesInput', textoCV);

                    alert('¡CV analizado y extraído correctamente!');
                } else {
                    alert('Error: ' + (data.error || 'No se pudo procesar el documento.'));
                }
            } catch (err) {
                console.error('Error:', err);
                alert('Error interno al conectar con el servidor.');
            }
        });
    }
});

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
                    const asignarValor = (id, valor) => {
                        const elemento = document.getElementById(id);
                        if (elemento) {
                            elemento.value = valor || '';
                        }
                    };

                    // Rellenar datos personales e inputs específicos
                    asignarValor('nombreInput', data.nombre);
                    asignarValor('emailInput', data.email);
                    asignarValor('telefonoInput', data.telefono);
                    asignarValor('domicilioInput', data.domicilio);
                    asignarValor('disponibilidadInput', data.disponibilidad || 'Inmediata');
                    
                    const textoCompleto = data.rawText || '';

                    // Inyectar contenido en textareas o inputs de secciones
                    asignarValor('resumenInput', textoCompleto);
                    asignarValor('experienciaInput', textoCompleto);
                    asignarValor('estudiosInput', textoCompleto);
                    asignarValor('habilidadesInput', textoCompleto);

                    alert('¡CV analizado y extraído correctamente!');
                } else {
                    alert('Error: ' + (data.error || 'No se pudo procesar el documento.'));
                }
            } catch (err) {
                console.error('Error en la petición:', err);
                alert('Error interno al conectar con el servidor.');
            }
        });
    }
});

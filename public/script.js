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

                    setValue('nombreInput', data.nombre);
                    setValue('emailInput', data.email);
                    setValue('telefonoInput', data.telefono);
                    setValue('domicilioInput', data.domicilio);
                    setValue('disponibilidadInput', data.disponibilidad || 'Inmediata');
                    
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

    // Limpieza profunda: eliminamos cualquier intento anterior de alterar o romper los enlaces de Cloudinary
    const limpiarEnlacesCloudinary = () => {
        const pdfLinks = document.querySelectorAll('a[href*="cloudinary.com"]');
        pdfLinks.forEach(link => {
            // Si la URL contiene el parámetro problemático fl_attachment, se lo quitamos limpiamente
            if (link.href.includes('fl_attachment')) {
                link.href = link.href.replace('/upload/fl_attachment/', '/upload/');
            }
            link.setAttribute('target', '_blank');
            link.removeAttribute('download'); // Dejamos que el navegador maneje la visualización o descarga del PDF nativamente
        });
    };

    limpiarEnlacesCloudinary();
    const observer = new MutationObserver(limpiarEnlacesCloudinary);
    observer.observe(document.body, { childList: true, subtree: true });
});

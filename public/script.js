// Lógica para el panel de administración (index.html) con protección de bloqueo
let todosLosCandidatos = [];
const listaCandidatosDiv = document.getElementById('listaCandidatos');

if (listaCandidatosDiv) {
    async function cargarCandidatos() {
        try {
            listaCandidatosDiv.innerHTML = '<p>Cargando postulantes...</p>';
            const res = await fetch('/api/candidatos');
            
            // Verificamos si la respuesta del servidor es correcta
            if (!res.ok) {
                throw new Error(`Error HTTP: ${res.status}`);
            }

            const data = await res.json();
            
            if (data.success && data.candidatos && data.candidatos.length > 0) {
                todosLosCandidatos = data.candidatos.map(c => ({ ...c, porcentaje: 0 }));
                renderizarTabla(todosLosCandidatos);
            } else {
                listaCandidatosDiv.innerHTML = '<p>No hay postulantes registrados todavía.</p>';
            }
        } catch (e) {
            console.error('Error al cargar candidatos:', e);
            listaCandidatosDiv.innerHTML = '<p style="color: red;">⚠️ Error al conectar con el servidor o cargar los datos. Intenta recargar la página.</p>';
        }
    }

    cargarCandidatos();

    // Conectar el input buscador de index.html en tiempo real
    const inputBuscador = document.getElementById('buscador');
    if (inputBuscador) {
        inputBuscador.addEventListener('input', (e) => {
            filtrarCandidatos(e.target.value);
        });
    }
}

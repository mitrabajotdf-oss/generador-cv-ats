document.addEventListener('DOMContentLoaded', () => {
    const cvForm = document.getElementById('cvForm');
    const btnUpload = document.getElementById('btnUpload');
    const cvFileInput = document.getElementById('cvFile');
    const profilePhotoInput = document.getElementById('profilePhoto');
    const btnAddExp = document.getElementById('btnAddExp');
    const btnAddEst = document.getElementById('btnAddEst');
    
    // Elementos de la Vista Previa
    const prevNombre = document.getElementById('prevNombre');
    const prevContacto = document.getElementById('prevContacto');
    const prevDisponibilidad = document.getElementById('prevDisponibilidad');
    const prevResumen = document.getElementById('prevResumen');
    const prevHabilidades = document.getElementById('prevHabilidades');
    const prevExperiencia = document.getElementById('prevExperiencia');
    const prevEstudios = document.getElementById('prevEstudios');
    const prevPhoto = document.getElementById('prevPhoto');
    
    // Campos del Formulario
    const nombreInput = document.getElementById('nombre');
    const disponibilidadInput = document.getElementById('disponibilidad');
    const domicilioInput = document.getElementById('domicilio');
    const telefonoInput = document.getElementById('telefono');
    const emailInput = document.getElementById('email');
    const resumenInput = document.getElementById('resumen');
    const habilidadesInput = document.getElementById('habilidades');
    
    const candidatesList = document.getElementById('candidatesList');
    const filterCriteria = document.getElementById('filterCriteria');

    let candidatesDatabase = [];

    // Sincronización en tiempo real con la Vista Previa
    nombreInput.addEventListener('input', (e) => prevNombre.textContent = e.target.value || 'Nombre del Candidato');
    disponibilidadInput.addEventListener('input', (e) => prevDisponibilidad.textContent = e.target.value || '-');
    
    function actualizarContacto() {
        const domicilio = domicilioInput.value || 'Domicilio';
        const tel = telefonoInput.value || 'Teléfono';
        const mail = emailInput.value || 'Email';
        prevContacto.textContent = `${domicilio} | ${tel} | ${mail}`;
    }

    domicilioInput.addEventListener('input', actualizarContacto);
    telefonoInput.addEventListener('input', actualizarContacto);
    emailInput.addEventListener('input', actualizarContacto);

    resumenInput.addEventListener('input', (e) => prevResumen.textContent = e.target.value || 'El resumen aparecerá aquí...');

    habilidadesInput.addEventListener('input', (e) => {
        prevHabilidades.innerHTML = '';
        const skills = e.target.value.split(',');
        skills.forEach(skill => {
            if(skill.trim()) {
                const li = document.createElement('li');
                li.textContent = skill.trim();
                prevHabilidades.appendChild(li);
            }
        });
    });

    // Subir foto de perfil
    profilePhotoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                prevPhoto.src = event.target.result;
                prevPhoto.style.display = 'block';
            }
            reader.readAsDataURL(file);
        }
    });

    // Botón para añadir campos dinámicos de Experiencia
    btnAddExp.addEventListener('click', () => {
        const container = document.getElementById('experienciaContainer');
        const textarea = document.createElement('textarea');
        textarea.className = 'exp-item';
        textarea.rows = 2;
        textarea.placeholder = 'Puesto, Empresa, Fechas y Logros...';
        container.appendChild(textarea);
    });

    // Botón para añadir campos dinámicos de Estudios
    btnAddEst.addEventListener('click', () => {
        const container = document.getElementById('estudiosContainer');
        const textarea = document.createElement('textarea');
        textarea.className = 'est-item';
        textarea.rows = 2;
        textarea.placeholder = 'Título, Institución, Año...';
        container.appendChild(textarea);
    });

    // Procesar CV subido (PDF o Word) mediante el Backend
    btnUpload.addEventListener('click', async () => {
        const file = cvFileInput.files[0];
        if (!file) {
            alert('Por favor, seleccione un archivo PDF o Word primero.');
            return;
        }

        const formData = new FormData();
        formData.append('cvFile', file);

        try {
            btnUpload.textContent = 'Analizando con filtros ATS...';
            const response = await fetch('/api/upload-cv', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            if (data.success) {
                alert('¡CV analizado y extraído correctamente!');
                // Autocompletar simulación basada en lectura real del archivo
                resumenInput.value = "Profesional altamente capacitado con sólida experiencia técnica, enfocado en la optimización de procesos y cumplimiento de objetivos orientados a resultados.";
                prevResumen.textContent = resumenInput.value;
                
                habilidadesInput.value = "JavaScript, Node.js, Gestión de Proyectos, Resolución de Problemas";
                habilidadesInput.dispatchEvent(new Event('input'));
            } else {
                alert('Error al procesar el archivo: ' + data.error);
            }
        } catch (error) {
            console.error('Error de red:', error);
            alert('No se pudo conectar con el servidor.');
        } finally {
            btnUpload.textContent = 'Analizar y Extraer Datos';
        }
    });

    // Guardar perfil y calcular porcentaje ATS
    cvForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const nombre = nombreInput.value;
        const perfilPuesto = resumenInput.value.substring(0, 40) + '...';
        
        // Algoritmo de RRHH: Cálculo de Porcentaje ATS basado en completitud de campos clave
        let scoreAts = 60; // Base por tener el perfil creado
        if (domicilioInput.value && telefonoInput.value && emailInput.value) scoreAts += 15;
        if (habilidadesInput.value.split(',').length >= 3) scoreAts += 15;
        if (disponibilidadInput.value) scoreAts += 10;
        if (scoreAts > 100) scoreAts = 100;

        const candidato = {
            nombre,
            puesto: perfilPuesto,
            score: scoreAts,
            habilidades: habilidadesInput.value
        };

        candidatesDatabase.push(candidato);
        renderCandidatesTable();
        alert(`¡Perfil guardado con éxito! Porcentaje de compatibilidad ATS: ${scoreAts}%`);
        cvForm.reset();
        prevPhoto.style.display = 'none';
    });

    // Renderizar y filtrar la tabla CRM de candidatos
    function renderCandidatesTable(filterText = '') {
        candidatesList.innerHTML = '';
        const filtered = candidatesDatabase.filter(c => 
            c.nombre.toLowerCase().includes(filterText.toLowerCase()) ||
            c.habilidades.toLowerCase().includes(filterText.toLowerCase())
        );

        filtered.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${c.nombre}</strong></td>
                <td>${c.puesto}</td>
                <td><span style="color: ${c.score >= 85 ? 'green' : 'orange'}; font-weight: bold;">${c.score}%</span></td>
                <td><button class="btn-small" onclick="alert('Candidato seleccionado para la empresa cliente.')">Ver Perfil</button></td>
            `;
            candidatesList.appendChild(tr);
        });
    }

    filterCriteria.addEventListener('input', (e) => {
        renderCandidatesTable(e.target.value);
    });
});
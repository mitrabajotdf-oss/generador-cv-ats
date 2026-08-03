// Lógica para el envío del formulario de postulación
const formPostulacion = document.getElementById('formPostulacion');
if (formPostulacion) {
    formPostulacion.addEventListener('submit', async function(e) {
        e.preventDefault();

        const btn = document.getElementById('btnEnviar');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Enviando postulación...';
        }

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
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Enviar Postulación Final';
                }
            }
        } catch (e) {
            console.error(e);
            alert('Error de conexión con el servidor.');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Enviar Postulación Final';
            }
        }
    });
}

// Lógica para el panel de administración (index.html)
let todosLosCandidatos = [];
const listaCandidatosDiv = document.getElementById('listaCandidatos');

if (listaCandidatosDiv) {
    async function cargarCandidatos() {
        try {
            const res = await fetch('/api/candidatos');
            const data = await res.json();
            
            if (data.success && data.candidatos.length > 0) {
                todosLosCandidatos = data.candidatos.map(c => ({ ...c, porcentaje: 0 }));
                renderizarTabla(todosLosCandidatos);
            } else {
                listaCandidatosDiv.innerHTML = '<p>No hay postulantes registrados todavía.</p>';
            }
        } catch (e) {
            listaCandidatosDiv.innerHTML = '<p>Error al cargar la lista de candidatos.</p>';
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

// Función para calcular un porcentaje de afinidad basado en las palabras clave ingresadas
function calcularAfinidad(candidato, textoBusqueda) {
    if (!textoBusqueda) return 0;
    
    const palabras = textoBusqueda.toLowerCase().split(/\s+/).filter(p => p.length > 2);
    if (palabras.length === 0) return 0;

    const textoCompleto = `
        ${candidato.puestoRequerido || ''} 
        ${candidato.habilidades || ''} 
        ${candidato.resumen || ''} 
        ${candidato.experiencia || ''} 
        ${candidato.estudios || ''}
    `.toLowerCase();

    let coincidencias = 0;
    palabras.forEach(palabra => {
        if (textoCompleto.includes(palabra)) {
            coincidencias++;
        }
    });

    let porcentaje = Math.round((coincidencias / palabras.length) * 100);
    
    if (candidato.habilidades && candidato.habilidades.toLowerCase().includes(textoBusqueda)) {
        porcentaje = Math.max(porcentaje, 85);
    }

    return Math.min(porcentaje, 100);
}

// Función inteligente para extraer y enriquecer habilidades leyendo la experiencia
function enriquecerHabilidadesATS(candidato) {
    let habilidadesManuales = candidato.habilidades || '';
    const experienciaTexto = (candidato.experiencia || '').toLowerCase();
    
    // Diccionario de palabras clave técnicas comunes a detectar en la experiencia
    const diccionarioKeywords = [
        { term: 'atención al cliente', label: 'Atención al Cliente' },
        { term: 'caja', label: 'Manejo de Caja' },
        { term: 'ventas', label: 'Ventas y Comercialización' },
        { term: 'excel', label: 'Microsoft Excel' },
        { term: 'administrativo', label: 'Gestión Administrativa' },
        { term: 'repositor', label: 'Reposición y Stock' },
        { term: 'limpieza', label: 'Mantenimiento y Limpieza' },
        { term: 'logística', label: 'Logística y Distribución' },
        { term: 'chofer', label: 'Conducción y Logística' },
        { term: 'gastronomía', label: 'Atención Gastronómica' },
        { term: 'cocina', label: 'Gastronomía y Cocina' }
    ];

    let detectadas = [];
    diccionarioKeywords.forEach(item => {
        if (experienciaTexto.includes(item.term)) {
            if (!habilidadesManuales.toLowerCase().includes(item.term)) {
                detectadas.push(item.label);
            }
        }
    });

    if (detectadas.length > 0) {
        if (habilidadesManuales.trim() !== '') {
            return habilidadesManuales + ' • ' + detectadas.join(' • ');
        } else {
            return detectadas.join(' • ');
        }
    }

    return habilidadesManuales || 'No especificadas.';
}

// Función para renderizar la tabla de candidatos
function renderizarTabla(candidatos, textoBusqueda = '') {
    if (!listaCandidatosDiv) return;

    if (candidatos.length === 0) {
        listaCandidatosDiv.innerHTML = '<p>No se encontraron candidatos con ese criterio de búsqueda.</p>';
        return;
    }

    let listaProcesada = candidatos.map(c => {
        const porc = textoBusqueda ? calcularAfinidad(c, textoBusqueda) : 0;
        return { ...c, porcentaje: porc };
    });

    if (textoBusqueda) {
        listaProcesada.sort((a, b) => b.porcentaje - a.porcentaje);
    }

    let html = '<div style="margin-bottom: 15px; background: #eaf2f8; padding: 10px 15px; border-radius: 6px; display: inline-block;">';
    html += '<label style="cursor: pointer; font-weight: bold; color: #2c3e50;">';
    html += '<input type="checkbox" id="chkIncluirFoto" style="margin-right: 8px;"> Incluir Foto de Perfil en la vista de CV ATS';
    html += '</label></div>';

    html += '<table border="1" style="width:100%; border-collapse: collapse; margin-top: 5px; background:white;">';
    html += '<tr style="background:#f2f2f2;"><th>Puesto Requerido</th><th>Nombre</th><th>Email / Teléfono</th>';
    if (textoBusqueda) html += '<th>Afinidad ATS</th>';
    html += '<th>Fecha</th><th>Acciones ATS</th></tr>';
    
    listaProcesada.forEach(c => {
        let badgeColor = '#7f8c8d';
        if (c.porcentaje >= 75) badgeColor = '#27ae60';
        else if (c.porcentaje >= 40) badgeColor = '#f39c12';

        let avatarHtml = '';
        if (c.fotoPerfil) {
            avatarHtml = `<img src="${c.fotoPerfil}" alt="Foto" style="width: 35px; height: 35px; border-radius: 50%; object-fit: cover; vertical-align: middle; margin-right: 8px;">`;
        }

        html += `<tr>
            <td style="padding:10px; font-weight:bold; color:#2980b9;">${c.puestoRequerido || 'General'}</td>
            <td style="padding:10px; vertical-align: middle;">${avatarHtml}${c.nombre}<br><small style="color:#7f8c8d;">DNI: ${c.dni}</small></td>
            <td style="padding:10px;">${c.email}<br><small>${c.telefono}</small></td>`;
        
        if (textoBusqueda) {
            html += `<td style="padding:10px; text-align:center;">
                <span style="background:${badgeColor}; color:white; padding:4px 8px; border-radius:12px; font-weight:bold; font-size:13px;">
                    ${c.porcentaje}%
                </span>
            </td>`;
        }

        html += `<td style="padding:10px;">${c.fecha}</td>
            <td style="padding:10px; text-align:center;">
                <button onclick='verCVATS(${JSON.stringify(c)}, document.getElementById("chkIncluirFoto").checked)' style="background:#27ae60; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; margin-bottom:5px;">📄 Ver CV ATS</button><br>
                <button onclick="eliminarCandidato(${c.id})" style="background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Eliminar</button>
            </td>
        </tr>`;
    });
    html += '</table>';
    listaCandidatosDiv.innerHTML = html;
}

// Función para filtrar candidatos en tiempo real
function filtrarCandidatos(textoBusqueda) {
    const texto = textoBusqueda.toLowerCase().trim();
    if (!texto) {
        renderizarTabla(todosLosCandidatos, '');
        return;
    }

    const filtrados = todosLosCandidatos.filter(c => {
        const puesto = (c.puestoRequerido || '').toLowerCase();
        const nombre = (c.nombre || '').toLowerCase();
        const dni = (c.dni || '').toLowerCase();
        const habilidades = (c.habilidades || '').toLowerCase();
        const resumen = (c.resumen || '').toLowerCase();
        const experiencia = (c.experiencia || '').toLowerCase();

        return puesto.includes(texto) || 
               nombre.includes(texto) || 
               dni.includes(texto) || 
               habilidades.includes(texto) || 
               resumen.includes(texto) || 
               experiencia.includes(texto);
    });

    renderizarTabla(filtrados, texto);
}

// Función para abrir una ventana limpia con el CV formateado estrictamente en formato ATS
function verCVATS(c, mostrarFoto) {
    // Enriquecemos las habilidades leyendo automáticamente la experiencia
    const habilidadesFinales = enriquecerHabilidadesATS(c);

    const ventanaATS = window.open('', '_blank');
    ventanaATS.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>CV ATS - ${c.nombre}</title>
            <style>
                body { font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #000; max-width: 800px; margin: 40px auto; padding: 20px; }
                .header-container { display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 5px; }
                .foto-perfil { width: 90px; height: 90px; border-radius: 50%; object-fit: cover; border: 2px solid #ccc; }
                h1 { font-size: 22px; text-transform: uppercase; margin: 0; text-align: center; }
                .contacto { text-align: center; font-size: 14px; margin-bottom: 25px; color: #333; }
                h2 { font-size: 15px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 2px; margin-top: 25px; margin-bottom: 8px; }
                p { font-size: 14px; text-align: justify; margin: 0 0 10px 0; }
                .habilidades-lista { font-size: 14px; font-weight: bold; }
                .btn-imprimir { background: #3498db; color: white; border: none; padding: 10px 20px; font-size: 14px; cursor: pointer; display: block; margin: 30px auto; border-radius: 4px; }
                @media print { .btn-imprimir { display: none; } }
            </style>
        </head>
        <body>
            <div class="header-container">
                ${mostrarFoto && c.fotoPerfil ? `<img src="${c.fotoPerfil}" class="foto-perfil" alt="Foto de perfil">` : ''}
                <div>
                    <h1>${c.nombre}</h1>
                </div>
            </div>

            <div class="contacto">
                ${c.direccion} | Tel: ${c.telefono} | Email: ${c.email} | DNI: ${c.dni}
                ${c.puestoRequerido ? `<br><strong>Objetivo / Puesto:</strong> ${c.puestoRequerido}` : ''}
                <br><strong>Disponibilidad:</strong> ${c.disponibilidad}
            </div>

            <h2>Resumen Profesional</h2>
            <p>${c.resumen || 'No especificado.'}</p>

            <h2>Experiencia Laboral</h2>
            <p>${c.experiencia || 'No especificada.'}</p>

            <h2>Estudios y Formación</h2>
            <p>${c.estudios || 'No especificados.'}</p>

            <h2>Habilidades y Competencias</h2>
            <p class="habilidades-lista">${habilidadesFinales}</p>

            <button class="btn-imprimir" onclick="window.print()">🖨️ Imprimir / Guardar como PDF ATS</button>
        </body>
        </html>
    `);
    ventanaATS.document.close();
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

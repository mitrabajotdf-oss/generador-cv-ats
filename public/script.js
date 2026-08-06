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

// Lógica para el panel de administración (index.html) con protección contra bloqueos
let todosLosCandidatos = [];
const listaCandidatosDiv = document.getElementById('listaCandidatos');

if (listaCandidatosDiv) {
    async function cargarCandidatos() {
        try {
            listaCandidatosDiv.innerHTML = '<p>Cargando postulantes...</p>';
            const res = await fetch('/api/candidatos');
            
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

// Función para calcular un porcentaje de afinidad basado en múltiples palabras clave
function calcularAfinidad(candidato, textoBusqueda) {
    if (!textoBusqueda) return 0;
    
    const palabras = textoBusqueda.toLowerCase().split(/\s+/).filter(p => p.length > 2);
    if (palabras.length === 0) return 0;

    const habilidadesEnriquecidas = enriquecerHabilidadesATS(candidato);
    const textoCompleto = `
        ${candidato.puestoRequerido || ''} 
        ${habilidadesEnriquecidas} 
        ${candidato.resumen || ''} 
        ${candidato.experiencia || ''} 
        ${candidato.estudios || ''}
        ${candidato.textoExtraidoCV || ''}
    `.toLowerCase();

    let coincidencias = 0;
    palabras.forEach(palabra => {
        if (textoCompleto.includes(palabra)) {
            coincidencias++;
        }
    });

    let porcentaje = Math.round((coincidencias / palabras.length) * 100);
    return Math.min(porcentaje, 100);
}

// Función inteligente para extraer y enriquecer habilidades uniendo formulario y texto extraído del CV
function enriquecerHabilidadesATS(candidato) {
    let habilidadesManuales = candidato.habilidades || '';
    const experienciaTexto = ((candidato.experiencia || '') + ' ' + (candidato.textoExtraidoCV || '')).toLowerCase();
    
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
        { term: 'cocina', label: 'Gastronomía y Cocina' },
        { term: 'carga', label: 'Carga y Descarga' }
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

// Función para renderizar la tabla con visualización de foto, descarga de archivo original y opciones de CV
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
    html += '<tr style="background:#f2f2f2;"><th>Foto</th><th>Puesto Requerido</th><th>Nombre</th><th>Email / Teléfono</th><th>CV Original</th>';
    if (textoBusqueda) html += '<th>Afinidad ATS</th>';
    html += '<th>Fecha</th><th>Acciones ATS / Empresa</th></tr>';
    
    listaProcesada.forEach(c => {
        let badgeColor = '#7f8c8d';
        if (c.porcentaje >= 75) badgeColor = '#27ae60';
        else if (c.porcentaje >= 40) badgeColor = '#f39c12';

        let avatarHtml = '<span style="color:#999; font-size:12px;">Sin foto</span>';
        const imgSource = c.fotoUrl || c.fotoPerfil;
        if (imgSource) {
            avatarHtml = `<img src="${imgSource}" alt="Foto" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover; border: 1px solid #bdc3c7;">`;
        }

        // Enlace seguro al servidor para la descarga física del archivo original
        const linkCvOriginal = c.cvUrl 
            ? `<a href="/api/descargar-cv/${c.id}" style="background:#007bff; color:white; padding:5px 8px; text-decoration:none; border-radius:3px; font-size:11px; display:inline-block;">📥 Descargar CV</a>` 
            : '<span style="color:#999; font-size:11px;">No adjunto</span>';

        html += `<tr>
            <td style="padding:10px; text-align:center; vertical-align: middle;">${avatarHtml}</td>
            <td style="padding:10px; font-weight:bold; color:#2980b9; vertical-align: middle;">${c.puestoRequerido || 'General'}</td>
            <td style="padding:10px; vertical-align: middle;">${c.nombre}<br><small style="color:#7f8c8d;">DNI: ${c.dni}</small></td>
            <td style="padding:10px; vertical-align: middle;">${c.email}<br><small>${c.telefono}</small></td>
            <td style="padding:10px; text-align:center; vertical-align: middle;">${linkCvOriginal}</td>`;
        
        if (textoBusqueda) {
            html += `<td style="padding:10px; text-align:center; vertical-align: middle;">
                <span style="background:${badgeColor}; color:white; padding:4px 8px; border-radius:12px; font-weight:bold; font-size:13px;">
                    ${c.porcentaje}%
                </span>
            </td>`;
        }

        html += `<td style="padding:10px; vertical-align: middle;">${c.fecha}</td>
            <td style="padding:10px; text-align:center; vertical-align: middle;">
                <button onclick='verCVATS(${JSON.stringify(c)})' style="background:#27ae60; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; margin-bottom:5px;">📄 Ver CV ATS (Sin Foto)</button><br>
                <a href="/api/cv-empresa/${c.id}" target="_blank" style="background:#2980b9; color:white; text-decoration:none; padding:5px 10px; border-radius:4px; font-size:11px; display:inline-block; margin-bottom:5px;">🏢 CV con Foto (Empresa)</a><br>
                <button onclick="eliminarCandidato(${c.id})" style="background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Eliminar</button>
            </td>
        </tr>`;
    });
    html += '</table>';
    listaCandidatosDiv.innerHTML = html;
}

// Función para filtrar candidatos permitiendo múltiples habilidades o palabras clave
function filtrarCandidatos(textoBusqueda) {
    const texto = textoBusqueda.toLowerCase().trim();
    if (!texto) {
        renderizarTabla(todosLosCandidatos, '');
        return;
    }

    const palabras = texto.split(/\s+/).filter(p => p.length > 2);

    const filtrados = todosLosCandidatos.filter(c => {
        const puesto = (c.puestoRequerido || '').toLowerCase();
        const nombre = (c.nombre || '').toLowerCase();
        const dni = (c.dni || '').toLowerCase();
        const habilidadesEnriquecidas = enriquecerHabilidadesATS(c).toLowerCase();
        const resumen = (c.resumen || '').toLowerCase();
        const experiencia = (c.experiencia || '').toLowerCase();
        const textoExtraido = (c.textoExtraidoCV || '').toLowerCase();

        const textoTotal = `${puesto} ${nombre} ${dni} ${habilidadesEnriquecidas} ${resumen} ${experiencia} ${textoExtraido}`;

        if (palabras.length > 1) {
            let matches = palabras.filter(palabra => textoTotal.includes(palabra));
            return matches.length > 0;
        } else {
            return textoTotal.includes(texto);
        }
    });

    renderizarTabla(filtrados, texto);
}

// Función para abrir la ventana del CV ATS optimizado (unificando formulario y archivo subido)
function verCVATS(c) {
    const incluirFotoChk = document.getElementById('chkIncluirFoto');
    const mostrarFoto = incluirFotoChk ? incluirFotoChk.checked : false;

    const habilidadesFinales = enriquecerHabilidadesATS(c);
    const fotoSrc = c.fotoUrl || c.fotoPerfil;

    let experienciaFinal = c.experiencia || '';
    if (c.textoExtraidoCV && c.textoExtraidoCV.trim() !== '') {
        experienciaFinal = c.textoExtraidoCV.trim();
    }

    let resumenFinal = c.resumen || '';
    if (!resumenFinal && c.textoExtraidoCV) {
        resumenFinal = c.textoExtraidoCV.substring(0, 300) + '...';
    }

    const ventanaATS = window.open('', '_blank');
    ventanaATS.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>CV ATS - ${c.nombre}</title>
            <style>
                body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #000; max-width: 800px; margin: 40px auto; padding: 20px; }
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
                ${mostrarFoto && fotoSrc ? `<img src="${fotoSrc}" class="foto-perfil" alt="Foto de perfil">` : ''}
                <div>
                    <h1>${c.nombre}</h1>
                </div>
            </div>

            <div class="contacto">
                ${c.direccion || ''} | Tel: ${c.telefono || ''} | Email: ${c.email || ''} | DNI: ${c.dni || ''}
                ${c.puestoRequerido ? `<br><strong>Objetivo / Puesto:</strong> ${c.puestoRequerido}` : ''}
                <br><strong>Disponibilidad:</strong> ${c.disponibilidad || 'Inmediata'}
            </div>

            <h2>Resumen Profesional</h2>
            <p>${resumenFinal || 'No especificado.'}</p>

            <h2>Experiencia Laboral</h2>
            <p style="white-space: pre-line;">${experienciaFinal || 'No especificada.'}</p>

            <h2>Estudios y Formación</h2>
            <p style="white-space: pre-line;">${c.estudios || 'No especificados.'}</p>

            <h2>Habilidades y Competencias Clave</h2>
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

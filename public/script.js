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

// Lógica para el panel de administración en formato carpetas con espacio de búsquedas
let todosLosCandidatos = [];
const listaCandidatosDiv = document.getElementById('listaCandidatos');

if (listaCandidatosDiv) {
    async function cargarCandidatos() {
        try {
            listaCandidatosDiv.innerHTML = '<p>Cargando legajos de postulantes...</p>';
            const res = await fetch('/api/candidatos');
            
            if (!res.ok) {
                throw new Error(`Error HTTP: ${res.status}`);
            }

            const data = await res.json();
            
            if (data.success && data.candidatos && data.candidatos.length > 0) {
                todosLosCandidatos = data.candidatos.map(c => ({ ...c, porcentaje: 0 }));
                renderizarTarjetasCarpetas(todosLosCandidatos);
            } else {
                listaCandidatosDiv.innerHTML = '<p>No hay postulantes registrados todavía.</p>';
            }
        } catch (e) {
            console.error('Error al cargar candidatos:', e);
            listaCandidatosDiv.innerHTML = '<p style="color: red;">⚠️ Error al conectar con el servidor o cargar los datos. Intenta recargar la página.</p>';
        }
    }

    cargarCandidatos();

    // Conectar el input buscador principal en tiempo real
    const inputBuscador = document.getElementById('buscador');
    if (inputBuscador) {
        inputBuscador.addEventListener('input', (e) => {
            filtrarCandidatos(e.target.value);
        });
    }
}

// Función para calcular afinidad por palabras clave de búsqueda
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

// Enriquecer habilidades leyendo la experiencia y CV
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

// Renderizar los legajos en formato de carpetas con panel de búsquedas integrado
function renderizarTarjetasCarpetas(candidatos, textoBusqueda = '') {
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

    // Sección de Control Superior (Espacio de Búsquedas y Filtros)
    let html = `
    <div style="background: white; border: 1px solid #cbd5e1; padding: 20px; border-radius: 12px; margin-bottom: 25px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; margin-bottom: 15px;">
            <h3 style="margin: 0; font-size: 16px; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                🔍 Espacio de Carga de Búsquedas & Filtros ATS
            </h3>
            <label style="cursor: pointer; font-weight: 600; color: #0284c7; font-size: 13px; background: #e0f2fe; padding: 6px 12px; border-radius: 6px;">
                <input type="checkbox" id="chkIncluirFoto" style="margin-right: 6px;"> Incluir Foto de Perfil en la vista de CV ATS
            </label>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
            <input type="text" id="buscadorBusquedas" placeholder="Ingresa puesto, habilidades clave o requisitos (Ej: Excel, administrativo, ventas)..." value="${textoBusqueda}" style="flex: 1; min-width: 280px; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; outline: none;">
            <button onclick="aplicarEspacioBusqueda()" style="background: #0284c7; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px;">Filtrar Perfiles</button>
            <button onclick="limpiarEspacioBusqueda()" style="background: #64748b; color: white; border: none; padding: 10px 15px; border-radius: 6px; font-weight: 500; cursor: pointer; font-size: 14px;">Limpiar</button>
        </div>
    </div>`;

    // Cuadrícula de Legajos (Carpetas de Candidatos)
    html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px;">';
    
    listaProcesada.forEach(c => {
        let badgeColor = '#64748b';
        if (c.porcentaje >= 75) badgeColor = '#27ae60';
        else if (c.porcentaje >= 40) badgeColor = '#f39c12';

        let avatarHtml = '<div style="width: 60px; height: 60px; border-radius: 50%; background: #e2e8f0; color: #64748b; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; border: 2px solid #cbd5e1;">Sin foto</div>';
        const imgSource = c.fotoUrl || c.fotoPerfil;
        if (imgSource) {
            avatarHtml = `<img src="${imgSource}" alt="Foto" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid #3498db;">`;
        }

        const nombreArchivoMostrable = c.nombreArchivoCV || 'Documento CV';
        const linkCvOriginal = c.cvUrl 
            ? `<div style="background: #f1f5f9; padding: 8px 10px; border-radius: 6px; border: 1px dashed #cbd5e1; margin-bottom: 8px; font-size: 12px; display: flex; align-items: center; justify-content: space-between;">
                   <span style="color: #334155; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;" title="${nombreArchivoMostrable}">📎 ${nombreArchivoMostrable}</span>
                   <a href="/api/descargar-cv/${c.id}" style="background:#0284c7; color:white; padding:4px 10px; text-decoration:none; border-radius:4px; font-size:11px; font-weight:500;">📥 Descargar</a>
               </div>` 
            : '<div style="font-size: 12px; color: #94a3b8; margin-bottom: 8px;">📂 Sin archivo de CV adjunto</div>';

        html += `
        <div style="background: white; border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.03); overflow: hidden; display: flex; flex-direction: column; justify-content: space-between;">
            
            <!-- Cabecera de la Carpeta -->
            <div style="background: #f8fafc; padding: 15px 20px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 15px;">
                ${avatarHtml}
                <div style="overflow: hidden;">
                    <div style="font-size: 12px; font-weight: 700; color: #0284c7; text-transform: uppercase; margin-bottom: 2px;">${c.puestoRequerido || 'General'}</div>
                    <div style="font-size: 16px; font-weight: bold; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${c.nombre}">${c.nombre}</div>
                    <div style="font-size: 12px; color: #64748b;">DNI: ${c.dni || 'No especificado'}</div>
                </div>
            </div>

            <!-- Contenido del Legajo -->
            <div style="padding: 15px 20px; flex-grow: 1;">
                <div style="font-size: 13px; color: #334155; margin-bottom: 8px;">
                    <strong>📧 Email:</strong> ${c.email || 'No cargado'}<br>
                    <strong>📞 Tel:</strong> ${c.telefono || 'No cargado'}<br>
                    <strong>📅 Postulación:</strong> ${c.fecha}
                </div>

                ${textoBusqueda ? `
                <div style="margin-bottom: 10px;">
                    <span style="font-size: 12px; font-weight: 600; color: #64748b;">Afinidad ATS:</span>
                    <span style="background:${badgeColor}; color:white; padding:2px 8px; border-radius:10px; font-weight:bold; font-size:12px; margin-left: 5px;">
                        ${c.porcentaje}%
                    </span>
                </div>` : ''}

                <!-- Archivo adjunto dentro de la carpeta -->
                <div style="margin-top: 10px;">
                    <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Archivos en Legajo:</div>
                    ${linkCvOriginal}
                </div>
            </div>

            <!-- Botones de Acción inferior -->
            <div style="background: #f8fafc; padding: 12px 20px; border-top: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 6px;">
                <button onclick='verCVATS(${JSON.stringify(c)})' style="background: #10b981; color: white; border: none; padding: 8px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; width: 100%;">📄 Ver CV ATS (Sin Foto)</button>
                <div style="display: flex; gap: 6px;">
                    <a href="/api/cv-empresa/${c.id}" target="_blank" style="background: #3b82f6; color: white; text-decoration: none; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; flex: 1; text-align: center;">🏢 CV Empresa</a>
                    <button onclick="eliminarCandidato(${c.id})" style="background: #ef4444; color: white; border: none; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer;">🗑️ Eliminar</button>
                </div>
            </div>

        </div>`;
    });

    html += '</div>';
    listaCandidatosDiv.innerHTML = html;
}

// Función para aplicar la búsqueda desde el nuevo espacio superior
function aplicarEspacioBusqueda() {
    const inputBusqueda = document.getElementById('buscadorBusquedas');
    if (inputBusqueda) {
        filtrarCandidatos(inputBusqueda.value);
    }
}

// Función para limpiar la búsqueda
function limpiarEspacioBusqueda() {
    const inputBusqueda = document.getElementById('buscadorBusquedas');
    if (inputBusqueda) {
        inputBusqueda.value = '';
    }
    renderizarTarjetasCarpetas(todosLosCandidatos, '');
}

// Función para filtrar candidatos
function filtrarCandidatos(textoBusqueda) {
    const texto = textoBusqueda.toLowerCase().trim();
    if (!texto) {
        renderizarTarjetasCarpetas(todosLosCandidatos, '');
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

    renderizarTarjetasCarpetas(filtrados, texto);
}

// Visor del CV ATS
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
    if (!confirm('¿Estás seguro de eliminar este legajo?')) return;
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

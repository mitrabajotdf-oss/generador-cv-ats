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

// Variables globales para el panel estructurado por carpetas
let todosLosCandidatos = [];
let carpetasBusquedas = [
    { id: 1, titulo: 'Administrativo Contable', keywords: 'excel administración tango gestión' },
    { id: 2, titulo: 'Atención al Cliente', keywords: 'atención al cliente ventas caja' },
    { id: 3, titulo: 'Logística y Operaciones', keywords: 'logística chofer repositor carga' }
];
let directorioActual = 'postulantes'; // 'postulantes' o 'busquedas'
let busquedaSeleccionadaFiltro = '';

const listaCandidatosDiv = document.getElementById('listaCandidatos');

if (listaCandidatosDiv) {
    async function cargarCandidatos() {
        try {
            listaCandidatosDiv.innerHTML = '<p style="text-align:center; padding: 20px; color:#64748b;">Cargando directorios del servidor...</p>';
            const res = await fetch('/api/candidatos');
            
            if (!res.ok) {
                throw new Error(`Error HTTP: ${res.status}`);
            }

            const data = await res.json();
            
            if (data.success && data.candidatos) {
                todosLosCandidatos = data.candidatos.map(c => ({ ...c, porcentaje: 0 }));
                renderizarExploradorCarpetas();
            } else {
                listaCandidatosDiv.innerHTML = '<p style="text-align:center; padding: 20px;">No hay registros todavía.</p>';
            }
        } catch (e) {
            console.error('Error al cargar datos:', e);
            listaCandidatosDiv.innerHTML = '<p style="text-align: center; color: red; padding: 20px;">⚠️ Error al conectar con el servidor.</p>';
        }
    }

    cargarCandidatos();
}

// Cálculo de afinidad ATS
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

// Renderizador principal del Explorador de Dos Carpetas
function renderizarExploradorCarpetas() {
    if (!listaCandidatosDiv) return;

    let html = `
    <!-- Directorio Principal: Las 2 Grandes Carpetas -->
    <div style="display: flex; gap: 15px; margin-bottom: 25px; flex-wrap: wrap;">
        
        <!-- Carpeta 1: Postulantes -->
        <div onclick="cambiarDirectorio('postulantes')" style="flex: 1; min-width: 280px; background: ${directorioActual === 'postulantes' ? '#f0f9ff' : '#ffffff'}; border: 2px solid ${directorioActual === 'postulantes' ? '#0284c7' : '#cbd5e1'}; padding: 18px 22px; border-radius: 12px; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); display: flex; align-items: center; gap: 15px; transition: all 0.2s;">
            <div style="font-size: 36px;">📁</div>
            <div>
                <div style="font-size: 16px; font-weight: bold; color: #1e293b;">Carpeta: Postulantes</div>
                <div style="font-size: 13px; color: #64748b;">${todosLosCandidatos.length} Legajos guardados en subcarpetas</div>
            </div>
        </div>

        <!-- Carpeta 2: Búsquedas -->
        <div onclick="cambiarDirectorio('busquedas')" style="flex: 1; min-width: 280px; background: ${directorioActual === 'busquedas' ? '#f0f9ff' : '#ffffff'}; border: 2px solid ${directorioActual === 'busquedas' ? '#0284c7' : '#cbd5e1'}; padding: 18px 22px; border-radius: 12px; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); display: flex; align-items: center; gap: 15px; transition: all 0.2s;">
            <div style="font-size: 36px;">📂</div>
            <div>
                <div style="font-size: 16px; font-weight: bold; color: #1e293b;">Carpeta: Búsquedas & Vacantes</div>
                <div style="font-size: 13px; color: #64748b;">${carpetasBusquedas.length} Perfiles de búsqueda creados</div>
            </div>
        </div>

    </div>`;

    if (directorioActual === 'postulantes') {
        html += renderizarSubcarpetasPostulantes();
    } else {
        html += renderizarSubcarpetasBusquedas();
    }

    listaCandidatosDiv.innerHTML = html;
}

function cambiarDirectorio(dir) {
    directorioActual = dir;
    if (dir === 'busquedas') {
        busquedaSeleccionadaFiltro = '';
    }
    renderizarExploradorCarpetas();
}

// Subcarpetas de Postulantes (Cada postulante es una subcarpeta con sus archivos)
function renderizarSubcarpetasPostulantes() {
    let listaFiltrada = todosLosCandidatos;
    
    if (busquedaSeleccionadaFiltro) {
        listaFiltrada = todosLosCandidatos.map(c => {
            const porc = calcularAfinidad(c, busquedaSeleccionadaFiltro);
            return { ...c, porcentaje: porc };
        });
        listaFiltrada.sort((a, b) => b.porcentaje - a.porcentaje);
    }

    let html = `
    <div style="background: white; border: 1px solid #cbd5e1; padding: 15px 20px; border-radius: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
        <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 250px;">
            <input type="text" id="buscadorGeneral" placeholder="🔍 Buscar subcarpeta de postulante..." oninput="filtrarSubcarpetas(this.value)" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; outline: none;">
        </div>
        ${busquedaSeleccionadaFiltro ? `<div style="background: #e0f2fe; color: #0369a1; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 600;">Filtrando por Búsqueda: "${busquedaSeleccionadaFiltro}" <button onclick="busquedaSeleccionadaFiltro=''; renderizarExploradorCarpetas();" style="background:none; border:none; color:#ef4444; cursor:pointer; font-weight:bold; margin-left:5px;">✕</button></div>` : ''}
        <label style="cursor: pointer; font-weight: 600; color: #0284c7; font-size: 13px;">
            <input type="checkbox" id="chkIncluirFoto" style="margin-right: 6px;"> Incluir Foto en CV ATS
        </label>
    </div>`;

    if (listaFiltrada.length === 0) {
        html += '<p style="text-align: center; padding: 30px; color: #64748b;">No hay subcarpetas de postulantes registradas.</p>';
        return html;
    }

    html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px;">';

    listaFiltrada.forEach(c => {
        let badgeColor = '#64748b';
        if (c.porcentaje >= 75) badgeColor = '#27ae60';
        else if (c.porcentaje >= 40) badgeColor = '#f39c12';

        let avatarHtml = '<div style="width: 50px; height: 50px; border-radius: 50%; background: #e2e8f0; color: #64748b; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; border: 2px solid #cbd5e1;">Sin foto</div>';
        const imgSource = c.fotoUrl || c.fotoPerfil;
        if (imgSource) {
            avatarHtml = `<img src="${imgSource}" alt="Foto" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid #3498db;">`;
        }

        const nombreArchivoMostrable = c.nombreArchivoCV || 'Documento CV';
        const linkCvOriginal = c.cvUrl 
            ? `<div style="background: #f1f5f9; padding: 8px 10px; border-radius: 6px; border: 1px dashed #cbd5e1; margin-bottom: 8px; font-size: 12px; display: flex; align-items: center; justify-content: space-between;">
                   <span style="color: #334155; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;" title="${nombreArchivoMostrable}">📄 ${nombreArchivoMostrable}</span>
                   <a href="/api/descargar-cv/${c.id}" style="background:#0284c7; color:white; padding:4px 10px; text-decoration:none; border-radius:4px; font-size:11px; font-weight:500;">📥 Descargar</a>
               </div>` 
            : '<div style="font-size: 12px; color: #94a3b8; margin-bottom: 8px;">📂 Sin archivo de CV adjunto</div>';

        html += `
        <div style="background: white; border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.03); overflow: hidden; display: flex; flex-direction: column; justify-content: space-between;">
            <div style="background: #f8fafc; padding: 15px 20px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 15px;">
                ${avatarHtml}
                <div style="overflow: hidden;">
                    <div style="font-size: 11px; font-weight: 700; color: #0284c7; text-transform: uppercase; margin-bottom: 2px;">📂 Subcarpeta: ${c.puestoRequerido || 'General'}</div>
                    <div style="font-size: 15px; font-weight: bold; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${c.nombre}">${c.nombre}</div>
                    <div style="font-size: 11px; color: #64748b;">DNI: ${c.dni || 'S/D'}</div>
                </div>
            </div>
            <div style="padding: 15px 20px; flex-grow: 1;">
                <div style="font-size: 13px; color: #334155; margin-bottom: 8px;">
                    <strong>📧 Email:</strong> ${c.email || 'No cargado'}<br>
                    <strong>📞 Tel:</strong> ${c.telefono || 'No cargado'}<br>
                    <strong>📅 Postulación:</strong> ${c.fecha}
                </div>
                ${busquedaSeleccionadaFiltro ? `
                <div style="margin-bottom: 10px;">
                    <span style="font-size: 12px; font-weight: 600; color: #64748b;">Afinidad ATS:</span>
                    <span style="background:${badgeColor}; color:white; padding:2px 8px; border-radius:10px; font-weight:bold; font-size:12px; margin-left: 5px;">${c.porcentaje}%</span>
                </div>` : ''}
                <div style="margin-top: 10px;">
                    <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Archivos en Subcarpeta:</div>
                    ${linkCvOriginal}
                </div>
            </div>
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
    return html;
}

// Subcarpetas de Búsquedas (Cada búsqueda es una subcarpeta de vacante)
function renderizarSubcarpetasBusquedas() {
    let html = `
    <div style="background: white; border: 1px solid #cbd5e1; padding: 25px; border-radius: 12px; margin-bottom: 25px;">
        <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #1e293b;">📂 Subcarpetas de Búsquedas y Vacantes Corporativas</h3>
        <p style="font-size: 14px; color: #64748b; margin-bottom: 20px;">Cada tarjeta representa una subcarpeta de búsqueda. Al hacer clic en <strong>"Evaluar Postulantes"</strong>, el sistema abrirá la carpeta de postulantes ordenados por afinidad ATS.</p>
        
        <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 25px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <input type="text" id="nuevaBusquedaTitulo" placeholder="Título de la Subcarpeta (Ej: Operario de Logística)..." style="flex: 1; min-width: 220px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
            <input type="text" id="nuevaBusquedaKeywords" placeholder="Keywords (Ej: chofer carga registro)..." style="flex: 2; min-width: 280px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
            <button onclick="agregarSubcarpetaBusqueda()" style="background: #27ae60; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px;">➕ Crear Subcarpeta</button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 15px;">`;

    carpetasBusquedas.forEach(b => {
        html += `
        <div style="background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; flex-direction: column; justify-content: space-between;">
            <div>
                <div style="font-size: 16px; font-weight: bold; color: #0284c7; margin-bottom: 6px;">📂 Subcarpeta: ${b.titulo}</div>
                <div style="font-size: 13px; color: #475569; margin-bottom: 12px;"><strong>Requisitos ATS:</strong> ${b.keywords}</div>
            </div>
            <div style="display: flex; gap: 8px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
                <button onclick="evaluarSubcarpetaBusqueda('${b.keywords}')" style="background: #0284c7; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; flex: 1;">🔍 Evaluar Postulantes</button>
                <button onclick="eliminarSubcarpetaBusqueda(${b.id})" style="background: #fee2e2; color: #dc2626; border: none; padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">🗑️</button>
            </div>
        </div>`;
    });

    html += '</div></div>';
    return html;
}

function agregarSubcarpetaBusqueda() {
    const tituloInput = document.getElementById('nuevaBusquedaTitulo');
    const keywordsInput = document.getElementById('nuevaBusquedaKeywords');
    
    if (!tituloInput.value || !keywordsInput.value) {
        alert('Por favor completa el título y las keywords de la subcarpeta.');
        return;
    }

    carpetasBusquedas.push({
        id: Date.now(),
        titulo: tituloInput.value,
        keywords: keywordsInput.value
    });

    renderizarExploradorCarpetas();
}

function eliminarSubcarpetaBusqueda(id) {
    carpetasBusquedas = carpetasBusquedas.filter(b => b.id !== id);
    renderizarExploradorCarpetas();
}

function evaluarSubcarpetaBusqueda(keywords) {
    busquedaSeleccionadaFiltro = keywords;
    directorioActual = 'postulantes';
    renderizarExploradorCarpetas();
}

function filtrarSubcarpetas(texto) {
    const textoBajo = texto.toLowerCase();
    const filtrados = todosLosCandidatos.filter(c => {
        const total = `${c.nombre} ${c.dni} ${c.puestoRequerido} ${c.habilidades}`.toLowerCase();
        return total.includes(textoBajo);
    });
    renderizarExploradorCarpetas();
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

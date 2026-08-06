// Lógica para el envío del formulario y autocompletado inteligente
const formPostulacion = document.getElementById('formPostulacion');
if (formPostulacion) {
    const cvInputFile = document.getElementById('cvFile');
    if (cvInputFile) {
        cvInputFile.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const btnEnviar = document.getElementById('btnEnviar');
            if (btnEnviar) {
                btnEnviar.disabled = true;
                btnEnviar.textContent = 'Analizando CV y autocompletando formulario...';
            }

            const formData = new FormData();
            formData.append('cvFile', file);

            try {
                const res = await fetch('/api/extraer-cv', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();

                if (data.success && data.texto) {
                    procesarYAutocompletarCampos(data.texto);
                }
            } catch (err) {
                console.error('Error al autocompletar:', err);
            } finally {
                if (btnEnviar) {
                    btnEnviar.disabled = false;
                    btnEnviar.textContent = 'Enviar Postulación Final';
                }
            }
        });
    }

    formPostulacion.addEventListener('submit', async function(e) {
        e.preventDefault();

        const cvFileCheck = document.getElementById('cvFile').files[0];
        if (!cvFileCheck) {
            alert('⚠️ Por favor adjunta tu archivo de CV (PDF o DOCX) para continuar.');
            document.getElementById('cvFile').focus();
            return;
        }

        const btn = document.getElementById('btnEnviar');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Enviando postulación...';
        }

        const formData = new FormData(this);
        formData.append('cvFile', cvFileCheck);

        const fotoPerfil = document.getElementById('fotoPerfil').files[0];
        if (fotoPerfil) {
            formData.append('fotoPerfil', fotoPerfil);
        }

        try {
            const res = await fetch('/api/enviar-postulacion', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (data.success) {
                document.getElementById('formPostulacion').style.display = 'none';
                document.getElementById('resultadoSeccion').style.display = 'block';

                const nombrePostulante = document.getElementById('nombre').value || 'Postulante';
                const telefonoWhatsApp = '5492964659057';

                const mensajeConFoto = encodeURIComponent(`Hola, soy ${nombrePostulante}. Quiero descargar mi CV con foto.`);
                const mensajeSinFoto = encodeURIComponent(`Hola, soy ${nombrePostulante}. Quiero descargar mi CV sin foto.`);

                const btnConFoto = document.getElementById('linkCvConFoto');
                const btnSinFoto = document.getElementById('linkCvSinFoto');

                if (btnConFoto) btnConFoto.href = `https://wa.me/${telefonoWhatsApp}?text=${mensajeConFoto}`;
                if (btnSinFoto) btnSinFoto.href = `https://wa.me/${telefonoWhatsApp}?text=${mensajeSinFoto}`;

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

// Función de interpretación inteligente del CV y autocompletado
function procesarYAutocompletarCampos(texto) {
    const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const textoBajo = texto.toLowerCase();

    const regexEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const matchEmail = texto.match(regexEmail);
    if (matchEmail) {
        const inputEmail = document.getElementById('email');
        if (inputEmail) inputEmail.value = matchEmail[0];
    }

    const regexTel = /(?:\+?54\s?9?\s?)?(\(?\d{2,4}\)?\s?)?\d{3,4}[-\s]?\d{4}/g;
    const matchesTel = texto.match(regexTel);
    if (matchesTel && matchesTel.length > 0) {
        let numerosLimpios = matchesTel[0].replace(/\D/g, '');
        if (numerosLimpios.startsWith('549')) {
            numerosLimpios = numerosLimpios.substring(3);
        } else if (numerosLimpios.startsWith('54')) {
            numerosLimpios = numerosLimpios.substring(2);
        }
        if (numerosLimpios.length >= 10) {
            const codArea = numerosLimpios.substring(0, 4);
            const resto = numerosLimpios.substring(4);
            const inputTel = document.getElementById('telefono');
            if (inputTel) inputTel.value = `+54 9 ${codArea} ${resto}`;
        }
    } else {
        const inputTel = document.getElementById('telefono');
        if (inputTel && !inputTel.value) inputTel.value = '+54 9 2964 ';
    }

    const regexDni = /(?:dni|d\.n\.i\.?|c[u|i][l|t])\D*(\d{1,2}\.?\d{3}\.?\d{3})/i;
    const matchDni = texto.match(regexDni);
    if (matchDni && matchDni[1]) {
        const inputDni = document.getElementById('dni');
        if (inputDni) inputDni.value = matchDni[1];
    }

    if (lineas.length > 0 && lineas[0].length < 40 && !lineas[0].includes('@')) {
        const inputNombre = document.getElementById('nombre');
        if (inputNombre) inputNombre.value = lineas[0];
    }

    let resumenExtraido = '';
    const idxResumen = textoBajo.indexOf('resumen profesional');
    const idxExperiencia = textoBajo.indexOf('experiencia');
    if (idxResumen !== -1 && idxExperiencia !== -1 && idxExperiencia > idxResumen) {
        resumenExtraido = texto.substring(idxResumen, idxExperiencia).replace(/resumen profesional/i, '').trim();
    } else {
        resumenExtraido = texto.substring(0, 350).trim();
    }
    const inputResumen = document.getElementById('resumen');
    if (inputResumen) inputResumen.value = resumenExtraido;

    let experienciaExtraida = '';
    if (idxExperiencia !== -1) {
        const idxEstudios = textoBajo.indexOf('estudios') !== -1 ? textoBajo.indexOf('estudios') : texto.length;
        experienciaExtraida = texto.substring(idxExperiencia, idxEstudios).replace(/experiencia laboral|experiencia/i, '').trim();
    } else {
        experienciaExtraida = texto;
    }
    const inputExperiencia = document.getElementById('experiencia');
    if (inputExperiencia) inputExperiencia.value = experienciaExtraida;

    let estudiosExtraidos = '';
    const idxEstudios = textoBajo.indexOf('estudios');
    const idxHabilidades = textoBajo.indexOf('habilidades');
    if (idxEstudios !== -1) {
        let finEstudios = idxHabilidades !== -1 && idxHabilidades > idxEstudios ? idxHabilidades : texto.length;
        estudiosExtraidos = texto.substring(idxEstudios, finEstudios).replace(/estudios y formación|estudios|educación/i, '').trim();
    }
    const inputEstudios = document.getElementById('estudios');
    if (inputEstudios) inputEstudios.value = estudiosExtraidos || 'Formación académica detallada en CV adjunto.';

    let habilidadesDetectadas = [];
    const diccionarioHabilidades = [
        { term: 'tango', label: 'Manejo de Tango Gestión' },
        { term: 'excel', label: 'Microsoft Excel Avanzado' },
        { term: 'administrativo', label: 'Gestión Administrativa' },
        { term: 'notarial', label: 'Gestión Notarial y Legal' },
        { term: 'atención', label: 'Atención al Cliente' },
        { term: 'caja', label: 'Manejo de Caja' },
        { term: 'logística', label: 'Logística y Depósito' },
        { term: 'ventas', label: 'Ventas y Comercialización' },
        { term: 'copilot', label: 'Integración de IA (Copilot)' }
    ];

    diccionarioHabilidades.forEach(h => {
        if (textoBajo.includes(h.term)) {
            habilidadesDetectadas.push(h.label);
        }
    });

    const inputHabilidades = document.getElementById('habilidades');
    if (inputHabilidades) {
        inputHabilidades.value = habilidadesDetectadas.length > 0 
            ? habilidadesDetectadas.join(' • ') 
            : 'Administración • Gestión • Trabajo en Equipo';
    }
}

// Variables globales del panel
let todosLosCandidatos = [];
let carpetasBusquedas = [
    { id: 1, empresa: 'Estudio Notarial Bitsh', titulo: 'Administrativo Contable', keywords: 'excel administración tango gestión' },
    { id: 2, empresa: 'Comercial Austral', titulo: 'Atención al Cliente', keywords: 'atención al cliente ventas caja' },
    { id: 3, empresa: 'Logística Fueguina', titulo: 'Logística y Operaciones', keywords: 'logística chofer repositor carga' }
];
let directorioActual = 'postulantes';
let busquedaSeleccionadaFiltro = '';

const listaCandidatosDiv = document.getElementById('listaCandidatos');

if (listaCandidatosDiv) {
    async function cargarCandidatos() {
        try {
            listaCandidatosDiv.innerHTML = '<p style="text-align:center; padding: 20px; color:#64748b;">Cargando directorios del servidor...</p>';
            const res = await fetch('/api/candidatos');
            
            if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);

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
        ${candidato.textoExtraidoCV || ''}
    `.toLowerCase();

    let coincidencias = 0;
    palabras.forEach(palabra => {
        if (textoCompleto.includes(palabra)) coincidencias++;
    });

    let porcentaje = Math.round((coincidencias / palabras.length) * 100);
    return Math.min(porcentaje, 100);
}

function renderizarExploradorCarpetas() {
    if (!listaCandidatosDiv) return;

    let html = `
    <div style="display: flex; gap: 15px; margin-bottom: 25px; flex-wrap: wrap;">
        <div onclick="cambiarDirectorio('postulantes')" style="flex: 1; min-width: 280px; background: ${directorioActual === 'postulantes' ? '#f0f9ff' : '#ffffff'}; border: 2px solid ${directorioActual === 'postulantes' ? '#0284c7' : '#cbd5e1'}; padding: 18px 22px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; gap: 15px;">
            <div style="font-size: 36px;">📁</div>
            <div>
                <div style="font-size: 16px; font-weight: bold; color: #1e293b;">Carpeta: Postulantes</div>
                <div style="font-size: 13px; color: #64748b;">${todosLosCandidatos.length} Legajos guardados</div>
            </div>
        </div>
        <div onclick="cambiarDirectorio('busquedas')" style="flex: 1; min-width: 280px; background: ${directorioActual === 'busquedas' ? '#f0f9ff' : '#ffffff'}; border: 2px solid ${directorioActual === 'busquedas' ? '#0284c7' : '#cbd5e1'}; padding: 18px 22px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; gap: 15px;">
            <div style="font-size: 36px;">📂</div>
            <div>
                <div style="font-size: 16px; font-weight: bold; color: #1e293b;">Carpeta: Búsquedas & Vacantes</div>
                <div style="font-size: 13px; color: #64748b;">${carpetasBusquedas.length} Empresas / Perfiles creados</div>
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
    if (dir === 'busquedas') busquedaSeleccionadaFiltro = '';
    renderizarExploradorCarpetas();
}

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
            <input type="text" id="buscadorGeneral" placeholder="🔍 Buscar legajo de postulante..." oninput="filtrarSubcarpetas(this.value)" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; outline: none;">
        </div>
        ${busquedaSeleccionadaFiltro ? `<div style="background: #e0f2fe; color: #0369a1; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 600;">Filtrando por Requisitos: "${busquedaSeleccionadaFiltro}" <button onclick="busquedaSeleccionadaFiltro=''; renderizarExploradorCarpetas();" style="background:none; border:none; color:#ef4444; cursor:pointer; font-weight:bold; margin-left:5px;">✕</button></div>` : ''}
    </div>`;

    if (listaFiltrada.length === 0) {
        html += '<p style="text-align: center; padding: 30px; color: #64748b;">No hay subcarpetas de postulantes registradas.</p>';
        return html;
    }

    html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 20px;">';

    listaFiltrada.forEach(c => {
        let badgeColor = '#64748b';
        if (c.porcentaje >= 75) badgeColor = '#27ae60';
        else if (c.porcentaje >= 40) badgeColor = '#f39c12';

        let avatarHtml = '<div style="width: 50px; height: 50px; border-radius: 50%; background: #e2e8f0; color: #64748b; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; border: 2px solid #cbd5e1;">Sin foto</div>';
        if (c.fotoUrl) {
            avatarHtml = `<img src="${c.fotoUrl}" alt="Foto" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid #3498db;">`;
        }

        const nombreArchivoCV = c.nombreArchivoCV || 'Documento CV';
        const linkCvOriginal = c.cvUrl 
            ? `<div style="background: #f1f5f9; padding: 6px 10px; border-radius: 6px; border: 1px dashed #cbd5e1; margin-bottom: 6px; font-size: 12px; display: flex; align-items: center; justify-content: space-between;">
                   <span style="color: #334155; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;" title="${nombreArchivoCV}">📄 ${nombreArchivoCV}</span>
                   <a href="/api/descargar-cv/${c.id}" style="background:#0284c7; color:white; padding:3px 8px; text-decoration:none; border-radius:4px; font-size:11px; font-weight:500;">📥 Descargar CV</a>
               </div>` 
            : '<div style="font-size: 12px; color: #94a3b8; margin-bottom: 6px;">📂 Sin archivo de CV</div>';

        const linkFotoPerfil = c.fotoUrl 
            ? `<div style="background: #f1f5f9; padding: 6px 10px; border-radius: 6px; border: 1px dashed #cbd5e1; margin-bottom: 6px; font-size: 12px; display: flex; align-items: center; justify-content: space-between;">
                   <span style="color: #334155; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;">📷 Foto de Perfil</span>
                   <a href="${c.fotoUrl}" target="_blank" style="background:#8b5cf6; color:white; padding:3px 8px; text-decoration:none; border-radius:4px; font-size:11px; font-weight:500;">👁️ Ver Foto</a>
               </div>` 
            : '';

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
                    ${linkFotoPerfil}
                    
                    <!-- Opción para subir o reponer archivos directamente desde el panel -->
                    <div style="background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px dashed #cbd5e1; margin-top: 10px;">
                        <div style="font-size: 11px; font-weight: bold; color: #475569; margin-bottom: 5px;">🔄 Reponer / Subir Archivos:</div>
                        <input type="file" id="panelCv_${c.id}" accept=".pdf,.doc,.docx" style="font-size: 11px; margin-bottom: 4px; display:block;">
                        <input type="file" id="panelFoto_${c.id}" accept="image/*" style="font-size: 11px; margin-bottom: 6px; display:block;">
                        <button onclick="subirArchivosDesdePanel(${c.id})" style="background: #3b82f6; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; width: 100%;">Guardar Archivos Nuevos</button>
                    </div>
                </div>
            </div>
            <div style="background: #f8fafc; padding: 12px 20px; border-top: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 6px;">
                <button onclick='verCVATS(${JSON.stringify(c)})' style="background: #10b981; color: white; border: none; padding: 8px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; width: 100%;">📄 CV ATS Optimizado (Sin Foto)</button>
                <div style="display: flex; gap: 6px;">
                    <a href="/api/cv-empresa/${c.id}" target="_blank" style="background: #3b82f6; color: white; text-decoration: none; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; flex: 1; text-align: center;">🏢 CV Corporativo (Con Foto)</a>
                    <button onclick="eliminarCandidato(${c.id})" style="background: #ef4444; color: white; border: none; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer;">🗑️ Eliminar</button>
                </div>
            </div>
        </div>`;
    });

    html += '</div>';
    return html;
}

// Función auxiliar para procesar la subida directa de archivos desde el panel
async function subirArchivosDesdePanel(idCandidato) {
    const inputCv = document.getElementById(`panelCv_${idCandidato}`);
    const inputFoto = document.getElementById(`panelFoto_${idCandidato}`);
    
    const formData = new FormData();
    if (inputCv && inputCv.files[0]) formData.append('cvFile', inputCv.files[0]);
    if (inputFoto && inputFoto.files[0]) formData.append('fotoPerfil', inputFoto.files[0]);

    if ((!inputCv || !inputCv.files[0]) && (!inputFoto || !inputFoto.files[0])) {
        alert('Por favor selecciona al menos un archivo (CV o Foto) para subir.');
        return;
    }

    try {
        const res = await fetch(`/api/candidatos/actualizar-archivos/${idCandidato}`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            alert('¡Archivos actualizados correctamente en el legajo!');
            cargarCandidatos();
        } else {
            alert('Error al actualizar: ' + (data.error || 'Desconocido'));
        }
    } catch (e) {
        console.error(e);
        alert('Error de conexión con el servidor.');
    }
}

function renderizarSubcarpetasBusquedas() {
    let html = `
    <div style="background: white; border: 1px solid #cbd5e1; padding: 25px; border-radius: 12px; margin-bottom: 25px;">
        <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #1e293b;">📂 Subcarpetas de Búsquedas y Empresas Corporativas</h3>
        <p style="font-size: 14px; color: #64748b; margin-bottom: 20px;">Registra el nombre de la empresa y su vacante. Haz clic en <strong>"Evaluar Postulantes"</strong> para ordenar los perfiles según afinidad.</p>
        
        <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 25px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <input type="text" id="nuevaEmpresa" placeholder="🏢 Nombre de la Empresa..." style="flex: 1; min-width: 200px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
            <input type="text" id="nuevaBusquedaTitulo" placeholder="💼 Puesto..." style="flex: 1; min-width: 200px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
            <input type="text" id="nuevaBusquedaKeywords" placeholder="🔑 Keywords ATS..." style="flex: 2; min-width: 250px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
            <button onclick="agregarSubcarpetaBusqueda()" style="background: #27ae60; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px;">➕ Crear Subcarpeta</button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 15px;">`;

    carpetasBusquedas.forEach(b => {
        html += `
        <div style="background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; flex-direction: column; justify-content: space-between;">
            <div>
                <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 2px;">🏢 ${b.empresa || 'Empresa General'}</div>
                <div style="font-size: 16px; font-weight: bold; color: #0284c7; margin-bottom: 6px;">📂 Vacante: ${b.titulo}</div>
                <div style="font-size: 13px; color: #475569; margin-bottom: 12px;"><strong>Keywords ATS:</strong> ${b.keywords}</div>
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
    const empresaInput = document.getElementById('nuevaEmpresa');
    const tituloInput = document.getElementById('nuevaBusquedaTitulo');
    const keywordsInput = document.getElementById('nuevaBusquedaKeywords');
    
    if (!empresaInput.value || !tituloInput.value || !keywordsInput.value) {
        alert('Por favor completa todos los campos de la subcarpeta.');
        return;
    }

    carpetasBusquedas.push({
        id: Date.now(),
        empresa: empresaInput.value,
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
    todosLosCandidatos.filter(c => {
        const total = `${c.nombre} ${c.dni} ${c.puestoRequerido} ${c.habilidades}`.toLowerCase();
        return total.includes(textoBajo);
    });
    renderizarExploradorCarpetas();
}

function verCVATS(c) {
    const habilidadesFinales = c.habilidades || 'Administración • Gestión • Trabajo en Equipo';
    let experienciaFinal = c.experiencia || c.textoExtraidoCV || '';

    const ventanaATS = window.open('', '_blank');
    ventanaATS.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>CV ATS Optimizado - ${c.nombre}</title>
            <style>
                body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #000; max-width: 800px; margin: 40px auto; padding: 20px; }
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
            <h1>${c.nombre}</h1>
            <div class="contacto">
                ${c.direccion || ''} | Tel: ${c.telefono || ''} | Email: ${c.email || ''} | DNI: ${c.dni || ''}
                ${c.puestoRequerido ? `<br><strong>Objetivo / Puesto:</strong> ${c.puestoRequerido}` : ''}
                <br><strong>Disponibilidad:</strong> ${c.disponibilidad || 'Inmediata'}
            </div>

            <h2>Resumen Profesional</h2>
            <p>${c.resumen || 'No especificado.'}</p>

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

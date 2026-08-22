// Lógica para el envío del formulario de postulación limpio
const formPostulacion = document.getElementById('formPostulacion');
if (formPostulacion) {
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

        const cartaFile = document.getElementById('cartaRecomendacion').files[0];
        if (cartaFile) {
            formData.append('cartaRecomendacion', cartaFile);
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

                const mensajeConFoto = encodeURIComponent(`Hola, soy ${nombrePostulante}. Quiero descargar mi CV con foto ($6.000).`);
                const mensajeSinFoto = encodeURIComponent(`Hola, soy ${nombrePostulante}. Quiero descargar mi CV sin foto ($5.000).`);
                const mensajeAmbos = encodeURIComponent(`Hola, soy ${nombrePostulante}. Quiero descargar ambos formatos de mi CV con y sin foto ($6.500).`);

                const btnConFoto = document.getElementById('linkCvConFoto');
                const btnSinFoto = document.getElementById('linkCvSinFoto');
                const btnAmbos = document.getElementById('linkCvAmbos');

                if (btnConFoto) btnConFoto.href = `https://wa.me/${telefonoWhatsApp}?text=${mensajeConFoto}`;
                if (btnSinFoto) btnSinFoto.href = `https://wa.me/${telefonoWhatsApp}?text=${mensajeSinFoto}`;
                if (btnAmbos) btnAmbos.href = `https://wa.me/${telefonoWhatsApp}?text=${mensajeAmbos}`;

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

// Variables globales del panel (Carga persistente desde localStorage)
let todosLosCandidatos = [];
let carpetasBusquedas = JSON.parse(localStorage.getItem('carpetasBusquedas_tdf')) || [];
let directorioActual = 'postulantes';
let busquedaSeleccionadaFiltro = '';

const listaCandidatosDiv = document.getElementById('listaCandidatos');

if (listaCandidatosDiv) {
    async function cargarCandidatos() {
        try {
            listaCandidatosDiv.innerHTML = '<p style="text-align:center; padding: 20px; color:#64748b;">Cargando directorios del servidor...</p>';
            
            const res = await fetch('/api/candidatos', { credentials: 'include' });
            
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
        if (c.fotoData) {
            avatarHtml = `<img src="/api/foto/${c.id}" alt="Foto" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid #3498db;">`;
        }

        const nombreArchivoCV = c.nombreArchivoCV || 'Documento CV';
        const linkCvOriginal = c.cvData 
            ? `<div style="background: #f1f5f9; padding: 6px 10px; border-radius: 6px; border: 1px dashed #cbd5e1; margin-bottom: 6px; font-size: 12px; display: flex; align-items: center; justify-content: space-between;">
                   <span style="color: #334155; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;" title="${nombreArchivoCV}">📄 ${nombreArchivoCV}</span>
                   <a href="/api/descargar-cv/${c.id}" style="background:#0284c7; color:white; padding:3px 8px; text-decoration:none; border-radius:4px; font-size:11px; font-weight:500;">📥 Descargar</a>
               </div>` 
            : '<div style="font-size: 12px; color: #94a3b8; margin-bottom: 6px;">📂 Sin archivo de CV</div>';

        const linkCarta = c.cartaData 
            ? `<div style="background: #f1f5f9; padding: 6px 10px; border-radius: 6px; border: 1px dashed #cbd5e1; margin-bottom: 6px; font-size: 12px; display: flex; align-items: center; justify-content: space-between;">
                   <span style="color: #334155; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;" title="${c.nombreArchivoCarta}">📜 Carta de Recomendación</span>
                   <a href="/api/descargar-carta/${c.id}" style="background:#10b981; color:white; padding:3px 8px; text-decoration:none; border-radius:4px; font-size:11px; font-weight:500;">📥 Descargar</a>
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
                    ${linkCarta}
                    
                    <button onclick='abrirModalEdicion(${JSON.stringify(c)})' style="background: #f59e0b; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; width: 100%; margin-top: 6px;">✏️ Editar Datos del Candidato</button>
                    
                    <div style="background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px dashed #cbd5e1; margin-top: 10px;">
                        <div style="font-size: 11px; font-weight: bold; color: #475569; margin-bottom: 5px;">🔄 Reponer / Subir Archivos:</div>
                        <input type="file" id="panelCv_${c.id}" accept=".pdf,.doc,.docx" style="font-size: 11px; margin-bottom: 4px; display:block;" title="CV">
                        <input type="file" id="panelFoto_${c.id}" accept="image/*" style="font-size: 11px; margin-bottom: 4px; display:block;" title="Foto">
                        <input type="file" id="panelCarta_${c.id}" accept=".pdf,.doc,.docx,image/*" style="font-size: 11px; margin-bottom: 6px; display:block;" title="Carta">
                        <button onclick="subirArchivosDesdePanel(${c.id})" style="background: #3b82f6; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; width: 100%;">Guardar Archivos Nuevos</button>
                    </div>
                </div>
            </div>
            <div style="background: #f8fafc; padding: 12px 20px; border-top: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 6px;">
                <button onclick='verCVATS(${JSON.stringify(c)})' style="background: #10b981; color: white; border: none; padding: 8px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; width: 100%;">📄 CV ATS Optimizado (Sin Foto)</button>
                <div style="display: flex; gap: 6px;">
                    <a href="/api/cv-empresa/${c.id}" target="_blank" style="background: #3b82f6; color: white; text-decoration: none; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; flex: 1; text-align: center;">🏢 CV Corporativo</a>
                    <button onclick="eliminarCandidato(${c.id})" style="background: #ef4444; color: white; border: none; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer;">🗑️</button>
                </div>
            </div>
        </div>`;
    });

    html += '</div>';
    return html;
}

function abrirModalEdicion(c) {
    let modalExistente = document.getElementById('modalEdicionCandidato');
    if (modalExistente) modalExistente.remove();

    const modalHtml = `
    <div id="modalEdicionCandidato" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px;">
        <div style="background: white; width: 100%; max-width: 650px; border-radius: 12px; padding: 25px; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
            <h2 style="margin-top:0; color:#1e293b; font-size: 20px;">✏️ Editar Legajo de ${c.nombre}</h2>
            <form id="formEditarCandidato" onsubmit="guardarEdicionCandidato(event, ${c.id})">
                <div style="margin-bottom: 12px;">
                    <label style="font-size: 12px; font-weight: bold; color: #475569;">Puesto Requerido:</label>
                    <input type="text" id="editPuesto" value="${c.puestoRequerido || ''}" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                    <div style="flex: 1;">
                        <label style="font-size: 12px; font-weight: bold; color: #475569;">Nombre Completo:</label>
                        <input type="text" id="editNombre" value="${c.nombre || ''}" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
                    </div>
                    <div style="flex: 1;">
                        <label style="font-size: 12px; font-weight: bold; color: #475569;">DNI:</label>
                        <input type="text" id="editDni" value="${c.dni || ''}" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
                    </div>
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                    <div style="flex: 1;">
                        <label style="font-size: 12px; font-weight: bold; color: #475569;">Email:</label>
                        <input type="email" id="editEmail" value="${c.email || ''}" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
                    </div>
                    <div style="flex: 1;">
                        <label style="font-size: 12px; font-weight: bold; color: #475569;">Teléfono:</label>
                        <input type="text" id="editTelefono" value="${c.telefono || ''}" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
                    </div>
                </div>
                <div style="margin-bottom: 12px;">
                    <label style="font-size: 12px; font-weight: bold; color: #475569;">Resumen Profesional:</label>
                    <textarea id="editResumen" rows="3" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">${c.resumen || ''}</textarea>
                </div>
                <div style="margin-bottom: 12px;">
                    <label style="font-size: 12px; font-weight: bold; color: #475569;">Experiencia Laboral:</label>
                    <textarea id="editExperiencia" rows="5" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">${c.experiencia || ''}</textarea>
                </div>
                <div style="margin-bottom: 12px;">
                    <label style="font-size: 12px; font-weight: bold; color: #475569;">Estudios y Formación:</label>
                    <textarea id="editEstudios" rows="3" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">${c.estudios || ''}</textarea>
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="font-size: 12px; font-weight: bold; color: #475569;">Habilidades:</label>
                    <input type="text" id="editHabilidades" value="${c.habilidades || ''}" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
                </div>
                
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button type="button" onclick="document.getElementById('modalEdicionCandidato').remove()" style="background: #cbd5e1; color: #334155; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; cursor: pointer;">Cancelar</button>
                    <button type="submit" style="background: #0284c7; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer;">💾 Guardar Cambios</button>
                </div>
            </form>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function guardarEdicionCandidato(event, idCandidato) {
    event.preventDefault();
    const datosEditados = {
        puestoRequerido: document.getElementById('editPuesto').value,
        nombre: document.getElementById('editNombre').value,
        dni: document.getElementById('editDni').value,
        email: document.getElementById('editEmail').value,
        telefono: document.getElementById('editTelefono').value,
        resumen: document.getElementById('editResumen').value,
        experiencia: document.getElementById('editExperiencia').value,
        estudios: document.getElementById('editEstudios').value,
        habilidades: document.getElementById('editHabilidades').value
    };

    try {
        const res = await fetch(`/api/candidatos/editar/${idCandidato}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datosEditados),
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            alert('¡Legajo actualizado con éxito!');
            document.getElementById('modalEdicionCandidato').remove();
            location.reload();
        } else {
            alert('Error al actualizar.');
        }
    } catch (e) {
        alert('Error de conexión.');
    }
}

async function subirArchivosDesdePanel(idCandidato) {
    const inputCv = document.getElementById(`panelCv_${idCandidato}`);
    const inputFoto = document.getElementById(`panelFoto_${idCandidato}`);
    const inputCarta = document.getElementById(`panelCarta_${idCandidato}`);
    
    const formData = new FormData();
    if (inputCv && inputCv.files[0]) formData.append('cvFile', inputCv.files[0]);
    if (inputFoto && inputFoto.files[0]) formData.append('fotoPerfil', inputFoto.files[0]);
    if (inputCarta && inputCarta.files[0]) formData.append('cartaRecomendacion', inputCarta.files[0]);

    if ((!inputCv || !inputCv.files[0]) && (!inputFoto || !inputFoto.files[0]) && (!inputCarta || !inputCarta.files[0])) {
        alert('Selecciona al menos un archivo para subir.');
        return;
    }

    try {
        const res = await fetch(`/api/candidatos/actualizar-archivos/${idCandidato}`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            alert('¡Archivos actualizados con éxito!');
            location.reload();
        } else {
            alert('Error al actualizar.');
        }
    } catch (e) {
        alert('Error de conexión.');
    }
}

function renderizarSubcarpetasBusquedas() {
    let html = `
    <div style="background: white; border: 1px solid #cbd5e1; padding: 25px; border-radius: 12px; margin-bottom: 25px;">
        <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #1e293b;">📂 Subcarpetas de Búsquedas y Empresas Corporativas</h3>
        <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 25px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <input type="text" id="nuevaEmpresa" placeholder="🏢 Empresa..." style="flex: 1; min-width: 200px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
            <input type="text" id="nuevaBusquedaTitulo" placeholder="💼 Puesto..." style="flex: 1; min-width: 200px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
            <input type="text" id="nuevaBusquedaKeywords" placeholder="🔑 Keywords ATS..." style="flex: 2; min-width: 250px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
            <button onclick="agregarSubcarpetaBusqueda()" style="background: #27ae60; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer;">➕ Crear Subcarpeta</button>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 15px;">`;

    carpetasBusquedas.forEach(b => {
        html += `
        <div style="background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px 20px; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
                <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;">🏢 ${b.empresa || 'Empresa'}</div>
                <div style="font-size: 16px; font-weight: bold; color: #0284c7; margin-bottom: 6px;">📂 ${b.titulo}</div>
                <div style="font-size: 13px; color: #475569; margin-bottom: 12px;"><strong>Keywords:</strong> ${b.keywords}</div>
            </div>
            <div style="display: flex; gap: 8px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
                <button onclick="evaluarSubcarpetaBusqueda('${b.keywords}')" style="background: #0284c7; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; flex: 1;">🔍 Evaluar</button>
                <button onclick="eliminarSubcarpetaBusqueda(${b.id})" style="background: #fee2e2; color: #dc2626; border: none; padding: 6px 10px; border-radius: 6px; font-weight: 600; cursor: pointer;">🗑️</button>
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
    if (!empresaInput.value || !tituloInput.value || !keywordsInput.value) return alert('Completa todos los campos.');

    carpetasBusquedas.push({ id: Date.now(), empresa: empresaInput.value, titulo: tituloInput.value, keywords: keywordsInput.value });
    localStorage.setItem('carpetasBusquedas_tdf', JSON.stringify(carpetasBusquedas));
    renderizarExploradorCarpetas();
}

function eliminarSubcarpetaBusqueda(id) {
    carpetasBusquedas = carpetasBusquedas.filter(b => b.id !== id);
    localStorage.setItem('carpetasBusquedas_tdf', JSON.stringify(carpetasBusquedas));
    renderizarExploradorCarpetas();
}

function evaluarSubcarpetaBusqueda(keywords) {
    busquedaSeleccionadaFiltro = keywords;
    directorioActual = 'postulantes';
    renderizarExploradorCarpetas();
}

function filtrarSubcarpetas(texto) {
    renderizarExploradorCarpetas();
}

function verCVATS(c) {
    const habilidadesFinales = c.habilidades || 'Administración • Gestión • Trabajo en Equipo';
    let experienciaFinal = c.experiencia || '';

    const ventanaATS = window.open('', '_blank');
    ventanaATS.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>CV ATS Optimizado - ${c.nombre}</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #000; max-width: 800px; margin: 40px auto; padding: 20px; }
                h1 { font-size: 22px; text-transform: uppercase; margin: 0; text-align: center; }
                .contacto { text-align: center; font-size: 14px; margin-bottom: 25px; color: #333; }
                h2 { font-size: 15px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 2px; margin-top: 25px; margin-bottom: 8px; }
                p { font-size: 14px; text-align: justify; margin: 0 0 10px 0; }
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
            <p style="white-space: pre-line;">${c.estudios || 'No especificados'}</p>
            <h2>Habilidades y Competencias Clave</h2>
            <p style="font-weight: bold;">${habilidadesFinales}</p>
            <button class="btn-imprimir" onclick="window.print()">🖨️ Imprimir / Guardar como PDF ATS</button>
        </body>
        </html>
    `);
    ventanaATS.document.close();
}

async function eliminarCandidato(id) {
    if (!confirm('¿Estás seguro de eliminar este legajo?')) return;
    try {
        const res = await fetch(`/api/candidatos/${id}`, { method: 'DELETE', credentials: 'include' });
        const data = await res.json();
        if (data.success) location.reload();
        else alert('No se pudo eliminar.');
    } catch (e) {
        alert('Error de conexión.');
    }
}

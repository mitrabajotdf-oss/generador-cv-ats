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
                const baseWa = ['https:', '', 'wa.me', telefonoWhatsApp].join('/');

                const mensajeConFoto = encodeURIComponent(`Hola, soy ${nombrePostulante}. Quiero descargar mi CV con foto ($6.000).`);
                const mensajeSinFoto = encodeURIComponent(`Hola, soy ${nombrePostulante}. Quiero descargar mi CV sin foto ($5.000).`);
                const mensajeAmbos = encodeURIComponent(`Hola, soy ${nombrePostulante}. Quiero descargar ambos formatos de mi CV con y sin foto ($6.500).`);

                const btnConFoto = document.getElementById('linkCvConFoto');
                const btnSinFoto = document.getElementById('linkCvSinFoto');
                const btnAmbos = document.getElementById('linkCvAmbos');

                if (btnConFoto) btnConFoto.href = `${baseWa}?text=${mensajeConFoto}`;
                if (btnSinFoto) btnSinFoto.href = `${baseWa}?text=${mensajeSinFoto}`;
                if (btnAmbos) btnAmbos.href = `${baseWa}?text=${mensajeAmbos}`;

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

// Variables globales del panel (Sincronizadas con MongoDB)
let todosLosCandidatos = [];
let carpetasBusquedas = [];
let empresasCreadasManualmente = JSON.parse(localStorage.getItem('empresasCarpetas_tdf') || '[]');
let directorioActual = 'postulantes';
let empresaCarpetaAbierta = '';       // Nivel 1: Empresa seleccionada (ej: "TANTE SARA")
let subcarpetaPuestoAbiertaId = null; // Nivel 2: Subcarpeta de puesto abierta (ej: "Pastelero")
let busquedaSeleccionadaFiltro = '';
let tituloVacanteFiltro = '';
let textoBuscadorRapido = '';

const listaCandidatosDiv = document.getElementById('listaCandidatos');

function normalizarTextoATS(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

if (listaCandidatosDiv) {
    async function inicializarPanel() {
        try {
            listaCandidatosDiv.innerHTML = '<p style="text-align:center; padding: 20px; color:#64748b;">Cargando directorios y vacantes desde MongoDB...</p>';

            const [resCand, resBusq] = await Promise.all([
                fetch('/api/candidatos', { credentials: 'include' }),
                fetch('/api/busquedas', { credentials: 'include' })
            ]);

            if (!resCand.ok) throw new Error(`Error HTTP: ${resCand.status}`);

            const dataCand = await resCand.json();
            if (dataCand.success && dataCand.candidatos) {
                todosLosCandidatos = dataCand.candidatos.map(c => ({ ...c, porcentaje: 0, coincidenciasATS: [], faltantesATS: [] }));
            }

            if (resBusq.ok) {
                const dataBusq = await resBusq.json();
                if (dataBusq.success && Array.isArray(dataBusq.busquedas)) {
                    carpetasBusquedas = dataBusq.busquedas;
                }
            }

            renderizarExploradorCarpetas();

            const inputsSuperiores = document.querySelectorAll('input[type="text"]');
            inputsSuperiores.forEach(inp => {
                if (inp.placeholder && inp.placeholder.includes('Buscar por nombre, DNI')) {
                    inp.addEventListener('input', (e) => {
                        textoBuscadorRapido = e.target.value;
                        if (directorioActual !== 'postulantes') directorioActual = 'postulantes';
                        renderizarListaTarjetasPostulantes();
                    });
                }
            });
        } catch (e) {
            console.error('Error al cargar datos:', e);
            listaCandidatosDiv.innerHTML = '<p style="text-align: center; color: red; padding: 20px;">⚠️ Error al conectar con el servidor.</p>';
        }
    }

    inicializarPanel();
}

function evaluarAfinidadDetallada(candidato, textoBusqueda) {
    if (!textoBusqueda) return { porcentaje: 0, coincidencias: [], faltantes: [] };

    const terminosCrudos = textoBusqueda
        .split(/[\s,]+/)
        .map(t => t.trim())
        .filter(p => p.length > 1);

    if (terminosCrudos.length === 0) return { porcentaje: 0, coincidencias: [], faltantes: [] };

    const palabrasPositivas = terminosCrudos.filter(p => !p.startsWith('-'));
    const palabrasNegativas = terminosCrudos.filter(p => p.startsWith('-')).map(p => p.substring(1));

    const textoCompletoNormalizado = normalizarTextoATS(`
        ${candidato.nombre || ''}
        ${candidato.dni || ''}
        ${candidato.empresa || ''}
        ${candidato.puestoRequerido || ''}
        ${candidato.direccion || ''}
        ${candidato.disponibilidad || ''}
        ${candidato.datosPersonalesExtra || ''}
        ${candidato.habilidades || ''}
        ${candidato.habilidadesDuras || ''}
        ${candidato.habilidadesBlandas || ''}
        ${candidato.resumen || ''}
        ${candidato.experiencia || ''}
        ${candidato.estudios || ''}
        ${candidato.textoExtraidoCV || ''}
    `);

    for (let neg of palabrasNegativas) {
        const negLimpia = normalizarTextoATS(neg.replace(/_/g, ' '));
        if (negLimpia.length > 1 && textoCompletoNormalizado.includes(negLimpia)) {
            return { porcentaje: -1, coincidencias: [], faltantes: [] };
        }
    }

    if (palabrasPositivas.length === 0) return { porcentaje: 100, coincidencias: [], faltantes: [] };

    const coincidencias = [];
    const faltantes = [];

    palabrasPositivas.forEach(terminoOriginal => {
        const fraseNormalizada = normalizarTextoATS(terminoOriginal.replace(/_/g, ' '));
        const etiquetaMostrar = terminoOriginal.replace(/_/g, ' ');

        let coincide = textoCompletoNormalizado.includes(fraseNormalizada);

        if (!coincide && fraseNormalizada.length >= 6 && !fraseNormalizada.includes(' ')) {
            const raiz = fraseNormalizada.substring(0, fraseNormalizada.length - 2);
            if (raiz.length >= 5 && textoCompletoNormalizado.includes(raiz)) {
                coincide = true;
            }
        }

        if (coincide) {
            coincidencias.push(etiquetaMostrar);
        } else {
            faltantes.push(etiquetaMostrar);
        }
    });

    const porcentaje = Math.min(Math.round((coincidencias.length / palabrasPositivas.length) * 100), 100);
    return { porcentaje, coincidencias, faltantes };
}

function obtenerListaEmpresasUnicas() {
    const setEmpresas = new Set();
    empresasCreadasManualmente.forEach(e => {
        if (e && e.trim()) setEmpresas.add(e.trim().toUpperCase());
    });
    carpetasBusquedas.forEach(b => {
        if (b.empresa && b.empresa.trim()) setEmpresas.add(b.empresa.trim().toUpperCase());
    });
    return Array.from(setEmpresas);
}

function renderizarExploradorCarpetas() {
    if (!listaCandidatosDiv) return;

    const totalEmpresas = obtenerListaEmpresasUnicas().length;

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
                <div style="font-size: 13px; color: #64748b;">${totalEmpresas} Empresas • ${carpetasBusquedas.length} Subcarpetas de puestos</div>
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
    renderizarExploradorCarpetas();
}

async function optimizarUnLegajoIA(idCandidato, botonElemento) {
    const textoOriginal = botonElemento ? botonElemento.textContent : '';
    if (botonElemento) {
        botonElemento.disabled = true;
        botonElemento.textContent = '⏳ Leyendo PDF con IA...';
    }
    try {
        const res = await fetch(`/api/candidatos/optimizar-ia/${idCandidato}`, {
            method: 'POST',
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            alert(`✅ ¡El CV ATS de ${data.nombre} fue optimizado con éxito leyendo su PDF y anexos!`);
            location.reload();
        } else {
            alert('⚠️ No se pudo optimizar este legajo: ' + (data.error || 'Error desconocido'));
            if (botonElemento) {
                botonElemento.disabled = false;
                botonElemento.textContent = textoOriginal;
            }
        }
    } catch (e) {
        alert('Error de conexión con el servidor.');
        if (botonElemento) {
            botonElemento.disabled = false;
            botonElemento.textContent = textoOriginal;
        }
    }
}

async function ejecutarMigracionIA() {
    if (!confirm(`¿Querés actualizar los ${todosLosCandidatos.length} legajos con la IA de Gemini? Verás el avance uno por uno en el botón superior y no se borrará ningún registro.`)) return;

    const btn = document.getElementById('btnMigrarTodosIA');
    if (btn) btn.disabled = true;

    let exitosos = 0;
    let errores = 0;

    for (let i = 0; i < todosLosCandidatos.length; i++) {
        const cand = todosLosCandidatos[i];
        if (!cand.cvData && !cand.cartaData) continue;

        if (btn) {
            btn.textContent = `⏳ Procesando (${i + 1}/${todosLosCandidatos.length}): ${cand.nombre}...`;
        }

        try {
            const res = await fetch(`/api/candidatos/optimizar-ia/${cand.id}`, {
                method: 'POST',
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                exitosos++;
            } else {
                errores++;
            }
        } catch (err) {
            errores++;
        }

        await new Promise(r => setTimeout(r, 3000));
    }

    alert(`🎉 ¡Proceso completado!\n✅ Legajos actualizados: ${exitosos}\n${errores > 0 ? `⚠️ Con demora: ${errores} (podés tocar el botón ⚡ individual en su tarjeta)` : ''}`);
    location.reload();
}

function obtenerCandidatosFiltradosActuales() {
    let listaFiltrada = todosLosCandidatos;

    if (busquedaSeleccionadaFiltro) {
        listaFiltrada = listaFiltrada.map(c => {
            const evalATS = evaluarAfinidadDetallada(c, busquedaSeleccionadaFiltro);
            return {
                ...c,
                porcentaje: evalATS.porcentaje,
                coincidenciasATS: evalATS.coincidencias,
                faltantesATS: evalATS.faltantes
            };
        }).filter(c => c.porcentaje > 0);

        listaFiltrada.sort((a, b) => b.porcentaje - a.porcentaje);
    }

    if (textoBuscadorRapido && textoBuscadorRapido.trim() !== '') {
        const q = normalizarTextoATS(textoBuscadorRapido);
        listaFiltrada = listaFiltrada.filter(c => {
            const blob = normalizarTextoATS(`${c.nombre} ${c.dni} ${c.puestoRequerido} ${c.empresa} ${c.direccion} ${c.telefono} ${c.email} ${c.habilidades} ${c.experiencia} ${c.estudios}`);
            return blob.includes(q);
        });
    }

    return listaFiltrada;
}

function construirGrillaTarjetasHTML(listaFiltrada) {
    if (listaFiltrada.length === 0) {
        return '<p style="text-align: center; padding: 30px; color: #64748b; background: white; border-radius: 10px; border: 1px solid #e2e8f0;">No se encontraron postulantes que coincidan con los criterios actuales.</p>';
    }

    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 20px;">';

    listaFiltrada.forEach(c => {
        let badgeColor = '#64748b';
        if (c.porcentaje >= 75) badgeColor = '#16a34a';
        else if (c.porcentaje >= 40) badgeColor = '#d97706';

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

        const linkFotoOriginal = c.fotoData
            ? `<div style="background: #f1f5f9; padding: 6px 10px; border-radius: 6px; border: 1px dashed #cbd5e1; margin-bottom: 6px; font-size: 12px; display: flex; align-items: center; justify-content: space-between;">
                   <span style="color: #334155; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;">📷 Foto de Perfil</span>
                   <a href="/api/descargar-foto/${c.id}" style="background:#8b5cf6; color:white; padding:3px 8px; text-decoration:none; border-radius:4px; font-size:11px; font-weight:500;">📥 Descargar</a>
               </div>`
            : '';

        const linkCarta = c.cartaData 
            ? `<div style="background: #f1f5f9; padding: 6px 10px; border-radius: 6px; border: 1px dashed #cbd5e1; margin-bottom: 6px; font-size: 12px; display: flex; align-items: center; justify-content: space-between;">
                   <span style="color: #334155; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;" title="${c.nombreArchivoCarta}">📜 Carta de Recomendación</span>
                   <a href="/api/descargar-carta/${c.id}" style="background:#10b981; color:white; padding:3px 8px; text-decoration:none; border-radius:4px; font-size:11px; font-weight:500;">📥 Descargar</a>
               </div>` 
            : '';

        let bloqueAfinidadHTML = '';
        if (busquedaSeleccionadaFiltro) {
            const tagsCoincide = (c.coincidenciasATS || []).map(k => `<span style="background:#dcfce7; color:#166534; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;">✓ ${k}</span>`).join(' ');
            const tagsFalta = (c.faltantesATS || []).map(k => `<span style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-size:11px;">✗ ${k}</span>`).join(' ');

            bloqueAfinidadHTML = `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                    <span style="font-size: 12px; font-weight: 700; color: #334155;">🎯 Afinidad ATS:</span>
                    <span style="background:${badgeColor}; color:white; padding:2px 10px; border-radius:12px; font-weight:bold; font-size:12px;">${c.porcentaje}%</span>
                </div>
                ${tagsCoincide ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px;">${tagsCoincide}</div>` : ''}
                ${tagsFalta ? `<div style="display:flex; flex-wrap:wrap; gap:4px;">${tagsFalta}</div>` : ''}
            </div>`;
        }

        html += `
        <div style="background: white; border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.03); overflow: hidden; display: flex; flex-direction: column; justify-content: space-between;">
            <div style="background: #f8fafc; padding: 15px 20px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 15px;">
                ${avatarHtml}
                <div style="overflow: hidden;">
                    <div style="font-size: 11px; font-weight: 700; color: #0284c7; text-transform: uppercase; margin-bottom: 2px;">🏢 EMPRESA: ${c.empresa || 'Base de Datos General'}</div>
                    <div style="font-size: 15px; font-weight: bold; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${c.nombre}">${c.nombre}</div>
                    <div style="font-size: 11px; color: #64748b;">DNI: ${c.dni || 'S/D'}</div>
                </div>
            </div>
            <div style="padding: 15px 20px; flex-grow: 1;">
                <div style="font-size: 13px; color: #334155; margin-bottom: 8px;">
                    <strong>📌 Vacante:</strong> ${c.puestoRequerido || 'Postulación Espontánea'}<br>
                    <strong>📍 Dirección:</strong> ${c.direccion || 'No especificada'}<br>
                    <strong>📧 Email:</strong> ${c.email || 'No cargado'}<br>
                    <strong>📞 Tel:</strong> ${c.telefono || 'No cargado'}<br>
                    <strong>📅 Postulación:</strong> ${c.fecha}
                </div>
                ${bloqueAfinidadHTML}
                
                <div style="margin-top: 10px;">
                    <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Archivos en Subcarpeta:</div>
                    ${linkCvOriginal}
                    ${linkFotoOriginal}
                    ${linkCarta}
                    
                    <div style="display: flex; gap: 6px; margin-top: 6px;">
                        <button onclick='abrirModalEdicion(${JSON.stringify(c)})' style="background: #f59e0b; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; flex: 1;">✏️ Editar Datos</button>
                        <button onclick="optimizarUnLegajoIA(${c.id}, this)" style="background: #8b5cf6; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; flex: 1;">⚡ Optimizar con IA</button>
                    </div>
                    
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

function renderizarSubcarpetasPostulantes() {
    const listaFiltrada = obtenerCandidatosFiltradosActuales();

    let html = `
    <div style="background: white; border: 1px solid #cbd5e1; padding: 15px 20px; border-radius: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
        <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 250px;">
            <input type="text" id="buscadorGeneral" value="${textoBuscadorRapido}" placeholder="🔍 Buscar legajo por nombre, DNI, vacante o palabra clave..." oninput="filtrarSubcarpetas(this.value)" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; outline: none;">
        </div>
        <button id="btnMigrarTodosIA" onclick="ejecutarMigracionIA()" style="background: #8b5cf6; color: white; border: none; padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">🤖 Actualizar todos los legajos con IA</button>
        ${busquedaSeleccionadaFiltro ? `
        <div style="background: #e0f2fe; color: #0369a1; padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; width: 100%; justify-content: space-between; flex-wrap: wrap;">
            <span>🎯 <strong>Subcarpeta activa:</strong> ${tituloVacanteFiltro ? tituloVacanteFiltro + ' — ' : ''}Keywords: "${busquedaSeleccionadaFiltro}" (${listaFiltrada.length} candidatos compatibles)</span>
            <div style="display: flex; gap: 8px;">
                <button onclick="volverASubcarpetaVacante()" style="background:#0284c7; color:white; border:none; padding:5px 12px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">📂 Volver a la Subcarpeta</button>
                <button onclick="limpiarFiltroVacante()" style="background:#ef4444; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">✕ Quitar filtro</button>
            </div>
        </div>` : ''}
    </div>
    <div id="contenedorGrillaTarjetas">
        ${construirGrillaTarjetasHTML(listaFiltrada)}
    </div>`;

    return html;
}

function volverASubcarpetaVacante() {
    directorioActual = 'busquedas';
    renderizarExploradorCarpetas();
}

function limpiarFiltroVacante() {
    busquedaSeleccionadaFiltro = '';
    tituloVacanteFiltro = '';
    renderizarExploradorCarpetas();
}

function renderizarListaTarjetasPostulantes() {
    const contenedor = document.getElementById('contenedorGrillaTarjetas');
    if (contenedor) {
        const listaFiltrada = obtenerCandidatosFiltradosActuales();
        contenedor.innerHTML = construirGrillaTarjetasHTML(listaFiltrada);
    } else {
        renderizarExploradorCarpetas();
    }
}

function filtrarSubcarpetas(texto) {
    textoBuscadorRapido = texto;
    renderizarListaTarjetasPostulantes();
}

function abrirModalEdicion(c) {
    let modalExistente = document.getElementById('modalEdicionCandidato');
    if (modalExistente) modalExistente.remove();

    const modalHtml = `
    <div id="modalEdicionCandidato" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px;">
        <div style="background: white; width: 100%; max-width: 650px; border-radius: 12px; padding: 25px; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
            <h2 style="margin-top:0; color:#1e293b; font-size: 20px;">✏️ Editar Legajo de ${c.nombre}</h2>
            <form id="formEditarCandidato" onsubmit="guardarEdicionCandidato(event, ${c.id})">
                <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                    <div style="flex: 1;">
                        <label style="font-size: 12px; font-weight: bold; color: #475569;">Empresa a la que postula:</label>
                        <input type="text" id="editEmpresa" value="${c.empresa || 'Base de Datos General'}" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
                    </div>
                    <div style="flex: 1;">
                        <label style="font-size: 12px; font-weight: bold; color: #475569;">Puesto Requerido / Vacante:</label>
                        <input type="text" id="editPuesto" value="${c.puestoRequerido || ''}" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
                    </div>
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
                    <label style="font-size: 12px; font-weight: bold; color: #475569;">Dirección / Localidad:</label>
                    <input type="text" id="editDireccion" value="${c.direccion || ''}" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;" placeholder="Ej: Calle 123, Río Grande">
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
        empresa: document.getElementById('editEmpresa').value,
        puestoRequerido: document.getElementById('editPuesto').value,
        nombre: document.getElementById('editNombre').value,
        dni: document.getElementById('editDni').value,
        email: document.getElementById('editEmail').value,
        telefono: document.getElementById('editTelefono').value,
        direccion: document.getElementById('editDireccion').value,
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

// ============================================================================
// 📂 EXPLORADOR JERÁRQUICO: 1) CARPETA EMPRESA -> 2) SUBCARPETA PUESTO -> 3) ARCHIVO/WHATSAPP/ATS
// ============================================================================
function renderizarSubcarpetasBusquedas() {
    const listaEmpresas = obtenerListaEmpresasUnicas();

    // Si había una empresa abierta pero ya no existe, volvemos a la raíz
    if (empresaCarpetaAbierta && !listaEmpresas.includes(empresaCarpetaAbierta.toUpperCase())) {
        empresaCarpetaAbierta = '';
        subcarpetaPuestoAbiertaId = null;
    }

    let html = `
    <div style="background: white; border: 1px solid #cbd5e1; padding: 25px; border-radius: 12px; margin-bottom: 25px;">
        <!-- Barra de navegación (Breadcrumbs) -->
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: bold; color: #1e293b; flex-wrap: wrap;">
                <span onclick="navegarRaizEmpresas()" style="cursor: pointer; color: ${empresaCarpetaAbierta ? '#0284c7' : '#1e293b'}; text-decoration: ${empresaCarpetaAbierta ? 'underline' : 'none'};">🏢 Directorio de Empresas</span>
                ${empresaCarpetaAbierta ? `<span>❯</span> <span onclick="abrirCarpetaEmpresa('${empresaCarpetaAbierta}')" style="cursor: pointer; color: ${subcarpetaPuestoAbiertaId ? '#0284c7' : '#1e293b'}; text-decoration: ${subcarpetaPuestoAbiertaId ? 'underline' : 'none'};">📁 ${empresaCarpetaAbierta}</span>` : ''}
                ${subcarpetaPuestoAbiertaId ? (() => {
                    const sub = carpetasBusquedas.find(x => x.id === subcarpetaPuestoAbiertaId);
                    return sub ? `<span>❯</span> <span style="color: #16a34a;">📂 ${sub.titulo}</span>` : '';
                })() : ''}
            </div>
            ${empresaCarpetaAbierta ? `<button onclick="${subcarpetaPuestoAbiertaId ? `abrirCarpetaEmpresa('${empresaCarpetaAbierta}')` : 'navegarRaizEmpresas()'}" style="background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">⬅ Volver atrás</button>` : ''}
        </div>`;

    // NIVEL 1: VISTA DE CARPETAS DE EMPRESAS (Ej: "TANTE SARA", "SANTISTA TEXTIL")
    if (!empresaCarpetaAbierta) {
        html += `
        <div style="background: #f8fafc; padding: 18px; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 25px; display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 250px;">
                <label style="font-size: 12px; font-weight: 700; color: #334155; text-transform: uppercase; display: block; margin-bottom: 6px;">🏢 Paso 1: Crear Nueva Carpeta de Empresa / Cliente:</label>
                <input type="text" id="inputNuevaCarpetaEmpresa" placeholder="Ej: Tante Sara, Santista Textil, Hotel Austral..." style="width: 100%; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px;">
            </div>
            <button onclick="crearCarpetaEmpresa()" style="background: #0284c7; color: white; border: none; padding: 11px 22px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 14px;">➕ Crear Carpeta de Empresa</button>
        </div>`;

        if (listaEmpresas.length === 0) {
            html += `<p style="text-align:center; padding: 35px; color:#64748b; background:#f8fafc; border-radius:10px; border:1px dashed #cbd5e1;">Todavía no hay empresas cargadas. Escribí el nombre de una empresa arriba (ej: <strong>Tante Sara</strong>) y hacé clic en <strong>"➕ Crear Carpeta de Empresa"</strong>.</p></div>`;
            return html;
        }

        html += `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px;">`;
        listaEmpresas.forEach(emp => {
            const subcarpetasDeEmpresa = carpetasBusquedas.filter(b => (b.empresa || '').trim().toUpperCase() === emp);
            html += `
            <div onclick='abrirCarpetaEmpresa(${JSON.stringify(emp)})' style="background: #ffffff; border: 2px solid #cbd5e1; border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 5px rgba(0,0,0,0.03);" onmouseover="this.style.borderColor='#0284c7'; this.style.background='#f0f9ff';" onmouseout="this.style.borderColor='#cbd5e1'; this.style.background='#ffffff';">
                <div style="display: flex; align-items: center; gap: 15px; overflow: hidden;">
                    <div style="font-size: 40px;">📁</div>
                    <div style="overflow: hidden;">
                        <div style="font-size: 16px; font-weight: 800; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${emp}</div>
                        <div style="font-size: 13px; color: #0284c7; font-weight: 600; margin-top: 3px;">${subcarpetasDeEmpresa.length} subcarpeta(s) de puestos</div>
                    </div>
                </div>
                <button onclick="event.stopPropagation(); eliminarCarpetaEmpresaCompleta(${JSON.stringify(emp)})" style="background: #fee2e2; color: #dc2626; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;" title="Eliminar carpeta de empresa">🗑️</button>
            </div>`;
        });
        html += `</div></div>`;
        return html;
    }

    // NIVEL 2: DENTRO DE LA CARPETA DE UNA EMPRESA (Ej: "TANTE SARA" -> Crear subcarpetas "Pastelero", "Jefe de Cocina")
    if (empresaCarpetaAbierta && !subcarpetaPuestoAbiertaId) {
        const subcarpetasDeEmpresa = carpetasBusquedas.filter(b => (b.empresa || '').trim().toUpperCase() === empresaCarpetaAbierta.toUpperCase());

        html += `
        <div style="background: #f0f9ff; padding: 18px; border-radius: 10px; border: 1px solid #bae6fd; margin-bottom: 25px; display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 250px;">
                <label style="font-size: 12px; font-weight: 700; color: #0369a1; text-transform: uppercase; display: block; margin-bottom: 6px;">📂 Paso 2: Crear Subcarpeta de Puesto dentro de "${empresaCarpetaAbierta}":</label>
                <input type="text" id="inputNuevaSubcarpetaPuesto" placeholder="Ej: Pastelero, Jefe de Cocina, Cajero, Operario..." style="width: 100%; padding: 10px 14px; border: 1px solid #7dd3fc; border-radius: 8px; font-size: 14px; background: white;">
            </div>
            <button onclick="crearSubcarpetaPuesto()" style="background: #0284c7; color: white; border: none; padding: 11px 22px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 14px;">➕ Crear Subcarpeta de Puesto</button>
        </div>`;

        if (subcarpetasDeEmpresa.length === 0) {
            html += `<p style="text-align:center; padding: 35px; color:#64748b; background:#f8fafc; border-radius:10px; border:1px dashed #cbd5e1;">La carpeta de <strong>${empresaCarpetaAbierta}</strong> está vacía. Creá arriba sus subcarpetas de puestos (ej: <strong>Pastelero</strong> o <strong>Jefe de Cocina</strong>) para cargarles su PDF, Flyer o pedido de WhatsApp.</p></div>`;
            return html;
        }

        html += `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 18px;">`;
        subcarpetasDeEmpresa.forEach(b => {
            const compatibles = b.keywords ? todosLosCandidatos.filter(c => evaluarAfinidadDetallada(c, b.keywords).porcentaje >= 40).length : 0;
            const tieneDoc = Boolean(b.archivoData);
            const tieneTexto = Boolean(b.textoAviso && b.textoAviso.trim());

            html += `
            <div style="background: #ffffff; border: 2px solid #e2e8f0; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 2px 5px rgba(0,0,0,0.03);">
                <div>
                    <div onclick="abrirSubcarpetaPuesto(${b.id})" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 30px;">📂</span>
                            <div>
                                <div style="font-size: 16px; font-weight: 800; color: #0284c7;">${b.titulo}</div>
                                <div style="font-size: 11px; color: #64748b;">Creada: ${b.fechaCreacion || 'Reciente'}</div>
                            </div>
                        </div>
                        <span style="background: ${b.keywords ? '#dcfce7' : '#f1f5f9'}; color: ${b.keywords ? '#166534' : '#64748b'}; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 10px;">
                            ${b.keywords ? `${compatibles} compatibles` : 'Sin requisitos aún'}
                        </span>
                    </div>

                    <div style="font-size: 12px; color: #475569; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 12px;">
                        <div style="margin-bottom: 4px;">📎 <strong>Archivo (PDF/Word/Flyer):</strong> ${tieneDoc ? `<span style="color:#16a34a; font-weight:600;">${b.nombreArchivo || 'Cargado'}</span>` : '<span style="color:#94a3b8;">No cargado</span>'}</div>
                        <div style="margin-bottom: 4px;">💬 <strong>Texto WhatsApp/Email:</strong> ${tieneTexto ? '<span style="color:#16a34a; font-weight:600;">Cargado</span>' : '<span style="color:#94a3b8;">No cargado</span>'}</div>
                        <div>🔑 <strong>Keywords ATS:</strong> ${b.keywords ? `<span style="color:#0f172a;">${b.keywords}</span>` : '<span style="color:#94a3b8;">Pendiente de cargar</span>'}</div>
                    </div>
                </div>

                <div style="display: flex; gap: 8px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
                    <button onclick="abrirSubcarpetaPuesto(${b.id})" style="background: #16a34a; color: white; border: none; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; flex: 1;">📂 Abrir / Cargar Aviso</button>
                    ${b.keywords ? `<button onclick='evaluarSubcarpetaBusqueda(${JSON.stringify(b.keywords)}, ${JSON.stringify(empresaCarpetaAbierta + " - " + b.titulo)})' style="background: #0284c7; color: white; border: none; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; flex: 1;">🔍 Filtrar CVs (${compatibles})</button>` : ''}
                    <button onclick="eliminarSubcarpetaBusqueda(${b.id})" style="background: #fee2e2; color: #dc2626; border: none; padding: 8px 10px; border-radius: 6px; font-weight: 600; cursor: pointer;" title="Eliminar subcarpeta">🗑️</button>
                </div>
            </div>`;
        });
        html += `</div></div>`;
        return html;
    }

    // NIVEL 3: DENTRO DE LA SUBCARPETA DEL PUESTO (Ej: "TANTE SARA" ❯ "Pastelero")
    const subActual = carpetasBusquedas.find(x => x.id === subcarpetaPuestoAbiertaId);
    if (!subActual) {
        subcarpetaPuestoAbiertaId = null;
        return renderizarSubcarpetasBusquedas();
    }

    const compatiblesAhora = subActual.keywords
        ? todosLosCandidatos.filter(c => evaluarAfinidadDetallada(c, subActual.keywords).porcentaje >= 40).length
        : 0;

    html += `
        <div style="background: #f8fafc; border: 2px solid #cbd5e1; border-radius: 12px; padding: 22px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 18px; border-bottom: 1px solid #cbd5e1; padding-bottom: 14px;">
                <div>
                    <div style="font-size: 12px; font-weight: 700; color: #0284c7; text-transform: uppercase;">🏢 EMPRESA: ${subActual.empresa}</div>
                    <h3 style="margin: 2px 0 0 0; font-size: 20px; color: #0f172a;">📂 Subcarpeta de Puesto: ${subActual.titulo}</h3>
                </div>
                ${subActual.keywords ? `
                <button onclick='evaluarSubcarpetaBusqueda(${JSON.stringify(subActual.keywords)}, ${JSON.stringify(subActual.empresa + " - " + subActual.titulo)})' style="background: #0284c7; color: white; border: none; padding: 10px 18px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: 0 2px 4px rgba(2,132,199,0.2);">
                    🔍 Ver Candidatos Compatibles (${compatiblesAhora})
                </button>` : ''}
            </div>

            <!-- Paso 3: Cargar PDF/Word/Flyer o WhatsApp dentro de esta subcarpeta -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px; margin-bottom: 18px;">
                <!-- Caja Archivo -->
                <div style="background: white; padding: 16px; border-radius: 10px; border: 1px solid #cbd5e1;">
                    <label style="font-size: 13px; font-weight: 700; color: #1e293b; display: block; margin-bottom: 8px;">
                        📎 1. Archivo del Puesto (PDF, Word o Flyer Imagen):
                    </label>
                    ${subActual.archivoData ? `
                        <div style="background: #f0fdf4; border: 1px dashed #86efac; padding: 10px 12px; border-radius: 8px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                            <span style="font-size: 12px; color: #166534; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">📄 ${subActual.nombreArchivo || 'Aviso adjunto'}</span>
                            <a href="/api/busquedas/archivo/${subActual.id}" target="_blank" style="background: #16a34a; color: white; text-decoration: none; padding: 4px 10px; border-radius: 5px; font-size: 11px; font-weight: 600;">👁️ Ver / Descargar</a>
                        </div>
                    ` : '<div style="font-size: 12px; color: #64748b; margin-bottom: 8px;">No hay archivo cargado todavía en esta subcarpeta.</div>'}
                    <input type="file" id="subArchivoIA" accept=".pdf,.doc,.docx,image/*" style="font-size: 12px; width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc;">
                </div>

                <!-- Caja Texto WhatsApp / Email -->
                <div style="background: white; padding: 16px; border-radius: 10px; border: 1px solid #cbd5e1;">
                    <label style="font-size: 13px; font-weight: 700; color: #1e293b; display: block; margin-bottom: 8px;">
                        💬 2. Texto del Pedido (WhatsApp / Email de ${subActual.empresa}):
                    </label>
                    <textarea id="subTextoAviso" rows="4" placeholder="Pegá acá el mensaje de WhatsApp o correo con los requisitos para ${subActual.titulo}..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; font-family: inherit;">${subActual.textoAviso || ''}</textarea>
                </div>
            </div>

            <!-- Botón Analizar con IA para esta subcarpeta -->
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 14px 18px; border-radius: 10px; margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                <div style="font-size: 13px; color: #166534;">
                    🤖 <strong>Auto-extraer Keywords con IA:</strong> Lee el PDF/Flyer o el texto de WhatsApp que subiste arriba y genera las palabras clave ATS para <strong>${subActual.titulo}</strong>.
                </div>
                <button onclick="extraerKeywordsDentroDeSubcarpeta(${subActual.id})" id="btnExtraerSubIA" style="background: #16a34a; color: white; border: none; padding: 9px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 13px; white-space: nowrap;">
                    ⚡ Extraer Keywords con IA
                </button>
            </div>

            <!-- Campo de Keywords ATS y Nombre del Puesto -->
            <div style="background: white; padding: 16px; border-radius: 10px; border: 1px solid #cbd5e1; margin-bottom: 18px;">
                <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px;">
                    <div style="flex: 1; min-width: 220px;">
                        <label style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;">💼 Nombre de la Subcarpeta / Puesto:</label>
                        <input type="text" id="subTituloInput" value="${subActual.titulo || ''}" style="width: 100%; padding: 9px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; margin-top: 4px;">
                    </div>
                    <div style="flex: 2; min-width: 280px;">
                        <label style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;">🔑 Keywords ATS del Puesto (separadas por espacio):</label>
                        <input type="text" id="subKeywordsInput" value="${subActual.keywords || ''}" placeholder="Ej: pastelero pasteleria reposteria panaderia horno manipulacion_de_alimentos" style="width: 100%; padding: 9px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; margin-top: 4px;">
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button onclick="guardarCambiosSubcarpeta(${subActual.id})" id="btnGuardarSub" style="background: #0284c7; color: white; border: none; padding: 10px 22px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 14px;">
                        💾 Guardar Archivo, Texto y Keywords en "${subActual.titulo}"
                    </button>
                </div>
            </div>
        </div>
    </div>`;

    return html;
}

// Funciones de navegación y creación de Carpetas y Subcarpetas
function navegarRaizEmpresas() {
    empresaCarpetaAbierta = '';
    subcarpetaPuestoAbiertaId = null;
    renderizarExploradorCarpetas();
}

function abrirCarpetaEmpresa(nombreEmpresa) {
    empresaCarpetaAbierta = nombreEmpresa.trim().toUpperCase();
    subcarpetaPuestoAbiertaId = null;
    renderizarExploradorCarpetas();
}

function abrirSubcarpetaPuesto(idSubcarpeta) {
    subcarpetaPuestoAbiertaId = Number(idSubcarpeta);
    renderizarExploradorCarpetas();
}

function crearCarpetaEmpresa() {
    const input = document.getElementById('inputNuevaCarpetaEmpresa');
    if (!input || !input.value.trim()) {
        return alert('⚠️ Escribí el nombre de la empresa primero (ej: Tante Sara).');
    }
    const nombre = input.value.trim().toUpperCase();
    if (!empresasCreadasManualmente.includes(nombre)) {
        empresasCreadasManualmente.push(nombre);
        localStorage.setItem('empresasCarpetas_tdf', JSON.stringify(empresasCreadasManualmente));
    }
    empresaCarpetaAbierta = nombre;
    subcarpetaPuestoAbiertaId = null;
    renderizarExploradorCarpetas();
}

async function crearSubcarpetaPuesto() {
    const input = document.getElementById('inputNuevaSubcarpetaPuesto');
    if (!input || !input.value.trim()) {
        return alert('⚠️ Escribí el nombre del puesto para crear la subcarpeta (ej: Pastelero o Jefe de Cocina).');
    }
    const tituloPuesto = input.value.trim();
    const keywordInicial = tituloPuesto.toLowerCase().replace(/\s+/g, '_');

    const formData = new FormData();
    formData.append('id', Date.now());
    formData.append('empresa', empresaCarpetaAbierta);
    formData.append('titulo', tituloPuesto);
    formData.append('keywords', keywordInicial);
    formData.append('textoAviso', '');

    try {
        const res = await fetch('/api/busquedas', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        const data = await res.json();
        if (data.success && data.busqueda) {
            carpetasBusquedas.unshift(data.busqueda);
            // Abrimos automáticamente la subcarpeta recién creada para que cargue el PDF/WhatsApp
            subcarpetaPuestoAbiertaId = data.busqueda.id;
            renderizarExploradorCarpetas();
        } else {
            alert('Error al crear la subcarpeta.');
        }
    } catch (e) {
        alert('Error de conexión con el servidor.');
    }
}

async function extraerKeywordsDentroDeSubcarpeta(idSubcarpeta) {
    const subActual = carpetasBusquedas.find(x => x.id === idSubcarpeta);
    if (!subActual) return;

    const fileInput = document.getElementById('subArchivoIA');
    const textoInput = document.getElementById('subTextoAviso');
    const tituloInput = document.getElementById('subTituloInput');

    const tieneArchivoNuevo = fileInput && fileInput.files && fileInput.files[0];
    const tieneTexto = textoInput && textoInput.value.trim().length > 0;

    if (!tieneArchivoNuevo && !tieneTexto) {
        return alert('⚠️ Seleccioná primero el archivo (PDF, Word o Imagen) o pegá el mensaje de WhatsApp/Email en la caja de texto.');
    }

    const btn = document.getElementById('btnExtraerSubIA');
    btn.disabled = true;
    btn.textContent = '⏳ Leyendo aviso con IA...';

    const formData = new FormData();
    if (tieneArchivoNuevo) formData.append('archivoRequisitos', fileInput.files[0]);
    if (tieneTexto) formData.append('textoRequisitos', textoInput.value.trim());
    formData.append('empresaContexto', subActual.empresa);
    formData.append('puestoContexto', tituloInput ? tituloInput.value.trim() : subActual.titulo);

    try {
        const res = await fetch('/api/analizar-requisitos', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success && data.datos) {
            if (data.datos.keywords) {
                document.getElementById('subKeywordsInput').value = data.datos.keywords;
            }
            if (data.datos.textoExtraido && (!textoInput.value || textoInput.value.trim().length < 10)) {
                textoInput.value = data.datos.textoExtraido;
            }
            // Guardamos automáticamente en MongoDB el archivo, texto y keywords extraídas
            await guardarCambiosSubcarpeta(idSubcarpeta, true);
            alert('✅ ¡Requisitos extraídos y guardados en la subcarpeta con éxito!');
        } else {
            alert('Error al analizar: ' + (data.error || 'Desconocido'));
        }
    } catch (e) {
        alert('Error de conexión al analizar.');
    }

    btn.disabled = false;
    btn.textContent = '⚡ Extraer Keywords con IA';
}

async function guardarCambiosSubcarpeta(idSubcarpeta, silencioso = false) {
    const fileInput = document.getElementById('subArchivoIA');
    const textoInput = document.getElementById('subTextoAviso');
    const tituloInput = document.getElementById('subTituloInput');
    const keywordsInput = document.getElementById('subKeywordsInput');

    const btn = document.getElementById('btnGuardarSub');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Guardando en MongoDB...';
    }

    const formData = new FormData();
    formData.append('empresa', empresaCarpetaAbierta);
    formData.append('titulo', tituloInput ? tituloInput.value.trim() : '');
    formData.append('keywords', keywordsInput ? keywordsInput.value.trim() : '');
    formData.append('textoAviso', textoInput ? textoInput.value.trim() : '');
    if (fileInput && fileInput.files && fileInput.files[0]) {
        formData.append('archivoAviso', fileInput.files[0]);
    }

    try {
        const res = await fetch(`/api/busquedas/editar/${idSubcarpeta}`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        const data = await res.json();
        if (data.success && data.busqueda) {
            const idx = carpetasBusquedas.findIndex(x => x.id === idSubcarpeta);
            if (idx !== -1) carpetasBusquedas[idx] = data.busqueda;
            if (!silencioso) alert('💾 ¡Subcarpeta guardada con éxito!');
            renderizarExploradorCarpetas();
        } else {
            if (!silencioso) alert('No se pudo guardar la subcarpeta.');
        }
    } catch (e) {
        if (!silencioso) alert('Error de conexión al guardar.');
    }
}

async function eliminarSubcarpetaBusqueda(id) {
    if (!confirm('¿Eliminar esta subcarpeta de puesto?')) return;
    try {
        const res = await fetch(`/api/busquedas/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            carpetasBusquedas = carpetasBusquedas.filter(b => b.id !== id);
            if (subcarpetaPuestoAbiertaId === id) subcarpetaPuestoAbiertaId = null;
            renderizarExploradorCarpetas();
        }
    } catch (e) {
        alert('Error al eliminar subcarpeta.');
    }
}

async function eliminarCarpetaEmpresaCompleta(nombreEmpresa) {
    if (!confirm(`¿Seguro que querés eliminar la carpeta de la empresa "${nombreEmpresa}" y todas sus subcarpetas de puestos?`)) return;
    const subcarpetas = carpetasBusquedas.filter(b => (b.empresa || '').trim().toUpperCase() === nombreEmpresa.toUpperCase());
    for (const sub of subcarpetas) {
        try {
            await fetch(`/api/busquedas/${sub.id}`, { method: 'DELETE', credentials: 'include' });
        } catch (e) {}
    }
    carpetasBusquedas = carpetasBusquedas.filter(b => (b.empresa || '').trim().toUpperCase() !== nombreEmpresa.toUpperCase());
    empresasCreadasManualmente = empresasCreadasManualmente.filter(e => e.toUpperCase() !== nombreEmpresa.toUpperCase());
    localStorage.setItem('empresasCarpetas_tdf', JSON.stringify(empresasCreadasManualmente));
    renderizarExploradorCarpetas();
}

function evaluarSubcarpetaBusqueda(keywords, tituloCompleto = '') {
    busquedaSeleccionadaFiltro = keywords;
    tituloVacanteFiltro = tituloCompleto;
    directorioActual = 'postulantes';
    renderizarExploradorCarpetas();
}

function verCVATS(c) {
    const habilidadesFinales = c.habilidades || 'Administración • Gestión • Trabajo en Equipo';
    let experienciaFinal = c.experiencia || '';

    let resumenLimpio = c.resumen || 'No especificado.';
    let datosExtra = c.datosPersonalesExtra || '';
    if (resumenLimpio.includes('Datos adicionales:')) {
        const partes = resumenLimpio.split('Datos adicionales:');
        resumenLimpio = partes[0].trim();
        if (!datosExtra) datosExtra = partes[1].replace(/\.$/, '').trim();
    }

    const ventanaATS = window.open('', '_blank');
    ventanaATS.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>CV ATS Optimizado - ${c.nombre}</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #000; max-width: 800px; margin: 40px auto; padding: 20px; }
                h1 { font-size: 22px; text-transform: uppercase; margin: 0 0 8px 0; text-align: center; }
                .datos-personales { text-align: center; font-size: 13.5px; margin-bottom: 25px; color: #222; line-height: 1.5; border-bottom: 2px solid #000; padding-bottom: 12px; }
                h2 { font-size: 15px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 2px; margin-top: 22px; margin-bottom: 8px; }
                p { font-size: 14px; text-align: justify; margin: 0 0 10px 0; }
                .btn-imprimir { background: #3498db; color: white; border: none; padding: 10px 20px; font-size: 14px; cursor: pointer; display: block; margin: 30px auto; border-radius: 4px; }
                @media print { .btn-imprimir { display: none; } }
            </style>
        </head>
        <body>
            <h1>${c.nombre}</h1>
            <div class="datos-personales">
                <strong>Dirección:</strong> ${c.direccion || 'No especificada'} | <strong>Tel:</strong> ${c.telefono || 'S/D'} | <strong>Email:</strong> ${c.email || 'S/D'} | <strong>DNI:</strong> ${c.dni || 'S/D'}
                ${datosExtra ? `<br>${datosExtra}` : ''}
                <br><strong>Empresa de interés:</strong> ${c.empresa || 'Base de Datos General'}
                ${c.puestoRequerido ? ` | <strong>Objetivo / Vacante:</strong> ${c.puestoRequerido}` : ''}
                | <strong>Disponibilidad:</strong> ${c.disponibilidad || 'Inmediata'}
            </div>
            <h2>Resumen Profesional</h2>
            <p>${resumenLimpio}</p>
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

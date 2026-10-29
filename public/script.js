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
let directorioActual = 'postulantes';
let busquedaSeleccionadaFiltro = '';
let tituloVacanteFiltro = '';
let textoBuscadorRapido = '';

const listaCandidatosDiv = document.getElementById('listaCandidatos');

// Normaliza texto quitando tildes y pasando a minúsculas para comparaciones ATS exactas y flexibles
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

            // 🔄 Migración automática transparente: si había búsquedas en localStorage que no están en MongoDB, las subimos
            const locales = JSON.parse(localStorage.getItem('carpetasBusquedas_tdf') || '[]');
            if (locales.length > 0) {
                let subidas = false;
                for (const loc of locales) {
                    if (!carpetasBusquedas.some(b => b.id === loc.id || (b.empresa === loc.empresa && b.titulo === loc.titulo))) {
                        try {
                            const r = await fetch('/api/busquedas', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify(loc)
                            });
                            const d = await r.json();
                            if (d.success && d.busqueda) {
                                carpetasBusquedas.unshift(d.busqueda);
                                subidas = true;
                            }
                        } catch (errMig) {}
                    }
                }
                if (subidas) {
                    localStorage.removeItem('carpetasBusquedas_tdf');
                }
            }

            renderizarExploradorCarpetas();

            // Conectamos también el buscador superior general de la página si existe
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

// 🧠 Motor de Afinidad ATS Mejorado (Soporta sin acentos, frases con guion bajo como "jefe_de_cocina", exclusiones "-palabra" y devuelve coincidencias/faltantes)
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

    // 1. Verificar exclusiones (-palabra o -frase_compuesta)
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

        // Coincidencia directa o por raíz de palabra (ej: "pastelera" <-> "pastelero" <-> "pasteleria")
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
                <div style="font-size: 13px; color: #64748b;">${carpetasBusquedas.length} Perfiles de empresas (MongoDB)</div>
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

    // 1. Filtro por Vacante / Keywords ATS si hay una búsqueda activa
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

    // 2. Filtro por texto escrito en el buscador rápido de legajos
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

        // Desglose visual de Keywords coincidentes y faltantes cuando se filtra por vacante
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
        <div style="background: #e0f2fe; color: #0369a1; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; width: 100%; justify-content: space-between;">
            <span>🎯 <strong>Vacante activa:</strong> ${tituloVacanteFiltro ? tituloVacanteFiltro + ' — ' : ''}Keywords: "${busquedaSeleccionadaFiltro}" (${listaFiltrada.length} candidatos compatibles)</span>
            <button onclick="limpiarFiltroVacante()" style="background:#ef4444; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">✕ Quitar filtro</button>
        </div>` : ''}
    </div>
    <div id="contenedorGrillaTarjetas">
        ${construirGrillaTarjetasHTML(listaFiltrada)}
    </div>`;

    return html;
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

// 📂 SECCIÓN DE BÚSQUEDAS & VACANTES (CON LECTOR DE WHATSAPP/ARCHIVO Y GUARDADO EN MONGODB)
function renderizarSubcarpetasBusquedas() {
    let html = `
    <div style="background: white; border: 1px solid #cbd5e1; padding: 25px; border-radius: 12px; margin-bottom: 25px;">
        <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #1e293b;">📂 Directorio de Empresas y Vacantes (Sincronizado en la Nube)</h3>
        
        <div style="background: #f0fdf4; padding: 18px; border-radius: 10px; border: 1px solid #bbf7d0; margin-bottom: 20px;">
            <div style="font-size: 14px; font-weight: bold; color: #166534; margin-bottom: 10px;">
                🤖 Auto-completar Vacante con IA (Desde Archivo PDF/Word/Imagen o Mensaje de WhatsApp):
            </div>
            <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start;">
                <div style="flex: 1; min-width: 240px;">
                    <label style="font-size: 12px; font-weight: 600; color: #15803d; display: block; margin-bottom: 4px;">📎 Opción 1: Subir PDF, Word o Flyer (Imagen):</label>
                    <input type="file" id="archivoRequisitosIA" accept=".pdf,.doc,.docx,image/*" style="font-size: 12px; width: 100%; background: white; padding: 6px; border-radius: 6px; border: 1px solid #86efac;">
                </div>
                <div style="flex: 2; min-width: 280px;">
                    <label style="font-size: 12px; font-weight: 600; color: #15803d; display: block; margin-bottom: 4px;">💬 Opción 2: Pegar texto del pedido de la empresa (WhatsApp / Email):</label>
                    <textarea id="textoRequisitosIA" rows="2" placeholder="Ej: Hola! Para Planta Río Grande buscamos Operario de Logística con carnet de autoelevador y secundario completo..." style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #86efac; font-size: 13px; font-family: inherit;"></textarea>
                </div>
                <div style="display: flex; align-items: center; padding-top: 18px;">
                    <button onclick="analizarRequisitosIA()" id="btnAnalizarIA" style="background: #16a34a; color: white; border: none; padding: 11px 18px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 13px; white-space: nowrap;">Extraer Requisitos con IA ⚡</button>
                </div>
            </div>
        </div>

        <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; background: #f8fafc; padding: 16px; border-radius: 10px; border: 1px solid #e2e8f0;">
            <div style="flex: 1; min-width: 200px;">
                <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">🏢 Empresa / Cliente:</label>
                <input type="text" id="nuevaEmpresa" placeholder="Ej: Santista Textil / Hotel..." style="width: 100%; padding: 9px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; margin-top: 4px;">
            </div>
            <div style="flex: 1; min-width: 200px;">
                <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">💼 Puesto / Vacante:</label>
                <input type="text" id="nuevaBusquedaTitulo" placeholder="Ej: Operario de Logística..." style="width: 100%; padding: 9px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; margin-top: 4px;">
            </div>
            <div style="flex: 2; min-width: 260px;">
                <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">🔑 Keywords ATS (Usa guion_bajo para frases y -palabra para excluir):</label>
                <input type="text" id="nuevaBusquedaKeywords" placeholder="Ej: logistica autoelevador stock jefe_de_cocina" style="width: 100%; padding: 9px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; margin-top: 4px;">
            </div>
            <div style="display: flex; align-items: flex-end;">
                <button onclick="agregarSubcarpetaBusqueda()" style="background: #0284c7; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; height: 38px;">➕ Guardar Vacante</button>
            </div>
        </div>
        <div style="font-size: 12px; color: #64748b; margin-bottom: 25px; padding-left: 4px;">
            💡 <strong>Tip ATS:</strong> El buscador ignora tildes automáticamente. Si escribís <code>jefe_de_cocina</code> busca la frase exacta; si escribís <code>cocina pasteleria</code> evalúa cuántas de esas palabras cumple cada candidato.
        </div>`;

    if (carpetasBusquedas.length === 0) {
        html += `<p style="text-align:center; padding: 30px; color:#64748b; background:#f8fafc; border-radius:8px; border:1px dashed #cbd5e1;">Todavía no hay vacantes cargadas. Creá la primera arriba o usá el extractor con IA.</p></div>`;
        return html;
    }

    const empresasAgrupadas = {};
    carpetasBusquedas.forEach(b => {
        const nombreEmpresa = (b.empresa || 'Empresas Generales').toUpperCase();
        if (!empresasAgrupadas[nombreEmpresa]) {
            empresasAgrupadas[nombreEmpresa] = [];
        }
        empresasAgrupadas[nombreEmpresa].push(b);
    });

    html += `<div style="display: flex; flex-direction: column; gap: 20px;">`;

    for (const [empresa, busquedas] of Object.entries(empresasAgrupadas)) {
        html += `
        <div style="background: #f1f5f9; border: 2px solid #cbd5e1; border-radius: 10px; padding: 20px;">
            <h4 style="margin: 0 0 15px 0; font-size: 17px; color: #0f172a; border-bottom: 2px solid #94a3b8; padding-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                <span>🏢 EMPRESA: ${empresa}</span>
                <span style="font-size: 12px; background: #e2e8f0; color: #334155; padding: 3px 10px; border-radius: 12px;">${busquedas.length} vacante(s)</span>
            </h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 15px;">`;

        busquedas.forEach(b => {
            // Calculamos en vivo cuántos candidatos superan el 40% de afinidad para mostrarlo en la tarjeta de la vacante
            const compatibles = todosLosCandidatos.filter(c => evaluarAfinidadDetallada(c, b.keywords).porcentaje >= 40).length;

            html += `
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
                        <div style="font-size: 16px; font-weight: bold; color: #0284c7;">📂 ${b.titulo}</div>
                        <span style="background: #dcfce7; color: #166534; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; white-space: nowrap;">${compatibles} compatibles</span>
                    </div>
                    <div style="font-size: 13px; color: #475569; margin-bottom: 12px; line-height: 1.4;"><strong>Keywords ATS:</strong> ${b.keywords}</div>
                </div>
                <div style="display: flex; gap: 6px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
                    <button onclick='evaluarSubcarpetaBusqueda(${JSON.stringify(b.keywords)}, ${JSON.stringify(b.empresa + " - " + b.titulo)})' style="background: #0284c7; color: white; border: none; padding: 7px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; flex: 1;">🔍 Ver Candidatos ATS</button>
                    <button onclick='abrirModalEditarBusqueda(${JSON.stringify(b)})' style="background: #f59e0b; color: white; border: none; padding: 7px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;" title="Editar Vacante">✏️</button>
                    <button onclick="eliminarSubcarpetaBusqueda(${b.id})" style="background: #fee2e2; color: #dc2626; border: none; padding: 7px 10px; border-radius: 6px; font-weight: 600; cursor: pointer;" title="Eliminar Vacante">🗑️</button>
                </div>
            </div>`;
        });

        html += `</div></div>`;
    }

    html += '</div></div>';
    return html;
}

async function agregarSubcarpetaBusqueda() {
    const empresaInput = document.getElementById('nuevaEmpresa');
    const tituloInput = document.getElementById('nuevaBusquedaTitulo');
    const keywordsInput = document.getElementById('nuevaBusquedaKeywords');
    if (!empresaInput.value || !tituloInput.value || !keywordsInput.value) {
        return alert('⚠️ Completá Empresa, Puesto y Keywords para guardar la vacante.');
    }

    const nueva = {
        id: Date.now(),
        empresa: empresaInput.value.trim(),
        titulo: tituloInput.value.trim(),
        keywords: keywordsInput.value.trim()
    };

    try {
        const res = await fetch('/api/busquedas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(nueva)
        });
        const data = await res.json();
        if (data.success && data.busqueda) {
            carpetasBusquedas.unshift(data.busqueda);
            renderizarExploradorCarpetas();
        } else {
            alert('Error al guardar la vacante en el servidor.');
        }
    } catch (e) {
        alert('Error de conexión al guardar la vacante.');
    }
}

function abrirModalEditarBusqueda(b) {
    let modalExistente = document.getElementById('modalEditarBusqueda');
    if (modalExistente) modalExistente.remove();

    const modalHtml = `
    <div id="modalEditarBusqueda" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px;">
        <div style="background: white; width: 100%; max-width: 520px; border-radius: 12px; padding: 25px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
            <h2 style="margin-top:0; color:#1e293b; font-size: 19px;">✏️ Editar Vacante / Búsqueda</h2>
            <form onsubmit="guardarEdicionBusqueda(event, ${b.id})">
                <div style="margin-bottom: 12px;">
                    <label style="font-size: 12px; font-weight: bold; color: #475569;">🏢 Nombre de la Empresa:</label>
                    <input type="text" id="editBusqEmpresa" value="${b.empresa || ''}" style="width: 100%; padding: 9px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; margin-top: 4px;" required>
                </div>
                <div style="margin-bottom: 12px;">
                    <label style="font-size: 12px; font-weight: bold; color: #475569;">💼 Puesto / Vacante:</label>
                    <input type="text" id="editBusqTitulo" value="${b.titulo || ''}" style="width: 100%; padding: 9px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; margin-top: 4px;" required>
                </div>
                <div style="margin-bottom: 18px;">
                    <label style="font-size: 12px; font-weight: bold; color: #475569;">🔑 Keywords ATS (separadas por espacio):</label>
                    <textarea id="editBusqKeywords" rows="3" style="width: 100%; padding: 9px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; margin-top: 4px;" required>${b.keywords || ''}</textarea>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button type="button" onclick="document.getElementById('modalEditarBusqueda').remove()" style="background: #cbd5e1; color: #334155; border: none; padding: 9px 16px; border-radius: 6px; font-weight: 600; cursor: pointer;">Cancelar</button>
                    <button type="submit" style="background: #0284c7; color: white; border: none; padding: 9px 18px; border-radius: 6px; font-weight: 600; cursor: pointer;">💾 Guardar Cambios</button>
                </div>
            </form>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function guardarEdicionBusqueda(event, id) {
    event.preventDefault();
    const payload = {
        empresa: document.getElementById('editBusqEmpresa').value.trim(),
        titulo: document.getElementById('editBusqTitulo').value.trim(),
        keywords: document.getElementById('editBusqKeywords').value.trim()
    };

    try {
        const res = await fetch(`/api/busquedas/editar/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success && data.busqueda) {
            const idx = carpetasBusquedas.findIndex(x => x.id === id);
            if (idx !== -1) carpetasBusquedas[idx] = data.busqueda;
            document.getElementById('modalEditarBusqueda').remove();
            renderizarExploradorCarpetas();
        } else {
            alert('No se pudo actualizar la vacante.');
        }
    } catch (e) {
        alert('Error de conexión.');
    }
}

async function eliminarSubcarpetaBusqueda(id) {
    if (!confirm('¿Eliminar esta vacante del directorio?')) return;
    try {
        const res = await fetch(`/api/busquedas/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            carpetasBusquedas = carpetasBusquedas.filter(b => b.id !== id);
            renderizarExploradorCarpetas();
        }
    } catch (e) {
        alert('Error al eliminar vacante.');
    }
}

function evaluarSubcarpetaBusqueda(keywords, tituloCompleto = '') {
    busquedaSeleccionadaFiltro = keywords;
    tituloVacanteFiltro = tituloCompleto;
    directorioActual = 'postulantes';
    renderizarExploradorCarpetas();
}

async function analizarRequisitosIA() {
    const fileInput = document.getElementById('archivoRequisitosIA');
    const textoInput = document.getElementById('textoRequisitosIA');

    const tieneArchivo = fileInput && fileInput.files && fileInput.files[0];
    const tieneTexto = textoInput && textoInput.value.trim().length > 0;

    if (!tieneArchivo && !tieneTexto) {
        return alert('⚠️ Subí un archivo (PDF, Word o Imagen) o pegá el texto del pedido de la empresa primero.');
    }

    const btn = document.getElementById('btnAnalizarIA');
    btn.disabled = true;
    btn.textContent = 'Analizando búsqueda... ⏳';

    const formData = new FormData();
    if (tieneArchivo) formData.append('archivoRequisitos', fileInput.files[0]);
    if (tieneTexto) formData.append('textoRequisitos', textoInput.value.trim());

    try {
        const res = await fetch('/api/analizar-requisitos', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success && data.datos) {
            if (data.datos.empresa) document.getElementById('nuevaEmpresa').value = data.datos.empresa;
            if (data.datos.titulo) document.getElementById('nuevaBusquedaTitulo').value = data.datos.titulo;
            if (data.datos.keywords) document.getElementById('nuevaBusquedaKeywords').value = data.datos.keywords;
            alert('✅ ¡Datos extraídos! Revisá los 3 campos abajo y hacé clic en "➕ Guardar Vacante".');
        } else {
            alert('Error al procesar: ' + (data.error || 'Desconocido'));
        }
    } catch(e) {
        alert('Error de conexión con el servidor.');
    }
    
    btn.disabled = false;
    btn.textContent = 'Extraer Requisitos con IA ⚡';
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

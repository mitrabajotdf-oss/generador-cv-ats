let postulantesLocales = [];
let fotoBase64Actual = '';

document.addEventListener('DOMContentLoaded', () => {
  actualizarListaPostulantes();
});

async function actualizarListaPostulantes() {
  try {
    const res = await fetch('/api/postulantes');
    postulantesLocales = await res.json();
    
    const select = document.getElementById('selectPostulante');
    select.innerHTML = '<option value="">-- Nuevo Postulante --</option>';

    postulantesLocales.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.nombre} (${p.titulo || 'Sin título'})`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Error al obtener postulantes:', err);
  }
}

function cargarPostulanteSeleccionado() {
  const id = document.getElementById('selectPostulante').value;
  if (!id) {
    limpiarFormulario();
    return;
  }

  const p = postulantesLocales.find(item => item.id === id);
  if (p) {
    llenarFormulario(p);
  }
}

function llenarFormulario(d) {
  document.getElementById('postulanteId').value = d.id || '';
  document.getElementById('nombre').value = d.nombre || '';
  document.getElementById('titulo').value = d.titulo || '';
  document.getElementById('email').value = d.email || '';
  document.getElementById('telefono').value = d.telefono || '';
  document.getElementById('ubicacion').value = d.ubicacion || '';
  document.getElementById('disponibilidad').value = d.disponibilidad || '';
  document.getElementById('linkedin').value = d.linkedin || '';

  document.getElementById('resumen').value = d.resumen || '';
  document.getElementById('experiencia').value = d.experiencia || '';
  document.getElementById('educacion').value = d.educacion || '';
  document.getElementById('habilidades').value = d.habilidades || '';
  document.getElementById('informacion_adicional').value = d.informacion_adicional || '';

  fotoBase64Actual = d.fotoBase64 || '';
  const imgPreview = document.getElementById('imgPreview');
  if (fotoBase64Actual) {
    imgPreview.src = fotoBase64Actual;
    imgPreview.style.display = 'block';
  } else {
    imgPreview.style.display = 'none';
  }
}

function limpiarFormulario() {
  document.getElementById('postulanteId').value = '';
  document.getElementById('selectPostulante').value = '';
  document.getElementById('nombre').value = '';
  document.getElementById('titulo').value = '';
  document.getElementById('email').value = '';
  document.getElementById('telefono').value = '';
  document.getElementById('ubicacion').value = '';
  document.getElementById('disponibilidad').value = '';
  document.getElementById('linkedin').value = '';
  document.getElementById('resumen').value = '';
  document.getElementById('experiencia').value = '';
  document.getElementById('educacion').value = '';
  document.getElementById('habilidades').value = '';
  document.getElementById('informacion_adicional').value = '';
  fotoBase64Actual = '';
  document.getElementById('imgPreview').style.display = 'none';
}

async function subirYProcesarCV() {
  const fileInput = document.getElementById('cvFile');
  if (!fileInput.files || fileInput.files.length === 0) {
    alert('Por favor selecciona un archivo PDF o Word.');
    return;
  }

  const formData = new FormData();
  formData.append('cvFile', fileInput.files[0]);

  try {
    const response = await fetch('/api/parse-cv', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.error) {
      alert(result.error);
      return;
    }

    llenarFormulario(result.postulante);
    await actualizarListaPostulantes();
    document.getElementById('selectPostulante').value = result.postulante.id;

    alert('¡Postulante creado y datos extraídos exitosamente!');

  } catch (err) {
    console.error(err);
    alert('Error al leer el archivo.');
  }
}

function previewFoto(event) {
  const input = event.target;
  const preview = document.getElementById('imgPreview');
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      fotoBase64Actual = e.target.result;
      preview.src = fotoBase64Actual;
      preview.style.display = 'block';
    }
    reader.readAsDataURL(input.files[0]);
  }
}

async function guardarPostulante() {
  const datos = obtenerDatosFormulario();
  try {
    const res = await fetch('/api/guardar-postulante', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });
    const result = await res.json();
    alert('¡Ficha del postulante guardada correctamente!');
    await actualizarListaPostulantes();
    document.getElementById('selectPostulante').value = result.id;
  } catch (e) {
    alert('Error al guardar datos.');
  }
}

function obtenerDatosFormulario() {
  return {
    id: document.getElementById('postulanteId').value || '',
    nombre: document.getElementById('nombre').value || '',
    titulo: document.getElementById('titulo').value || '',
    email: document.getElementById('email').value || '',
    telefono: document.getElementById('telefono').value || '',
    ubicacion: document.getElementById('ubicacion').value || '',
    disponibilidad: document.getElementById('disponibilidad').value || '',
    linkedin: document.getElementById('linkedin').value || '',
    resumen: document.getElementById('resumen').value || '',
    experiencia: document.getElementById('experiencia').value || '',
    educacion: document.getElementById('educacion').value || '',
    habilidades: document.getElementById('habilidades').value || '',
    informacion_adicional: document.getElementById('informacion_adicional').value || '',
    fotoBase64: fotoBase64Actual
  };
}

async function generarPDF() {
  const datos = obtenerDatosFormulario();

  try {
    const response = await fetch('/generar-cv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });

    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } else {
      alert('Error al generar el PDF.');
    }
  } catch (err) {
    alert('Error de conexión.');
  }
}

function evaluarATS() {
  const oferta = document.getElementById('ofertaLaboral').value.toLowerCase();
  const textoCV = (document.getElementById('habilidades').value + " " + document.getElementById('experiencia').value).toLowerCase();

  if (!oferta.trim()) {
    alert('Pega la descripción del puesto de trabajo para evaluar la compatibilidad.');
    return;
  }

  const palabras = oferta.match(/\b[a-záéíóúñ]{4,}\b/gi) || [];
  const unicas = [...new Set(palabras)];
  let coincidencias = 0;

  unicas.forEach(p => {
    if (textoCV.includes(p)) coincidencias++;
  });

  const score = Math.min(100, Math.round((coincidencias / (unicas.length || 1)) * 100 * 2.2));
  
  const resDiv = document.getElementById('resultadoATS');
  resDiv.style.display = 'block';
  document.getElementById('puntuacionATS').innerText = score + '%';

  const msg = document.getElementById('mensajeATS');
  if (score >= 65) {
    msg.innerText = '¡Excelente coincidencia ATS para este postulante!';
  } else if (score >= 35) {
    msg.innerText = 'Coincidencia media. Se sugiere agregar más competencias del aviso.';
  } else {
    msg.innerText = 'Coincidencia baja. Ajusta el vocabulario técnico de la experiencia laboral.';
  }
}
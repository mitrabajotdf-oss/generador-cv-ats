// 🌐 Endpoint de Recepción de Postulación
app.post('/api/enviar-postulacion', upload.fields([{ name: 'cvFile', maxCount: 1 }, { name: 'fotoPerfil', maxCount: 1 }]), async (req, res) => {
    try {
        const { puestoRequerido, nombre, dni, email, telefono, direccion, disponibilidad, resumen, experiencia, estudios, habilidades } = req.body;
        
        let cvUrlLocal = '';
        let fotoUrlLocal = '';

        if (req.files) {
            if (req.files.cvFile && req.files.cvFile[0]) {
                cvUrlLocal = `/uploads/${path.basename(req.files.cvFile[0].path)}`;
            }
            if (req.files.fotoPerfil && req.files.fotoPerfil[0]) {
                fotoUrlLocal = `/uploads/${path.basename(req.files.fotoPerfil[0].path)}`;
            }
        }

        const candidatoId = Date.now();

        const nuevoCandidato = new Candidato({
            id: candidatoId,
            puestoRequerido: puestoRequerido || 'General / Sin especificar',
            nombre: nombre || 'Postulante',
            dni: dni || '',
            email: email || '',
            telefono: telefono || '',
            direccion: direccion || '',
            disponibilidad: disponibilidad || 'Inmediata',
            resumen: resumen || '',
            experiencia: experiencia || '',
            estudios: estudios || '',
            habilidades: habilidades || '',
            cvUrl: cvUrlLocal,
            fotoUrl: fotoUrlLocal,
            fecha: new Date().toLocaleString(),
            pagado: false
        });

        await nuevoCandidato.save();

        return res.json({ success: true, candidatoId: candidatoId, message: '¡Postulación guardada con éxito!' });

    } catch (error) {
        console.error("Error crítico en servidor:", error);
        return.status(500).json({ success: false, error: error.message });
    }
});

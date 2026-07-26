const express = require('express');
const path = require('path');
const basicAuth = require('express-basic-auth');

const app = express();
const PORT = process.env.PORT || 10000;

// Configuración de usuario y contraseña privados para ti
app.use(basicAuth({
    users: { 'matias': 'tu_password_secreta_123' }, // Cambia 'matias' y la contraseña por los tuyos
    challenge: true,
    realm: 'Acceso Privado - Gestor CV ATS'
}));

// Servir archivos estáticos de la carpeta actual
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor activo en puerto ${PORT}`);
});
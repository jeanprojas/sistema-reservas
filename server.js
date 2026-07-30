const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dirData = path.join(__dirname, 'data');
const archivoReservas = path.join(dirData, 'reservas.json');
const archivoUsuarios = path.join(dirData, 'usuarios.json');

// Asegurar que la carpeta data exista
if (!fs.existsSync(dirData)) {
    try {
        fs.mkdirSync(dirData, { recursive: true });
    } catch (e) {
        console.log("No se pudo crear la carpeta data físicamente, usando respaldo en memoria.");
    }
}

// Usuarios base iniciales obligatorios del sistema
const usuariosBaseIniciales = [
    {
        id: 'USR-ADMIN',
        username: 'admin',
        password: '123',
        rol: 'Administrador',
        sede: 'TODAS'
    },
    {
        id: 'USR-SALVAJE',
        username: 'salvaje_cover',
        password: 'S123*',
        rol: 'Staff',
        sede: 'Salvaje'
    }
];

// Funciones auxiliares robustas de lectura y escritura con protección de datos
function leerDatos(ruta, inicial = []) {
    try {
        if (!fs.existsSync(ruta)) {
            fs.writeFileSync(ruta, JSON.stringify(inicial, null, 2), 'utf8');
            return inicial;
        }
        const contenido = fs.readFileSync(ruta, 'utf8');
        const parsed = JSON.parse(contenido);
        if (!Array.isArray(parsed) || parsed.length === 0) {
            return inicial;
        }
        return parsed;
    } catch (e) {
        console.error("Error al leer archivo, usando valor inicial:", e);
        return inicial;
    }
}

function guardarDatos(ruta, datos) {
    try {
        fs.writeFileSync(ruta, JSON.stringify(datos, null, 2), 'utf8');
    } catch (e) {
        console.error("Error crítico al guardar en disco:", e);
    }
}

// Inicializar base de datos de usuarios fusionando los base sin borrar nunca los existentes
function inicializarUsuariosSistema() {
    let usuariosActuales = leerDatos(archivoUsuarios, usuariosBaseIniciales);
    let cambiosRealizados = false;

    // Asegurar que los usuarios base obligatorios siempre existan sin sobrescribir los demás
    usuariosBaseIniciales.forEach(base => {
        const existe = usuariosActuales.some(u => u.username === base.username);
        if (!existe) {
            usuariosActuales.push(base);
            cambiosRealizados = true;
        }
    });

    if (cambiosRealizados || !fs.existsSync(archivoUsuarios)) {
        guardarDatos(archivoUsuarios, usuariosActuales);
    }
}
inicializarUsuariosSistema();

// ================= LOGIN =================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const usuarios = leerDatos(archivoUsuarios, usuariosBaseIniciales);
    const usuario = usuarios.find(u => u.username === username && u.password === password);

    if (!usuario) {
        return res.status(401).json({ success: false, mensaje: 'Usuario o contraseña incorrectos' });
    }

    res.json({ 
        success: true, 
        rol: usuario.rol, 
        sede: usuario.sede, 
        username: usuario.username,
        mensaje: 'Autenticación exitosa' 
    });
});

// ================= GESTIÓN DE USUARIOS (CRUD) =================
app.get('/api/usuarios', (req, res) => {
    res.json(leerDatos(archivoUsuarios, usuariosBaseIniciales));
});

app.post('/api/usuarios', (req, res) => {
    let usuarios = leerDatos(archivoUsuarios, usuariosBaseIniciales);
    
    // Validar si el username ya existe para evitar duplicados
    const existeUsername = usuarios.some(u => u.username === req.body.username);
    if (existeUsername) {
        return res.status(400).json({ success: false, mensaje: 'El nombre de usuario ya está en uso' });
    }

    const nuevoUsuario = {
        id: 'USR-' + Date.now().toString().slice(-6),
        username: req.body.username,
        password: req.body.password,
        rol: req.body.rol, 
        sede: req.body.sede || 'Salvaje'
    };

    usuarios.push(nuevoUsuario);
    guardarDatos(archivoUsuarios, usuarios);
    res.status(201).json({ success: true, mensaje: 'Usuario creado con éxito' });
});

app.put('/api/usuarios/:id', (req, res) => {
    const { id } = req.params;
    let usuarios = leerDatos(archivoUsuarios, usuariosBaseIniciales);
    const index = usuarios.findIndex(u => u.id === id);

    if (index === -1) {
        return res.status(404).json({ success: false, mensaje: 'Usuario no encontrado' });
    }

    usuarios[index].username = req.body.username || usuarios[index].username;
    if (req.body.password) usuarios[index].password = req.body.password;
    usuarios[index].rol = req.body.rol || usuarios[index].rol;
    usuarios[index].sede = req.body.sede || usuarios[index].sede;

    guardarDatos(archivoUsuarios, usuarios);
    res.json({ success: true, mensaje: 'Usuario actualizado con éxito' });
});

app.delete('/api/usuarios/:id', (req, res) => {
    const { id } = req.params;
    let usuarios = leerDatos(archivoUsuarios, usuariosBaseIniciales);
    
    // Evitar que se eliminen los usuarios base principales de seguridad
    const usuarioAEliminar = usuarios.find(u => u.id === id);
    if (usuarioAEliminar && (usuarioAEliminar.username === 'admin' || usuarioAEliminar.username === 'salvaje_cover')) {
        return res.status(403).json({ success: false, mensaje: 'No se pueden eliminar los usuarios principales del sistema' });
    }

    const filtrados = usuarios.filter(u => u.id !== id);
    guardarDatos(archivoUsuarios, filtrados);
    res.json({ success: true, mensaje: 'Usuario eliminado con éxito' });
});

// ================= RESERVAS =================
app.post('/api/reservas', (req, res) => {
    const reservas = leerDatos(archivoReservas, []);
    const nuevaReserva = {
        id: 'RES-' + Date.now().toString().slice(-6),
        nombreCliente: req.body.nombreCliente,
        telefono: req.body.telefono,
        fecha: req.body.fecha,
        sede: req.body.sede || 'Salvaje',
        zona: req.body.zona,
        mesa: req.body.mesa || 'Asignar',
        cortesiasQR: req.body.cumpleanos ? `QR-CORTESIA-${Math.random().toString(36).substring(7).toUpperCase()}` : null,
        estadoAsistencia: 'Pendiente',
        creadoEn: new Date().toISOString()
    };

    reservas.push(nuevaReserva);
    guardarDatos(archivoReservas, reservas);
    res.status(201).json({ success: true, mensaje: 'Reserva registrada con éxito', reserva: nuevaReserva });
});

app.get('/api/reservas', (req, res) => {
    res.json(leerDatos(archivoReservas, []));
});

// Endpoints estandarizados para aceptar tanto 'estadoAsistencia' como 'nuevoEstado'
app.put('/api/reservas/:id/asistencia', (req, res) => {
    const { id } = req.params;
    const nuevoEstado = req.body.estadoAsistencia || req.body.nuevoEstado;
    let reservas = leerDatos(archivoReservas, []);
    const index = reservas.findIndex(r => r.id === id);

    if (index === -1) {
        return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
    }

    reservas[index].estadoAsistencia = nuevoEstado;
    guardarDatos(archivoReservas, reservas);
    res.json({ success: true, mensaje: 'Asistencia actualizada', reserva: reservas[index] });
});

app.put('/api/reservas/:id/estado', (req, res) => {
    const { id } = req.params;
    const nuevoEstado = req.body.nuevoEstado || req.body.estadoAsistencia;
    let reservas = leerDatos(archivoReservas, []);
    const index = reservas.findIndex(r => r.id === id);

    if (index === -1) {
        return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
    }

    reservas[index].estadoAsistencia = nuevoEstado;
    guardarDatos(archivoReservas, reservas);
    res.json({ success: true, mensaje: `Estado actualizado a ${nuevoEstado}`, reserva: reservas[index] });
});

app.post('/api/validar-qr', (req, res) => {
    const { codigoQR } = req.body;
    let reservas = leerDatos(archivoReservas, []);
    const reserva = reservas.find(r => r.cortesiasQR === codigoQR);

    if (!reserva) {
        return res.status(404).json({ valido: false, mensaje: 'Código QR de cortesía inválido o inexistente.' });
    }

    res.json({ 
        valido: true, 
        mensaje: `Cortesía válida para ${reserva.nombreCliente}`, 
        sede: reserva.sede || 'Salvaje',
        zona: reserva.zona 
    });
});

app.listen(PORT, () => {
    console.log(`Sistema VIP Norte operando en puerto ${PORT}`);
});

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

// Asegurar que la carpeta data exista de forma sincrónica y estricta
if (!fs.existsSync(dirData)) {
    fs.mkdirSync(dirData, { recursive: true });
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

// Funciones auxiliares ultra seguras para evitar pérdida de datos
function leerDatosSeguro(ruta, inicial) {
    try {
        if (!fs.existsSync(ruta)) {
            fs.writeFileSync(ruta, JSON.stringify(inicial, null, 2), 'utf8');
            return JSON.parse(JSON.stringify(inicial));
        }
        const contenido = fs.readFileSync(ruta, 'utf8');
        if (!contenido || contenido.trim() === '') {
            fs.writeFileSync(ruta, JSON.stringify(inicial, null, 2), 'utf8');
            return JSON.parse(JSON.stringify(inicial));
        }
        const parsed = JSON.parse(contenido);
        if (!Array.isArray(parsed)) {
            return JSON.parse(JSON.stringify(inicial));
        }
        return parsed;
    } catch (e) {
        console.error(`Error leyendo ${ruta}:`, e);
        return JSON.parse(JSON.stringify(inicial));
    }
}

function guardarDatosSeguro(ruta, datos) {
    try {
        fs.writeFileSync(ruta, JSON.stringify(datos, null, 2), 'utf8');
    } catch (e) {
        console.error(`Error crítico escribiendo ${ruta}:`, e);
    }
}

// Inicializar archivos garantizando que nunca se pierdan usuarios creados
function inicializarSistema() {
    // Inicializar reservas si no existen
    if (!fs.existsSync(archivoReservas)) {
        guardarDatosSeguro(archivoReservas, []);
    }

    // Inicializar usuarios asegurando fusión de base sin borrar personalizados
    let usuariosActuales = leerDatosSeguro(archivoUsuarios, usuariosBaseIniciales);
    let modificado = false;

    usuariosBaseIniciales.forEach(base => {
        const existe = usuariosActuales.some(u => u.username === base.username);
        if (!existe) {
            usuariosActuales.push(base);
            modificado = true;
        }
    });

    if (modificado || !fs.existsSync(archivoUsuarios)) {
        guardarDatosSeguro(archivoUsuarios, usuariosActuales);
    }
}
inicializarSistema();

// ================= LOGIN =================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const usuarios = leerDatosSeguro(archivoUsuarios, usuariosBaseIniciales);
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
    res.json(leerDatosSeguro(archivoUsuarios, usuariosBaseIniciales));
});

app.post('/api/usuarios', (req, res) => {
    let usuarios = leerDatosSeguro(archivoUsuarios, usuariosBaseIniciales);
    
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
    guardarDatosSeguro(archivoUsuarios, usuarios);
    res.status(201).json({ success: true, mensaje: 'Usuario creado con éxito' });
});

app.put('/api/usuarios/:id', (req, res) => {
    const { id } = req.params;
    let usuarios = leerDatosSeguro(archivoUsuarios, usuariosBaseIniciales);
    const index = usuarios.findIndex(u => u.id === id);

    if (index === -1) {
        return res.status(404).json({ success: false, mensaje: 'Usuario no encontrado' });
    }

    usuarios[index].username = req.body.username || usuarios[index].username;
    if (req.body.password) usuarios[index].password = req.body.password;
    usuarios[index].rol = req.body.rol || usuarios[index].rol;
    usuarios[index].sede = req.body.sede || usuarios[index].sede;

    guardarDatosSeguro(archivoUsuarios, usuarios);
    res.json({ success: true, mensaje: 'Usuario actualizado con éxito' });
});

app.delete('/api/usuarios/:id', (req, res) => {
    const { id } = req.params;
    let usuarios = leerDatosSeguro(archivoUsuarios, usuariosBaseIniciales);
    
    const usuarioAEliminar = usuarios.find(u => u.id === id);
    if (!usuarioAEliminar) {
        return res.status(404).json({ success: false, mensaje: 'Usuario no encontrado' });
    }

    // Bloquear eliminación estricta de usuarios base del sistema
    if (usuarioAEliminar.username === 'admin' || usuarioAEliminar.username === 'salvaje_cover') {
        return res.status(403).json({ success: false, mensaje: 'Por seguridad, este usuario principal no se puede eliminar' });
    }

    const filtrados = usuarios.filter(u => u.id !== id);
    guardarDatosSeguro(archivoUsuarios, filtrados);
    res.json({ success: true, mensaje: 'Usuario eliminado con éxito' });
});

// ================= RESERVAS =================
app.post('/api/reservas', (req, res) => {
    const reservas = leerDatosSeguro(archivoReservas, []);
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
    guardarDatosSeguro(archivoReservas, reservas);
    res.status(201).json({ success: true, mensaje: 'Reserva registrada con éxito', reserva: nuevaReserva });
});

app.get('/api/reservas', (req, res) => {
    res.json(leerDatosSeguro(archivoReservas, []));
});

// Endpoints estandarizados para asistencia y estado
app.put('/api/reservas/:id/asistencia', (req, res) => {
    const { id } = req.params;
    const nuevoEstado = req.body.estadoAsistencia || req.body.nuevoEstado;
    let reservas = leerDatosSeguro(archivoReservas, []);
    const index = reservas.findIndex(r => r.id === id);

    if (index === -1) {
        return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
    }

    reservas[index].estadoAsistencia = nuevoEstado;
    guardarDatosSeguro(archivoReservas, reservas);
    res.json({ success: true, mensaje: 'Asistencia actualizada', reserva: reservas[index] });
});

app.put('/api/reservas/:id/estado', (req, res) => {
    const { id } = req.params;
    const nuevoEstado = req.body.nuevoEstado || req.body.estadoAsistencia;
    let reservas = leerDatosSeguro(archivoReservas, []);
    const index = reservas.findIndex(r => r.id === id);

    if (index === -1) {
        return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
    }

    reservas[index].estadoAsistencia = nuevoEstado;
    guardarDatosSeguro(archivoReservas, reservas);
    res.json({ success: true, mensaje: `Estado actualizado a ${nuevoEstado}`, reserva: reservas[index] });
});

app.post('/api/validar-qr', (req, res) => {
    const { codigoQR } = req.body;
    let reservas = leerDatosSeguro(archivoReservas, []);
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

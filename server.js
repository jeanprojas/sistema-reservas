const express = require('express');
const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dirData = path.join(__dirname, 'data');
const archivoReservas = path.join(dirData, 'reservas.json');
const archivoUsuarios = path.join(dirData, 'usuarios.json');

if (!fs.existsSync(dirData)) {
    fs.mkdirSync(dirData, { recursive: true });
}

// Configuración de Resend usando la variable de entorno RESEND_API_KEY[cite: 6]
const resend = new Resend(process.env.RESEND_API_KEY);

// Función auxiliar para enviar correos de reserva utilizando Resend[cite: 6]
async function enviarCorreoReserva(destinatario, nombreCliente, idReserva, fecha, zona, mesa, pinQr) {
    try {
        const data = await resend.emails.send({
            from: process.env.RESEND_FROM || 'Portal VIP Norte <onboarding@resend.dev>',
            to: [destinatario],
            subject: `¡Reserva Confirmada! #${idReserva} - VIP Norte`,
            html: `
                <div style="background-color: #09090b; color: #ffffff; padding: 20px; font-family: sans-serif; border-radius: 10px;">
                    <h2 style="color: #f97316;">¡Hola, ${nombreCliente}!</h2>
                    <p>Tu reserva en <b>VIP Norte</b> ha sido registrada con éxito.</p>
                    <hr style="border-color: #27272a;">
                    <p><b>Detalles de tu visita:</b></p>
                    <ul>
                        <li>Nº de Reserva: <b>${idReserva}</b></li>
                        <li>Fecha: <b>${fecha}</b></li>
                        <li>Ubicación: <b>${zona} - Mesa ${mesa}</b></li>
                    </ul>
                    <div style="background-color: #18181b; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 0; font-size: 12px; color: #a1a1aa;">Tu PIN / Código QR de Acceso en Puerta es:</p>
                        <h1 style="color: #fb923c; font-family: monospace; letter-spacing: 5px; margin: 10px 0;">${pinQr}</h1>
                    </div>
                    <p style="font-size: 12px; color: #71717a; text-align: center;">Presenta este código al ingresar a la sede.</p>
                </div>
            `
        });
        return { success: true, data };
    } catch (error) {
        console.error('Error al enviar correo con Resend:', error);
        return { success: false, mensaje: error.message };
    }
}

// Únicamente el usuario admin base del sistema
const usuariosBaseIniciales = [
    {
        id: 'USR-ADMIN',
        username: 'admin',
        password: '123',
        rol: 'Administrador',
        sede: 'TODAS'
    }
];

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

// Función auxiliar para calcular la "Noche Operativa" (8 PM a 5 AM del día siguiente)
function obtenerNocheOperativa(fechaStr, horaStr = "21:00") {
    if (!fechaStr) return new Date().toISOString().split('T')[0];
    const [anio, mes, dia] = fechaStr.split('-').map(Number);
    const [hora] = (horaStr || "21:00").split(':').map(Number);
    
    if (hora >= 0 && hora < 6) {
        const d = new Date(anio, mes - 1, dia);
        d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
    }
    return fechaStr;
}

function inicializarSistema() {
    if (!fs.existsSync(archivoReservas)) {
        guardarDatosSeguro(archivoReservas, []);
    } else {
        try {
            let reservasActuales = leerDatosSeguro(archivoReservas, []);
            let modificadoReservas = false;

            reservasActuales = reservasActuales.map(r => {
                let cambios = false;
                if (!r.codigoQr || r.codigoQr === 'undefined' || r.codigoQr.length !== 4) {
                    r.codigoQr = Math.floor(1000 + Math.random() * 9000).toString();
                    cambios = true;
                }
                if (r.estadoAsistencia === 'Presente' && (!r.personasLlegadas || r.personasLlegadas === 0)) {
                    r.estadoAsistencia = 'Reservado';
                    cambios = true;
                }
                if (cambios) modificadoReservas = true;
                return r;
            });

            if (modificadoReservas) {
                guardarDatosSeguro(archivoReservas, reservasActuales);
            }
        } catch (e) {
            console.error("Error al auditar/corregir reservas iniciales:", e);
        }
    }

    let usuariosActuales = leerDatosSeguro(archivoUsuarios, usuariosBaseIniciales);
    let modificadoUsuarios = false;

    usuariosBaseIniciales.forEach(base => {
        const existe = usuariosActuales.some(u => u.username === base.username);
        if (!existe) {
            usuariosActuales.push(base);
            modificadoUsuarios = true;
        }
    });

    if (modificadoUsuarios || !fs.existsSync(archivoUsuarios)) {
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

    if (usuarioAEliminar.username === 'admin') {
        return res.status(403).json({ success: false, mensaje: 'Por seguridad, el usuario administrador principal no se puede eliminar' });
    }

    const filtrados = usuarios.filter(u => u.id !== id);
    guardarDatosSeguro(archivoUsuarios, filtrados);
    res.json({ success: true, mensaje: 'Usuario eliminado con éxito' });
});

// ================= RESERVAS =================

app.post('/api/reservas', async (req, res) => {
    const reservas = leerDatosSeguro(archivoReservas, []);
    const codigoQrPin = Math.floor(1000 + Math.random() * 9000).toString();

    const nuevaReserva = {
        id: 'RES-' + Date.now().toString().slice(-6),
        codigoQr: codigoQrPin,
        nombreCliente: req.body.nombreCliente,
        telefono: req.body.telefono,
        email: req.body.email || '', 
        fecha: req.body.fecha,
        sede: req.body.sede || 'Salvaje',
        zona: req.body.zona,
        mesa: req.body.mesa || 'Asignar',
        
        cantidadPersonasInicial: Number(req.body.cantidadPersonasInicial) || 1,
        personasLlegadas: 0,
        cortesias: 0,
        pagaronCover: 0,
        precioCover: Number(req.body.precioCover) || 30000,

        cortesiasQR: req.body.cumpleanos ? `QR-CORTESIA-${Math.random().toString(36).substring(7).toUpperCase()}` : null,
        estadoAsistencia: 'Reservado',
        usuarioCreador: req.body.usuarioCreador || 'Web Pública',
        nocheOperativa: obtenerNocheOperativa(req.body.fecha),
        creadoEn: new Date().toISOString()
    };

    reservas.push(nuevaReserva);
    guardarDatosSeguro(archivoReservas, reservas);

    if (nuevaReserva.email) {
        await enviarCorreoReserva(
            nuevaReserva.email,
            nuevaReserva.nombreCliente,
            nuevaReserva.id,
            nuevaReserva.fecha,
            nuevaReserva.zona,
            nuevaReserva.mesa,
            nuevaReserva.codigoQr
        );
    }

    res.status(201).json({ success: true, mensaje: 'Reserva registrada con éxito', reserva: nuevaReserva });
});

app.post('/api/admin/reservas', async (req, res) => {
    const reservas = leerDatosSeguro(archivoReservas, []);
    const codigoQrPin = Math.floor(1000 + Math.random() * 9000).toString();

    const nuevaReserva = {
        id: 'RES-' + Date.now().toString().slice(-6),
        codigoQr: codigoQrPin,
        nombreCliente: req.body.nombreCliente,
        telefono: req.body.telefono,
        email: req.body.email || '', 
        fecha: req.body.fecha,
        sede: req.body.sede || 'Salvaje',
        zona: req.body.zona,
        mesa: req.body.mesa || 'Asignar',
        
        cantidadPersonasInicial: Number(req.body.cantidadPersonasInicial) || 1,
        personasLlegadas: Number(req.body.personasLlegadas) || 0,
        cortesias: Number(req.body.cortesias) || 0,
        pagaronCover: Number(req.body.pagaronCover) || 0,
        precioCover: Number(req.body.precioCover) || 30000,

        estadoAsistencia: req.body.estadoAsistencia || 'Reservado',
        usuarioCreador: req.body.usuarioCreador || 'Administrador',
        nocheOperativa: obtenerNocheOperativa(req.body.fecha),
        creadoEn: new Date().toISOString()
    };

    reservas.push(nuevaReserva);
    guardarDatosSeguro(archivoReservas, reservas);

    if (nuevaReserva.email) {
        await enviarCorreoReserva(
            nuevaReserva.email,
            nuevaReserva.nombreCliente,
            nuevaReserva.id,
            nuevaReserva.fecha,
            nuevaReserva.zona,
            nuevaReserva.mesa,
            nuevaReserva.codigoQr
        );
    }

    res.status(201).json({ success: true, mensaje: 'Reserva creada por Admin', reserva: nuevaReserva });
});

app.get('/api/reservas', (req, res) => {
    res.json(leerDatosSeguro(archivoReservas, []));
});

app.get('/api/reservas/:id', (req, res) => {
    const { id } = req.params;
    const reservas = leerDatosSeguro(archivoReservas, []);
    const reserva = reservas.find(r => r.id === id);

    if (!reserva) {
        return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
    }

    res.json({ success: true, reserva });
});

// Endpoint para enviar el correo manualmente desde el sistema
app.post('/api/reservas/:id/enviar-correo', async (req, res) => {
    const { id } = req.params;
    const reservas = leerDatosSeguro(archivoReservas, []);
    const reserva = reservas.find(r => r.id === id);

    if (!reserva) {
        return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
    }

    if (!reserva.email) {
        return res.status(400).json({ success: false, mensaje: 'El cliente no tiene un correo registrado en esta reserva' });
    }

    const resultado = await enviarCorreoReserva(
        reserva.email,
        reserva.nombreCliente,
        reserva.id,
        reserva.fecha,
        reserva.zona,
        reserva.mesa,
        reserva.codigoQr
    );

    res.json(resultado);
});

app.put('/api/reservas/:id/detalle', (req, res) => {
    const { id } = req.params;
    let reservas = leerDatosSeguro(archivoReservas, []);
    const index = reservas.findIndex(r => r.id === id);

    if (index === -1) {
        return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
    }

    reservas[index].cantidadPersonasInicial = req.body.cantidadPersonasInicial !== undefined ? Number(req.body.cantidadPersonasInicial) : reservas[index].cantidadPersonasInicial;
    reservas[index].personasLlegadas = req.body.personasLlegadas !== undefined ? Number(req.body.personasLlegadas) : reservas[index].personasLlegadas;
    reservas[index].cortesias = req.body.cortesias !== undefined ? Number(req.body.cortesias) : reservas[index].cortesias;
    reservas[index].pagaronCover = req.body.pagaronCover !== undefined ? Number(req.body.pagaronCover) : reservas[index].pagaronCover;
    reservas[index].precioCover = req.body.precioCover !== undefined ? Number(req.body.precioCover) : reservas[index].precioCover;

    guardarDatosSeguro(archivoReservas, reservas);
    res.json({ success: true, mensaje: 'Detalle actualizado correctamente', reserva: reservas[index] });
});

// Ruta ADMIN para Editar Datos Generales de la Reserva
app.put('/api/admin/reservas/:id', (req, res) => {
    const { id } = req.params;
    let reservas = leerDatosSeguro(archivoReservas, []);
    const index = reservas.findIndex(r => r.id === id);

    if (index === -1) {
        return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
    }

    reservas[index].nombreCliente = req.body.nombreCliente || reservas[index].nombreCliente;
    reservas[index].telefono = req.body.telefono || reservas[index].telefono;
    reservas[index].email = req.body.email !== undefined ? req.body.email : reservas[index].email;
    reservas[index].sede = req.body.sede || reservas[index].sede;
    reservas[index].fecha = req.body.fecha || reservas[index].fecha;
    reservas[index].zona = req.body.zona || reservas[index].zona;
    reservas[index].mesa = req.body.mesa || reservas[index].mesa;
    reservas[index].nocheOperativa = obtenerNocheOperativa(reservas[index].fecha);

    guardarDatosSeguro(archivoReservas, reservas);
    res.json({ success: true, mensaje: 'Reserva actualizada correctamente por Administrador', reserva: reservas[index] });
});

// Ruta ADMIN para Eliminar Reserva
app.delete('/api/admin/reservas/:id', (req, res) => {
    const { id } = req.params;
    let reservas = leerDatosSeguro(archivoReservas, []);
    const index = reservas.findIndex(r => r.id === id);

    if (index === -1) {
        return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
    }

    const filtradas = reservas.filter(r => r.id !== id);
    guardarDatosSeguro(archivoReservas, filtradas);
    res.json({ success: true, mensaje: 'Reserva eliminada con éxito' });
});

app.put('/api/reservas/:id/estado', (req, res) => {
    const { id } = req.params;
    const nuevoEstado = req.body.nuevoEstado || req.body.estadoAsistencia;
    const codigoIngresado = req.body.codigoIngresado;

    let reservas = leerDatosSeguro(archivoReservas, []);
    const index = reservas.findIndex(r => r.id === id);

    if (index === -1) {
        return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
    }

    const reserva = reservas[index];
    const hoyStr = new Date().toISOString().split('T')[0];

    if (nuevoEstado === 'Presente') {
        if (reserva.fecha > hoyStr) {
            return res.status(400).json({ 
                success: false, 
                mensaje: 'No es posible cambiar a Presente: la fecha de la reserva es futura.' 
            });
        }
        if (!reserva.codigoQr || reserva.codigoQr === 'undefined') {
            reserva.codigoQr = Math.floor(1000 + Math.random() * 9000).toString();
        }
        if (codigoIngresado && codigoIngresado !== reserva.codigoQr) {
            return res.status(400).json({ 
                success: false, 
                mensaje: 'Código QR / PIN incorrecto proporcionado por el cliente.' 
            });
        }
    }

    reserva.estadoAsistencia = nuevoEstado;
    
    if (nuevoEstado === 'Presente' && (!reserva.personasLlegadas || reserva.personasLlegadas === 0)) {
        reserva.personasLlegadas = reservas[index].cantidadPersonasInicial;
    }

    guardarDatosSeguro(archivoReservas, reservas);
    res.json({ success: true, mensaje: `Estado actualizado a ${nuevoEstado}`, reserva });
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

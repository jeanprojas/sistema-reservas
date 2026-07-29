const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const archivoReservas = path.join(__dirname, 'data', 'reservas.json');

// Función para leer reservas
function leerReservas() {
    if (!fs.existsSync(archivoReservas)) {
        if (!fs.existsSync(path.dirname(archivoReservas))) {
            fs.mkdirSync(path.dirname(archivoReservas), { recursive: true });
        }
        fs.writeFileSync(archivoReservas, JSON.stringify([]));
        return [];
    }
    const data = fs.readFileSync(archivoReservas, 'utf8');
    try {
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

// Función para guardar reservas
function guardarReservas(reservas) {
    fs.writeFileSync(archivoReservas, JSON.stringify(reservas, null, 2));
}

// 1. WEBHOOK / ENDPOINT para recibir datos (Con soporte de Sede)
app.post('/api/reservas', (req, res) => {
    const reservas = leerReservas();
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
    guardarReservas(reservas);
    res.status(201).json({ success: true, mensaje: 'Reserva registrada con éxito', reserva: nuevaReserva });
});

// 2. OBTENER TODAS LAS RESERVAS
app.get('/api/reservas', (req, res) => {
    const reservas = leerReservas();
    res.json(reservas);
});

// 3. ACTUALIZAR ASISTENCIA (Staff)
app.put('/api/reservas/:id/asistencia', (req, res) => {
    const { id } = req.params;
    const { estadoAsistencia } = req.body;
    let reservas = leerReservas();
    const index = reservas.findIndex(r => r.id === id);

    if (index === -1) {
        return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
    }

    reservas[index].estadoAsistencia = estadoAsistencia;
    guardarReservas(reservas);
    res.json({ success: true, mensaje: 'Asistencia actualizada', reserva: reservas[index] });
});

// 4. CAMBIAR ESTADO EXCLUSIVO ADMINISTRADOR (Incluye estado "Prueba")
app.put('/api/reservas/:id/estado', (req, res) => {
    const { id } = req.params;
    const { nuevoEstado } = req.body;
    let reservas = leerReservas();
    const index = reservas.findIndex(r => r.id === id);

    if (index === -1) {
        return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
    }

    reservas[index].estadoAsistencia = nuevoEstado;
    guardarReservas(reservas);
    res.json({ success: true, mensaje: `Estado actualizado a ${nuevoEstado}`, reserva: reservas[index] });
});

// 5. VALIDAR CÓDIGO QR DE CORTESÍA
app.post('/api/validar-qr', (req, res) => {
    const { codigoQR } = req.body;
    let reservas = leerReservas();
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

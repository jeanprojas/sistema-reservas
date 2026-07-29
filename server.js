const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data', 'reservas.json');

// Función auxiliar para leer reservas
function leerReservas() {
    if (!fs.existsSync(DATA_FILE)) return [];
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data || '[]');
}

// Función auxiliar para guardar reservas
function guardarReservas(reservas) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(reservas, null, 2));
}

// 1. WEBHOOK / ENDPOINT para recibir datos desde Google Forms
app.post('/api/reservas', (req, res) => {
    const reservas = leerReservas();
    const nuevaReserva = {
        id: 'RES-' + Date.now().toString().slice(-6),
        nombreCliente: req.body.nombreCliente,
        telefono: req.body.telefono,
        fecha: req.body.fecha,
        sede: req.body.sede || 'Salvaje', // <--- Sede integrada (por defecto Salvaje)
        zona: req.body.zona, // 'Palco', 'VIP', 'General'
        mesa: req.body.mesa || 'Asignar',
        cortesiasQR: req.body.cumpleanos ? `QR-CORTESIA-${Math.random().toString(36).substring(7).toUpperCase()}` : null,
        estadoAsistencia: 'Pendiente', // Pendiente, Presente, No-Show
        creadoEn: new Date().toISOString()
    };

    reservas.push(nuevaReserva);
    guardarReservas(reservas);
    res.status(201).json({ success: true, mensaje: 'Reserva registrada con éxito', reserva: nuevaReserva });
});

// 2. OBTENER RESERVAS (En tiempo real para Admin y Staff)
app.get('/api/reservas', (req, res) => {
    const reservas = leerReservas();
    res.json(reservas);
});

// 3. ACTUALIZAR ESTADO DE ASISTENCIA (Llegó / No llegó)
app.patch('/api/reservas/:id/asistencia', (req, res) => {
    const { id } = req.params;
    const { estadoAsistencia } = req.body; // 'Presente' o 'No-Show'
    let reservas = leerReservas();
    
    let encontrada = false;
    reservas = reservas.map(r => {
        if (r.id === id) {
            encontrada = true;
            return { ...r, estadoAsistencia };
        }
        return r;
    });

    if (!encontrada) return res.status(404).json({ error: 'Reserva no encontrada' });
    
    guardarReservas(reservas);
    res.json({ success: true, mensaje: `Estado actualizado a ${estadoAsistencia}` });
});

// 4. VALIDAR CÓDIGO QR DE CORTESÍA
app.post('/api/validar-qr', (req, res) => {
    const { codigoQR } = req.body;
    let reservas = leerReservas();
    const reserva = reservas.find(r => r.cortesiasQR === codigoQR);

    if (!reserva) {
        return res.status(404).json({ valido: false, mensaje: 'Código QR de cortesía inválido o inexistente.' });
    }

    res.json({ valido: true, mensaje: `Cortesía válida para ${reserva.nombreCliente}`, zona: reserva.zona });
});

app.listen(PORT, () => {
    console.log(`Sistema VIP Norte operando en puerto ${PORT}`);
});

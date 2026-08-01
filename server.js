const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { Resend } = require('resend');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de Resend usando la variable de entorno RESEND_API_KEY
const resend = new Resend(process.env.RESEND_API_KEY);

// Conexión a MongoDB (Base de datos en la nube para evitar pérdida de datos por reinicios)
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("ERROR CRÍTICO: Falta la variable de entorno MONGO_URI en Render.");
}

mongoose.connect(MONGO_URI)
    .then(() => console.log('Conectado exitosamente a la Base de Datos en la Nube'))
    .catch(err => console.error('Error conectando a MongoDB:', err));

// ================= MIGRACIÓN AUTOMÁTICA DE DATOS LOCALES =================
async function migrarDatosLocales() {
    try {
        const totalReservas = await Reserva.countDocuments();
        if (totalReservas === 0) {
            const rutaArchivo = path.join(__dirname, 'data', 'reservas.json');
            if (fs.existsSync(rutaArchivo)) {
                const datosRaw = fs.readFileSync(rutaArchivo, 'utf8');
                const reservasLocales = JSON.parse(datosRaw);

                if (reservasLocales.length > 0) {
                    for (let r of reservasLocales) {
                        await Reserva.updateOne(
                            { id: r.id },
                            { $set: {
                                id: r.id,
                                codigoQr: r.codigoQr || Math.floor(1000 + Math.random() * 9000).toString(),
                                nombreCliente: r.nombreCliente || 'Cliente',
                                telefono: r.telefono || '',
                                email: r.email || '',
                                fecha: r.fecha || new Date().toISOString().split('T')[0],
                                sede: r.sede || 'Salvaje',
                                zona: r.zona || 'General',
                                mesa: r.mesa || 'Asignar',
                                mesaAsignada: r.mesaAsignada || r.mesa || 'Sin Asignar',
                                motivoReserva: r.motivoReserva || 'General',
                                cantidadPersonasInicial: Number(r.cantidadPersonasInicial) || 1,
                                personasLlegadas: Number(r.personasLlegadas) || 0,
                                cortesias: Number(r.cortesias) || 0,
                                pagaronCover: Number(r.pagaronCover) || 0,
                                precioCover: Number(r.precioCover) || 30000,
                                cortesiasQR: r.cortesiasQR || null,
                                estadoAsistencia: r.estadoAsistencia || 'Reservado',
                                usuarioCreador: r.usuarioCreador || 'Migración',
                                nocheOperativa: r.fecha || new Date().toISOString().split('T')[0]
                            }},
                            { upsert: true }
                        );
                    }
                    console.log(`¡Migración exitosa! Se cargaron ${reservasLocales.length} reservas desde el archivo local a MongoDB Atlas.`);
                }
            }
        }
    } catch (e) {
        console.error('Error durante la migración automática de datos:', e);
    }
}

// Ejecutar la migración al iniciar
setTimeout(migrarDatosLocales, 2000);

// ================= ESQUEMAS Y MODELOS DE LA BASE DE DATOS =================
const reservaSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true },
    codigoQr: String,
    nombreCliente: String,
    telefono: String,
    email: String,
    fecha: String,
    sede: { type: String, default: 'Salvaje' },
    zona: String,
    mesa: String,
    mesaAsignada: { type: String, default: 'Sin Asignar' }, 
    motivoReserva: { type: String, default: 'General' },    
    cantidadPersonasInicial: Number,
    personasLlegadas: { type: Number, default: 0 },
    cortesias: { type: Number, default: 0 },
    pagaronCover: { type: Number, default: 0 },
    precioCover: { type: Number, default: 30000 },
    cortesiasQR: String,
    estadoAsistencia: { type: String, default: 'Reservado' },
    usuarioCreador: String,
    nocheOperativa: String,
    creadoEn: { type: Date, default: Date.now }
});

const usuarioSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true },
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    rol: String,
    sede: String
});

const Reserva = mongoose.model('Reserva', reservaSchema);
const Usuario = mongoose.model('Usuario', usuarioSchema);

// Inicializar usuario Administrador por defecto si no existe
async function inicializarAdmin() {
    try {
        const adminExiste = await Usuario.findOne({ username: 'admin' });
        if (!adminExiste) {
            await Usuario.create({
                id: 'USR-ADMIN',
                username: 'admin',
                password: '123',
                rol: 'Administrador',
                sede: 'TODAS'
            });
            console.log('Usuario administrador inicial creado en la base de datos.');
        }
    } catch (e) {
        console.error('Error al inicializar admin:', e);
    }
}
inicializarAdmin();

// ================= VALIDACIÓN DE DISPONIBILIDAD DE MESA =================
async function verificarDisponibilidadMesa(nuevaSede, nuevaFecha, nuevaMesa, idActualExcluir = null) {
    if (!nuevaMesa || nuevaMesa === 'Sin Asignar' || nuevaMesa === 'Mesa Asignar') {
        return true; 
    }

    const sedeBuscada = nuevaSede || 'Salvaje';
    const reservasExistentes = await Reserva.find({
        fecha: nuevaFecha,
        sede: sedeBuscada,
        mesa: String(nuevaMesa)
    });

    const colision = reservasExistentes.find(r => {
        if (idActualExcluir && r.id === idActualExcluir) return false;
        return true;
    });

    return !colision;
}

// Función auxiliar para enviar correos de reserva utilizando Resend
async function enviarCorreoReserva(destinatario, nombreCliente, idReserva, fecha, zona, mesa, pinQr, sede) {
    try {
        const data = await resend.emails.send({
            from: process.env.RESEND_FROM || 'Portal VIP Norte <onboarding@resend.dev>',
            to: [destinatario],
            subject: `¡Reserva Confirmada! #${idReserva} - ${sede || 'VIP Norte'}`,
            html: `
                <div style="background-color: #09090b; color: #ffffff; padding: 20px; font-family: sans-serif; border-radius: 10px;">
                    <h2 style="color: #f97316;">¡Hola, ${nombreCliente}!</h2>
                    <p>Tu reserva en <b>${sede || 'VIP Norte'}</b> ha sido registrada con éxito.</p>
                    <hr style="border-color: #27272a;">
                    <p><b>Detalles de tu visita:</b></p>
                    <ul>
                        <li>Nº de Reserva: <b>${idReserva}</b></li>
                        <li>Sede / Discoteca: <b>${sede || 'Salvaje'}</b></li>
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

// ================= LOGIN =================
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const usuario = await Usuario.findOne({ username, password });

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
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error en el servidor' });
    }
});

// ================= GESTIÓN DE USUARIOS (CRUD) =================
app.get('/api/usuarios', async (req, res) => {
    try {
        const usuarios = await Usuario.find({});
        res.json(usuarios);
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al obtener usuarios' });
    }
});

app.post('/api/usuarios', async (req, res) => {
    try {
        const existeUsername = await Usuario.findOne({ username: req.body.username });
        if (existeUsername) {
            return res.status(400).json({ success: false, mensaje: 'El nombre de usuario ya está en uso' });
        }

        const nuevoUsuario = new Usuario({
            id: 'USR-' + Date.now().toString().slice(-6),
            username: req.body.username,
            password: req.body.password,
            rol: req.body.rol, 
            sede: req.body.sede || 'Salvaje'
        });

        await nuevoUsuario.save();
        res.status(201).json({ success: true, mensaje: 'Usuario creado con éxito' });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al crear usuario' });
    }
});

app.put('/api/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = {};
        if (req.body.username) updateData.username = req.body.username;
        if (req.body.password) updateData.password = req.body.password;
        if (req.body.rol) updateData.rol = req.body.rol;
        if (req.body.sede) updateData.sede = req.body.sede;

        const usuarioActualizado = await Usuario.findOneAndUpdate({ id }, updateData, { new: true });
        if (!usuarioActualizado) {
            return res.status(404).json({ success: false, mensaje: 'Usuario no encontrado' });
        }

        res.json({ success: true, mensaje: 'Usuario actualizado con éxito' });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al actualizar usuario' });
    }
});

app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const usuarioAEliminar = await Usuario.findOne({ id });
        
        if (!usuarioAEliminar) {
            return res.status(404).json({ success: false, mensaje: 'Usuario no encontrado' });
        }

        if (usuarioAEliminar.username === 'admin') {
            return res.status(403).json({ success: false, mensaje: 'Por seguridad, el usuario administrador principal no se puede eliminar' });
        }

        await Usuario.findOneAndDelete({ id });
        res.json({ success: true, mensaje: 'Usuario eliminado con éxito' });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al eliminar usuario' });
    }
});

// ================= RESERVAS =================

app.post('/api/reservas', async (req, res) => {
    try {
        const sedeReserva = req.body.sede || 'Salvaje';
        const fechaReserva = req.body.fecha;
        const mesaReserva = req.body.mesa;

        const mesaLibre = await verificarDisponibilidadMesa(sedeReserva, fechaReserva, mesaReserva);
        if (!mesaLibre) {
            return res.status(400).json({ 
                success: false, 
                mensaje: `Error de inconsistencia: La Mesa #${mesaReserva} ya se encuentra reservada para la sede ${sedeReserva} en la fecha ${fechaReserva}.` 
            });
        }

        const codigoQrPin = Math.floor(1000 + Math.random() * 9000).toString();

        const nuevaReserva = new Reserva({
            id: 'RES-' + Date.now().toString().slice(-6),
            codigoQr: codigoQrPin,
            nombreCliente: req.body.nombreCliente,
            telefono: req.body.telefono,
            email: req.body.email || '', 
            fecha: fechaReserva,
            sede: sedeReserva,
            zona: req.body.zona,
            mesa: mesaReserva || 'Asignar',
            mesaAsignada: req.body.mesaAsignada || mesaReserva || 'Sin Asignar',
            motivoReserva: req.body.motivoReserva || 'General',
            cantidadPersonasInicial: Number(req.body.cantidadPersonasInicial) || 1,
            personasLlegadas: 0,
            cortesias: 0,
            pagaronCover: 0,
            precioCover: Number(req.body.precioCover) || 30000,
            cortesiasQR: req.body.cumpleanos ? `QR-CORTESIA-${Math.random().toString(36).substring(7).toUpperCase()}` : null,
            estadoAsistencia: 'Reservado',
            usuarioCreador: req.body.usuarioCreador || 'Web Pública',
            nocheOperativa: obtenerNocheOperativa(fechaReserva)
        });

        await nuevaReserva.save();

        if (nuevaReserva.email) {
            await enviarCorreoReserva(
                nuevaReserva.email,
                nuevaReserva.nombreCliente,
                nuevaReserva.id,
                nuevaReserva.fecha,
                nuevaReserva.zona,
                nuevaReserva.mesa,
                nuevaReserva.codigoQr,
                nuevaReserva.sede
            );
        }

        res.status(201).json({ success: true, mensaje: 'Reserva registrada con éxito', reserva: nuevaReserva });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al registrar la reserva' });
    }
});

app.post('/api/admin/reservas', async (req, res) => {
    try {
        const sedeReserva = req.body.sede || 'Salvaje';
        const fechaReserva = req.body.fecha;
        const mesaReserva = req.body.mesa;

        const mesaLibre = await verificarDisponibilidadMesa(sedeReserva, fechaReserva, mesaReserva);
        if (!mesaLibre) {
            return res.status(400).json({ 
                success: false, 
                mensaje: `Error de inconsistencia: La Mesa #${mesaReserva} ya se encuentra reservada para la sede ${sedeReserva} en la fecha ${fechaReserva}.` 
            });
        }

        const codigoQrPin = Math.floor(1000 + Math.random() * 9000).toString();

        const nuevaReserva = new Reserva({
            id: 'RES-' + Date.now().toString().slice(-6),
            codigoQr: codigoQrPin,
            nombreCliente: req.body.nombreCliente,
            telefono: req.body.telefono,
            email: req.body.email || '', 
            fecha: fechaReserva,
            sede: sedeReserva,
            zona: req.body.zona,
            mesa: mesaReserva || 'Asignar',
            mesaAsignada: req.body.mesaAsignada || mesaReserva || 'Sin Asignar',
            motivoReserva: req.body.motivoReserva || 'General',
            cantidadPersonasInicial: Number(req.body.cantidadPersonasInicial) || 1,
            personasLlegadas: Number(req.body.personasLlegadas) || 0,
            cortesias: Number(req.body.cortesias) || 0,
            pagaronCover: Number(req.body.pagaronCover) || 0,
            precioCover: Number(req.body.precioCover) || 30000,
            estadoAsistencia: req.body.estadoAsistencia || 'Reservado',
            usuarioCreador: req.body.usuarioCreador || 'Administrador',
            nocheOperativa: obtenerNocheOperativa(fechaReserva)
        });

        await nuevaReserva.save();

        if (nuevaReserva.email) {
            await enviarCorreoReserva(
                nuevaReserva.email,
                nuevaReserva.nombreCliente,
                nuevaReserva.id,
                nuevaReserva.fecha,
                nuevaReserva.zona,
                nuevaReserva.mesa,
                nuevaReserva.codigoQr,
                nuevaReserva.sede
            );
        }

        res.status(201).json({ success: true, mensaje: 'Reserva creada por Admin', reserva: nuevaReserva });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al crear reserva por admin' });
    }
});

app.get('/api/reservas', async (req, res) => {
    try {
        const reservas = await Reserva.find({});
        res.json(reservas);
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al obtener reservas' });
    }
});

app.get('/api/reservas/:id', async (req, res) => {
    try {
        const reserva = await Reserva.findOne({ id: req.params.id });
        if (!reserva) {
            return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
        }
        res.json({ success: true, reserva });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al buscar reserva' });
    }
});

app.post('/api/reservas/:id/enviar-correo', async (req, res) => {
    try {
        const reserva = await Reserva.findOne({ id: req.params.id });
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
            reserva.codigoQr,
            reserva.sede
        );

        res.json(resultado);
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al enviar correo' });
    }
});

app.put('/api/reservas/:id/detalle', async (req, res) => {
    try {
        const updateData = {};
        if (req.body.cantidadPersonasInicial !== undefined) updateData.cantidadPersonasInicial = Number(req.body.cantidadPersonasInicial);
        if (req.body.personasLlegadas !== undefined) updateData.personasLlegadas = Number(req.body.personasLlegadas);
        if (req.body.cortesias !== undefined) updateData.cortesias = Number(req.body.cortesias);
        if (req.body.pagaronCover !== undefined) updateData.pagaronCover = Number(req.body.pagaronCover);
        if (req.body.precioCover !== undefined) updateData.precioCover = Number(req.body.precioCover);
        if (req.body.motivoReserva !== undefined) updateData.motivoReserva = req.body.motivoReserva;
        if (req.body.mesaAsignada !== undefined) updateData.mesaAsignada = req.body.mesaAsignada;

        const reserva = await Reserva.findOneAndUpdate({ id: req.params.id }, updateData, { new: true });
        if (!reserva) {
            return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
        }

        res.json({ success: true, mensaje: 'Detalle actualizado correctamente', reserva });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al actualizar detalle' });
    }
});

app.put('/api/admin/reservas/:id', async (req, res) => {
    try {
        const reservaActual = await Reserva.findOne({ id: req.params.id });
        if (!reservaActual) {
            return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
        }

        const sedeEvaluar = req.body.sede || reservaActual.sede;
        const fechaEvaluar = req.body.fecha || reservaActual.fecha;
        const mesaEvaluar = req.body.mesa || reservaActual.mesa;

        const mesaLibre = await verificarDisponibilidadMesa(sedeEvaluar, fechaEvaluar, mesaEvaluar, req.params.id);
        if (!mesaLibre) {
            return res.status(400).json({ 
                success: false, 
                mensaje: `Error de inconsistencia: La Mesa #${mesaEvaluar} ya se encuentra reservada para la sede ${sedeEvaluar} en la fecha ${fechaEvaluar}.` 
            });
        }

        const updateData = {};
        if (req.body.nombreCliente) updateData.nombreCliente = req.body.nombreCliente;
        if (req.body.telefono) updateData.telefono = req.body.telefono;
        if (req.body.email !== undefined) updateData.email = req.body.email;
        if (req.body.sede) updateData.sede = req.body.sede;
        if (req.body.fecha) {
            updateData.fecha = req.body.fecha;
            updateData.nocheOperativa = obtenerNocheOperativa(req.body.fecha);
        }
        if (req.body.zona) updateData.zona = req.body.zona;
        if (req.body.mesa) updateData.mesa = req.body.mesa;
        if (req.body.mesaAsignada) updateData.mesaAsignada = req.body.mesaAsignada;
        if (req.body.motivoReserva) updateData.motivoReserva = req.body.motivoReserva;

        const reserva = await Reserva.findOneAndUpdate({ id: req.params.id }, updateData, { new: true });

        res.json({ success: true, mensaje: 'Reserva actualizada correctamente por Administrador', reserva });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al actualizar reserva' });
    }
});

app.delete('/api/admin/reservas/:id', async (req, res) => {
    try {
        const reserva = await Reserva.findOneAndDelete({ id: req.params.id });
        if (!reserva) {
            return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
        }
        res.json({ success: true, mensaje: 'Reserva eliminada con éxito' });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al eliminar reserva' });
    }
});

app.delete('/api/admin/limpiar-base-datos', async (req, res) => {
    try {
        const resultadoReservas = await Reserva.deleteMany({});
        await Usuario.deleteMany({ username: { $ne: 'admin' } });
        await inicializarAdmin();

        res.json({ 
            success: true, 
            mensaje: `Base de datos limpiada exitosamente. Se eliminaron ${resultadoReservas.deletedCount} reservas.` 
        });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al limpiar la base de datos' });
    }
});

app.put('/api/reservas/:id/estado', async (req, res) => {
    try {
        const nuevoEstado = req.body.nuevoEstado || req.body.estadoAsistencia;
        const codigoIngresado = req.body.codigoIngresado;

        const reserva = await Reserva.findOne({ id: req.params.id });
        if (!reserva) {
            return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
        }

        const hoyStr = new Date().toISOString().split('T')[0];

        if (nuevoEstado === 'Presente') {
            if (reserva.fecha > hoyStr) {
                return res.status(400).json({ success: false, mensaje: 'No es posible cambiar a Presente: la fecha de la reserva es futura.' });
            }
            if (!reserva.codigoQr || reserva.codigoQr === 'undefined') {
                reserva.codigoQr = Math.floor(1000 + Math.random() * 9000).toString();
            }
            if (codigoIngresado && codigoIngresado !== reserva.codigoQr) {
                return res.status(400).json({ success: false, mensaje: 'Código QR / PIN incorrecto.' });
            }
        }

        reserva.estadoAsistencia = nuevoEstado;
        if (nuevoEstado === 'Presente' && (!reserva.personasLlegadas || reserva.personasLlegadas === 0)) {
            reserva.personasLlegadas = reserva.cantidadPersonasInicial;
        }

        await reserva.save();
        res.json({ success: true, mensaje: `Estado actualizado a ${nuevoEstado}`, reserva });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al actualizar estado' });
    }
});

app.post('/api/validar-qr', async (req, res) => {
    try {
        const { codigoQR } = req.body;
        const reserva = await Reserva.findOne({ cortesiasQR: codigoQR });

        if (!reserva) {
            return res.status(404).json({ valido: false, mensaje: 'Código QR de cortesía inválido o inexistente.' });
        }

        res.json({ 
            valido: true, 
            mensaje: `Cortesía válida para ${reserva.nombreCliente}`, 
            sede: reserva.sede || 'Salvaje',
            zona: reserva.zona 
        });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al validar QR' });
    }
});

app.post('/api/sincronizar-externo', async (req, res) => {
    try {
        const sedeReserva = req.body.sede || 'Salvaje';
        const fechaReserva = req.body.fecha || new Date().toISOString().split('T')[0];
        const mesaReserva = req.body.mesa;

        const mesaLibre = await verificarDisponibilidadMesa(sedeReserva, fechaReserva, mesaReserva);
        if (!mesaLibre) {
            return res.status(400).json({ 
                success: false, 
                mensaje: `Error de inconsistencia: La Mesa #${mesaReserva} ya se encuentra reservada para la sede ${sedeReserva} en la fecha ${fechaReserva}.` 
            });
        }

        const nuevaReserva = new Reserva({
            id: req.body.id || 'RES-' + Date.now().toString().slice(-6),
            nombreCliente: req.body.nombreCliente || 'Sin Nombre',
            telefono: req.body.telefono || '',
            email: req.body.email || '',
            fecha: fechaReserva,
            sede: sedeReserva,
            zona: req.body.zona || 'General',
            mesa: mesaReserva || 'Asignar',
            mesaAsignada: req.body.mesaAsignada || mesaReserva || 'Sin Asignar',
            motivoReserva: req.body.motivoReserva || 'General',
            cantidadPersonasInicial: Number(req.body.cantidadPersonasInicial) || 1,
            estadoAsistencia: 'Reservado',
            nocheOperativa: fechaReserva,
            usuarioCreador: 'Google Sheets'
        });
        
        await nuevaReserva.save();
        console.log('✅ Nueva reserva sincronizada desde Google Sheets:', nuevaReserva.nombreCliente);
        res.json({ success: true, mensaje: 'Reserva sincronizada exitosamente' });
    } catch (e) {
        console.error('❌ Error al sincronizar desde Sheets:', e);
        res.status(500).json({ success: false, mensaje: 'Error al procesar la reserva' });
    }
});

app.listen(PORT, () => {
    console.log(`Sistema VIP Norte operando en puerto ${PORT}`);
});

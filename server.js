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
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Conexión a MongoDB (Base de datos en la nube para evitar pérdida de datos por reinicios)
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vipnorte';

if (!process.env.MONGO_URI) {
    console.warn('Advertencia: No se encontró MONGO_URI. Se usará la base local por defecto (mongodb://127.0.0.1:27017/vipnorte).');
}

async function conectarBaseDatos() {
    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
        console.log('Conectado exitosamente a la Base de Datos en la Nube');
        await inicializarAdmin();
        await migrarDatosLocales();
    } catch (err) {
        console.warn('No se pudo conectar a MongoDB. El servidor seguirá arrancando en modo de desarrollo limitado:', err.message);
    }
}

// ================= MIGRACIÓN AUTOMÁTICA DE DATOS LOCALES =================
async function migrarDatosLocales() {
    try {
        if (mongoose.connection.readyState !== 1) {
            return;
        }

        const totalReservas = await Reserva.countDocuments();
        if (totalReservas === 0) {
            const rutaArchivo = path.join(__dirname, 'data', 'reservas.json');
            if (fs.existsSync(rutaArchivo)) {
                const datosRaw = fs.readFileSync(rutaArchivo, 'utf8');
                const reservasLocales = JSON.parse(datosRaw);

                if (reservasLocales.length > 0) {
                    for (let r of reservasLocales) {
                        const motivoUnificado = r.motivo || r.motivoReserva || r.motivo_reserva || 'General';
                        const promotorMigrado = r.promotor ? r.promotor.trim() : 'VIP NORTE';
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
                                motivoReserva: motivoUnificado,
                                cantidadPersonasInicial: Number(r.cantidadPersonasInicial) || 1,
                                personasLlegadas: Number(r.personasLlegadas) || 0,
                                cortesias: Number(r.cortesias) || 0,
                                pagaronCover: Number(r.pagaronCover) || 0,
                                precioCover: Number(r.precioCover) || 10000,
                                cortesiasQR: r.cortesiasQR || null,
                                estadoAsistencia: r.estadoAsistencia || 'Reservado',
                                usuarioCreador: r.usuarioCreador || 'Migración',
                                nocheOperativa: r.fecha || new Date().toISOString().split('T')[0],
                                promotor: promotorMigrado
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
    nota: { type: String, default: '' },
    comentarios: { type: String, default: '' },
    cantidadPersonasInicial: Number,
    personasLlegadas: { type: Number, default: 0 },
    cortesias: { type: Number, default: 0 },
    pagaronCover: { type: Number, default: 0 },
    precioCover: { type: Number, default: 10000 },
    cortesiasQR: String,
    estadoAsistencia: { type: String, default: 'Reservado' },
    usuarioCreador: String,
    nocheOperativa: String,
    promotor: { type: String, default: 'VIP NORTE' },
    creadoEn: { type: Date, default: Date.now }
});

const usuarioSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true },
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    rol: String,
    sede: String,
    activo: { type: Boolean, default: true },
    estado: { type: String, default: 'Activo' }
});

// Esquema para Configuración Dinámica del Index
const configuracionSchema = new mongoose.Schema({
    clave: { type: String, unique: true, required: true, default: 'global' },
    whatsappLink: { type: String, default: 'https://wa.me/573014815281' },
    whatsappNumero: { type: String, default: '3014815281' },
    whatsappTexto: { type: String, default: 'Comunícate al número de WhatsApp: 3014815281' },
    whatsappSubititulo: { type: String, default: 'Para una atención más inmediata.' },
    tituloConsulta: { type: String, default: 'Consultar Mi Reserva' },
    tituloCreacion: { type: String, default: 'Crear Nueva Reserva' },
    camposConfig: {
        emailRequerido: { type: Boolean, default: false },
        instagramRequerido: { type: Boolean, default: false },
        notaRequerida: { type: Boolean, default: false },
        promotorRequerido: { type: Boolean, default: false }
    },
    actualizadoEn: { type: Date, default: Date.now }
});

const Reserva = mongoose.model('Reserva', reservaSchema);
const Usuario = mongoose.model('Usuario', usuarioSchema);
const ConfiguracionIndex = mongoose.model('ConfiguracionIndex', configuracionSchema);

const memoryDb = {
    usuarios: [{
        id: 'USR-ADMIN',
        username: 'admin',
        password: '123',
        rol: 'Administrador',
        sede: 'TODAS',
        activo: true,
        estado: 'Activo'
    }],
    configuracion: {
        clave: 'global',
        whatsapp: 'https://wa.me/573014815281',
        whatsappLink: 'https://wa.me/573014815281',
        whatsappNumero: '3014815281',
        whatsappTexto: 'Comunícate al número de WhatsApp: 3014815281',
        whatsappSubititulo: 'Para una atención más inmediata.',
        subtitulo: 'Para una atención más inmediata.',
        titulo: 'Sistema de Reservas - VIP Norte',
        tituloConsulta: 'Consultar Mi Reserva',
        tituloCreacion: 'Crear Nueva Reserva',
        precioCover: 10000,
        camposConfig: {
            emailRequerido: false,
            instagramRequerido: false,
            notaRequerida: false,
            promotorRequerido: false,
            email: 'opcional',
            telefono: 'obligatorio'
        },
        campos: {
            email: 'opcional',
            telefono: 'obligatorio'
        },
        actualizadoEn: Date.now()
    },
    reservas: []
};

function normalizarConfiguracionPayload(payload = {}) {
    const rawCampos = payload.campos || payload.camposConfig || {};
    const emailEstado = String((rawCampos.email ?? rawCampos.emailRequerido ?? payload.email ?? payload.emailRequerido ?? 'opcional')).toLowerCase();
    const telefonoEstado = String((rawCampos.telefono ?? rawCampos.telefonoRequerido ?? payload.telefono ?? payload.telefonoRequerido ?? 'obligatorio')).toLowerCase();
    const whatsappLink = payload.whatsappLink || payload.whatsapp || '';
    const whatsappNumero = payload.whatsappNumero || (whatsappLink.match(/\d+/g) || []).join('').slice(-10) || '3014815281';
    return {
        whatsapp: payload.whatsapp || whatsappLink,
        whatsappLink,
        whatsappNumero,
        whatsappTexto: payload.whatsappTexto || payload.whatsappMensaje || `Comunícate al número de WhatsApp: ${whatsappNumero}`,
        whatsappSubititulo: payload.whatsappSubititulo || payload.subtitulo || 'Para una atención más inmediata.',
        titulo: payload.titulo || payload.tituloConsulta || 'Sistema de Reservas - VIP Norte',
        tituloConsulta: payload.tituloConsulta || payload.titulo || 'Consultar Mi Reserva',
        tituloCreacion: payload.tituloCreacion || payload.titulo || 'Crear Nueva Reserva',
        subtitulo: payload.subtitulo || payload.whatsappSubititulo || 'Para una atención más inmediata.',
        precioCover: Number(payload.precioCover ?? 10000),
        camposConfig: {
            emailRequerido: emailEstado === 'obligatorio' || emailEstado === 'true',
            instagramRequerido: Boolean(payload.instagramRequerido || rawCampos.instagramRequerido),
            notaRequerida: Boolean(payload.notaRequerida || rawCampos.notaRequerida),
            promotorRequerido: Boolean(payload.promotorRequerido || rawCampos.promotorRequerido),
            email: emailEstado,
            telefono: telefonoEstado
        },
        campos: {
            email: emailEstado,
            telefono: telefonoEstado
        },
        actualizadoEn: Date.now()
    };
}

function isMemoryMode() {
    return mongoose.connection.readyState !== 1;
}

function normalizarPromotor(valor) {
    const valorNormalizado = valor ? String(valor).trim() : '';
    if (!valorNormalizado) return 'VIP NORTE';
    const valorMayus = valorNormalizado.toUpperCase();
    if (valorMayus === 'FREDYFREE') return 'FREDYFREE';
    if (valorMayus === 'PRUEBASISTEMA') return 'PRUEBASISTEMA';
    return valorNormalizado;
}

function aplicarReglaPromocionCover(reserva) {
    const promotor = normalizarPromotor(reserva.promotor);
    const codigo = String(reserva.promotor || reserva.codigoPromocional || '').toUpperCase();
    const esFredyFree = promotor === 'FREDYFREE' || codigo.includes('FREDYFREE');
    const esPruebaSistema = promotor === 'PRUEBASISTEMA' || codigo.includes('PRUEBASISTEMA');

    if (esFredyFree) {
        reserva.promotor = 'FREDYFREE';
        reserva.precioCover = 0;
        reserva.pagaronCover = 0;
    }

    if (esPruebaSistema) {
        reserva.promotor = 'PRUEBASISTEMA';
        reserva.estadoAsistencia = reserva.estadoAsistencia === 'Cancelado' ? 'Cancelado' : 'Prueba';
        reserva.precioCover = 0;
        reserva.pagaronCover = 0;
    }

    return reserva;
}

function obtenerDataReserva(r) {
    return {
        ...r,
        creadoEn: r.creadoEn || new Date()
    };
}

function buscarReservaEnMemoria(id) {
    return memoryDb.reservas.find(r => String(r.id) === String(id));
}

function construirFiltroReservasMemoria({ fecha, sede, query, id } = {}) {
    return memoryDb.reservas.filter(r => {
        if (fecha && String(r.fecha) !== String(fecha)) return false;
        if (sede && sede !== 'TODAS' && String(r.sede) !== String(sede)) return false;
        if (query && !(
            String(r.telefono || '').toLowerCase().includes(String(query).toLowerCase()) ||
            String(r.id || '').toLowerCase().includes(String(query).toLowerCase()) ||
            String(r.codigoQr || '').includes(String(query))
        )) {
            return false;
        }
        if (id && String(r.id) !== String(id)) return false;
        return true;
    });
}

function desbloquearMesaEnMemoria(sede, fecha, mesa, idActualExcluir = null) {
    if (!mesa || mesa === 'Sin Asignar' || mesa === 'Mesa Asignar' || mesa === 'Asignar') {
        return true;
    }
    const coinciden = memoryDb.reservas.some(r => {
        if (idActualExcluir && String(r.id) === String(idActualExcluir)) return false;
        return String(r.fecha) === String(fecha) && String(r.sede) === String(sede) && String(r.mesa) === String(mesa);
    });
    return !coinciden;
}

// Inicializar usuario Administrador por defecto si no existe
async function inicializarAdmin() {
    try {
        if (mongoose.connection.readyState !== 1) {
            return;
        }

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

        // Inicializar configuración por defecto del Index si no existe
        const configExiste = await ConfiguracionIndex.findOne({ clave: 'global' });
        if (!configExiste) {
            await ConfiguracionIndex.create({
                clave: 'global',
                whatsappLink: 'https://wa.me/573014815281',
                whatsappNumero: '3014815281',
                whatsappTexto: 'Comunícate al número de WhatsApp: 3014815281',
                whatsappSubititulo: 'Para una atención más inmediata.',
                tituloConsulta: 'Consultar Mi Reserva',
                tituloCreacion: 'Crear Nueva Reserva',
                camposConfig: {
                    emailRequerido: false,
                    instagramRequerido: false,
                    notaRequerida: false,
                    promotorRequerido: false
                }
            });
            console.log('Configuración global del Index inicializada en la base de datos.');
        }
    } catch (e) {
        console.error('Error al inicializar admin o configuraciones:', e);
    }
}

// ================= VALIDACIÓN DE DISPONIBILIDAD DE MESA =================
async function verificarDisponibilidadMesa(nuevaSede, nuevaFecha, nuevaMesa, idActualExcluir = null) {
    if (!nuevaMesa || nuevaMesa === 'Sin Asignar' || nuevaMesa === 'Mesa Asignar' || nuevaMesa === 'Asignar') {
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
        if (!resend) {
            console.warn('Resend no está configurado; se omite el envío de correo para la reserva:', idReserva);
            return { success: false, mensaje: 'La API key de Resend no está configurada.' };
        }

        const data = await resend.emails.send({
            from: process.env.RESEND_FROM || 'Portal VIP Norte <onboarding@resend.dev>',
            to: [destinatario],
            subject: `¡Reserva Confirmada! #${idReserva} - ${sede || 'VIP Norte'}`,
            html: `
                <div style="background-color: #09090b; color: #ffffff; padding: 20px; font-family: sans-serif; border-radius: 10px;">
                    <h2 style="color: #00FFEF;">¡Hola, ${nombreCliente}!</h2>
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
        if (isMemoryMode()) {
            const usuario = memoryDb.usuarios.find(u => u.username === username && u.password === password);
            if (!usuario) {
                return res.status(401).json({ success: false, mensaje: 'Usuario o contraseña incorrectos' });
            }
            if (usuario.activo === false || String(usuario.estado || 'Activo').toLowerCase() === 'suspendido') {
                return res.status(403).json({ success: false, mensaje: 'Este usuario está suspendido y no puede ingresar al sistema.' });
            }
            return res.json({
                success: true,
                rol: usuario.rol,
                sede: usuario.sede,
                username: usuario.username,
                mensaje: 'Autenticación exitosa'
            });
        }

        const usuario = await Usuario.findOne({ username, password });

        if (!usuario) {
            return res.status(401).json({ success: false, mensaje: 'Usuario o contraseña incorrectos' });
        }

        if (usuario.activo === false || String(usuario.estado || 'Activo').toLowerCase() === 'suspendido') {
            return res.status(403).json({ success: false, mensaje: 'Este usuario está suspendido y no puede ingresar al sistema.' });
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

// ================= GESTIÓN DE CONFIGURACIÓN DEL INDEX =================
app.get(['/api/configuracion-index', '/api/admin/configuracion', '/api/configuracion'], async (req, res) => {
    try {
        if (isMemoryMode()) {
            const config = { ...memoryDb.configuracion, clave: 'global' };
            return res.json({ success: true, config, ...config });
        }

        let config = await ConfiguracionIndex.findOne({ clave: 'global' });
        if (!config) {
            config = await ConfiguracionIndex.create({ clave: 'global' });
        }
        const payload = config.toObject ? config.toObject() : config;
        res.json({ success: true, config: payload, ...payload });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al obtener la configuración' });
    }
});

app.put(['/api/configuracion-index', '/api/admin/configuracion', '/api/configuracion'], async (req, res) => {
    try {
        const updateData = normalizarConfiguracionPayload(req.body);

        if (isMemoryMode()) {
            memoryDb.configuracion = { ...memoryDb.configuracion, ...updateData, clave: 'global' };
            return res.json({ success: true, mensaje: 'Configuración actualizada con éxito', config: memoryDb.configuracion });
        }

        const configActualizada = await ConfiguracionIndex.findOneAndUpdate(
            { clave: 'global' }, 
            updateData, 
            { new: true, upsert: true }
        );

        res.json({ success: true, mensaje: 'Configuración actualizada con éxito', config: configActualizada });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al actualizar la configuración' });
    }
});

app.post(['/api/configuracion-index', '/api/admin/configuracion', '/api/configuracion'], async (req, res) => {
    try {
        const updateData = normalizarConfiguracionPayload(req.body);

        if (isMemoryMode()) {
            memoryDb.configuracion = { ...memoryDb.configuracion, ...updateData, clave: 'global' };
            return res.json({ success: true, mensaje: 'Configuración guardada exitosamente', config: memoryDb.configuracion });
        }

        const configActualizada = await ConfiguracionIndex.findOneAndUpdate(
            { clave: 'global' }, 
            updateData, 
            { new: true, upsert: true }
        );

        res.json({ success: true, mensaje: 'Configuración guardada exitosamente', config: configActualizada });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al guardar la configuración' });
    }
});

// ================= GESTIÓN DE USUARIOS =================
app.get('/api/usuarios', async (req, res) => {
    try {
        if (isMemoryMode()) {
            return res.json(memoryDb.usuarios.map(usuario => ({
                ...usuario,
                activo: usuario.activo !== false,
                estado: usuario.estado || (usuario.activo === false ? 'Suspendido' : 'Activo')
            })));
        }
        const usuarios = await Usuario.find({});
        res.json(usuarios.map(usuario => ({
            ...usuario.toObject(),
            activo: usuario.activo !== false,
            estado: usuario.estado || (usuario.activo === false ? 'Suspendido' : 'Activo')
        })));
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al obtener usuarios' });
    }
});

app.post('/api/usuarios', async (req, res) => {
    try {
        const { username, password, rol, sede, activo, estado } = req.body;

        if (isMemoryMode()) {
            const usuarioExiste = memoryDb.usuarios.some(u => u.username === username);
            if (usuarioExiste) {
                return res.status(400).json({ success: false, mensaje: 'El nombre de usuario ya existe' });
            }
            const nuevoUsuario = {
                id: 'USR-' + Date.now().toString().slice(-6),
                username,
                password,
                rol: rol || 'Staff',
                sede: sede || 'TODAS',
                activo: activo !== false,
                estado: estado || (activo === false ? 'Suspendido' : 'Activo')
            };
            memoryDb.usuarios.push(nuevoUsuario);
            return res.status(201).json({ success: true, mensaje: 'Usuario creado con éxito', usuario: nuevoUsuario });
        }
        
        const usuarioExiste = await Usuario.findOne({ username });
        if (usuarioExiste) {
            return res.status(400).json({ success: false, mensaje: 'El nombre de usuario ya existe' });
        }

        const nuevoUsuario = new Usuario({
            id: 'USR-' + Date.now().toString().slice(-6),
            username,
            password,
            rol: rol || 'Staff',
            sede: sede || 'TODAS',
            activo: activo !== false,
            estado: estado || (activo === false ? 'Suspendido' : 'Activo')
        });

        await nuevoUsuario.save();
        res.status(201).json({ success: true, mensaje: 'Usuario creado con éxito', usuario: nuevoUsuario });
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
        if (req.body.activo !== undefined) updateData.activo = Boolean(req.body.activo);
        if (req.body.estado) updateData.estado = req.body.estado;

        if (isMemoryMode()) {
            const index = memoryDb.usuarios.findIndex(u => String(u.id) === String(id));
            if (index === -1) {
                return res.status(404).json({ success: false, mensaje: 'Usuario no encontrado' });
            }
            memoryDb.usuarios[index] = { ...memoryDb.usuarios[index], ...updateData };
            if (updateData.activo !== undefined) {
                memoryDb.usuarios[index].estado = memoryDb.usuarios[index].activo ? 'Activo' : 'Suspendido';
            }
            return res.json({ success: true, mensaje: 'Usuario actualizado con éxito', usuario: memoryDb.usuarios[index] });
        }

        if (req.body.activo !== undefined) {
            updateData.estado = Boolean(req.body.activo) ? 'Activo' : 'Suspendido';
        }

        const usuarioActualizado = await Usuario.findOneAndUpdate({ id }, updateData, { new: true });
        if (!usuarioActualizado) {
            return res.status(404).json({ success: false, mensaje: 'Usuario no encontrado' });
        }

        res.json({ success: true, mensaje: 'Usuario actualizado con éxito', usuario: usuarioActualizado });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al actualizar usuario' });
    }
});

app.patch('/api/usuarios/:id/suspend', async (req, res) => {
    try {
        const { id } = req.params;
        const activo = req.body.activo !== undefined ? Boolean(req.body.activo) : false;

        if (isMemoryMode()) {
            const usuario = memoryDb.usuarios.find(u => String(u.id) === String(id));
            if (!usuario) {
                return res.status(404).json({ success: false, mensaje: 'Usuario no encontrado' });
            }
            usuario.activo = activo;
            usuario.estado = activo ? 'Activo' : 'Suspendido';
            return res.json({ success: true, mensaje: activo ? 'Usuario activado con éxito' : 'Usuario suspendido con éxito', usuario });
        }

        const usuario = await Usuario.findOne({ id });
        if (!usuario) {
            return res.status(404).json({ success: false, mensaje: 'Usuario no encontrado' });
        }

        usuario.activo = activo;
        usuario.estado = activo ? 'Activo' : 'Suspendido';
        await usuario.save();
        res.json({ success: true, mensaje: activo ? 'Usuario activado con éxito' : 'Usuario suspendido con éxito', usuario });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al cambiar el estado del usuario' });
    }
});

app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (isMemoryMode()) {
            const usuarioAEliminar = memoryDb.usuarios.find(u => String(u.id) === String(id));
            if (!usuarioAEliminar) {
                return res.status(404).json({ success: false, mensaje: 'Usuario no encontrado' });
            }
            if (usuarioAEliminar.username === 'admin') {
                return res.status(403).json({ success: false, mensaje: 'Por seguridad, el usuario administrador principal no se puede eliminar' });
            }
            memoryDb.usuarios = memoryDb.usuarios.filter(u => String(u.id) !== String(id));
            return res.json({ success: true, mensaje: 'Usuario eliminado con éxito' });
        }

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

// Obtener reservas con filtros
app.get('/api/reservas', async (req, res) => {
    try {
        const { fecha, sede } = req.query;
        if (isMemoryMode()) {
            const reservas = construirFiltroReservasMemoria({ fecha, sede });
            return res.json([...reservas].sort((a, b) => new Date(b.creadoEn || b.fecha) - new Date(a.creadoEn || a.fecha)));
        }

        let filtro = {};

        if (fecha) filtro.fecha = fecha;
        if (sede && sede !== 'TODAS') filtro.sede = sede;

        const reservas = await Reserva.find(filtro).sort({ creadoEn: -1 });
        res.json(reservas);
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al obtener reservas' });
    }
});

// Obtener reservas para administración
app.get('/api/admin/reservas', async (req, res) => {
    try {
        const { fecha, sede } = req.query;
        if (isMemoryMode()) {
            const reservas = construirFiltroReservasMemoria({ fecha, sede });
            return res.json([...reservas].sort((a, b) => new Date(b.creadoEn || b.fecha) - new Date(a.creadoEn || a.fecha)));
        }

        let filtro = {};

        if (fecha) filtro.fecha = fecha;
        if (sede && sede !== 'TODAS') filtro.sede = sede;

        const reservas = await Reserva.find(filtro).sort({ creadoEn: -1 });
        res.json(reservas);
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al obtener reservas para admin' });
    }
});

// Buscar reserva por teléfono o código QR/ID (Público)
app.get('/api/reservas/buscar', async (req, res) => {
    try {
        const { query, sede } = req.query;
        if (!query) {
            return res.status(400).json({ success: false, mensaje: 'Debe ingresar un criterio de búsqueda' });
        }

        if (isMemoryMode()) {
            const reservas = construirFiltroReservasMemoria({ query, sede });
            return res.json(reservas);
        }

        let filtro = {
            $or: [
                { telefono: { $regex: query, $options: 'i' } },
                { id: { $regex: query, $options: 'i' } },
                { codigoQr: query }
            ]
        };

        if (sede && sede !== 'TODAS') {
            filtro.sede = sede;
        }

        const reservas = await Reserva.find(filtro);
        res.json(reservas);
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al buscar reservas' });
    }
});

// Obtener reserva por ID específico
app.get('/api/reservas/:id', async (req, res) => {
    try {
        if (isMemoryMode()) {
            const reserva = buscarReservaEnMemoria(req.params.id);
            if (!reserva) {
                return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
            }
            return res.json(reserva);
        }

        const reserva = await Reserva.findOne({ id: req.params.id });
        if (!reserva) {
            return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
        }
        res.json(reserva);
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al consultar la reserva' });
    }
});

// Modificar reserva por parte del cliente (Público: cambiar personas, fecha, sede, zona, mesa o cancelar)
app.put('/api/reservas/:id/modificar', async (req, res) => {
    try {
        const { cantidadPersonasInicial, fecha, sede, zona, mesaAsignada, mesa, estadoAsistencia, codigoIngresado } = req.body;
        if (isMemoryMode()) {
            const reserva = buscarReservaEnMemoria(req.params.id);
            if (!reserva) {
                return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
            }

            if (codigoIngresado && reserva.codigoQr && codigoIngresado !== reserva.codigoQr) {
                return res.status(400).json({ success: false, mensaje: 'El código PIN de acceso no coincide' });
            }

            if (estadoAsistencia === 'Cancelado') {
                reserva.estadoAsistencia = 'Cancelado';
                return res.json({ success: true, mensaje: 'Reserva cancelada exitosamente y guardada como lead', reserva });
            }

            const nuevaSede = sede || reserva.sede;
            const nuevaFecha = fecha || reserva.fecha;
            const nuevaMesa = mesaAsignada || mesa || reserva.mesaAsignada || reserva.mesa;

            if (nuevaMesa && nuevaMesa !== 'Sin Asignar' && (nuevaSede !== reserva.sede || nuevaFecha !== reserva.fecha || nuevaMesa !== reserva.mesaAsignada)) {
                const mesaLibre = desbloquearMesaEnMemoria(nuevaSede, nuevaFecha, nuevaMesa, reserva.id);
                if (!mesaLibre) {
                    return res.status(400).json({
                        success: false,
                        mensaje: `La Mesa #${nuevaMesa} ya se encuentra ocupada para la sede ${nuevaSede} en la fecha ${nuevaFecha}.`
                    });
                }
            }

            if (cantidadPersonasInicial !== undefined) reserva.cantidadPersonasInicial = Number(cantidadPersonasInicial);
            if (fecha) reserva.fecha = fecha;
            if (sede) reserva.sede = sede;
            if (zona) reserva.zona = zona;
            if (mesaAsignada) {
                reserva.mesaAsignada = mesaAsignada;
                reserva.mesa = mesaAsignada;
            }
            if (mesa) {
                reserva.mesa = mesa;
                reserva.mesaAsignada = mesa;
            }

            return res.json({ success: true, mensaje: 'Reserva modificada correctamente', reserva });
        }

        const reserva = await Reserva.findOne({ id: req.params.id });

        if (!reserva) {
            return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
        }

        // Validar PIN de seguridad opcional si se envía
        if (codigoIngresado && reserva.codigoQr && codigoIngresado !== reserva.codigoQr) {
            return res.status(400).json({ success: false, mensaje: 'El código PIN de acceso no coincide' });
        }

        // Si se va a cancelar la reserva, la marcamos como Cancelada pero NO se elimina para conservarla como lead
        if (estadoAsistencia === 'Cancelado') {
            reserva.estadoAsistencia = 'Cancelado';
            await reserva.save();
            return res.json({ success: true, mensaje: 'Reserva cancelada exitosamente y guardada como lead', reserva });
        }

        // Si cambia de fecha, sede o mesa, validamos la disponibilidad
        const nuevaSede = sede || reserva.sede;
        const nuevaFecha = fecha || reserva.fecha;
        const nuevaMesa = mesaAsignada || mesa || reserva.mesaAsignada || reserva.mesa;

        if (nuevaMesa && nuevaMesa !== 'Sin Asignar' && (nuevaSede !== reserva.sede || nuevaFecha !== reserva.fecha || nuevaMesa !== reserva.mesaAsignada)) {
            const mesaLibre = await verificarDisponibilidadMesa(nuevaSede, nuevaFecha, nuevaMesa, reserva.id);
            if (!mesaLibre) {
                return res.status(400).json({
                    success: false,
                    mensaje: `La Mesa #${nuevaMesa} ya se encuentra ocupada para la sede ${nuevaSede} en la fecha ${nuevaFecha}.`
                });
            }
        }

        // Actualizar campos permitidos
        if (cantidadPersonasInicial !== undefined) reserva.cantidadPersonasInicial = Number(cantidadPersonasInicial);
        if (fecha) reserva.fecha = fecha;
        if (sede) reserva.sede = sede;
        if (zona) reserva.zona = zona;
        if (mesaAsignada) {
            reserva.mesaAsignada = mesaAsignada;
            reserva.mesa = mesaAsignada;
        }
        if (mesa) {
            reserva.mesa = mesa;
            reserva.mesaAsignada = mesa;
        }

        await reserva.save();
        res.json({ success: true, mensaje: 'Reserva modificada correctamente', reserva });
    } catch (e) {
        console.error('Error al modificar reserva:', e);
        res.status(500).json({ success: false, mensaje: 'Error al modificar la reserva' });
    }
});

// Crear nueva reserva pública
app.post('/api/reservas', async (req, res) => {
    try {
        const sedeReserva = req.body.sede || 'Salvaje';
        const fechaReserva = req.body.fecha;
        const mesaReserva = req.body.mesa;

        if (isMemoryMode()) {
            if (!desbloquearMesaEnMemoria(sedeReserva, fechaReserva, mesaReserva)) {
                return res.status(400).json({
                    success: false,
                    mensaje: `La Mesa #${mesaReserva} ya se encuentra ocupada para la sede ${sedeReserva} en la fecha ${fechaReserva}.`
                });
            }

            const codigoQrPin = Math.floor(1000 + Math.random() * 9000).toString();
            const idGenerado = 'RES-' + Date.now().toString().slice(-6);
            const motivoSeleccionado = req.body.motivo || req.body.motivoReserva || req.body.motivo_reserva || 'General';
            const promotorSeleccionado = normalizarPromotor(req.body.promotor);
            const notaReserva = String(req.body.nota || req.body.comentario || req.body.notas || req.body.comentarios || '').trim();
            const nuevaReserva = {
                id: idGenerado,
                codigoQr: codigoQrPin,
                nombreCliente: req.body.nombreCliente,
                telefono: req.body.telefono,
                email: req.body.email || '',
                fecha: fechaReserva,
                sede: sedeReserva,
                zona: req.body.zona || 'General',
                mesa: mesaReserva || 'Asignar',
                mesaAsignada: req.body.mesaAsignada || mesaReserva || 'Sin Asignar',
                motivoReserva: motivoSeleccionado,
                nota: notaReserva,
                comentarios: notaReserva,
                cantidadPersonasInicial: Number(req.body.cantidadPersonasInicial) || 1,
                personasLlegadas: 0,
                cortesias: 0,
                pagaronCover: 0,
                precioCover: Number(req.body.precioCover) || 10000,
                estadoAsistencia: 'Reservado',
                usuarioCreador: req.body.usuarioCreador || 'VIP NORTE',
                nocheOperativa: fechaReserva,
                promotor: promotorSeleccionado,
                creadoEn: new Date()
            };
            aplicarReglaPromocionCover(nuevaReserva);
            memoryDb.reservas.push(nuevaReserva);

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

            return res.status(201).json({ success: true, mensaje: 'Reserva registrada con éxito', reserva: nuevaReserva });
        }

        const mesaLibre = await verificarDisponibilidadMesa(sedeReserva, fechaReserva, mesaReserva);
        if (!mesaLibre) {
            return res.status(400).json({
                success: false,
                mensaje: `La Mesa #${mesaReserva} ya se encuentra ocupada para la sede ${sedeReserva} en la fecha ${fechaReserva}.`
            });
        }

        const codigoQrPin = Math.floor(1000 + Math.random() * 9000).toString();
        const idGenerado = 'RES-' + Date.now().toString().slice(-6);
        const motivoSeleccionado = req.body.motivo || req.body.motivoReserva || req.body.motivo_reserva || 'General';
        const promotorSeleccionado = normalizarPromotor(req.body.promotor);
        const notaReserva = String(req.body.nota || req.body.comentario || req.body.notas || req.body.comentarios || '').trim();

        const nuevaReserva = new Reserva({
            id: idGenerado,
            codigoQr: codigoQrPin,
            nombreCliente: req.body.nombreCliente,
            telefono: req.body.telefono,
            email: req.body.email || '',
            fecha: fechaReserva,
            sede: sedeReserva,
            zona: req.body.zona || 'General',
            mesa: mesaReserva || 'Asignar',
            mesaAsignada: req.body.mesaAsignada || mesaReserva || 'Sin Asignar',
            motivoReserva: motivoSeleccionado,
            nota: notaReserva,
            comentarios: notaReserva,
            cantidadPersonasInicial: Number(req.body.cantidadPersonasInicial) || 1,
            personasLlegadas: 0,
            cortesias: 0,
            pagaronCover: 0,
            precioCover: Number(req.body.precioCover) || 10000,
            estadoAsistencia: 'Reservado',
            usuarioCreador: req.body.usuarioCreador || 'VIP NORTE',
            nocheOperativa: fechaReserva,
            promotor: promotorSeleccionado
        });

        aplicarReglaPromocionCover(nuevaReserva);
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

// Crear reserva desde panel Admin / Staff
app.post('/api/admin/reservas', async (req, res) => {
    try {
        const sedeReserva = req.body.sede || 'Salvaje';
        const fechaReserva = req.body.fecha;
        const mesaReserva = req.body.mesa;

        if (isMemoryMode()) {
            if (!desbloquearMesaEnMemoria(sedeReserva, fechaReserva, mesaReserva)) {
                return res.status(400).json({
                    success: false,
                    mensaje: `Error de inconsistencia: La Mesa #${mesaReserva} ya se encuentra reservada para la sede ${sedeReserva} en la fecha ${fechaReserva}.`
                });
            }

            const notaReserva = String(req.body.nota || req.body.comentario || req.body.notas || req.body.comentarios || '').trim();
            const nuevaReserva = {
                id: req.body.id || 'RES-' + Date.now().toString().slice(-6),
                codigoQr: Math.floor(1000 + Math.random() * 9000).toString(),
                nombreCliente: req.body.nombreCliente,
                telefono: req.body.telefono,
                email: req.body.email || '',
                fecha: fechaReserva,
                sede: sedeReserva,
                zona: req.body.zona || 'General',
                mesa: mesaReserva || 'Asignar',
                mesaAsignada: req.body.mesaAsignada || mesaReserva || 'Sin Asignar',
                motivoReserva: req.body.motivo || req.body.motivoReserva || req.body.motivo_reserva || 'General',
                nota: notaReserva,
                comentarios: notaReserva,
                cantidadPersonasInicial: Number(req.body.cantidadPersonasInicial) || 1,
                personasLlegadas: Number(req.body.personasLlegadas) || 0,
                cortesias: Number(req.body.cortesias) || 0,
                pagaronCover: Number(req.body.pagaronCover) || 0,
                precioCover: Number(req.body.precioCover) || 10000,
                estadoAsistencia: req.body.estadoAsistencia || 'Reservado',
                usuarioCreador: req.body.usuarioCreador || 'Administrador',
                nocheOperativa: fechaReserva,
                promotor: normalizarPromotor(req.body.promotor),
                creadoEn: new Date()
            };
            aplicarReglaPromocionCover(nuevaReserva);
            memoryDb.reservas.push(nuevaReserva);
            return res.status(201).json({ success: true, mensaje: 'Reserva administrativa creada con éxito', reserva: nuevaReserva });
        }

        const mesaLibre = await verificarDisponibilidadMesa(sedeReserva, fechaReserva, mesaReserva);
        if (!mesaLibre) {
            return res.status(400).json({
                success: false,
                mensaje: `Error de inconsistencia: La Mesa #${mesaReserva} ya se encuentra reservada para la sede ${sedeReserva} en la fecha ${fechaReserva}.`
            });
        }

        const codigoQrPin = Math.floor(1000 + Math.random() * 9000).toString();
        const motivoSeleccionado = req.body.motivo || req.body.motivoReserva || req.body.motivo_reserva || 'General';
        const promotorSeleccionado = normalizarPromotor(req.body.promotor);
        const notaReserva = String(req.body.nota || req.body.comentario || req.body.notas || req.body.comentarios || '').trim();

        const nuevaReserva = new Reserva({
            id: req.body.id || 'RES-' + Date.now().toString().slice(-6),
            codigoQr: codigoQrPin,
            nombreCliente: req.body.nombreCliente,
            telefono: req.body.telefono,
            email: req.body.email || '',
            fecha: fechaReserva,
            sede: sedeReserva,
            zona: req.body.zona || 'General',
            mesa: mesaReserva || 'Asignar',
            mesaAsignada: req.body.mesaAsignada || mesaReserva || 'Sin Asignar',
            motivoReserva: motivoSeleccionado,
            nota: notaReserva,
            comentarios: notaReserva,
            cantidadPersonasInicial: Number(req.body.cantidadPersonasInicial) || 1,
            personasLlegadas: Number(req.body.personasLlegadas) || 0,
            cortesias: Number(req.body.cortesias) || 0,
            pagaronCover: Number(req.body.pagaronCover) || 0,
            precioCover: Number(req.body.precioCover) || 10000,
            estadoAsistencia: req.body.estadoAsistencia || 'Reservado',
            usuarioCreador: req.body.usuarioCreador || 'Administrador',
            nocheOperativa: fechaReserva,
            promotor: promotorSeleccionado
        });

        aplicarReglaPromocionCover(nuevaReserva);
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

        res.status(201).json({ success: true, mensaje: 'Reserva administrativa creada con éxito', reserva: nuevaReserva });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al registrar la reserva administrativa' });
    }
});

// Sincronización desde Google Sheets / Webhook
app.post('/api/sincronizar-sheets', async (req, res) => {
    try {
        const fechaReserva = req.body.fecha || new Date().toISOString().split('T')[0];
        const sedeReserva = req.body.sede || 'NORTE';
        const mesaReserva = req.body.mesa || 'Asignar';
        const motivoSeleccionado = req.body.motivo_reserva || req.body.motivoReserva || 'General';
        const promotorSeleccionado = req.body.promotor ? req.body.promotor.trim() : 'VIP NORTE';

        if (isMemoryMode()) {
            const nuevaReserva = {
                id: req.body.id || 'RES-' + Date.now().toString().slice(-6),
                codigoQr: Math.floor(1000 + Math.random() * 9000).toString(),
                nombreCliente: req.body.nombreCliente || 'Sin Nombre',
                telefono: req.body.telefono || '',
                email: req.body.email || '',
                fecha: fechaReserva,
                sede: sedeReserva,
                zona: req.body.zona || 'General',
                mesa: mesaReserva,
                mesaAsignada: req.body.mesaAsignada || mesaReserva || 'Sin Asignar',
                motivoReserva: motivoSeleccionado,
                cantidadPersonasInicial: Number(req.body.cantidadPersonasInicial) || 1,
                estadoAsistencia: 'Reservado',
                nocheOperativa: fechaReserva,
                usuarioCreador: 'Google Sheets',
                promotor: promotorSeleccionado,
                creadoEn: new Date()
            };
            memoryDb.reservas.push(nuevaReserva);
            console.log('✅ Nueva reserva sincronizada desde Google Sheets:', nuevaReserva.nombreCliente);
            return res.json({ success: true, mensaje: 'Reserva sincronizada exitosamente' });
        }

        const nuevaReserva = new Reserva({
            id: req.body.id || 'RES-' + Date.now().toString().slice(-6),
            codigoQr: Math.floor(1000 + Math.random() * 9000).toString(),
            nombreCliente: req.body.nombreCliente || 'Sin Nombre',
            telefono: req.body.telefono || '',
            email: req.body.email || '',
            fecha: fechaReserva,
            sede: sedeReserva,
            zona: req.body.zona || 'General',
            mesa: mesaReserva,
            mesaAsignada: req.body.mesaAsignada || mesaReserva || 'Sin Asignar',
            motivoReserva: motivoSeleccionado,
            cantidadPersonasInicial: Number(req.body.cantidadPersonasInicial) || 1,
            estadoAsistencia: 'Reservado',
            nocheOperativa: fechaReserva,
            usuarioCreador: 'Google Sheets',
            promotor: promotorSeleccionado
        });

        await nuevaReserva.save();
        console.log('✅ Nueva reserva sincronizada desde Google Sheets:', nuevaReserva.nombreCliente);
        res.json({ success: true, mensaje: 'Reserva sincronizada exitosamente' });
    } catch (e) {
        console.error('❌ Error al sincronizar desde Sheets:', e);
        res.status(500).json({ success: false, mensaje: 'Error al sincronizar desde Sheets' });
    }
});

// Reenviar correo de confirmación
app.post('/api/reservas/:id/reenviar-correo', async (req, res) => {
    try {
        const reserva = await Reserva.findOne({ id: req.params.id });
        if (!reserva) {
            return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
        }
        if (!reserva.email) {
            return res.status(400).json({ success: false, mensaje: 'La reserva no tiene un correo registrado' });
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

// Actualizar detalle parcial de reserva (Staff)
app.put('/api/reservas/:id/detalle', async (req, res) => {
    try {
        if (isMemoryMode()) {
            const reserva = buscarReservaEnMemoria(req.params.id);
            if (!reserva) {
                return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
            }
            const updateData = {};
            if (req.body.cantidadPersonasInicial !== undefined) updateData.cantidadPersonasInicial = Number(req.body.cantidadPersonasInicial);
            if (req.body.personasLlegadas !== undefined) updateData.personasLlegadas = Number(req.body.personasLlegadas);
            if (req.body.cortesias !== undefined) updateData.cortesias = Number(req.body.cortesias);
            if (req.body.pagaronCover !== undefined) updateData.pagaronCover = Number(req.body.pagaronCover);
            if (req.body.precioCover !== undefined) updateData.precioCover = Number(req.body.precioCover);
            if (req.body.promotor !== undefined) updateData.promotor = normalizarPromotor(req.body.promotor);
            const motivoSeleccionado = req.body.motivo || req.body.motivoReserva || req.body.motivo_reserva;
            if (motivoSeleccionado !== undefined) updateData.motivoReserva = motivoSeleccionado;
            if (req.body.mesaAsignada !== undefined) updateData.mesaAsignada = req.body.mesaAsignada;
            if (req.body.nota !== undefined || req.body.comentario !== undefined || req.body.notas !== undefined || req.body.comentarios !== undefined) {
                const notaTexto = String(req.body.nota ?? req.body.comentario ?? req.body.notas ?? req.body.comentarios ?? '').trim();
                updateData.nota = notaTexto;
                updateData.comentarios = notaTexto;
            }
            Object.assign(reserva, updateData);
            aplicarReglaPromocionCover(reserva);
            return res.json({ success: true, mensaje: 'Detalle actualizado correctamente', reserva });
        }

        const updateData = {};
        if (req.body.cantidadPersonasInicial !== undefined) updateData.cantidadPersonasInicial = Number(req.body.cantidadPersonasInicial);
        if (req.body.personasLlegadas !== undefined) updateData.personasLlegadas = Number(req.body.personasLlegadas);
        if (req.body.cortesias !== undefined) updateData.cortesias = Number(req.body.cortesias);
        if (req.body.pagaronCover !== undefined) updateData.pagaronCover = Number(req.body.pagaronCover);
        if (req.body.precioCover !== undefined) updateData.precioCover = Number(req.body.precioCover);
        if (req.body.promotor !== undefined) updateData.promotor = normalizarPromotor(req.body.promotor);

        const motivoSeleccionado = req.body.motivo || req.body.motivoReserva || req.body.motivo_reserva;
        if (motivoSeleccionado !== undefined) updateData.motivoReserva = motivoSeleccionado;
        if (req.body.mesaAsignada !== undefined) updateData.mesaAsignada = req.body.mesaAsignada;
        if (req.body.nota !== undefined || req.body.comentario !== undefined || req.body.notas !== undefined || req.body.comentarios !== undefined) {
            const notaTexto = String(req.body.nota ?? req.body.comentario ?? req.body.notas ?? req.body.comentarios ?? '').trim();
            updateData.nota = notaTexto;
            updateData.comentarios = notaTexto;
        }

        const reserva = await Reserva.findOneAndUpdate({ id: req.params.id }, updateData, { new: true });
        if (!reserva) {
            return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
        }
        res.json({ success: true, mensaje: 'Detalle actualizado correctamente', reserva });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al actualizar detalle' });
    }
});

// Actualizar reserva completa (Admin)
app.put('/api/admin/reservas/:id', async (req, res) => {
    try {
        const { sede, fecha, mesa } = req.body;
        if (isMemoryMode()) {
            const reserva = buscarReservaEnMemoria(req.params.id);
            if (!reserva) {
                return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
            }
            if (mesa) {
                const mesaLibre = desbloquearMesaEnMemoria(sede || reserva.sede, fecha || reserva.fecha, mesa, req.params.id);
                if (!mesaLibre) {
                    return res.status(400).json({
                        success: false,
                        mensaje: `No se puede asignar: La Mesa #${mesa} ya se encuentra reservada para esa sede y fecha.`
                    });
                }
            }
            if (req.body.nota !== undefined || req.body.comentario !== undefined || req.body.notas !== undefined || req.body.comentarios !== undefined) {
                const notaTexto = String(req.body.nota ?? req.body.comentario ?? req.body.notas ?? req.body.comentarios ?? '').trim();
                reserva.nota = notaTexto;
                reserva.comentarios = notaTexto;
            }
            if (req.body.promotor !== undefined) {
                reserva.promotor = normalizarPromotor(req.body.promotor);
            }
            Object.assign(reserva, req.body);
            aplicarReglaPromocionCover(reserva);
            return res.json({ success: true, mensaje: 'Reserva actualizada con éxito', reserva });
        }
        if (mesa) {
            const mesaLibre = await verificarDisponibilidadMesa(sede, fecha, mesa, req.params.id);
            if (!mesaLibre) {
                return res.status(400).json({
                    success: false,
                    mensaje: `No se puede asignar: La Mesa #${mesa} ya se encuentra reservada para esa sede y fecha.`
                });
            }
        }

        if (req.body.nota !== undefined || req.body.comentario !== undefined || req.body.notas !== undefined || req.body.comentarios !== undefined) {
            const notaTexto = String(req.body.nota ?? req.body.comentario ?? req.body.notas ?? req.body.comentarios ?? '').trim();
            req.body.nota = notaTexto;
            req.body.comentarios = notaTexto;
        }
        if (req.body.promotor !== undefined) {
            req.body.promotor = normalizarPromotor(req.body.promotor);
        }

        const reservaActualizada = await Reserva.findOneAndUpdate(
            { id: req.params.id },
            req.body,
            { new: true }
        );

        if (!reservaActualizada) {
            return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
        }

        if (reservaActualizada.promotor && reservaActualizada.promotor.toUpperCase().includes('FREDYFREE')) {
            reservaActualizada.promotor = 'FREDYFREE';
            reservaActualizada.precioCover = 0;
            reservaActualizada.pagaronCover = 0;
            await reservaActualizada.save();
        }

        res.json({ success: true, mensaje: 'Reserva actualizada con éxito', reserva: reservaActualizada });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al actualizar la reserva' });
    }
});

// Actualizar estado de asistencia o confirmación de la reserva (Staff/Puerta)
app.put('/api/reservas/:id/estado', async (req, res) => {
    try {
        const nuevoEstado = req.body.nuevoEstado || req.body.estadoAsistencia;
        const codigoIngresado = req.body.codigoIngresado;

        if (isMemoryMode()) {
            const reserva = buscarReservaEnMemoria(req.params.id);
            if (!reserva) {
                return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
            }
            if (codigoIngresado && reserva.codigoQr && codigoIngresado !== reserva.codigoQr) {
                return res.status(400).json({ success: false, mensaje: 'El código PIN/QR no coincide' });
            }
            reserva.estadoAsistencia = nuevoEstado || reserva.estadoAsistencia;
            if (req.body.personasLlegadas !== undefined) {
                reserva.personasLlegadas = Number(req.body.personasLlegadas);
            }
            return res.json({ success: true, mensaje: 'Estado de reserva actualizado con éxito', reserva });
        }

        const reserva = await Reserva.findOne({ id: req.params.id });
        if (!reserva) {
            return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
        }

        if (codigoIngresado && reserva.codigoQr && codigoIngresado !== reserva.codigoQr) {
            return res.status(400).json({ success: false, mensaje: 'El código PIN/QR no coincide' });
        }

        reserva.estadoAsistencia = nuevoEstado || reserva.estadoAsistencia;
        if (req.body.personasLlegadas !== undefined) {
            reserva.personasLlegadas = Number(req.body.personasLlegadas);
        }

        await reserva.save();
        res.json({ success: true, mensaje: 'Estado de reserva actualizado con éxito', reserva });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al actualizar estado de la reserva' });
    }
});

// Eliminar reserva por ID
app.delete('/api/admin/reservas/:id', async (req, res) => {
    try {
        if (isMemoryMode()) {
            const index = memoryDb.reservas.findIndex(r => String(r.id) === String(req.params.id));
            if (index === -1) {
                return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
            }
            memoryDb.reservas.splice(index, 1);
            return res.json({ success: true, mensaje: 'Reserva eliminada con éxito' });
        }

        const reserva = await Reserva.findOneAndDelete({ id: req.params.id });
        if (!reserva) {
            return res.status(404).json({ success: false, mensaje: 'Reserva no encontrada' });
        }
        res.json({ success: true, mensaje: 'Reserva eliminada con éxito' });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'Error al eliminar reserva' });
    }
});

// Limpiar base de datos (Admin)
app.delete('/api/admin/limpiar-base-datos', async (req, res) => {
    try {
        if (isMemoryMode()) {
            const count = memoryDb.reservas.length;
            memoryDb.reservas = [];
            memoryDb.usuarios = [{ id: 'USR-ADMIN', username: 'admin', password: '123', rol: 'Administrador', sede: 'TODAS' }];
            memoryDb.configuracion = {
                clave: 'global',
                whatsappLink: 'https://wa.me/573014815281',
                whatsappNumero: '3014815281',
                whatsappTexto: 'Comunícate al número de WhatsApp: 3014815281',
                whatsappSubititulo: 'Para una atención más inmediata.',
                tituloConsulta: 'Consultar Mi Reserva',
                tituloCreacion: 'Crear Nueva Reserva',
                camposConfig: {
                    emailRequerido: false,
                    instagramRequerido: false,
                    notaRequerida: false,
                    promotorRequerido: false
                },
                actualizadoEn: Date.now()
            };
            return res.json({
                success: true,
                mensaje: `Base de datos limpiada exitosamente. Se eliminaron ${count} reservas.`
            });
        }

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

// ================= HEALTH CHECK =================
app.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'ok',
        dbConnected: mongoose.connection.readyState === 1,
        timestamp: new Date().toISOString()
    });
});

// ================= RUTAS DE FRONTEND (CATCH ALL) =================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================= INICIALIZACIÓN DEL SERVIDOR =================
conectarBaseDatos();

app.listen(PORT, () => {
    console.log(`Servidor iniciado correctamente y escuchando en el puerto ${PORT}`);
});

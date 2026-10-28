const mongoose = require('mongoose');

const reservaSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  codigoQr: String,
  nombreCliente: String,
  telefono: String,
  email: String,
  fecha: String,
  sede: String,
  zona: String,
  mesa: String,
  mesaAsignada: String,
  motivoReserva: String,
  nota: String,
  comentarios: String,
  cantidadPersonasInicial: Number,
  personasLlegadas: Number,
  cortesias: Number,
  pagaronCover: Number,
  precioCover: Number,
  totalGenerado: Number,
  estadoAsistencia: String,
  estado: String,
  promotor: String,
  creadoEn: Date,
  sheetsSyncVersion: Number,
  sheetsSyncedVersion: Number,
  sheetsSyncPending: Boolean,
  sheetsSyncAttempts: Number,
  sheetsSyncNextAttemptAt: Date,
  sheetsSyncPriority: Number,
  sheetsSyncLeaseUntil: Date,
  sheetsSyncLeaseToken: String
}, { collection: 'reservas' });

const Reserva = mongoose.models.VipNorteReserva || mongoose.model('VipNorteReserva', reservaSchema);

let connectionPromise;

async function conectarMongo() {
  if (mongoose.connection.readyState === 1) return;
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI no está configurada.');
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 5
    }).catch(error => {
      connectionPromise = null;
      throw error;
    });
  }
  await connectionPromise;
}

function retrasoReintento(intentos) {
  return Math.min(300000, 1000 * (2 ** Math.min(intentos, 8)));
}

function crearPayload(reserva) {
  const personasPagaronCover = Number(reserva.pagaronCover || 0);
  const precioCover = Number(reserva.precioCover || 0);

  return {
    token: process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN || '',
    id_reserva: reserva.id || '',
    codigo_pin: reserva.codigoQr || '',
    fecha_creacion: reserva.creadoEn || new Date().toISOString(),
    fecha_reserva: reserva.fecha || '',
    nombre_cliente: reserva.nombreCliente || '',
    celular: reserva.telefono || '',
    correo: reserva.email || '',
    discoteca: reserva.sede || '',
    zona: reserva.zona || '',
    mesa: reserva.mesaAsignada || reserva.mesa || '',
    personas_reservadas: Number(reserva.cantidadPersonasInicial || 0),
    personas_llegadas: Number(reserva.personasLlegadas || 0),
    cortesias: Number(reserva.cortesias || 0),
    personas_pagaron_cover: personasPagaronCover,
    precio_cover: precioCover,
    total_generado: Number(reserva.totalGenerado ?? (personasPagaronCover * precioCover)),
    promotor: reserva.promotor || '',
    motivo: reserva.motivoReserva || reserva.motivo || '',
    notas: reserva.nota || reserva.comentarios || '',
    estado_asistencia: reserva.estadoAsistencia || '',
    estado_reserva: reserva.estado || reserva.estadoAsistencia || ''
  };
}

async function enviar(reserva) {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const token = process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN;

  if (!webhookUrl || !token) {
    throw new Error('GOOGLE_SHEETS_WEBHOOK_URL o GOOGLE_SHEETS_WEBHOOK_TOKEN no configurados.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VIP-NORTE-SYNC': '1'
      },
      body: JSON.stringify(crearPayload(reserva)),
      signal: controller.signal
    });

    const raw = await response.text();
    let result = null;
    try {
      result = JSON.parse(raw);
    } catch (_) {
      // Se conserva el cuerpo para diagnóstico sin asumir que Apps Script devolvió JSON.
    }

    if (!response.ok) {
      throw new Error(`Google Sheets HTTP ${response.status}: ${raw.slice(0, 500)}`);
    }

    if (!result || result.status !== 'success') {
      const detalle = result?.message || raw.slice(0, 500) || 'Respuesta vacía de Google Apps Script.';
      throw new Error(`Google Sheets rechazó ${reserva.id}: ${detalle}`);
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function reclamar() {
  const now = new Date();
  const leaseToken = `vercel-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const job = await Reserva.findOneAndUpdate(
    {
      sheetsSyncPending: true,
      sheetsSyncNextAttemptAt: { $lte: now },
      $or: [
        { sheetsSyncLeaseUntil: { $exists: false } },
        { sheetsSyncLeaseUntil: null },
        { sheetsSyncLeaseUntil: { $lt: now } }
      ]
    },
    {
      $set: {
        sheetsSyncLeaseUntil: new Date(now.getTime() + 60000),
        sheetsSyncLeaseToken: leaseToken
      }
    },
    {
      new: true,
      sort: { sheetsSyncPriority: -1, sheetsSyncNextAttemptAt: 1, creadoEn: 1 }
    }
  );

  if (!job) return null;
  return {
    reserva: job.toObject(),
    version: Number(job.sheetsSyncVersion || 0),
    intentos: Number(job.sheetsSyncAttempts || 0),
    leaseToken
  };
}

async function finalizar(job, correcto, errorMessage = '') {
  const filtro = {
    id: job.reserva.id,
    sheetsSyncLeaseToken: job.leaseToken,
    sheetsSyncVersion: job.version
  };

  if (correcto) {
    await Reserva.updateOne(filtro, {
      $set: {
        sheetsSyncPending: false,
        sheetsSyncedVersion: job.version,
        sheetsSyncAttempts: 0,
        sheetsSyncPriority: 0
      },
      $unset: {
        sheetsSyncLeaseUntil: 1,
        sheetsSyncLeaseToken: 1
      }
    });
    return;
  }

  const attempts = job.intentos + 1;
  await Reserva.updateOne(filtro, {
    $inc: { sheetsSyncAttempts: 1 },
    $set: {
      sheetsSyncNextAttemptAt: new Date(Date.now() + retrasoReintento(attempts))
    },
    $unset: {
      sheetsSyncLeaseUntil: 1,
      sheetsSyncLeaseToken: 1
    }
  });

  console.error(`VIP NORTE Sheets sync failed for ${job.reserva.id} (attempt ${attempts}): ${errorMessage}`);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, mensaje: 'Método no permitido.' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization || '';
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado.' });
  }

  try {
    await conectarMongo();

    let procesadas = 0;
    let exitosas = 0;
    let fallidas = 0;
    const errores = [];

    for (let i = 0; i < 10; i++) {
      const job = await reclamar();
      if (!job) break;

      procesadas++;
      try {
        await enviar(job.reserva);
        exitosas++;
        await finalizar(job, true);
      } catch (error) {
        fallidas++;
        errores.push({ id: job.reserva.id, mensaje: error.message });
        await finalizar(job, false, error.message);
      }
    }

    const pendientes = await Reserva.countDocuments({ sheetsSyncPending: true });

    return res.status(200).json({
      success: true,
      procesadas,
      exitosas,
      fallidas,
      pendientes,
      errores
    });
  } catch (error) {
    console.error('VIP NORTE Google Sheets cron error:', error);
    return res.status(500).json({
      success: false,
      mensaje: error.message
    });
  }
};

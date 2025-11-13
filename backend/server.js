const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');
const axios = require('axios');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// Almacenamiento simple de sesiones en memoria (en producción usar Redis o similar)
const sessions = new Map();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  connectionTimeoutMillis: 5000,
});

async function connectWithRetry() {
  for (let i = 0; i < 15; i++) {
    try {
      await pool.query('SELECT 1');
      
      // Asegurar que el viaje demo existe
      const demoViajeId = '11111111-1111-1111-1111-111111111111';
      const viajeCheck = await pool.query('SELECT id FROM viajes WHERE id = $1', [demoViajeId]);
      if (viajeCheck.rows.length === 0) {
        await pool.query(
          'INSERT INTO viajes (id, nombre) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
          [demoViajeId, 'Viaje Demo ITBA']
        );
      }
      
      return;
    } catch (err) {
      await new Promise(res => setTimeout(res, 3000));
    }
  }
  process.exit(1);
}

let listener;
async function setupListener() {
  listener = new Pool({ connectionString: process.env.DATABASE_URL });
  await listener.connect();
  await listener.query('LISTEN actividad_cambiada');
  listener.on('notification', async (msg) => {
    try {
      const payload = JSON.parse(msg.payload);
      
      const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || "http://n8n:5678/webhook/itinerario-update";
      
      await axios.post(n8nWebhookUrl, payload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (e) {
      // Error silencioso
    }
  });
}

// Middleware de autenticación
const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  req.user = sessions.get(token);
  next();
};

// Endpoint de registro
app.post('/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }
    
    if (username.length < 3) {
      return res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres' });
    }
    
    if (password.length < 4) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    }
    
    // Verificar si el usuario ya existe
    const existingUser = await pool.query('SELECT id FROM usuarios WHERE username = $1', [username]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }
    
    // Hashear contraseña
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Crear usuario
    const { rows } = await pool.query(
      'INSERT INTO usuarios (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, passwordHash]
    );
    
    // Crear sesión
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { id: rows[0].id, username: rows[0].username });
    
    res.json({ 
      token, 
      user: { id: rows[0].id, username: rows[0].username } 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint de login
app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }
    
    // Buscar usuario
    const { rows } = await pool.query(
      'SELECT id, username, password_hash FROM usuarios WHERE username = $1',
      [username]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    
    // Verificar contraseña
    const isValid = await bcrypt.compare(password, rows[0].password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    
    // Crear sesión
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { id: rows[0].id, username: rows[0].username });
    
    res.json({ 
      token, 
      user: { id: rows[0].id, username: rows[0].username } 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para verificar sesión
app.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Endpoint de logout
app.post('/auth/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;
  if (token) {
    sessions.delete(token);
  }
  res.json({ message: 'Sesión cerrada' });
});

app.get('/viajes/:viajeId/actividades', async (req, res) => {
  try {
    const viajeId = req.params.viajeId;
    const { rows } = await pool.query(
      'SELECT * FROM actividades WHERE viaje_id = $1 ORDER BY fecha_hora',
      [viajeId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/actividades', async (req, res) => {
  try {
    const { viaje_id, titulo, fecha_hora, fecha_hora_fin, tipo = 'otro', direccion } = req.body;
    
    if (!viaje_id || !titulo || !fecha_hora) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }
    
    // Validar que fecha_hora_fin sea posterior a fecha_hora si se proporciona
    if (fecha_hora_fin && new Date(fecha_hora_fin) <= new Date(fecha_hora)) {
      return res.status(400).json({ error: 'La hora de fin debe ser posterior a la hora de inicio' });
    }
    
    // Verificar que el viaje existe, si no existe, crearlo
    const viajeCheck = await pool.query('SELECT id FROM viajes WHERE id = $1', [viaje_id]);
    if (viajeCheck.rows.length === 0) {
      try {
        await pool.query(
          'INSERT INTO viajes (id, nombre) VALUES ($1, $2)',
          [viaje_id, 'Viaje Demo ITBA']
        );
      } catch (createErr) {
        // Si falla la creación, puede ser por constraint, intentar de nuevo
        const retryCheck = await pool.query('SELECT id FROM viajes WHERE id = $1', [viaje_id]);
        if (retryCheck.rows.length === 0) {
          return res.status(500).json({ error: `Error al crear el viaje: ${createErr.message}` });
        }
      }
    }
    
    const { rows } = await pool.query(
      `INSERT INTO actividades (viaje_id, titulo, fecha_hora, fecha_hora_fin, tipo, direccion, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, 'demo') RETURNING *`,
      [viaje_id, titulo, fecha_hora, fecha_hora_fin || null, tipo, direccion || null]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/actividades/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, fecha_hora, fecha_hora_fin, tipo, direccion } = req.body;
    
    if (!titulo || !fecha_hora) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }
    
    // Validar que fecha_hora_fin sea posterior a fecha_hora si se proporciona
    if (fecha_hora_fin && new Date(fecha_hora_fin) <= new Date(fecha_hora)) {
      return res.status(400).json({ error: 'La hora de fin debe ser posterior a la hora de inicio' });
    }
    
    const { rows } = await pool.query(
      `UPDATE actividades 
       SET titulo = $1, fecha_hora = $2, fecha_hora_fin = $3, tipo = $4, direccion = $5
       WHERE id = $6 
       RETURNING *`,
      [titulo, fecha_hora, fecha_hora_fin || null, tipo, direccion || null, id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }
    
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/actividades/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { rows } = await pool.query(
      'DELETE FROM actividades WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }
    
    res.json({ message: 'Actividad eliminada exitosamente', actividad: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para que n8n consulte eventos próximos (dentro de 1 hora) y que necesitan notificación
app.get('/actividades/proximas-notificar', async (req, res) => {
  try {
    const ahora = new Date();
    const enUnaHora = new Date(ahora.getTime() + 60 * 60 * 1000); // +1 hora
    const en40Minutos = new Date(ahora.getTime() + 40 * 60 * 1000); // +40 minutos
    const en70Minutos = new Date(ahora.getTime() + 70 * 60 * 1000); // +70 minutos
    
    // Buscar eventos que están entre 40 y 70 minutos en el futuro
    const { rows } = await pool.query(
      `SELECT id, titulo, fecha_hora, fecha_hora_fin, tipo, direccion
       FROM actividades
       WHERE fecha_hora >= $1 AND fecha_hora <= $2
       ORDER BY fecha_hora ASC`,
      [en40Minutos, en70Minutos]
    );
    
    // Procesar y formatear los eventos con el mensaje listo
    const eventosParaNotificar = rows.map(evento => {
      const fechaHora = new Date(evento.fecha_hora);
      const horaEvento = fechaHora.toLocaleTimeString('es-AR', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'America/Argentina/Buenos_Aires'
      });
      
      return {
        evento: evento,
        mensaje: `En menos de 1 hora tienes: ${evento.titulo} a las ${horaEvento}`
      };
    });
    
    res.json(eventosParaNotificar);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para que n8n envíe notificaciones a los clientes
app.post('/notificaciones/evento-proximo', async (req, res) => {
  try {
    const { evento, mensaje } = req.body;
    
    // Mapeo de tipos a emojis
    const tipoEmojis = {
      hotel: '🏨',
      vuelo: '✈️',
      tren: '🚂',
      bus: '🚌',
      excursion: '🏔️',
      museo: '🏛️',
      otro: '📍'
    };
    
    const emoji = req.body.emoji || (evento?.tipo ? tipoEmojis[evento.tipo] : '📍');
    
    // Enviar notificación a todos los clientes conectados
    io.emit('notificacion_evento', {
      tipo: 'evento_proximo',
      evento,
      mensaje: mensaje || `En 1 hora tienes: ${evento?.titulo || evento?.title || 'un evento'}`,
      emoji: emoji,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, message: 'Notificación enviada a los clientes' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint de prueba para verificar notificaciones
app.post('/notificaciones/test', async (req, res) => {
  try {
    const { mensaje } = req.body;
    const mensajePrueba = mensaje || 'Esta es una notificación de prueba desde el backend';
    
    io.emit('notificacion_evento', {
      tipo: 'evento_proximo',
      evento: { titulo: 'Prueba' },
      mensaje: mensajePrueba,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, message: 'Notificación de prueba enviada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cron en el backend para verificar eventos próximos y notificar a n8n
const eventosNotificados = new Set(); // Para evitar notificaciones duplicadas

async function verificarEventosProximos() {
  try {
    const ahora = new Date();
    const en40Minutos = new Date(ahora.getTime() + 40 * 60 * 1000);
    const en70Minutos = new Date(ahora.getTime() + 70 * 60 * 1000);
    
    // Buscar eventos que están entre 40 y 70 minutos en el futuro
    const { rows } = await pool.query(
      `SELECT id, titulo, fecha_hora, fecha_hora_fin, tipo, direccion
       FROM actividades
       WHERE fecha_hora >= $1 AND fecha_hora <= $2
       ORDER BY fecha_hora ASC`,
      [en40Minutos, en70Minutos]
    );
    
    for (const evento of rows) {
      // Verificar si ya notificamos este evento
      if (eventosNotificados.has(evento.id)) {
        continue;
      }
      
      const fechaHora = new Date(evento.fecha_hora);
      const horaEvento = fechaHora.toLocaleTimeString('es-AR', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'America/Argentina/Buenos_Aires'
      });
      
      // Mapeo de tipos a emojis
      const tipoEmojis = {
        hotel: '🏨',
        vuelo: '✈️',
        tren: '🚂',
        bus: '🚌',
        excursion: '🏔️',
        museo: '🏛️',
        otro: '📍'
      };
      
      const emoji = tipoEmojis[evento.tipo] || '📍';
      const mensaje = `En menos de 1 hora tienes: ${evento.titulo} a las ${horaEvento}`;
      
      // Llamar a n8n para que envíe la notificación
      const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || "http://n8n:5678/webhook/itinerario-update";
      
      try {
        await axios.post(n8nWebhookUrl, {
          evento: evento,
          mensaje: mensaje,
          emoji: emoji,
          tipo: evento.tipo
        }, {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        eventosNotificados.add(evento.id);
      } catch (error) {
        // Error silencioso
      }
    }
    
    // Limpiar eventos que ya pasaron del set de notificados
    const eventosPasados = await pool.query(
      `SELECT id FROM actividades WHERE fecha_hora < $1`,
      [ahora]
    );
    
    eventosPasados.rows.forEach(row => {
      eventosNotificados.delete(row.id);
    });
    
  } catch (err) {
    // Error silencioso
  }
}

// Ejecutar el cron cada minuto
let cronInterval;
function iniciarCron() {
  // Ejecutar inmediatamente
  verificarEventosProximos();
  
  // Luego cada minuto
  cronInterval = setInterval(verificarEventosProximos, 60 * 1000);
}

// WebSocket connection handling
io.on('connection', (socket) => {
  socket.on('disconnect', () => {
    // Desconexión silenciosa
  });
});

connectWithRetry().then(() => {
  setupListener();
  iniciarCron(); // Iniciar el cron para verificar eventos próximos
  server.listen(4000, '0.0.0.0', () => {
    // Servidor iniciado
  });
});
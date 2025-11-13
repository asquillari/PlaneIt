const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const axios = require('axios');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const app = express();
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
      console.log('Backend conectado a la base de datos');
      
      // Asegurar que el viaje demo existe
      const demoViajeId = '11111111-1111-1111-1111-111111111111';
      const viajeCheck = await pool.query('SELECT id FROM viajes WHERE id = $1', [demoViajeId]);
      if (viajeCheck.rows.length === 0) {
        await pool.query(
          'INSERT INTO viajes (id, nombre) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
          [demoViajeId, 'Viaje Demo ITBA']
        );
        console.log('Viaje demo creado:', demoViajeId);
      } else {
        console.log('Viaje demo ya existe:', demoViajeId);
      }
      
      return;
    } catch (err) {
      console.log(`Esperando DB... (${i + 1}/15)`);
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
      await axios.post("http://n8n:5678/webhook/itinerario-update", payload);
    } catch (e) {}
  });
  console.log('Escuchando cambios en tiempo real');
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
    console.error('Error en registro:', err);
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
    console.error('Error en login:', err);
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
    console.log('GET /viajes/:viajeId/actividades - Viaje ID:', viajeId);
    const { rows } = await pool.query(
      'SELECT * FROM actividades WHERE viaje_id = $1 ORDER BY fecha_hora',
      [viajeId]
    );
    console.log(`Encontradas ${rows.length} actividades para viaje ${viajeId}`);
    res.json(rows);
  } catch (err) {
    console.error('Error en GET /viajes/:viajeId/actividades:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/actividades', async (req, res) => {
  try {
    const { viaje_id, titulo, fecha_hora, tipo = 'otro' } = req.body;
    console.log('POST /actividades - Recibido:', { viaje_id, titulo, fecha_hora, tipo });
    
    // Verificar que el viaje existe, si no existe, crearlo
    const viajeCheck = await pool.query('SELECT id FROM viajes WHERE id = $1', [viaje_id]);
    if (viajeCheck.rows.length === 0) {
      console.log('Viaje no encontrado, creándolo:', viaje_id);
      try {
        await pool.query(
          'INSERT INTO viajes (id, nombre) VALUES ($1, $2)',
          [viaje_id, 'Viaje Demo ITBA']
        );
        console.log('Viaje creado exitosamente:', viaje_id);
      } catch (createErr) {
        // Si falla la creación, puede ser por constraint, intentar de nuevo
        const retryCheck = await pool.query('SELECT id FROM viajes WHERE id = $1', [viaje_id]);
        if (retryCheck.rows.length === 0) {
          console.error('Error creando viaje:', createErr);
          return res.status(500).json({ error: `Error al crear el viaje: ${createErr.message}` });
        }
      }
    }
    
    const { rows } = await pool.query(
      `INSERT INTO actividades (viaje_id, titulo, fecha_hora, tipo, creado_por)
       VALUES ($1, $2, $3, $4, 'demo') RETURNING *`,
      [viaje_id, titulo, fecha_hora, tipo]
    );
    console.log('Evento creado exitosamente:', rows[0]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Error en POST /actividades:', err);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: err.message });
  }
});

app.put('/actividades/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, fecha_hora, tipo } = req.body;
    console.log('PUT /actividades/:id - Recibido:', { id, titulo, fecha_hora, tipo });
    
    const { rows } = await pool.query(
      `UPDATE actividades 
       SET titulo = $1, fecha_hora = $2, tipo = $3 
       WHERE id = $4 
       RETURNING *`,
      [titulo, fecha_hora, tipo, id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }
    
    console.log('Evento actualizado exitosamente:', rows[0]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Error en PUT /actividades/:id:', err);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/actividades/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('DELETE /actividades/:id - ID:', id);
    
    const { rows } = await pool.query(
      'DELETE FROM actividades WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }
    
    console.log('Evento eliminado exitosamente:', rows[0]);
    res.json({ message: 'Actividad eliminada exitosamente', actividad: rows[0] });
  } catch (err) {
    console.error('Error en DELETE /actividades/:id:', err);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: err.message });
  }
});

connectWithRetry().then(() => {
  setupListener();
  app.listen(4000, '0.0.0.0', () => {
    console.log('Backend corriendo en http://localhost:4000');
  });
});
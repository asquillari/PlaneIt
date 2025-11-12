const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  connectionTimeoutMillis: 5000,
});

async function connectWithRetry() {
  for (let i = 0; i < 15; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('Backend conectado a Supabase');
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

app.get('/viajes/:viajeId/actividades', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM actividades WHERE viaje_id = $1 ORDER BY fecha_hora',
      [req.params.viajeId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/actividades', async (req, res) => {
  try {
    const { viaje_id, titulo, fecha_hora, tipo = 'actividad' } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO actividades (viaje_id, titulo, fecha_hora, tipo, creado_por)
       VALUES ($1, $2, $3, $4, 'demo') RETURNING *`,
      [viaje_id, titulo, fecha_hora, tipo]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

connectWithRetry().then(() => {
  setupListener();
  app.listen(4000, '0.0.0.0', () => {
    console.log('Backend corriendo en http://localhost:4000');
  });
});
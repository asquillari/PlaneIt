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
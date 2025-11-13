CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE viajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL
);

INSERT INTO viajes (id, nombre) VALUES ('11111111-1111-1111-1111-111111111111', 'Viaje Demo ITBA') ON CONFLICT (id) DO NOTHING;

CREATE TABLE actividades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viaje_id UUID REFERENCES viajes(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  fecha_hora TIMESTAMPTZ NOT NULL,
  fecha_hora_fin TIMESTAMPTZ,
  tipo TEXT DEFAULT 'actividad',
  direccion TEXT,
  creado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agregar columnas si la tabla ya existe (para migración)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'actividades' AND column_name = 'fecha_hora_fin'
  ) THEN
    ALTER TABLE actividades ADD COLUMN fecha_hora_fin TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'actividades' AND column_name = 'direccion'
  ) THEN
    ALTER TABLE actividades ADD COLUMN direccion TEXT;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION notify_n8n()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('actividad_cambiada', row_to_json(NEW)::TEXT);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_n8n
  AFTER INSERT OR UPDATE ON actividades
  FOR EACH ROW
  EXECUTE FUNCTION notify_n8n();
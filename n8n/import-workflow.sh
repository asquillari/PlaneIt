#!/bin/bash

# Script para importar y activar el workflow de n8n automáticamente
N8N_URL="${N8N_URL:-http://n8n:5678}"
WORKFLOW_FILE="/workflows/itinerario-update.json"
MAX_RETRIES=60
RETRY_COUNT=0

echo "⏳ Esperando a que n8n esté disponible en $N8N_URL..."

# Esperar a que n8n esté listo
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -f -s "$N8N_URL/healthz" > /dev/null 2>&1; then
    echo "✅ n8n está disponible!"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $((RETRY_COUNT % 10)) -eq 0 ]; then
    echo "   Intento $RETRY_COUNT/$MAX_RETRIES..."
  fi
  sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo "❌ Error: n8n no está disponible después de $MAX_RETRIES intentos"
  exit 1
fi

# Esperar un poco más para que n8n termine de inicializar completamente
echo "⏳ Esperando inicialización completa de n8n..."
sleep 10

if [ ! -f "$WORKFLOW_FILE" ]; then
  echo "❌ Error: Archivo de workflow no encontrado en $WORKFLOW_FILE"
  exit 1
fi

echo "📥 Importando workflow desde $WORKFLOW_FILE..."

# Leer el workflow y asegurar que active esté en true
WORKFLOW_JSON=$(cat "$WORKFLOW_FILE")
# Asegurar que active esté en true
WORKFLOW_JSON=$(echo "$WORKFLOW_JSON" | sed 's/"active":\s*false/"active": true/g')

# Verificar si el workflow ya existe (buscando por nombre)
WORKFLOW_NAME=$(echo "$WORKFLOW_JSON" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
EXISTING_WORKFLOWS=$(curl -s "$N8N_URL/api/v1/workflows" 2>/dev/null || echo "[]")

# Buscar workflow por nombre
WORKFLOW_ID=$(echo "$EXISTING_WORKFLOWS" | grep -o "\"name\":\"$WORKFLOW_NAME\"[^}]*\"id\":\"[^\"]*\"" | grep -o "\"id\":\"[^\"]*\"" | head -1 | cut -d'"' -f4 || echo "")

# Si no se encontró por nombre, intentar obtener el primer ID disponible
if [ -z "$WORKFLOW_ID" ]; then
  WORKFLOW_ID=$(echo "$EXISTING_WORKFLOWS" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")
fi

if [ -n "$WORKFLOW_ID" ]; then
  echo "🔄 Workflow ya existe con ID: $WORKFLOW_ID"
  echo "📝 Actualizando workflow existente..."
  
  # Actualizar workflow existente y activarlo
  RESPONSE=$(curl -s -X PUT "$N8N_URL/api/v1/workflows/$WORKFLOW_ID" \
    -H "Content-Type: application/json" \
    -d "$WORKFLOW_JSON" 2>/dev/null)
  
  if [ $? -eq 0 ]; then
    echo "✅ Workflow actualizado exitosamente"
    
    # Activar el workflow
    echo "🔌 Activando workflow..."
    ACTIVATE_RESPONSE=$(curl -s -X POST "$N8N_URL/api/v1/workflows/$WORKFLOW_ID/activate" 2>&1)
    if [ $? -eq 0 ]; then
      echo "✅ Workflow activado"
      # Verificar que realmente está activo
      sleep 2
      WORKFLOW_STATUS=$(curl -s "$N8N_URL/api/v1/workflows/$WORKFLOW_ID" | grep -o '"active":[^,]*' | grep -o 'true\|false' || echo "unknown")
      if [ "$WORKFLOW_STATUS" = "true" ]; then
        echo "✅ Confirmado: Workflow está activo"
      else
        echo "⚠️  Advertencia: Workflow puede no estar activo (status: $WORKFLOW_STATUS)"
      fi
    else
      echo "⚠️  Error al activar workflow: $ACTIVATE_RESPONSE"
    fi
  else
    echo "⚠️  Error al actualizar workflow, intentando crear nuevo..."
    WORKFLOW_ID=""
  fi
fi

if [ -z "$WORKFLOW_ID" ]; then
  echo "➕ Creando nuevo workflow..."
  
  # Crear nuevo workflow
  RESPONSE=$(curl -s -X POST "$N8N_URL/api/v1/workflows" \
    -H "Content-Type: application/json" \
    -d "$WORKFLOW_JSON" 2>/dev/null)
  
  if [ $? -eq 0 ]; then
    # Extraer el ID del workflow recién creado
    NEW_WORKFLOW_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -n "$NEW_WORKFLOW_ID" ]; then
      echo "✅ Workflow creado exitosamente con ID: $NEW_WORKFLOW_ID"
      
      # Activar el workflow
      echo "🔌 Activando workflow..."
      ACTIVATE_RESPONSE=$(curl -s -X POST "$N8N_URL/api/v1/workflows/$NEW_WORKFLOW_ID/activate" 2>&1)
      if [ $? -eq 0 ]; then
        echo "✅ Workflow activado"
        # Verificar que realmente está activo
        sleep 2
        WORKFLOW_STATUS=$(curl -s "$N8N_URL/api/v1/workflows/$NEW_WORKFLOW_ID" | grep -o '"active":[^,]*' | grep -o 'true\|false' || echo "unknown")
        if [ "$WORKFLOW_STATUS" = "true" ]; then
          echo "✅ Confirmado: Workflow está activo"
        else
          echo "⚠️  Advertencia: Workflow puede no estar activo (status: $WORKFLOW_STATUS)"
        fi
      else
        echo "⚠️  Error al activar workflow: $ACTIVATE_RESPONSE"
      fi
    else
      echo "⚠️  Workflow creado pero no se pudo obtener el ID"
    fi
  else
    echo "❌ Error al crear workflow"
    exit 1
  fi
fi

echo "🎉 Workflow configurado y activado correctamente!"


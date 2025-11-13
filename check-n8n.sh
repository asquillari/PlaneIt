#!/bin/bash

# Script para verificar el estado de n8n y el workflow

N8N_URL="${N8N_URL:-http://localhost:5678}"

echo "🔍 Verificando estado de n8n..."
echo ""

# Verificar si n8n está disponible
if curl -f -s "$N8N_URL/healthz" > /dev/null 2>&1; then
  echo "✅ n8n está disponible"
else
  echo "❌ n8n no está disponible en $N8N_URL"
  exit 1
fi

echo ""
echo "📋 Listando workflows..."
WORKFLOWS=$(curl -s "$N8N_URL/api/v1/workflows" 2>/dev/null)

if [ -z "$WORKFLOWS" ] || [ "$WORKFLOWS" = "[]" ]; then
  echo "⚠️  No se encontraron workflows"
else
  echo "$WORKFLOWS" | grep -o '"name":"[^"]*"' | sed 's/"name":"\([^"]*\)"/  - \1/'
  echo ""
  
  # Verificar estado de cada workflow
  echo "📊 Estado de workflows:"
  echo "$WORKFLOWS" | grep -o '"[^"]*":{[^}]*"active":[^,]*' | while IFS= read -r line; do
    NAME=$(echo "$line" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
    ACTIVE=$(echo "$line" | grep -o '"active":[^,}]*' | grep -o 'true\|false')
    if [ -n "$NAME" ]; then
      if [ "$ACTIVE" = "true" ]; then
        echo "  ✅ $NAME: ACTIVO"
      else
        echo "  ❌ $NAME: INACTIVO"
      fi
    fi
  done
fi

echo ""
echo "🔗 Webhook URL esperada: $N8N_URL/webhook/itinerario-update"
echo ""
echo "💡 Para probar el webhook manualmente:"
echo "   curl -X POST $N8N_URL/webhook/itinerario-update \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"evento\":{\"titulo\":\"Test\",\"tipo\":\"otro\"},\"mensaje\":\"Test\",\"emoji\":\"📍\"}'"


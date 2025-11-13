# PlaneIt 🗓️

Sistema de gestión de calendarios de viaje colaborativo con notificaciones en tiempo real y automatización mediante n8n.

## 📋 Descripción

PlaneIt es una aplicación web que permite a los usuarios crear y gestionar múltiples calendarios de viaje. Los usuarios pueden crear sus propios calendarios, solicitar unirse a calendarios de otros usuarios, y colaborar en tiempo real. El sistema incluye notificaciones automáticas cuando un evento está próximo (1 hora antes) y utiliza n8n para automatizar el flujo de notificaciones.


## 🛠️ Stack Tecnológico

### Frontend
- **React 18** - Framework de UI
- **Vite** - Build tool y dev server
- **FullCalendar** - Componente de calendario interactivo
- **Socket.io-client** - Cliente WebSocket para tiempo real
- **Axios** - Cliente HTTP
- **React Router** - Navegación entre páginas

### Backend
- **Node.js** - Runtime de JavaScript
- **Express.js** - Framework web
- **PostgreSQL** - Base de datos relacional
- **Socket.io** - Servidor WebSocket
- **bcrypt** - Hash de contraseñas
- **pg** - Cliente PostgreSQL para Node.js

### Automatización
- **n8n** - Plataforma de automatización de workflows
- **Cron Jobs** - Verificación periódica de eventos próximos

### Infraestructura
- **Docker** - Contenedores
- **Docker Compose** - Orquestación de servicios

## 📁 Estructura del Proyecto

```
PlaneIt/
├── backend/              # API Node.js/Express
│   ├── Dockerfile
│   ├── package.json
│   └── server.js         # Servidor principal
├── frontend/             # Aplicación React
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx       # Router principal
│       ├── HomePage.jsx  # Página de calendarios
│       ├── Calendar.jsx  # Vista de calendario individual
│       ├── Login.jsx     # Componente de autenticación
│       └── App.css       # Estilos
├── n8n/                  # Configuración de n8n
│   ├── workflows/
│   │   └── itinerario-update.json  # Workflow de notificaciones
│   └── import-workflow.sh          # Script de importación
├── n8n-importer/         # Contenedor para importar workflow
│   ├── Dockerfile
│   └── import-workflow.sh
├── docker-compose.yml    # Configuración de servicios
├── init.sql              # Script de inicialización de BD
├── check-n8n.sh         # Script de verificación de n8n
└── README.md
```

## 🚀 Cómo Correr el Proyecto

### Prerrequisitos

- Docker 20.10+
- Docker Compose 2.0+

### Instalación y Ejecución

1. **Clonar el repositorio**:
```bash
git clone git@github.com:asquillari/PlaneIt.git
cd PlaneIt
```

2. **Iniciar todos los servicios**:
```bash
docker-compose up -d --build
```

Este comando:
- Construye las imágenes de Docker
- Inicia PostgreSQL, Backend, Frontend y n8n
- Importa automáticamente el workflow de n8n
- Activa el workflow automáticamente

3. **Acceder a la aplicación**:
   - **Frontend**: http://localhost:3000
   - **Backend API**: http://localhost:4000
   - **n8n**: http://localhost:5678

4. **Primer uso**:
   - Crear una cuenta desde la pantalla de login
   - Crear tu primer calendario
   - Agregar eventos al calendario
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import './App.css';

function SolicitudesPage({ user, onLogout }) {
  const navigate = useNavigate();
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const socketRef = useRef(null);

  const showNotification = (title, message, type = 'info') => {
    const id = Date.now() + Math.random();
    const notification = { id, title, message, type, timestamp: new Date() };
    setNotifications(prev => [...prev, notification]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  useEffect(() => {
    loadSolicitudes();

    socketRef.current = io('http://localhost:4000');

    socketRef.current.on('solicitud_unirse', (data) => {
      if (data.creador_id === user.id) {
        showNotification(
          'Nueva solicitud',
          `${data.solicitante.username} quiere unirse a "${data.viaje.nombre}"`,
          'info'
        );
        loadSolicitudes();
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user]);

  const loadSolicitudes = async () => {
    try {
      setLoading(true);
      const res = await axios.get('http://localhost:4000/viajes/solicitudes');
      setSolicitudes(res.data);
    } catch (error) {
      showNotification('Error', 'No se pudieron cargar las solicitudes', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAceptarSolicitud = async (solicitudId) => {
    try {
      await axios.post(`http://localhost:4000/viajes/solicitudes/${solicitudId}/aceptar`);
      showNotification('Éxito', 'Solicitud aceptada', 'success');
      loadSolicitudes();
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Error desconocido';
      showNotification('Error', errorMessage, 'error');
    }
  };

  const handleRechazarSolicitud = async (solicitudId) => {
    try {
      await axios.post(`http://localhost:4000/viajes/solicitudes/${solicitudId}/rechazar`);
      showNotification('Éxito', 'Solicitud rechazada', 'info');
      loadSolicitudes();
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Error desconocido';
      showNotification('Error', errorMessage, 'error');
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <button className="btn-back" onClick={() => navigate('/')}>←</button>
            <h1 className="app-title">PlaneIt</h1>
          </div>
          <div className="header-actions">
            <div className="user-badge">
              <span className="user-avatar">{user.username.charAt(0).toUpperCase()}</span>
              <span className="user-name">{user.username}</span>
            </div>
            <button
              className="btn-logout"
              onClick={onLogout}
              title="Cerrar sesión"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="home-main">
        <div className="home-content">
          <div className="home-header">
            <h2>Solicitudes Pendientes</h2>
          </div>

          {loading ? (
            <div className="empty-state">
              <p>Cargando solicitudes...</p>
            </div>
          ) : solicitudes.length === 0 ? (
            <div className="empty-state">
              <p>No tienes solicitudes pendientes</p>
            </div>
          ) : (
            <div className="viajes-section">
              <div className="viajes-grid">
                {solicitudes.map(solicitud => (
                  <div key={solicitud.id} className="viaje-card solicitud-card-page">
                    <div className="viaje-header">
                      <h4>{solicitud.viaje_nombre}</h4>
                      <span className="viaje-badge solicitado">Pendiente</span>
                    </div>
                    <div className="solicitud-info-page">
                      <div className="solicitud-user-info">
                        <span className="solicitud-label">Solicitante:</span>
                        <span className="solicitud-username">{solicitud.solicitante_username}</span>
                      </div>
                      <div className="solicitud-date-info">
                        <span className="solicitud-label">Fecha:</span>
                        <span className="solicitud-date">
                          {new Date(solicitud.created_at).toLocaleDateString('es-AR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="viaje-footer solicitud-footer-page">
                      <button
                        className="btn-primary btn-small"
                        onClick={() => handleAceptarSolicitud(solicitud.id)}
                      >
                        Aceptar
                      </button>
                      <button
                        className="btn-secondary btn-small"
                        onClick={() => handleRechazarSolicitud(solicitud.id)}
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <div className="notifications-container">
        {notifications.map(notification => (
          <div
            key={notification.id}
            className={`notification notification-${notification.type}`}
            onClick={() => removeNotification(notification.id)}
          >
            <div className="notification-icon">
              {notification.type === 'success' ? '✅' :
               notification.type === 'info' ? 'ℹ️' :
               notification.type === 'warning' ? '⚠️' :
               notification.type === 'error' ? '❌' : 'ℹ️'}
            </div>
            <div className="notification-content">
              <div className="notification-title">{notification.title}</div>
              <div className="notification-message">{notification.message}</div>
            </div>
            <button
              className="notification-close"
              onClick={(e) => {
                e.stopPropagation();
                removeNotification(notification.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SolicitudesPage;


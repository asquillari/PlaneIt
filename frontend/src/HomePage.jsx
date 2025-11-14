import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import './App.css';

function HomePage({ user, onLogout }) {
  const navigate = useNavigate();
  const [viajes, setViajes] = useState({ creados: [], compartidos: [], todos: [] });
  const [solicitudes, setSolicitudes] = useState([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newViajeNombre, setNewViajeNombre] = useState('');
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
    loadViajes();
    loadSolicitudes();
    
    socketRef.current = io('http://localhost:4000');
    
    socketRef.current.on('solicitud_unirse', (data) => {
      // Solo mostrar la notificación al creador del calendario
      if (data.creador_id === user.id) {
        showNotification(
          'Nueva solicitud',
          `${data.solicitante.username} quiere unirse a "${data.viaje.nombre}"`,
          'info'
        );
        loadSolicitudes();
      }
    });
    
    socketRef.current.on('solicitud_aceptada', (data) => {
      if (data.solicitante_id === user.id) {
        showNotification(
          'Solicitud aceptada',
          `Tu solicitud para unirte a "${data.viaje.nombre}" fue aceptada`,
          'success'
        );
        loadViajes();
      }
    });
    
    socketRef.current.on('solicitud_rechazada', (data) => {
      if (data.solicitante_id === user.id) {
        showNotification(
          'Solicitud rechazada',
          `Tu solicitud para unirte a "${data.viaje.nombre}" fue rechazada`,
          'warning'
        );
        loadViajes();
      }
    });
    
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  const loadViajes = async () => {
    try {
      const res = await axios.get('http://localhost:4000/viajes');
      setViajes(res.data);
    } catch (error) {
      showNotification('Error', 'No se pudieron cargar los calendarios', 'error');
    }
  };

  const loadSolicitudes = async () => {
    try {
      const res = await axios.get('http://localhost:4000/viajes/solicitudes');
      setSolicitudes(res.data);
    } catch (error) {
    }
  };

  const handleCreateViaje = async (e) => {
    e.preventDefault();
    
    if (!newViajeNombre.trim()) {
      showNotification('Error', 'El nombre del calendario es requerido', 'error');
      return;
    }

    try {
      const res = await axios.post('http://localhost:4000/viajes', {
        nombre: newViajeNombre.trim()
      });
      
      setIsCreateModalOpen(false);
      setNewViajeNombre('');
      showNotification('Éxito', `Calendario "${res.data.nombre}" creado`, 'success');
      loadViajes();
      navigate(`/viaje/${res.data.id}`);
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Error desconocido';
      showNotification('Error', errorMessage, 'error');
    }
  };

  const handleSolicitarUnirse = async (viajeId) => {
    try {
      await axios.post(`http://localhost:4000/viajes/${viajeId}/solicitar-unirse`);
      loadViajes();
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
            <h2>Mis Calendarios</h2>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn-secondary"
                onClick={() => navigate('/solicitudes')}
                style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <span>Solicitudes</span>
                {solicitudes.length > 0 && (
                  <span className="badge-notification">{solicitudes.length}</span>
                )}
              </button>
              <button 
                className="btn-primary"
                onClick={() => setIsCreateModalOpen(true)}
              >
                + Nuevo Calendario
              </button>
            </div>
          </div>

          {viajes.creados.length > 0 && (
            <div className="viajes-section">
              <h3>Mis Calendarios</h3>
              <div className="viajes-grid">
                {viajes.creados.map(viaje => (
                  <div 
                    key={viaje.id} 
                    className="viaje-card"
                    onClick={() => navigate(`/viaje/${viaje.id}`)}
                  >
                    <div className="viaje-header">
                      <h4>{viaje.nombre}</h4>
                      <span className="viaje-badge creador">Creador</span>
                    </div>
                    <div className="viaje-footer">
                      <span className="viaje-date">
                        Creado: {new Date(viaje.created_at).toLocaleDateString('es-AR')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viajes.compartidos.length > 0 && (
            <div className="viajes-section">
              <h3>Calendarios Compartidos</h3>
              <div className="viajes-grid">
                {viajes.compartidos.map(viaje => (
                  <div 
                    key={viaje.id} 
                    className="viaje-card"
                    onClick={() => navigate(`/viaje/${viaje.id}`)}
                  >
                    <div className="viaje-header">
                      <h4>{viaje.nombre}</h4>
                      <span className="viaje-badge miembro">Miembro</span>
                    </div>
                    <div className="viaje-footer">
                      <span className="viaje-date">
                        Unido: {new Date(viaje.created_at).toLocaleDateString('es-AR')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viajes.todos.length > viajes.creados.length + viajes.compartidos.length && (
            <div className="viajes-section">
              <h3>Otros Calendarios</h3>
              <div className="viajes-grid">
                {viajes.todos
                  .filter(v => v.estado === 'disponible' || v.estado === 'solicitado')
                  .map(viaje => (
                    <div key={viaje.id} className="viaje-card">
                      <div className="viaje-header">
                        <h4>{viaje.nombre}</h4>
                        {viaje.estado === 'solicitado' && (
                          <span className="viaje-badge solicitado">Solicitado</span>
                        )}
                      </div>
                      <div className="viaje-footer">
                        {viaje.estado === 'disponible' ? (
                          <button
                            className="btn-primary btn-small"
                            onClick={() => handleSolicitarUnirse(viaje.id)}
                          >
                            Solicitar unirse
                          </button>
                        ) : (
                          <span className="viaje-status">Solicitud pendiente</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {viajes.creados.length === 0 && viajes.compartidos.length === 0 && (
            <div className="empty-state">
              <p>No tienes calendarios aún. ¡Crea uno para comenzar!</p>
            </div>
          )}
        </div>
      </main>

      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Nuevo Calendario</h2>
              <button className="modal-close" onClick={() => setIsCreateModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleCreateViaje} className="modal-form">
              <div className="form-group">
                <label htmlFor="nombre">Nombre del calendario</label>
                <input
                  type="text"
                  id="nombre"
                  value={newViajeNombre}
                  onChange={(e) => setNewViajeNombre(e.target.value)}
                  placeholder="Ej: Viaje a París"
                  required
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setIsCreateModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

export default HomePage;


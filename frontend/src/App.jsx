import { useState, useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import axios from 'axios';
import io from 'socket.io-client';
import Login from './Login';
import './App.css';

const EVENT_TYPES = {
  hotel: { icon: '🏨', label: 'Hotel', color: '#4285f4' },
  vuelo: { icon: '✈️', label: 'Vuelo', color: '#34a853' },
  tren: { icon: '🚂', label: 'Tren', color: '#ea4335' },
  bus: { icon: '🚌', label: 'Bus', color: '#fbbc04' },
  excursion: { icon: '🏔️', label: 'Excursión', color: '#9c27b0' },
  museo: { icon: '🏛️', label: 'Museo', color: '#ff9800' },
  otro: { icon: '📍', label: 'Otro', color: '#5f6368' }
};

function App() {
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [conflictInfo, setConflictInfo] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [newEvent, setNewEvent] = useState({
    titulo: '',
    fecha_hora: '',
    fecha_hora_fin: '',
    tipo: 'otro',
    direccion: ''
  });
  const viajeId = "11111111-1111-1111-1111-111111111111"; // demo

  // Verificar autenticación al cargar
  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      // Configurar axios con el token
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      // Verificar que el token sigue siendo válido
      axios.get('http://localhost:4000/auth/me')
        .then(response => {
          setUser(response.data.user);
        })
        .catch(() => {
          // Token inválido, limpiar
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          delete axios.defaults.headers.common['Authorization'];
        });
    }
  }, []);

  // WebSocket para recibir notificaciones de n8n
  const socketRef = useRef(null);

  // Sistema de notificaciones (definido antes de useEffect para que esté disponible)
  const showNotification = (title, message, type = 'info', persistente = false, eventoData = null) => {
    const id = Date.now() + Math.random();
    const notification = {
      id,
      title,
      message,
      type, // 'success', 'info', 'warning', 'error'
      timestamp: new Date(),
      persistente, // Si es true, se guarda en el cuadro
      eventoData // Datos del evento (para verificar si ya pasó)
    };
    
    setNotifications(prev => [...prev, notification]);
    
    // Solo auto-eliminar toasts (no persistentes) después de 5 segundos
    if (!persistente) {
      setTimeout(() => {
        removeNotification(id);
      }, 5000);
    }
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Generar notificaciones basadas en eventos reales próximos
  const [notificacionesGeneradas, setNotificacionesGeneradas] = useState(new Set());
  
  useEffect(() => {
    if (user && events.length > 0) {
      const ahora = new Date();
      const enUnaHora = new Date(ahora.getTime() + 60 * 60 * 1000);
      const en40Minutos = new Date(ahora.getTime() + 40 * 60 * 1000);
      
      events.forEach(event => {
        const eventId = event.id;
        const eventStart = new Date(event.start);
        
        // Solo procesar eventos que están entre 40 y 70 minutos en el futuro
        if (eventStart >= en40Minutos && eventStart <= enUnaHora) {
          // Verificar si ya generamos una notificación para este evento
          if (!notificacionesGeneradas.has(eventId)) {
            const horaEvento = eventStart.toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit'
            });
            
            const mensaje = `En menos de 1 hora tienes: ${event.title} a las ${horaEvento}`;
            
            // Crear notificación persistente basada en el evento real
            showNotification(
              'Evento próximo',
              mensaje,
              'info',
              true, // Persistente
              {
                id: event.id,
                titulo: event.title,
                fecha_hora: eventStart.toISOString()
              }
            );
            
            setNotificacionesGeneradas(prev => new Set(prev).add(eventId));
          }
        }
      });
    }
  }, [user, events]);

  // Verificar y eliminar notificaciones de eventos que ya pasaron
  useEffect(() => {
    if (user) {
      const checkExpiredNotifications = () => {
        const ahora = new Date();
        setNotifications(prev => prev.filter(notification => {
          // Si no es persistente, mantenerla (se elimina automáticamente después de 5 seg)
          if (!notification.persistente) {
            return true;
          }
          
          // Si no tiene datos del evento, mantenerla
          if (!notification.eventoData || !notification.eventoData.fecha_hora) {
            return true;
          }
          
          // Verificar si el evento ya pasó (con 5 minutos de margen)
          const fechaEvento = new Date(notification.eventoData.fecha_hora);
          const eventoYaPaso = fechaEvento.getTime() <= (ahora.getTime() - 5 * 60 * 1000);
          
          // Si el evento ya pasó, también eliminar del set de notificaciones generadas
          if (eventoYaPaso && notification.eventoData.id) {
            setNotificacionesGeneradas(prev => {
              const nuevo = new Set(prev);
              nuevo.delete(notification.eventoData.id);
              return nuevo;
            });
          }
          
          return !eventoYaPaso;
        }));
      };
      
      // Verificar cada minuto
      const intervalCheck = setInterval(checkExpiredNotifications, 60000);
      checkExpiredNotifications(); // Verificar inmediatamente
      
      return () => clearInterval(intervalCheck);
    }
  }, [user]);

  // Cargar eventos solo si está autenticado
  useEffect(() => {
    if (user) {
      loadEvents();
      const interval = setInterval(loadEvents, 3000);
      
      // Conectar WebSocket para recibir notificaciones de n8n
      socketRef.current = io('http://localhost:4000');
      
      socketRef.current.on('connect', () => {
        console.log('✅ Conectado al WebSocket para notificaciones');
      });
      
      socketRef.current.on('notificacion_evento', (data) => {
        console.log('📨 Notificación recibida de n8n:', data);
        if (data.mensaje) {
          // Mostrar como toast temporal (5 segundos) en la esquina
          showNotification(
            'Evento próximo',
            data.mensaje,
            'info',
            false, // No persistente para el toast
            data.evento // Guardar datos del evento
          );
          
          // También guardar como persistente en el cuadro
          showNotification(
            'Evento próximo',
            data.mensaje,
            'info',
            true, // Persistente para el cuadro
            data.evento // Guardar datos del evento
          );
        } else {
          console.warn('⚠️ Notificación sin mensaje:', data);
        }
      });
      
      socketRef.current.on('error', (error) => {
        console.error('❌ Error en WebSocket:', error);
      });
      
      socketRef.current.on('disconnect', () => {
        console.log('❌ Desconectado del WebSocket');
      });
      
      return () => {
        clearInterval(interval);
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    }
  }, [user]);

  const loadEvents = async () => {
    try {
    const res = await axios.get(`http://localhost:4000/viajes/${viajeId}/actividades`);
    setEvents(res.data.map(a => {
      let fechaHora = a.fecha_hora;
      if (typeof fechaHora === 'string' && !fechaHora.endsWith('Z') && !fechaHora.includes('+') && !fechaHora.includes('-', 10)) {
        fechaHora = fechaHora + 'Z';
      }
      
      let fechaHoraFin = a.fecha_hora_fin;
      if (fechaHoraFin && typeof fechaHoraFin === 'string' && !fechaHoraFin.endsWith('Z') && !fechaHoraFin.includes('+') && !fechaHoraFin.includes('-', 10)) {
        fechaHoraFin = fechaHoraFin + 'Z';
      }
      
      return {
        id: a.id,
        title: a.titulo,
        start: fechaHora,
        end: fechaHoraFin || null,
        extendedProps: { 
          tipo: a.tipo,
          direccion: a.direccion || null
        },
        backgroundColor: getColorForType(a.tipo),
        borderColor: getColorForType(a.tipo),
        textColor: '#fff'
      };
    }));
    } catch (error) {
      console.error('Error cargando eventos:', error);
    }
  };

  const getColorForType = (tipo) => {
    return EVENT_TYPES[tipo]?.color || EVENT_TYPES.otro.color;
  };

  const getIconForType = (tipo) => {
    return EVENT_TYPES[tipo]?.icon || EVENT_TYPES.otro.icon;
  };

  const getLabelForType = (tipo) => {
    return EVENT_TYPES[tipo]?.label || EVENT_TYPES.otro.label;
  };

  // Convertir Date a formato datetime-local (YYYY-MM-DDTHH:mm en hora local)
  const dateToLocalDateTime = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const handleDateClick = (arg) => {
    const dateStr = arg.dateStr;
    const timeStr = arg.date.toTimeString().slice(0, 5);
    
    setEditingEvent(null);
    setNewEvent({
      titulo: '',
      fecha_hora: `${dateStr}T${timeStr}`,
      fecha_hora_fin: '', // Vacío por defecto, el usuario lo completa si quiere
      tipo: 'otro',
      direccion: ''
    });
    setIsModalOpen(true);
  };

  const handleEventClick = (info) => {
    const event = info.event;
    // event.start ya está en la zona horaria local de FullCalendar
    const fecha = new Date(event.start);
    const fechaFin = event.end ? new Date(event.end) : null;
    
    // Convertir a formato datetime-local sin cambiar la zona horaria
    const fechaLocal = dateToLocalDateTime(fecha);
    const fechaFinLocal = fechaFin ? dateToLocalDateTime(fechaFin) : '';
    
    setEditingEvent({
      id: event.id,
      titulo: event.title,
      fecha_hora: fechaLocal,
      fecha_hora_fin: fechaFinLocal,
      tipo: event.extendedProps.tipo,
      direccion: event.extendedProps.direccion || ''
    });
    setNewEvent({
      titulo: event.title,
      fecha_hora: fechaLocal,
      fecha_hora_fin: fechaFinLocal,
      tipo: event.extendedProps.tipo,
      direccion: event.extendedProps.direccion || ''
    });
    setIsModalOpen(true);
  };

  // Función para verificar solapamientos
  const checkOverlap = (start, end, excludeId = null) => {
    const newStart = new Date(start);
    const newEnd = end ? new Date(end) : null;
    
    // Verificar que la hora de fin sea posterior a la de inicio si se proporciona
    if (newEnd && newEnd <= newStart) {
      return { error: 'La hora de fin debe ser posterior a la hora de inicio' };
    }
    
    // Si no hay hora de fin, verificar solapamiento con eventos que tengan la misma hora de inicio
    // o que contengan esa hora
    const overlapping = events.filter(event => {
      if (excludeId && event.id === excludeId) return false;
      
      const eventStart = new Date(event.start);
      const eventEnd = event.end ? new Date(event.end) : null;
      
      if (newEnd) {
        // Si el nuevo evento tiene hora de fin, verificar solapamiento completo
        const eventEndForComparison = eventEnd || new Date(eventStart.getTime() + 60 * 60 * 1000);
        return (newStart < eventEndForComparison && newEnd > eventStart);
      } else {
        // Si el nuevo evento NO tiene hora de fin, verificar si hay eventos que:
        // - Tienen la misma hora de inicio, O
        // - Contienen esa hora en su rango
        if (eventEnd) {
          // Evento existente tiene hora de fin: verificar si la hora de inicio del nuevo está dentro
          return (newStart >= eventStart && newStart < eventEnd);
        } else {
          // Ambos son eventos sin hora de fin: verificar si tienen la misma hora de inicio
          return (newStart.getTime() === eventStart.getTime());
        }
      }
    });
    
    if (overlapping.length > 0) {
      const conflictNames = overlapping.map(e => e.title).join(', ');
      return { 
        error: `Ya tienes eventos en este horario: ${conflictNames}`,
        conflicts: overlapping
      };
    }
    
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validaciones mejoradas
    const errors = [];
    
    if (!newEvent.titulo.trim()) {
      errors.push('El título del evento es requerido');
    }
    
    if (!newEvent.fecha_hora) {
      errors.push('La fecha y hora de inicio es requerida');
    }
    
    if (errors.length > 0) {
      showNotification('Campos requeridos', errors.join('\n'), 'warning');
      return;
    }

    try {
      // datetime-local devuelve "YYYY-MM-DDTHH:mm" en hora local (sin zona horaria)
      // new Date() interpreta esto como hora local del navegador
      // toISOString() automáticamente convierte a UTC
      const localDate = new Date(newEvent.fecha_hora);
      const localDateFin = newEvent.fecha_hora_fin ? new Date(newEvent.fecha_hora_fin) : null;
      
      // Verificar que la fecha es válida
      if (isNaN(localDate.getTime())) {
        showNotification('Error', 'La fecha u hora de inicio no es válida', 'error');
        return;
      }
      
      if (localDateFin) {
        if (isNaN(localDateFin.getTime())) {
          showNotification('Error', 'La fecha u hora de fin no es válida', 'error');
          return;
        }
        
        // Validar que la hora de fin sea posterior a la de inicio
        if (localDateFin <= localDate) {
          showNotification('Error', 'La hora de fin debe ser posterior a la hora de inicio', 'error');
          return;
        }
      }
      
      // Validar que la fecha no sea en el pasado (opcional, pero útil)
      const now = new Date();
      if (localDate < now) {
        // Usar notificación en lugar de confirm
        showNotification('Advertencia', 'La fecha de inicio es en el pasado', 'warning');
        // Continuar de todas formas, solo avisar
      }
      
      // Convertir a UTC usando toISOString() - JavaScript maneja la conversión automáticamente
      const fechaHoraISO = localDate.toISOString();
      const fechaHoraFinISO = localDateFin ? localDateFin.toISOString() : null;
      
      // Verificar solapamientos antes de guardar
      const overlapCheck = checkOverlap(fechaHoraISO, fechaHoraFinISO, editingEvent?.id);
      if (overlapCheck && overlapCheck.error) {
        setConflictInfo(overlapCheck);
        setIsConflictModalOpen(true);
        return; // Esperar confirmación del usuario
      }
      
      // Guardar el evento (sin conflictos)
      console.log('Fecha local ingresada:', newEvent.fecha_hora);
      console.log('Fecha convertida a UTC:', fechaHoraISO);
      console.log('Fecha fin convertida a UTC:', fechaHoraFinISO);
      
      if (editingEvent) {
        // Actualizar evento existente
        await axios.put(`http://localhost:4000/actividades/${editingEvent.id}`, {
          titulo: newEvent.titulo,
          fecha_hora: fechaHoraISO,
          fecha_hora_fin: fechaHoraFinISO,
          tipo: newEvent.tipo,
          direccion: newEvent.direccion.trim() || null
        });
      } else {
        // Crear nuevo evento
    await axios.post('http://localhost:4000/actividades', {
      viaje_id: viajeId,
          titulo: newEvent.titulo,
          fecha_hora: fechaHoraISO,
          fecha_hora_fin: fechaHoraFinISO,
          tipo: newEvent.tipo,
          direccion: newEvent.direccion.trim() || null
        });
      }
      
      setIsModalOpen(false);
      setEditingEvent(null);
      setNewEvent({ titulo: '', fecha_hora: '', fecha_hora_fin: '', tipo: 'otro', direccion: '' });
      
      // Mostrar notificación
      showNotification(
        editingEvent ? 'Evento actualizado' : 'Evento creado',
        editingEvent ? `"${newEvent.titulo}" ha sido actualizado` : `"${newEvent.titulo}" ha sido creado`,
        'success'
      );
      
      loadEvents();
    } catch (error) {
      console.error('Error guardando evento:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Error desconocido';
      showNotification('Error', errorMessage, 'error');
    }
  };

  const handleDeleteClick = () => {
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!editingEvent) return;

    try {
      const eventTitle = newEvent.titulo;
      await axios.delete(`http://localhost:4000/actividades/${editingEvent.id}`);
      setIsModalOpen(false);
      setIsDeleteModalOpen(false);
      setEditingEvent(null);
      setNewEvent({ titulo: '', fecha_hora: '', fecha_hora_fin: '', tipo: 'otro', direccion: '' });
      
      // Mostrar notificación
      showNotification(
        'Evento eliminado',
        `"${eventTitle}" ha sido eliminado`,
        'info'
      );
      
    loadEvents();
    } catch (error) {
      console.error('Error eliminando evento:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Error desconocido';
      showNotification('Error', errorMessage, 'error');
    }
  };

  const handleDeleteCancel = () => {
    setIsDeleteModalOpen(false);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEvent(null);
    setNewEvent({ titulo: '', fecha_hora: '', fecha_hora_fin: '', tipo: 'otro' });
  };

  const getStatsForType = (tipo) => {
    return events.filter(e => e.extendedProps.tipo === tipo).length;
  };

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    try {
      await axios.post('http://localhost:4000/auth/logout');
} catch (err) {
      console.error('Error al cerrar sesión:', err);
    }
    
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };


  // Mostrar login si no está autenticado
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

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
                onClick={handleLogout}
                title="Cerrar sesión"
              >
                Salir
              </button>
            </div>
          </div>
        </header>

      <main className="app-main">
        <div className="calendar-container">
      <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        events={events}
            editable={false}
            selectable={true}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            }}
            locale="es"
            firstDay={1}
            height="auto"
            eventDisplay="block"
            dayMaxEvents={3}
            moreLinkClick="popover"
            timeZone="local"
            buttonText={{
              today: 'Hoy',
              month: 'Mes',
              week: 'Semana',
              day: 'Día'
            }}
            eventTimeFormat={{
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            }}
          />
        </div>

        <div className="sidebar">
          <div className="sidebar-section">
            <div className="quick-actions">
              <button 
                className="btn-add-event"
                onClick={() => {
                  const now = new Date();
                  const dateStr = now.toISOString().slice(0, 10);
                  const timeStr = now.toTimeString().slice(0, 5);
                  setEditingEvent(null);
                  setNewEvent({
                    titulo: '',
                    fecha_hora: `${dateStr}T${timeStr}`,
                    fecha_hora_fin: '', // Vacío por defecto
                    tipo: 'otro',
                    direccion: ''
                  });
                  setIsModalOpen(true);
                }}
              >
                <span className="btn-add-icon">+</span>
                Nuevo evento
              </button>
            </div>
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-title">Notificaciones</h3>
            <div className="notifications-saved">
              {notifications.filter(n => n.persistente).length === 0 ? (
                <div className="notifications-empty">No hay notificaciones guardadas</div>
              ) : (
                notifications
                  .filter(n => n.persistente)
                  .map(notification => (
                    <div 
                      key={notification.id} 
                      className={`notification-saved notification-saved-${notification.type}`}
                    >
                      <div className="notification-saved-icon">
                        {notification.type === 'success' && '✅'}
                        {notification.type === 'info' && 'ℹ️'}
                        {notification.type === 'warning' && '⚠️'}
                        {notification.type === 'error' && '❌'}
                      </div>
                      <div className="notification-saved-content">
                        <div className="notification-saved-title">{notification.title}</div>
                        <div className="notification-saved-message">{notification.message}</div>
                      </div>
                      <button 
                        className="notification-saved-close"
                        onClick={() => removeNotification(notification.id)}
                        title="Cerrar"
                      >
                        ×
                      </button>
                    </div>
                  ))
              )}
            </div>
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-title">Resumen</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{events.length}</div>
                <div className="stat-label">Eventos totales</div>
              </div>
              {Object.entries(EVENT_TYPES).map(([key, value]) => {
                const count = getStatsForType(key);
                if (count === 0) return null;
                return (
                  <div key={key} className="stat-card">
                    <div className="stat-value" style={{ color: value.color }}>{count}</div>
                    <div className="stat-label">{value.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-title">Tipos</h3>
            <div className="legend">
              {Object.entries(EVENT_TYPES).map(([key, value]) => (
                <div key={key} className="legend-item">
                  <span className="legend-dot" style={{ backgroundColor: value.color }}></span>
                  <span className="legend-label">{value.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingEvent ? 'Editar Evento' : 'Nuevo Evento'}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-group">
                <label htmlFor="titulo">Título del evento</label>
                <input
                  type="text"
                  id="titulo"
                  value={newEvent.titulo}
                  onChange={(e) => setNewEvent({ ...newEvent, titulo: e.target.value })}
                  placeholder="Ej: Check-in en el hotel"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="fecha_hora">Fecha y hora de inicio</label>
                <input
                  type="datetime-local"
                  id="fecha_hora"
                  value={newEvent.fecha_hora}
                  onChange={(e) => setNewEvent({ ...newEvent, fecha_hora: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="fecha_hora_fin">Fecha y hora de fin (opcional)</label>
                <input
                  type="datetime-local"
                  id="fecha_hora_fin"
                  value={newEvent.fecha_hora_fin}
                  onChange={(e) => setNewEvent({ ...newEvent, fecha_hora_fin: e.target.value })}
                  min={newEvent.fecha_hora}
                />
                {newEvent.fecha_hora_fin && newEvent.fecha_hora && (
                  <small style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    Duración: {(() => {
                      const start = new Date(newEvent.fecha_hora);
                      const end = new Date(newEvent.fecha_hora_fin);
                      const diff = (end - start) / (1000 * 60); // minutos
                      if (diff <= 0) return 'Inválida';
                      if (diff < 60) return `${Math.round(diff)} minutos`;
                      const hours = Math.floor(diff / 60);
                      const mins = Math.round(diff % 60);
                      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
                    })()}
                  </small>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="tipo">Tipo de evento</label>
                <select
                  id="tipo"
                  value={newEvent.tipo}
                  onChange={(e) => setNewEvent({ ...newEvent, tipo: e.target.value })}
                >
                  {Object.entries(EVENT_TYPES).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value.icon} {value.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="direccion">Dirección (opcional)</label>
                <input
                  type="text"
                  id="direccion"
                  value={newEvent.direccion}
                  onChange={(e) => setNewEvent({ ...newEvent, direccion: e.target.value })}
                  placeholder="Ej: Av. Corrientes 1234, Buenos Aires"
                />
              </div>

              <div className="modal-actions">
                {editingEvent && (
                  <button 
                    type="button" 
                    className="btn-danger" 
                    onClick={handleDeleteClick}
                  >
                    Eliminar
                  </button>
                )}
                <div className="modal-actions-right">
                  <button type="button" className="btn-secondary" onClick={closeModal}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingEvent ? 'Guardar Cambios' : 'Crear Evento'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="modal-overlay" onClick={handleDeleteCancel}>
          <div className="modal-content delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Eliminar evento</h2>
              <button className="modal-close" onClick={handleDeleteCancel}>×</button>
            </div>
            <div className="delete-modal-content">
              <p>¿Desea eliminar <strong>"{newEvent.titulo}"</strong>?</p>
              <p className="delete-warning">Si acepta, no podrá deshacer esta eliminación.</p>
            </div>
            <div className="modal-actions">
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={handleDeleteCancel}
              >
                Cancelar
              </button>
              <button 
                type="button" 
                className="btn-danger" 
                onClick={handleDeleteConfirm}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {isConflictModalOpen && conflictInfo && (
        <div className="modal-overlay" onClick={() => setIsConflictModalOpen(false)}>
          <div className="modal-content delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Conflicto de Horarios</h2>
              <button className="modal-close" onClick={() => setIsConflictModalOpen(false)}>×</button>
            </div>
            <div className="delete-modal-content">
              <p>{conflictInfo.error}</p>
              {conflictInfo.conflicts && conflictInfo.conflicts.length > 0 && (
                <div style={{ marginTop: '16px', textAlign: 'left' }}>
                  <strong style={{ color: '#667eea', display: 'block', marginBottom: '8px' }}>Eventos conflictivos:</strong>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {conflictInfo.conflicts.map((conflict, idx) => (
                      <li key={idx} style={{ padding: '8px', background: '#f0f4ff', borderRadius: '6px', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 600 }}>{conflict.title}</span>
                        <br />
                        <small style={{ color: '#6b7280' }}>
                          {new Date(conflict.start).toLocaleString('es-AR')}
                          {conflict.end && ` - ${new Date(conflict.end).toLocaleString('es-AR')}`}
                        </small>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="delete-warning" style={{ marginTop: '16px' }}>¿Deseas guardar de todas formas?</p>
            </div>
            <div className="modal-actions">
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => setIsConflictModalOpen(false)}
              >
                Cancelar
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                onClick={async () => {
                  setIsConflictModalOpen(false);
                  // Continuar con el guardado
                  try {
                    const localDate = new Date(newEvent.fecha_hora);
                    const localDateFin = newEvent.fecha_hora_fin ? new Date(newEvent.fecha_hora_fin) : null;
                    // Convertir a UTC usando toISOString() - JavaScript maneja la conversión automáticamente
                    const fechaHoraISO = localDate.toISOString();
                    const fechaHoraFinISO = localDateFin ? localDateFin.toISOString() : null;
                    
                    if (editingEvent) {
                      await axios.put(`http://localhost:4000/actividades/${editingEvent.id}`, {
                        titulo: newEvent.titulo,
                        fecha_hora: fechaHoraISO,
                        fecha_hora_fin: fechaHoraFinISO,
                        tipo: newEvent.tipo,
                        direccion: newEvent.direccion.trim() || null
                      });
                    } else {
                      await axios.post('http://localhost:4000/actividades', {
                        viaje_id: viajeId,
                        titulo: newEvent.titulo,
                        fecha_hora: fechaHoraISO,
                        fecha_hora_fin: fechaHoraFinISO,
                        tipo: newEvent.tipo,
                        direccion: newEvent.direccion.trim() || null
                      });
                    }
                    setIsModalOpen(false);
                    setEditingEvent(null);
                    setNewEvent({ titulo: '', fecha_hora: '', fecha_hora_fin: '', tipo: 'otro', direccion: '' });
                    
                    // Mostrar notificación
                    showNotification(
                      editingEvent ? 'Evento actualizado' : 'Evento creado',
                      editingEvent ? `"${newEvent.titulo}" ha sido actualizado` : `"${newEvent.titulo}" ha sido creado`,
                      'success'
                    );
                    
                    loadEvents();
                  } catch (error) {
                    console.error('Error guardando evento:', error);
                    const errorMessage = error.response?.data?.error || error.message || 'Error desconocido';
                    showNotification('Error', errorMessage, 'error');
                  }
                }}
              >
                Guardar de todas formas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sistema de Notificaciones (Toasts temporales - esquina derecha) */}
      <div className="notifications-container">
        {notifications.filter(n => !n.persistente).map(notification => (
          <div 
            key={notification.id} 
            className={`notification notification-${notification.type}`}
            onClick={() => removeNotification(notification.id)}
          >
            <div className="notification-icon">
              {notification.type === 'success' && '✅'}
              {notification.type === 'info' && 'ℹ️'}
              {notification.type === 'warning' && '⚠️'}
              {notification.type === 'error' && '❌'}
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

export default App;

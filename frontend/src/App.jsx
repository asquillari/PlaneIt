import { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import axios from 'axios';
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
  const [events, setEvents] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [newEvent, setNewEvent] = useState({
    titulo: '',
    fecha_hora: '',
    tipo: 'otro'
  });
  const viajeId = "11111111-1111-1111-1111-111111111111"; // demo

  useEffect(() => {
    loadEvents();
    const interval = setInterval(loadEvents, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadEvents = async () => {
    try {
      const res = await axios.get(`http://localhost:4000/viajes/${viajeId}/actividades`);
      setEvents(res.data.map(a => ({
        id: a.id,
        title: a.titulo,
        start: a.fecha_hora,
        extendedProps: { tipo: a.tipo },
        backgroundColor: getColorForType(a.tipo),
        borderColor: getColorForType(a.tipo),
        textColor: '#fff'
      })));
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
      tipo: 'otro'
    });
    setIsModalOpen(true);
  };

  const handleEventClick = (info) => {
    const event = info.event;
    // event.start ya está en la zona horaria local de FullCalendar
    const fecha = new Date(event.start);
    
    // Convertir a formato datetime-local sin cambiar la zona horaria
    const fechaLocal = dateToLocalDateTime(fecha);
    
    setEditingEvent({
      id: event.id,
      titulo: event.title,
      fecha_hora: fechaLocal,
      tipo: event.extendedProps.tipo
    });
    setNewEvent({
      titulo: event.title,
      fecha_hora: fechaLocal,
      tipo: event.extendedProps.tipo
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newEvent.titulo.trim() || !newEvent.fecha_hora) {
      alert('Por favor completa todos los campos');
      return;
    }

    try {
      // datetime-local devuelve "YYYY-MM-DDTHH:mm" en hora local (sin zona horaria)
      // new Date() interpreta esto como hora local, luego toISOString() lo convierte a UTC
      const localDate = new Date(newEvent.fecha_hora);
      
      // Verificar que la fecha es válida
      if (isNaN(localDate.getTime())) {
        alert('Fecha u hora inválida');
        return;
      }
      
      const fechaHoraISO = localDate.toISOString();
      
      console.log('Fecha local ingresada:', newEvent.fecha_hora);
      console.log('Fecha convertida a UTC:', fechaHoraISO);
      
      if (editingEvent) {
        // Actualizar evento existente
        await axios.put(`http://localhost:4000/actividades/${editingEvent.id}`, {
          titulo: newEvent.titulo,
          fecha_hora: fechaHoraISO,
          tipo: newEvent.tipo
        });
      } else {
        // Crear nuevo evento
        await axios.post('http://localhost:4000/actividades', {
          viaje_id: viajeId,
          titulo: newEvent.titulo,
          fecha_hora: fechaHoraISO,
          tipo: newEvent.tipo
        });
      }
      
      setIsModalOpen(false);
      setEditingEvent(null);
      setNewEvent({ titulo: '', fecha_hora: '', tipo: 'otro' });
      loadEvents();
    } catch (error) {
      console.error('Error guardando evento:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Error desconocido';
      alert(`Error: ${errorMessage}`);
    }
  };

  const handleDelete = async () => {
    if (!editingEvent) return;
    
    if (!confirm(`¿Estás seguro de que quieres eliminar "${newEvent.titulo}"?`)) {
      return;
    }

    try {
      await axios.delete(`http://localhost:4000/actividades/${editingEvent.id}`);
      setIsModalOpen(false);
      setEditingEvent(null);
      setNewEvent({ titulo: '', fecha_hora: '', tipo: 'otro' });
      loadEvents();
    } catch (error) {
      console.error('Error eliminando evento:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Error desconocido';
      alert(`Error al eliminar: ${errorMessage}`);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEvent(null);
    setNewEvent({ titulo: '', fecha_hora: '', tipo: 'otro' });
  };

  const getStatsForType = (tipo) => {
    return events.filter(e => e.extendedProps.tipo === tipo).length;
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <span className="logo-icon">🗓️</span>
            <h1 className="app-title">PlaneIt</h1>
            <span className="app-subtitle">Calendario de Viaje</span>
          </div>
          <button 
            className="btn-primary"
            onClick={() => {
              const now = new Date();
              const dateStr = now.toISOString().slice(0, 10);
              const timeStr = now.toTimeString().slice(0, 5);
              setEditingEvent(null);
              setNewEvent({
                titulo: '',
                fecha_hora: `${dateStr}T${timeStr}`,
                tipo: 'otro'
              });
              setIsModalOpen(true);
            }}
          >
            <span className="btn-icon">+</span>
            Crear Evento
          </button>
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
            <h3 className="sidebar-title">Tipos de Eventos</h3>
            <div className="legend">
              {Object.entries(EVENT_TYPES).map(([key, value]) => (
                <div key={key} className="legend-item">
                  <span className="legend-color" style={{ backgroundColor: value.color }}></span>
                  <span className="legend-icon">{value.icon}</span>
                  <span>{value.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="sidebar-section">
            <div className="info-card">
              <div className="info-icon">🔄</div>
              <div className="info-content">
                <h4>Sincronización en Tiempo Real</h4>
                <p>Los cambios se actualizan automáticamente cada 3 segundos</p>
              </div>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="stats-card">
              <h4>Resumen</h4>
              <div className="stats">
                <div className="stat-item">
                  <span className="stat-number">{events.length}</span>
                  <span className="stat-label">Total eventos</span>
                </div>
                {Object.entries(EVENT_TYPES).map(([key, value]) => {
                  const count = getStatsForType(key);
                  if (count === 0) return null;
                  return (
                    <div key={key} className="stat-item">
                      <span className="stat-number">{count}</span>
                      <span className="stat-label">{value.label}</span>
                    </div>
                  );
                })}
              </div>
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
                <label htmlFor="fecha_hora">Fecha y hora</label>
                <input
                  type="datetime-local"
                  id="fecha_hora"
                  value={newEvent.fecha_hora}
                  onChange={(e) => setNewEvent({ ...newEvent, fecha_hora: e.target.value })}
                  required
                />
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

              <div className="modal-actions">
                {editingEvent && (
                  <button 
                    type="button" 
                    className="btn-danger" 
                    onClick={handleDelete}
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
    </div>
  );
}

export default App;

import { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import axios from 'axios';

function App() {
  const [events, setEvents] = useState([]);
  const viajeId = "11111111-1111-1111-1111-111111111111"; // demo

  useEffect(() => {
    loadEvents();
    const interval = setInterval(loadEvents, 3000); // realtime simulado
    return () => clearInterval(interval);
  }, []);

  const loadEvents = async () => {
    const res = await axios.get(`http://localhost:4000/viajes/${viajeId}/actividades`);
    setEvents(res.data.map(a => ({
      title: `${a.tipo === 'vuelo' ? '✈' : a.tipo === 'checkin' ? '🏨' : '🎯'} ${a.titulo}`,
      start: a.fecha_hora,
      extendedProps: { tipo: a.tipo }
    })));
  };

  const addEvent = async () => {
    await axios.post('http://localhost:4000/actividades', {
      viaje_id: viajeId,
      titulo: prompt("Título"),
      fecha_hora: prompt("Fecha y hora (YYYY-MM-DDTHH:mm)"),
      tipo: "actividad"
    });
    loadEvents();
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>PlaneIt - Calendario Compartido</h1>
      <button onClick={addEvent}>+ Agregar Actividad</button>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin]}
        initialView="dayGridMonth"
        events={events}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek'
        }}
      />
      <p>Edita desde otro navegador → ¡cambios en menos de 3 segundos!</p>
    </div>
  );
}

export default App;
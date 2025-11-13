import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import axios from 'axios';
import Login from './Login';
import HomePage from './HomePage';
import Calendar from './Calendar';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      axios.get('http://localhost:4000/auth/me')
        .then(response => {
          setUser(response.data.user);
        })
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          delete axios.defaults.headers.common['Authorization'];
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = (userData, token) => {
    setUser(userData);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  };

  const handleLogout = async () => {
    try {
      await axios.post('http://localhost:4000/auth/logout');
    } catch (err) {
      // Error silencioso
    }
    
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  if (loading) {
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/" 
          element={<HomePage user={user} onLogout={handleLogout} />} 
        />
        <Route 
          path="/viaje/:viajeId" 
          element={<CalendarRoute user={user} onLogout={handleLogout} />} 
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function CalendarRoute({ user, onLogout }) {
  const { viajeId } = useParams();
  const [viajeNombre, setViajeNombre] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadViajeInfo = async () => {
      try {
        const res = await axios.get('http://localhost:4000/viajes');
        const viaje = res.data.todos.find(v => v.id === viajeId);
        if (viaje) {
          setViajeNombre(viaje.nombre);
        }
      } catch (error) {
        // Error silencioso
      } finally {
        setLoading(false);
      }
    };

    if (viajeId) {
      loadViajeInfo();
    }
  }, [viajeId]);

  if (loading) {
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Cargando...</div>
      </div>
    );
  }

  return <Calendar viajeId={viajeId} viajeNombre={viajeNombre} user={user} onLogout={onLogout} />;
}

export default App;

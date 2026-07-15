import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, createContext, useContext } from 'react';
import Login from './pages/Login';
import Register from './pages/Register';
import Timetable from './pages/Timetable';
import Admin from './pages/Admin';
import WebhooksPage from './pages/WebhooksPage';
import { getMe, logout as apiLogout } from './api';

export const AuthContext = createContext(null);
export const ThemeContext = createContext(null);
export const TimezoneContext = createContext(null);

export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [theme, setTheme] = useState('light');
  const [timezone, setTimezone] = useState('UTC');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe().then(d => { setUser(d.username); setTheme(d.theme || 'light'); setIsAdmin(d.is_admin || false); setTimezone(d.timezone || 'UTC'); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => { await apiLogout(); setUser(null); };

  if (loading) return (
    <div className="app-loading"><div className="spinner" /></div>
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <AuthContext.Provider value={{ user, setUser, logout, isAdmin }}>
        <TimezoneContext.Provider value={{ timezone, setTimezone }}>
        <div className={`app theme-${theme}`}>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
              <Route path="/register" element={user ? <Navigate to="/" /> : <Register />} />
              <Route path="/" element={user ? <Timetable /> : <Navigate to="/login" />} />
              <Route path="/webhooks" element={user ? <WebhooksPage onBack={() => window.history.back()} /> : <Navigate to="/login" />} />
              {isAdmin && <Route path="/admin" element={<Admin />} />}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </BrowserRouter>
        </div>
        </TimezoneContext.Provider>
      </AuthContext.Provider>
    </ThemeContext.Provider>
  );
}

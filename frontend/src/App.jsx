import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, createContext, useContext } from 'react';
import Login from './pages/Login';
import Register from './pages/Register';
import Timetable from './pages/Timetable';
import { getMe, logout as apiLogout } from './api';

export const AuthContext = createContext(null);
export const ThemeContext = createContext(null);

export default function App() {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState('light');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe().then(d => { setUser(d.username); setTheme(d.theme || 'light'); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => { await apiLogout(); setUser(null); };

  if (loading) return (
    <div className="app-loading"><div className="spinner" /></div>
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <AuthContext.Provider value={{ user, setUser, logout }}>
        <div className={`app theme-${theme}`}>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
              <Route path="/register" element={user ? <Navigate to="/" /> : <Register />} />
              <Route path="/" element={user ? <Timetable /> : <Navigate to="/login" />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </BrowserRouter>
        </div>
      </AuthContext.Provider>
    </ThemeContext.Provider>
  );
}

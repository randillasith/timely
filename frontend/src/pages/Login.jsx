import { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api';
import { AuthContext } from '../App';

export default function Login() {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const { setUser } = useContext(AuthContext);
  const nav = useNavigate();

  const submit = async e => {
    e.preventDefault(); setErr('');
    if (!u || !p) { setErr('Fill all fields'); return; }
    try {
      const d = await login(u, p);
      setUser(d.username);
      nav('/');
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-logo">📅 Weekly Schedule</h1>
        <p className="auth-sub">Y2 Semester 1</p>
        <h2>Sign In</h2>
        {err && <div className="error">{err}</div>}
        <form onSubmit={submit}>
          <label>Username</label>
          <input value={u} onChange={e=>setU(e.target.value)} placeholder="Your username" autoFocus />
          <label>Password</label>
          <input type="password" value={p} onChange={e=>setP(e.target.value)} placeholder="••••••••" />
          <button type="submit" className="btn-primary">Sign In</button>
        </form>
        <p className="auth-footer">No account? <Link to="/register">Register</Link></p>
      </div>
    </div>
  );
}

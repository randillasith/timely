import { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../api';
import { AuthContext } from '../App';

export default function Register() {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const [err, setErr] = useState('');
  const { setUser } = useContext(AuthContext);
  const nav = useNavigate();

  const submit = async e => {
    e.preventDefault(); setErr('');
    if (!u || !p) { setErr('Fill all fields'); return; }
    if (p !== c) { setErr('Passwords do not match'); return; }
    try {
      const d = await register(u, p);
      setUser(d.username);
      nav('/');
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-logo">📅 Weekly Schedule</h1>
        <p className="auth-sub">Create your timetable</p>
        <h2>Create Account</h2>
        {err && <div className="error">{err}</div>}
        <form onSubmit={submit}>
          <label>Username</label>
          <input value={u} onChange={e=>setU(e.target.value)} placeholder="Choose a username" autoFocus />
          <label>Password</label>
          <input type="password" value={p} onChange={e=>setP(e.target.value)} placeholder="At least 8 chars" />
          <label>Confirm Password</label>
          <input type="password" value={c} onChange={e=>setC(e.target.value)} placeholder="Re-enter password" />
          <button type="submit" className="btn-primary">Create Account</button>
        </form>
        <p className="auth-footer">Already have an account? <Link to="/login">Sign In</Link></p>
      </div>
    </div>
  );
}

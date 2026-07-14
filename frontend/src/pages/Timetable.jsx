import { useState, useEffect, useCallback, useContext } from 'react';
import { AuthContext, ThemeContext, TimezoneContext } from '../App';
import Calendar from '../components/Calendar';
import MonthView from '../components/MonthView';
import AgendaView from '../components/AgendaView';
import EventModal from '../components/EventModal';
import ThemePicker from '../components/ThemePicker';
import SettingsPanel from '../components/SettingsPanel';
import { getEvents, createEvent, updateEvent, deleteEvent, setTheme as apiSetTheme, getCategories, createCategory, deleteCategory, getPresets, getActiveAnnouncements, getSemesters } from '../api';

export default function Timetable() {
  const { user, logout, isAdmin } = useContext(AuthContext);
  const { theme, setTheme } = useContext(ThemeContext);
  const { timezone, setTimezone } = useContext(TimezoneContext);
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [presets, setPresets] = useState([]);
  const [modal, setModal] = useState(null);
  const [catModal, setCatModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState([]);
  const [viewMode, setViewMode] = useState('week'); // week | month | agenda
  const [semester, setSemester] = useState('');
  const [semesters, setSemesters] = useState([]);

  const load = useCallback(async () => {
    try {
      const [evs, cats, prs, anns, sems] = await Promise.all([
        getEvents(), getCategories(), getPresets(), getActiveAnnouncements(), getSemesters()
      ]);
      setEvents(evs); setCategories(cats); setPresets(prs); setAnnouncements(anns); setSemesters(sems);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const handler = e => {
      if (modal || catModal || settingsModal) {
        if (e.key === 'Escape') {
          if (modal) setModal(null);
          else if (catModal) setCatModal(false);
          else setSettingsModal(false);
        }
        return;
      }
      switch (e.key) {
        case 'n': case 'N': setModal({}); break;
        case 'ArrowLeft': setWeekOffset(w => w - 1); break;
        case 'ArrowRight': setWeekOffset(w => w + 1); break;
        case 't': case 'T': setWeekOffset(0); break;
        case 'm': case 'M': setViewMode(v => v === 'week' ? 'month' : v === 'month' ? 'agenda' : 'week'); break;
        case 'Escape': setModal(null); setCatModal(false); setSettingsModal(false); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modal, catModal, settingsModal]);

  const legendItems = [
    ...presets.map(p => ({ key: p.name, color: p.color, icon: p.icon, label: p.name })),
    ...categories.map(c => ({ key: 'cat-'+c.id, color: c.color, icon: c.icon, label: c.name })),
  ];

  const handleSave = async data => {
    if (modal?.event) await updateEvent(modal.event.id, data);
    else await createEvent(data);
    setModal(null); load();
  };

  const handleDelete = async () => {
    if (modal?.event) { await deleteEvent(modal.event.id); setModal(null); load(); }
  };

  const handleEventUpdate = async (id, data) => {
    await updateEvent(id, data);
    load();
  };

  const handleTheme = async t => { setTheme(t); await apiSetTheme(t).catch(() => {}); };

  const handleAddCategory = async (name, color, icon) => { await createCategory({ name, color, icon }); load(); };
  const handleDeleteCategory = async id => { if (!confirm('Delete this category?')) return; await deleteCategory(id); load(); };

  const handleSemesterChange = async s => {
    setSemester(s);
    const evs = await getEvents();
    setEvents(evs);
  };

  // Recalculate monday for view modes
  const getMonday = () => {
    const d = new Date(); d.setDate(d.getDate() + (d.getDay() === 0 ? -6 : 1 - d.getDay()));
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  };

  return (
    <div className="timetable-page">
      {announcements.length > 0 && announcements.map(a => (
        <div key={a.id} className="announcement-banner">📢 {a.message}</div>
      ))}
      <div className="header">
        <h1>📅 Weekly Schedule</h1>
        <div className="header-actions">
          <span className="user-badge">👤 {user}</span>
          <ThemePicker current={theme} onChange={handleTheme} />
          {isAdmin && <a href="/admin" className="btn btn-sm" title="Admin Panel">⚙️ Admin</a>}
          <button className="btn btn-sm" onClick={() => setSettingsModal(true)} title="Settings">⚙️</button>
          <button className="btn btn-sm" onClick={() => setCatModal(true)}>🏷️</button>
          <button className="btn btn-primary btn-sm" onClick={() => setModal({})}>+ Add</button>
          <button className="btn btn-outline btn-sm" onClick={logout}>Logout</button>
        </div>
      </div>

      {/* ─── View bar ─── */}
      <div className="view-bar">
        <div className="view-bar-left">
          <button onClick={() => setWeekOffset(w => w - 1)}>◀</button>
          <span className="week-label">
            {viewMode === 'week' && (weekOffset===0?'This Week':weekOffset===-1?'Last Week':weekOffset===1?'Next Week':`Week ${weekOffset}`)}
            {viewMode === 'month' && (weekOffset===0?'This Month':weekOffset===-1?'Last Month':weekOffset===1?'Next Month':``)}
            {viewMode === 'agenda' && (weekOffset===0?'This Week':weekOffset===-1?'Last Week':weekOffset===1?'Next Week':`Week ${weekOffset}`)}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)}>▶</button>
          <button className="btn btn-sm btn-outline" style={{marginLeft:'.3rem'}} onClick={() => setWeekOffset(0)}>Today</button>
        </div>
        <div className="view-bar-right">
          {/* View mode buttons */}
          <div className="view-mode-group">
            {['week','month','agenda'].map(m => (
              <button key={m} className={`btn btn-sm ${viewMode===m?'btn-primary':''}`}
                onClick={() => setViewMode(m)}>
                {m==='week'?'📅 Week':m==='month'?'🗓️ Month':'📋 Agenda'}
              </button>
            ))}
          </div>
          {/* Semester filter */}
          {semesters.length > 0 && (
            <select value={semester} onChange={e => setSemester(e.target.value)}
              style={{marginLeft:'.5rem',fontSize:'.75rem',padding:'.25rem .4rem',width:'auto'}}>
              <option value="">All Semesters</option>
              {semesters.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {/* Keyboard shortcut hint */}
          <span className="shortcut-hint" title="N=New · ← → =Navigate · T=Today · M=Mode · Esc=Close">
            ⌨️ <kbd>N</kbd> <kbd>←</kbd> <kbd>→</kbd> <kbd>T</kbd> <kbd>M</kbd>
          </span>
        </div>
      </div>

      {/* ─── Calendar / View ─── */}
      {loading ? (
        <div className="empty-state"><p>Loading your schedule...</p></div>
      ) : (
        <>
          {viewMode === 'week' && (
            <Calendar
              events={events}
              weekOffset={weekOffset}
              timezone={timezone}
              onSlotClick={(day, hour) => setModal({ day, hour })}
              onEventClick={ev => setModal({ event: ev })}
              onEventUpdate={handleEventUpdate}
            />
          )}
          {viewMode === 'month' && (
            <MonthView
              events={events}
              monday={getMonday()}
              weekOffset={weekOffset}
              onSlotClick={(day, hour) => setModal({ day, hour })}
              onEventClick={ev => setModal({ event: ev })}
            />
          )}
          {viewMode === 'agenda' && (
            <AgendaView
              events={events}
              monday={getMonday()}
              weekOffset={weekOffset}
              onEventClick={ev => setModal({ event: ev })}
            />
          )}
        </>
      )}

      {/* LEGEND */}
      {legendItems.length > 0 && (
        <div className="legend">
          {legendItems.map((item, i) => (
            <span key={i} className="legend-item">
              <span className="legend-swatch" style={{background:item.color}}></span>
              {item.icon} {item.label}
            </span>
          ))}
          <span className="legend-hint">Click slot → add · Click event → edit · Drag event → move · Drag bottom → resize</span>
        </div>
      )}

      {/* MODALS */}
      {modal && (
        <EventModal
          event={modal.event} defaultDay={modal.day} defaultHour={modal.hour}
          categories={categories} presets={presets}
          onSave={handleSave} onDelete={modal.event ? handleDelete : null}
          onClose={() => setModal(null)}
        />
      )}

      {catModal && <CategoryManager
        categories={categories} presets={presets}
        onAdd={handleAddCategory} onDelete={handleDeleteCategory}
        onClose={() => setCatModal(false)}
      />}

      {settingsModal && <SettingsPanel onClose={() => setSettingsModal(false)} onImport={load} timezone={timezone} onTimezoneChange={setTimezone} />}
    </div>
  );
}

function CategoryManager({ categories, presets, onAdd, onDelete, onClose }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#c4956a');
  const [icon, setIcon] = useState('📌');

  const submit = e => { e.preventDefault(); if (!name.trim()) return; onAdd(name.trim(), color, icon); setName(''); setColor('#c4956a'); setIcon('📌'); };
  const ICONS = ['📚','🏫','🎬','😴','📺','🗄️','🚶','📌','💻','📝','🎮','🎵','✏️','📖','☕','🏋️'];

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal cat-manager-modal">
        <h2>🏷️ Manage Categories</h2>
        <div style={{fontSize:'.75rem',color:'var(--text2)',marginBottom:'.5rem'}}>Built-in:</div>
        <div className="cat-list">
          {presets.map((p,i) => (
            <div key={i} className="cat-row"><span className="cat-color" style={{background:p.color}}></span><span className="cat-name">{p.icon} {p.name}</span></div>
          ))}
        </div>
        {categories.length > 0 && (
          <><div style={{fontSize:'.75rem',color:'var(--text2)',marginBottom:'.5rem'}}>Your custom:</div>
          <div className="cat-list">
            {categories.map(c => (
              <div key={c.id} className="cat-row">
                <span className="cat-color" style={{background:c.color}}></span>
                <span className="cat-name">{c.icon} {c.name}</span>
                <button onClick={() => onDelete(c.id)} title="Delete">✕</button>
              </div>
            ))}
          </div></>
        )}
        <form onSubmit={submit} className="add-cat-form" style={{marginTop:'.5rem'}}>
          <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="New category name" style={{flex:1}} />
          <select value={icon} onChange={e=>setIcon(e.target.value)} style={{width:'50px',padding:'.35rem',marginBottom:0}}>
            {ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
          </select>
          <input type="color" value={color} onChange={e=>setColor(e.target.value)} style={{width:'36px',height:'32px',padding:0,marginBottom:0,border:'1px solid var(--border)',borderRadius:'6px',cursor:'pointer'}} />
          <button type="submit" className="btn btn-primary btn-sm">Add</button>
        </form>
        <div className="modal-actions"><button className="btn" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

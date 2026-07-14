import { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { AuthContext, ThemeContext, TimezoneContext } from '../App';
import Calendar from '../components/Calendar';
import AgendaView from '../components/AgendaView';
import EventModal from '../components/EventModal';
import ThemePicker from '../components/ThemePicker';
import SettingsPanel from '../components/SettingsPanel';
import { getEvents, createEvent, updateEvent, deleteEvent, setTheme as apiSetTheme, getCategories, createCategory, deleteCategory, getPresets, getActiveAnnouncements, getLocations } from '../api';

export default function Timetable() {
  const { user, logout, isAdmin } = useContext(AuthContext);
  const { theme, setTheme } = useContext(ThemeContext);
  const { timezone, setTimezone } = useContext(TimezoneContext);
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [presets, setPresets] = useState([]);
  const [locations, setLocations] = useState([]);
  const [modal, setModal] = useState(null);
  const [catModal, setCatModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState([]);
  const [view, setView] = useState('grid'); // 'grid' | 'agenda'
  const [locationFilter, setLocationFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const [evs, cats, prs, anns, locs] = await Promise.all([
        getEvents(), getCategories(), getPresets(), getActiveAnnouncements(), getLocations()
      ]);
      setEvents(evs); setCategories(cats); setPresets(prs); setAnnouncements(anns); setLocations(locs);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh locations after save/delete
  const refreshLocations = useCallback(async () => {
    try { setLocations(await getLocations()); } catch(e) {}
  }, []);

  // ── Filtered events ──
  const filteredEvents = useMemo(() => {
    if (!locationFilter) return events;
    return events.filter(e => e.location === locationFilter);
  }, [events, locationFilter]);

  const legendItems = [
    ...presets.map(p => ({ key: p.name, color: p.color, icon: p.icon, label: p.name })),
    ...categories.map(c => ({ key: 'cat-'+c.id, color: c.color, icon: c.icon, label: c.name })),
  ];

  const handleSave = async data => {
    if (modal?.event) await updateEvent(modal.event.id, data);
    else await createEvent(data);
    setModal(null); load(); refreshLocations();
  };

  const handleDelete = async () => {
    if (modal?.event) { await deleteEvent(modal.event.id); setModal(null); load(); refreshLocations(); }
  };

  const handleTheme = async t => { setTheme(t); await apiSetTheme(t).catch(() => {}); };

  const handleAddCategory = async (name, color, icon) => { await createCategory({ name, color, icon }); load(); };
  const handleDeleteCategory = async id => { if (!confirm('Delete this category?')) return; await deleteCategory(id); load(); };

  const allLocations = useMemo(() => {
    const set = new Set(locations);
    events.forEach(e => { if (e.location) set.add(e.location); });
    return [...set].sort();
  }, [locations, events]);

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

      {/* ─── Week bar + view toggle + location filter ─── */}
      <div className="week-bar">
        {view === 'grid' && (
          <>
            <button onClick={() => setWeekOffset(w => w - 1)}>◀</button>
            <span className="week-label">
              {weekOffset===0?'This Week':weekOffset===-1?'Last Week':weekOffset===1?'Next Week':`Week ${weekOffset}`}
            </span>
            <button onClick={() => setWeekOffset(w => w + 1)}>▶</button>
            <button className="btn btn-sm btn-outline" style={{marginLeft:'.3rem'}} onClick={() => setWeekOffset(0)}>Today</button>
          </>
        )}

        <div className="view-toggle">
          <button
            className={`btn btn-sm ${view === 'grid' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setView('grid')}
          >📅 Grid</button>
          <button
            className={`btn btn-sm ${view === 'agenda' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setView('agenda')}
          >📋 List</button>
        </div>

        {allLocations.length > 0 && (
          <div className="location-filter">
            <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
              style={{fontSize:'.78rem',padding:'.25rem .5rem',borderRadius:'6px',border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontFamily:'inherit',cursor:'pointer'}}>
              <option value="">📍 All locations</option>
              {allLocations.map(l => <option key={l} value={l}>📍 {l}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ─── Calendar / Agenda ─── */}
      {loading ? (
        <div className="empty-state"><p>Loading your schedule...</p></div>
      ) : view === 'grid' ? (
        <Calendar
          events={filteredEvents}
          weekOffset={weekOffset}
          timezone={timezone}
          onSlotClick={(day, hour) => setModal({ day, hour })}
          onEventClick={ev => setModal({ event: ev })}
        />
      ) : (
        <div className="agenda-container">
          <AgendaView events={filteredEvents} onEventClick={ev => setModal({ event: ev })} />
        </div>
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
          <span className="legend-hint">Click slot → add · Click event → edit · Drag to move</span>
        </div>
      )}

      {/* MODALS */}
      {modal && (
        <EventModal
          event={modal.event} defaultDay={modal.day} defaultHour={modal.hour}
          categories={categories} presets={presets} allEvents={events}
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

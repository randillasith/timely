import { useState, useEffect, useContext, useCallback } from 'react';
import { AuthContext, ThemeContext } from '../App';
import Calendar from '../components/Calendar';
import EventModal from '../components/EventModal';
import ThemePicker from '../components/ThemePicker';
import { getEvents, createEvent, updateEvent, deleteEvent, setTheme as apiSetTheme } from '../api';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

export default function Timetable() {
  const { user, logout } = useContext(AuthContext);
  const { theme, setTheme } = useContext(ThemeContext);
  const [events, setEvents] = useState([]);
  const [modal, setModal] = useState(null); // null | {event?, day?, hour?}
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setEvents(await getEvents()); }
    catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async data => {
    if (modal?.event) {
      await updateEvent(modal.event.id, data);
    } else {
      await createEvent(data);
    }
    setModal(null);
    load();
  };

  const handleDelete = async () => {
    if (modal?.event) {
      await deleteEvent(modal.event.id);
      setModal(null);
      load();
    }
  };

  const handleTheme = async t => {
    setTheme(t);
    await apiSetTheme(t).catch(() => {});
  };

  return (
    <div className="timetable-page">
      <header className="topbar">
        <div className="topbar-left">
          <h1>📅 Weekly Schedule</h1>
          <span className="user-badge">👤 {user}</span>
        </div>
        <div className="topbar-right">
          <ThemePicker current={theme} onChange={handleTheme} />
          <button className="btn" onClick={() => setModal({})}>+ Add Event</button>
          <button className="btn btn-outline" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="day-tabs">
        {DAYS.map((d, i) => (
          <button key={i} className="day-tab" onClick={() => {
            document.querySelector('.calendar-wrap')?.scrollIntoView({behavior:'smooth'});
          }}>{d.slice(0,3)}</button>
        ))}
      </div>

      {loading ? (
        <div className="loading-caption">Loading your schedule...</div>
      ) : (
        <Calendar
          events={events}
          onSlotClick={(day, hour) => setModal({ day, hour })}
          onEventClick={ev => setModal({ event: ev })}
        />
      )}

      {modal && (
        <EventModal
          event={modal.event}
          defaultDay={modal.day}
          defaultHour={modal.hour}
          onSave={handleSave}
          onDelete={modal.event ? handleDelete : null}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

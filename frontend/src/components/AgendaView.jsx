import { useMemo } from 'react';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

const CAT_COLORS = {
  lecture:'#e8e0f0', lab:'#d8e0f0', movie:'#f0d8d8',
  nap:'#d8e8e8', oop_videos:'#d8e8d0', database:'#d8d0e8',
  task:'#f5e6d8', travel:'#f0ece4', class:'#e8e0f0',
  tutorial:'#e0d8f0', other:'#f5e6d8'
};
const CAT_ICONS = {
  lecture:'📚', lab:'🔬', movie:'🎬',
  nap:'😴', oop_videos:'📺', database:'🗄️',
  task:'📖', travel:'🚶', class:'📚',
  tutorial:'📝', other:'📌'
};

export default function AgendaView({ events, onEventClick, weekOffset }) {
  const sorted = useMemo(() => {
    const filtered = weekOffset !== 0
      ? events.filter(e => e.repeat === 'weekly')
      : events;
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (a.day !== b.day) return a.day - b.day;
      return a.start.localeCompare(b.start);
    });
    return copy;
  }, [events, weekOffset]);

  if (!sorted.length) {
    return (
      <div className="agenda-empty">
        <p>✨ No events scheduled</p>
      </div>
    );
  }

  let currentDay = -1;
  const rows = [];
  sorted.forEach((ev, i) => {
    if (ev.day !== currentDay) {
      currentDay = ev.day;
      rows.push(
        <div key={`h-${i}`} className="agenda-day-header">
          {DAYS[currentDay]}
        </div>
      );
    }
    const bg = ev.color || CAT_COLORS[ev.category] || '#f5e6d8';
    const icon = ev.icon || CAT_ICONS[ev.category] || '📌';
    rows.push(
      <div key={ev.id} className="agenda-event" onClick={() => onEventClick(ev)}
        style={{ borderLeftColor: bg }}>
        <div className="agenda-event-time">{ev.start}–{ev.end}</div>
        <div className="agenda-event-body">
          <div className="agenda-event-title">{icon} {ev.title}</div>
          <div className="agenda-event-meta">
            {ev.location && <span className="agenda-location">📍 {ev.location}</span>}
            {ev.note && <span className="agenda-note">{ev.note}</span>}
          </div>
        </div>
      </div>
    );
  });

  return <div className="agenda-view">{rows}</div>;
}

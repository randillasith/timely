import { useMemo } from 'react';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

const CAT_COLORS = {
  lecture:'#e8e0f0', lab:'#d8e8f0', movie:'#f0d8d8',
  nap:'#d8e8e8', oop_videos:'#d8e8d0', database:'#d8d0e8',
  task:'#f5e6d8', travel:'#f0ece4', class:'#e8e0f0',
  other:'#f5e6d8'
};
const CAT_BORDER = {
  lecture:'#8a78b0', lab:'#6aa0c0', movie:'#c08080',
  nap:'#70a8a8', oop_videos:'#78b070', database:'#9080b8',
  task:'#c4956a', travel:'#b09a7a', class:'#8a78b0',
  other:'#c4956a'
};
const CAT_TEXT_COLORS = {
  lecture:'#3a2040', lab:'#1a3050', movie:'#4a2020',
  nap:'#1a3a3a', oop_videos:'#1a3a20', database:'#2a2050',
  task:'#2d2a24', travel:'#4a3a2a', class:'#3a2040',
  other:'#2d2a24'
};
const CAT_ICONS = {
  lecture:'📚', lab:'🔬', movie:'🎬',
  nap:'😴', oop_videos:'📺', database:'🗄️',
  task:'📖', travel:'🚶', class:'📚',
  other:'📌'
};

export default function AgendaView({ events, monday, weekOffset, onEventClick }) {
  const today = new Date();

  // Compute the 7 dates (Mon–Sun) from monday
  const dates = useMemo(() =>
    DAYS.map((_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return d;
    }),
  [monday]);

  // Group events by day, sort chronologically, mark past
  const byDay = useMemo(() => {
    const buckets = [[],[],[],[],[],[],[]];
    events.forEach(e => {
      if (e.day == null || e.day < 0 || e.day > 6) return;
      const dd = new Date(monday);
      dd.setDate(dd.getDate() + e.day);
      const isPast =
        dd < today &&
        (dd.getDate() !== today.getDate() ||
          dd.getMonth() !== today.getMonth() ||
          dd.getFullYear() !== today.getFullYear());
      buckets[e.day].push({ ...e, date: dd, isPast });
    });
    // Sort each day's events by start time
    buckets.forEach(day => {
      day.sort((a, b) => {
        if (a.start < b.start) return -1;
        if (a.start > b.start) return 1;
        return 0;
      });
    });
    return buckets;
  }, [events, monday, today]);

  const hasAnyEvents = byDay.some(day => day.length > 0);

  return (
    <div className="calendar-wrap">
      <div className="agenda-view">
        {DAYS.map((dayName, di) => {
          const date = dates[di];
          const dayEvents = byDay[di];
          if (dayEvents.length === 0) return null;

          // Format the date: e.g. "Jul 14"
          const dateStr = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
          });

          return (
            <div key={di} className="agenda-day">
              <div className="agenda-day-header">
                <span className="agenda-day-name">{dayName}</span>
                <span className="agenda-day-date">{dateStr}</span>
              </div>

              <div className="agenda-events">
                {dayEvents.map(ev => {
                  const borderColor = CAT_BORDER[ev.category] || CAT_BORDER.other;
                  const bgColor = ev.color || CAT_COLORS[ev.category] || '#f5e6d8';
                  const textColor = CAT_TEXT_COLORS[ev.category] || '#2d2a24';
                  const icon = ev.icon || CAT_ICONS[ev.category] || '📌';

                  return (
                    <div
                      key={ev.id}
                      className="agenda-event"
                      style={{ opacity: ev.isPast ? 0.55 : 1 }}
                      onClick={() => onEventClick(ev)}
                    >
                      <div
                        className="agenda-event-stripe"
                        style={{ background: borderColor }}
                      />
                      <div
                        className="agenda-event-body"
                        style={{ background: bgColor, color: textColor }}
                      >
                        <div className="agenda-event-time">{ev.start}–{ev.end}</div>
                        <div className="agenda-event-title">{icon} {ev.title}</div>
                        {ev.note && (
                          <div className="agenda-event-note">{ev.note}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {!hasAnyEvents && (
          <div className="empty-state">
            <p>No events this week</p>
          </div>
        )}
      </div>
    </div>
  );
}

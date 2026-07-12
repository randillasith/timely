import { useMemo } from 'react';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const HOURS = ['8AM','9AM','10AM','11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM','7PM','8PM','9PM','10PM','11PM','12AM','1AM'];
const GRID_START = 8 * 60;    // 480
const GRID_END   = 25 * 60;   // 1500
const TOTAL_MIN  = GRID_END - GRID_START;

function toGridMin(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  let total = h * 60 + m;
  if (total < GRID_START) total += 1440;
  return total;
}

const CAT_ICONS = { movie:'🎬', nap:'😴', oop:'📺', db:'🗄️', travel:'🚶', task:'📖', class:'📚', other:'📌' };

export default function Calendar({ events, onSlotClick, onEventClick }) {
  // Show only Mon-Fri
  const weekEvents = useMemo(() => events.filter(e => e.day >= 0 && e.day <= 4), [events]);
  const byDay = useMemo(() => {
    const d = [[],[],[],[],[]];
    weekEvents.forEach(e => { if (e.day < 5) d[e.day].push(e); });
    return d;
  }, [weekEvents]);

  return (
    <div className="calendar-wrap">
      <div className="calendar">
        {/* Header */}
        <div className="cal-header cal-time-header">Time</div>
        {DAYS.slice(0,5).map((d,i) => (
          <div key={i} className="cal-header">{d}</div>
        ))}

        {/* Rows */}
        {HOURS.map((label, hi) => (
          <>
            <div className="cal-time">{label}</div>
            {[0,1,2,3,4].map(di => (
              <div key={`${hi}-${di}`}
                className="cal-cell"
                onClick={() => onSlotClick(di, hi + 8)}
              />
            ))}
          </>
        ))}

        {/* Events overlay */}
        {[0,1,2,3,4].map(di => {
          if (!byDay[di].length) return null;
          // Find the column's position by getting the first cell for this day
          const firstIdx = 6 + di; // day header index
          return (
            <div key={`overlay-${di}`} className="cal-overlay" style={{
              gridColumn: di + 2,
              gridRow: 2,
              marginTop: 0,
            }}>
              {byDay[di].map(ev => {
                const s = toGridMin(ev.start);
                const e = toGridMin(ev.end);
                if (s === null || e === null || e <= s) return null;
                const top = ((s - GRID_START) / TOTAL_MIN) * 100;
                const h = Math.max(((e - s) / TOTAL_MIN) * 100, 2.5);
                const icon = CAT_ICONS[ev.category] || '📌';
                const bg = ev.color || (ev.category === 'class' ? '#e8e0f0' : '#f5e6d8');
                const textColor = ev.color ? '#fff' : undefined;
                return (
                  <div key={ev.id}
                    className="cal-event"
                    style={{ top: `${top}%`, height: `${h}%`, background: bg, color: textColor }}
                    onClick={e => { e.stopPropagation(); onEventClick(ev); }}
                    title={`${ev.title} (${ev.start}–${ev.end})`}
                  >
                    <div className="cal-event-title">{icon} {ev.title}</div>
                    <div className="cal-event-time">{ev.start}–{ev.end}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

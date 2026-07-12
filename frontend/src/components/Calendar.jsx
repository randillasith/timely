import { useMemo, Fragment } from 'react';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const HOURS = ['8AM','9AM','10AM','11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM','7PM','8PM','9PM','10PM','11PM','12AM','1AM'];
const GRID_START = 8 * 60;
const GRID_END = 25 * 60;
const TOTAL_MIN = GRID_END - GRID_START;

function toGridMin(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  let total = h * 60 + m;
  if (total < GRID_START) total += 1440;
  return total;
}

const CAT_COLORS = {
  task:'#f5e6d8', class:'#e8e0f0', movie:'#f0d8d8',
  nap:'#d8e8e8', oop:'#d8e8d0', db:'#d8d0e8',
  travel:'#f0ece4', other:'#f5e6d8'
};
const CAT_ICONS = { movie:'🎬', nap:'😴', oop:'📺', db:'🗄️', travel:'🚶', task:'📖', class:'📚', other:'📌' };

export default function Calendar({ events, weekOffset, onSlotClick, onEventClick }) {
  const weekEvents = useMemo(() => events.filter(e => e.day >= 0 && e.day <= 6), [events]);

  const monday = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + (d.getDay() === 0 ? -6 : 1 - d.getDay()));
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const dates = useMemo(() => DAYS.map((_, i) => {
    const d = new Date(monday); d.setDate(d.getDate() + i); return d;
  }), [monday]);

  const today = new Date();
  const isToday = (d) => d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();

  const byDay = useMemo(() => {
    const d = [[],[],[],[],[],[],[]];
    weekEvents.forEach(e => { if (e.day < 7) d[e.day].push(e); });
    return d;
  }, [weekEvents]);

  return (
    <div className="calendar-wrap">
      <div className="calendar">
        <div className="cal-header" style={{background:'#f8f5f0',color:'var(--text3)'}}>Time</div>
        {DAYS.map((day, i) => (
          <div key={i} className={`cal-header${isToday(dates[i])?' today':''}`}>
            {day}<small>{String(dates[i].getDate()).padStart(2,'0')}/{String(dates[i].getMonth()+1).padStart(2,'0')}</small>
          </div>
        ))}

        {HOURS.map((label, hi) => (
          <Fragment key={hi}>
            <div className="cal-time">{label}</div>
            {[0,1,2,3,4,5,6].map(di => (
              <div key={`${hi}-${di}`}
                className={`cal-cell${isToday(dates[di])?' today-col':''}`}
                onClick={() => onSlotClick(di, hi + 8)}
              />
            ))}
          </Fragment>
        ))}

        {[0,1,2,3,4,5,6].map(di => {
          if (!byDay[di].length) return null;
          return (
            <div key={`ol-${di}`} className="cal-overlay" style={{ gridColumn: di + 2 }}>
              {byDay[di].map(ev => {
                const s = toGridMin(ev.start);
                const e = toGridMin(ev.end);
                if (s === null || e === null || e <= s) return null;
                const top = ((s - GRID_START) / TOTAL_MIN) * 100;
                const h = Math.max(((e - s) / TOTAL_MIN) * 100, 2.5);
                const bg = ev.color || CAT_COLORS[ev.category] || '#f5e6d8';
                const icon = ev.icon || CAT_ICONS[ev.category] || '📌';
                return (
                  <div key={ev.id}
                    className="cal-event"
                    style={{ top:`${top}%`, height:`${h}%`, background:bg }}
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

import { useMemo, Fragment } from 'react';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const HOURS = ['8AM','9AM','10AM','11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM','7PM','8PM','9PM','10PM','11PM','12AM','1AM'];
const GRID_START = 8 * 60;
const GRID_END   = 26 * 60;
const TOTAL_MIN  = GRID_END - GRID_START;
const ROW_PX     = 50;
const HEADER_PX  = 43;

function toGridMin(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  let total = h * 60 + m;
  if (total < GRID_START) total += 1440;
  return total;
}

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
    weekEvents.forEach(e => { if (e.day < 7) {
      const dd = new Date(monday);
      dd.setDate(dd.getDate() + e.day);
      d[e.day].push({ ...e, date: dd, isPast: dd < today && (dd.getDate() !== today.getDate() || dd.getMonth() !== today.getMonth() || dd.getFullYear() !== today.getFullYear()) });
    }});
    return d;
  }, [weekEvents, monday, today]);

  const GRID_H = HOURS.length * ROW_PX; // 900px

  return (
    <div className="calendar-wrap">
      <div className="calendar-scroll">
        <div className="calendar">
          <div className="cal-header cal-time-header">Time</div>
          {DAYS.map((day, i) => (
            <div key={i} className={`cal-header${isToday(dates[i])?' today':''}`}>
              {day}<small>{String(dates[i].getDate()).padStart(2,'0')}/{String(dates[i].getMonth()+1).padStart(2,'0')}</small>
            </div>
          ))}

          {HOURS.map((label, hi) => (
            <Fragment key={hi}>
              <div className="cal-time">{label}</div>
              {[0,1,2,3,4,5,6].map(di => {
                const hourValue = hi + 8;
                const isPastHour = dates[di] < today && dates[di].getDate() !== today.getDate();
                return (
                  <div key={`${hi}-${di}`}
                    className={`cal-cell${isToday(dates[di])?' today-col':''}`}
                    onClick={() => onSlotClick(di, hourValue)}
                    style={{ opacity: isPastHour ? 0.5 : 1 }}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Events layer — absolutely positioned over the grid */}
      <div className="cal-events-layer" style={{ height: GRID_H }}>
        <div className="cal-events-time-spacer" />
        {[0,1,2,3,4,5,6].map(di => (
          <div key={di} className="cal-events-col">
            {byDay[di].map(ev => {
              const s = toGridMin(ev.start);
              const e = toGridMin(ev.end);
              if (s === null || e === null || e <= s) return null;
              const top    = ((s - GRID_START) / TOTAL_MIN) * GRID_H;
              const height = Math.max(((e - s) / TOTAL_MIN) * GRID_H, 24);
              const bg     = ev.color || CAT_COLORS[ev.category] || '#f5e6d8';
              const bdr    = CAT_BORDER[ev.category] || CAT_BORDER.other;
              const textColor = CAT_TEXT_COLORS[ev.category] || '#2d2a24';
              const icon   = ev.icon  || CAT_ICONS[ev.category]  || '📌';
              return (
                <div key={ev.id}
                  className="cal-event"
                  style={{
                    top, height,
                    background: `linear-gradient(135deg, ${bg}, ${bg}dd)`,
                    color: textColor,
                    borderLeft: `4px solid ${bdr}`,
                    boxShadow: '0 1px 4px rgba(0,0,0,.15)',
                    opacity: ev.isPast ? 0.55 : 1
                  }}
                  onClick={e => { e.stopPropagation(); onEventClick(ev); }}
                  title={`${ev.title} (${ev.start}–${ev.end})`}
                >
                  <div className="cal-event-title">{icon} {ev.title}</div>
                  <div className="cal-event-time">{ev.start}–{ev.end}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

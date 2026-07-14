import { useMemo, Fragment, useState, useEffect, useCallback, useRef } from 'react';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const HOURS = ['8AM','9AM','10AM','11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM','7PM','8PM','9PM','10PM','11PM','12AM','1AM'];
const GRID_START = 8 * 60;
const GRID_END   = 26 * 60;
const TOTAL_MIN  = GRID_END - GRID_START;
const ROW_PX     = 50;
const HEADER_PX  = 48;
const TIME_COL_W = 65;

function toGridMin(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  let total = h * 60 + m;
  if (total < GRID_START) total += 1440;
  return total;
}

function fromGridMin(m) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
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

export default function Calendar({ events, weekOffset, onSlotClick, onEventClick, timezone }) {
  const wrapRef = useRef(null);
  const [now, setNow] = useState(() => new Date());

  // ─── Live tick ───
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // ─── Time in user timezone ───
  const nowInTz = useMemo(() => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const h = parseInt(parts.find(p => p.type === 'hour').value, 10);
    const m = parseInt(parts.find(p => p.type === 'minute').value, 10);
    return { hour: h, minute: m, totalMin: h * 60 + m };
  }, [now, timezone]);

  const redLineTop = useMemo(() => {
    const total = nowInTz.totalMin;
    if (total < GRID_START || total > GRID_END) return null;
    return HEADER_PX + ((total - GRID_START) / 60) * ROW_PX;
  }, [nowInTz]);

  // ─── Week / Dates ───
  const monday = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + (d.getDay() === 0 ? -6 : 1 - d.getDay()));
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const dates = useMemo(() => DAYS.map((_, i) => {
    const d = new Date(monday); d.setDate(d.getDate() + i); return d;
  }), [monday]);

  const today = useMemo(() => new Date(), [now]);
  const isTodayFn = useCallback((d) => d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(), [today]);

  const GRID_H = HOURS.length * ROW_PX;

  const isCurrentWeek = useMemo(() => {
    return monday.getDate() <= today.getDate() &&
      today.getDate() < monday.getDate() + 7 &&
      monday.getMonth() === today.getMonth() &&
      monday.getFullYear() === today.getFullYear();
  }, [monday, today]);

  // ─── Prepare events with grid positions ───
  const byDay = useMemo(() => {
    const d = [[],[],[],[],[],[],[]];
    events.forEach(e => {
      if (e.day < 7 && e.day >= 0) {
        const s = toGridMin(e.start);
        const eMin = toGridMin(e.end);
        if (s === null || eMin === null || eMin <= s) return;
        d[e.day].push({
          ...e,
          gridS: s,
          gridE: eMin,
          date: new Date(monday.getTime() + e.day * 86400000),
          isPast: new Date(monday.getTime() + e.day * 86400000) < today && !isTodayFn(new Date(monday.getTime() + e.day * 86400000)),
        });
      }
    });
    return d;
  }, [events, monday, today, isTodayFn]);

  return (
    <div className="calendar-wrap" ref={wrapRef}>
      {/* ── Current time red line ── */}
      {isCurrentWeek && redLineTop !== null && (
        <div className="cal-now-line" style={{ top: redLineTop, left: TIME_COL_W, width: `calc(100% - ${TIME_COL_W}px)` }}>
          <div className="cal-now-dot" />
          <span className="cal-now-label">{String(nowInTz.hour).padStart(2,'0')}:{String(nowInTz.minute).padStart(2,'0')}</span>
        </div>
      )}

      <div className="calendar-scroll">
        <div className="calendar">
          <div className="cal-header cal-time-header">Time</div>
          {DAYS.map((day, i) => (
            <div key={i} className={`cal-header${isTodayFn(dates[i])?' today':''}`}>
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
                    className={`cal-cell${isTodayFn(dates[di])?' today-col':''}`}
                    onClick={() => onSlotClick(di, hourValue)}
                    style={{ opacity: isPastHour ? 0.5 : 1 }}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* ── Events layer ── */}
      <div className="cal-events-layer" style={{ height: GRID_H }}>
        <div className="cal-events-time-spacer" />
        {[0,1,2,3,4,5,6].map(di => {
          const dayEvs = byDay[di];
          return (
            <div key={di} className="cal-events-col" style={{ position: 'relative' }}>
              {dayEvs.map(ev => {
                const top    = ((ev.gridS - GRID_START) / TOTAL_MIN) * GRID_H;
                const height = Math.max(((ev.gridE - ev.gridS) / TOTAL_MIN) * GRID_H, 24);
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
                      opacity: ev.isPast ? 0.55 : 1,
                      cursor: 'pointer',
                      zIndex: 4,
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
          );
        })}
      </div>
    </div>
  );
}

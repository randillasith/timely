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

// ─── Collision: place overlapping events into lanes ───
function assignLanes(events) {
  if (!events.length) return [];
  const sorted = [...events].sort((a,b) => a.gridS - b.gridS || a.gridE - b.gridE);
  const lanes = [];
  for (const ev of sorted) {
    let placed = false;
    for (const lane of lanes) {
      const last = lane[lane.length - 1];
      if (ev.gridS >= last.gridE) {
        lane.push(ev);
        placed = true;
        break;
      }
    }
    if (!placed) lanes.push([ev]);
  }
  return lanes;
}

export default function Calendar({ events, weekOffset, onSlotClick, onEventClick, onEventUpdate, timezone }) {
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

  // ─── Drag & Drop ───
  const [dragState, setDragState] = useState(null);
  const dragRef = useRef(null);

  const handleEventMouseDown = useCallback((ev, e) => {
    if (e.target.classList.contains('cal-resize-handle')) return; // let resize handle it
    e.preventDefault();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startY = e.clientY;
    const evTop = HEADER_PX + ((ev.gridS - GRID_START) / 60) * ROW_PX;
    const evHeight = Math.max(((ev.gridE - ev.gridS) / TOTAL_MIN) * GRID_H, 24);
    const offsetY = startY - rect.top - evTop;
    setDragState({ event: ev, startY, offsetY, origDay: ev.day, origStart: ev.start, origEnd: ev.end });
    document.body.style.cursor = 'grabbing';
    dragRef.current = { event: ev, offsetY, rect };
  }, []);

  useEffect(() => {
    if (!dragState) return;
    const handleMove = (e) => {
      const ev = dragState.event;
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const y = e.clientY - rect.top - dragState.offsetY;
      const hourDec = (y - HEADER_PX) / ROW_PX;
      const newTotalMin = GRID_START + Math.round(hourDec * 60 / 15) * 15; // snap to 15min
      const clamped = Math.max(GRID_START, Math.min(GRID_END - 15, newTotalMin));
      const duration = ev.gridE - ev.gridS;
      const newEnd = clamped + duration;
      setDragState(s => ({ ...s, targetTop: y, targetStart: clamped, targetEnd: newEnd }));
    };
    const handleUp = () => {
      document.body.style.cursor = '';
      const s = dragRef.current;
      if (!s) return;
      const ds = dragState;
      if (ds.targetStart !== undefined && ds.targetStart !== ds.event.gridS) {
        const newStart = fromGridMin(ds.targetStart);
        const newEnd = fromGridMin(ds.targetEnd);
        onEventUpdate(ds.event.id, { start: newStart, end: newEnd, day: ds.event.day });
      }
      setDragState(null);
      dragRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragState, onEventUpdate]);

  // ─── Resize ───
  const [resizeState, setResizeState] = useState(null);
  const resizeRef = useRef(null);

  const handleResizeMouseDown = useCallback((ev, e) => {
    e.preventDefault(); e.stopPropagation();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setResizeState({ event: ev, startY: e.clientY, origEnd: ev.gridE });
    document.body.style.cursor = 'ns-resize';
    resizeRef.current = { event: ev, rect };
  }, []);

  useEffect(() => {
    if (!resizeState) return;
    const handleMove = (e) => {
      const ev = resizeState.event;
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const y = e.clientY - rect.top;
      const hourDec = (y - HEADER_PX) / ROW_PX;
      let newEnd = GRID_START + Math.round(hourDec * 60 / 15) * 15;
      newEnd = Math.max(ev.gridS + 15, Math.min(GRID_END, newEnd));
      setResizeState(s => ({ ...s, targetEnd: newEnd }));
    };
    const handleUp = () => {
      document.body.style.cursor = '';
      const rs = resizeRef.current;
      if (!rs) return;
      const ev = rs.event;
      const endMin = resizeState.targetEnd;
      if (endMin !== undefined && endMin !== ev.gridE) {
        onEventUpdate(ev.id, { end: fromGridMin(endMin) });
      }
      setResizeState(null);
      resizeRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [resizeState, onEventUpdate]);

  return (
    <div className="calendar-wrap" ref={wrapRef}>
      {/* ── Current time red line ── */}
      {isCurrentWeek && redLineTop !== null && (
        <div className="cal-now-line" style={{ top: redLineTop, left: TIME_COL_W, width: `calc(100% - ${TIME_COL_W}px)` }}>
          <div className="cal-now-dot" />
          <span className="cal-now-label">{String(nowInTz.hour).padStart(2,'0')}:{String(nowInTz.minute).padStart(2,'0')}</span>
        </div>
      )}

      {/* ── Drag ghost ── */}
      {dragState?.targetTop !== undefined && (
        <div className="cal-drag-ghost" style={{
          top: dragState.targetTop,
          left: TIME_COL_W,
          width: `calc((100% - ${TIME_COL_W}px) / 7)`,
          height: Math.max(((dragState.targetEnd - dragState.targetStart) / TOTAL_MIN) * GRID_H, 24),
        }}>
          <span>{dragState.event.title}</span>
          <small>{fromGridMin(dragState.targetStart)}–{fromGridMin(dragState.targetEnd)}</small>
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
          const lanes = assignLanes(dayEvs);
          const maxLanes = Math.max(1, ...lanes.map(l => l.length));
          return (
            <div key={di} className="cal-events-col" style={{ position: 'relative' }}>
              {lanes.map((lane, laneIdx) =>
                lane.map(ev => {
                  const top    = ((ev.gridS - GRID_START) / TOTAL_MIN) * GRID_H;
                  const height = Math.max(((ev.gridE - ev.gridS) / TOTAL_MIN) * GRID_H, 24);
                  const bg     = ev.color || CAT_COLORS[ev.category] || '#f5e6d8';
                  const bdr    = CAT_BORDER[ev.category] || CAT_BORDER.other;
                  const textColor = CAT_TEXT_COLORS[ev.category] || '#2d2a24';
                  const icon   = ev.icon  || CAT_ICONS[ev.category]  || '📌';
                  const colW   = 100 / maxLanes;
                  const isDrag = dragState?.event?.id === ev.id;
                  return (
                    <div key={ev.id}
                      className={`cal-event${isDrag ? ' cal-event-dragging' : ''}`}
                      style={{
                        top, height, left: `${laneIdx * colW}%`, width: `${colW}%`,
                        background: `linear-gradient(135deg, ${bg}, ${bg}dd)`,
                        color: textColor,
                        borderLeft: `4px solid ${bdr}`,
                        boxShadow: '0 1px 4px rgba(0,0,0,.15)',
                        opacity: ev.isPast ? 0.55 : 1,
                        cursor: isDrag ? 'grabbing' : 'grab',
                        zIndex: isDrag ? 10 : 4,
                      }}
                      onMouseDown={e => handleEventMouseDown(ev, e)}
                      onClick={e => { if (!isDrag) { e.stopPropagation(); onEventClick(ev); } }}
                      title={`${ev.title} (${ev.start}–${ev.end})`}
                    >
                      <div className="cal-event-title">{icon} {ev.title}</div>
                      <div className="cal-event-time">{ev.start}–{ev.end}</div>
                      <div className="cal-resize-handle" onMouseDown={e => handleResizeMouseDown(ev, e)} />
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

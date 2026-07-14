import { useMemo, Fragment, useState, useEffect, useCallback, useRef } from 'react';
import { updateEvent } from '../api';

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
  lecture:'#e8e0f0', lab:'#d8e0f0', movie:'#f0d8d8',
  nap:'#d8e8e8', oop_videos:'#d8e8d0', database:'#d8d0e8',
  task:'#f5e6d8', travel:'#f0ece4', class:'#e8e0f0',
  tutorial:'#e0d8f0', other:'#f5e6d8'
};
const CAT_BORDER = {
  lecture:'#8a78b0', lab:'#6aa0c0', movie:'#c08080',
  nap:'#70a8a8', oop_videos:'#78b070', database:'#9080b8',
  task:'#c4956a', travel:'#b09a7a', class:'#8a78b0',
  tutorial:'#9a80c0', other:'#c4956a'
};
const CAT_TEXT_COLORS = {
  lecture:'#3a2040', lab:'#1a3050', movie:'#4a2020',
  nap:'#1a3a3a', oop_videos:'#1a3a20', database:'#2a2050',
  task:'#2d2a24', travel:'#4a3a2a', class:'#3a2040',
  tutorial:'#2a2050', other:'#2d2a24'
};
const CAT_ICONS = {
  lecture:'📚', lab:'🔬', movie:'🎬',
  nap:'😴', oop_videos:'📺', database:'🗄️',
  task:'📖', travel:'🚶', class:'📚',
  tutorial:'📝', other:'📌'
};

function snapMin(m) {
  return Math.round(m / 30) * 30;
}

export default function Calendar({ events, weekOffset, onSlotClick, onEventClick, timezone }) {
  const wrapRef = useRef(null);
  const [now, setNow] = useState(() => new Date());
  const [drag, setDrag] = useState(null);
  const [dragOffset, setDragOffset] = useState(null); // { x, y } from drag start

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

  // ─── Drag & Drop ───
  const handleMouseDown = useCallback((ev, e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDrag({
      event: ev,
      origDay: ev.day,
      origStart: ev.start,
      origEnd: ev.end,
      duration: toGridMin(ev.end) - toGridMin(ev.start),
      colWidth: (rect.width - TIME_COL_W) / 7,
      rowHeight: ROW_PX,
      gridTop: rect.top + HEADER_PX,
      gridLeft: rect.left + TIME_COL_W,
      mouseStartX: e.clientX,
      mouseStartY: e.clientY,
    });
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!drag) return;
    setDragOffset({
      x: e.clientX - drag.mouseStartX,
      y: e.clientY - drag.mouseStartY,
    });
  }, [drag]);

  const handleMouseUp = useCallback(async () => {
    if (!drag || !dragOffset) {
      setDrag(null);
      setDragOffset(null);
      return;
    }
    // Calculate new day
    const dayShift = Math.round(dragOffset.x / drag.colWidth);
    const newDay = Math.max(0, Math.min(6, drag.origDay + dayShift));

    // Calculate new start time (vertical = minutes)
    const startMin = toGridMin(drag.origStart);
    const minShift = Math.round(dragOffset.y / drag.rowHeight * 60 / 30) * 30;
    let newStartMin = snapMin(startMin + minShift);
    if (newStartMin < GRID_START) newStartMin = GRID_START;
    if (newStartMin > GRID_END - 30) newStartMin = GRID_END - 30;
    let newEndMin = newStartMin + drag.duration;
    if (newEndMin > GRID_END) newEndMin = GRID_END;
    if (newEndMin - newStartMin < 30) newEndMin = newStartMin + 30;

    const newStart = fromGridMin(newStartMin);
    const newEnd = fromGridMin(newEndMin);

    if (newDay !== drag.origDay || newStart !== drag.origStart) {
      try {
        await updateEvent(drag.event.id, { day: newDay, start: newStart, end: newEnd });
      } catch (err) {
        console.error('Drag update failed:', err);
      }
    }

    setDrag(null);
    setDragOffset(null);
  }, [drag, dragOffset]);

  // Attach global mousemove/mouseup during drag
  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => handleMouseMove(e);
    const onUp = () => handleMouseUp();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, handleMouseMove, handleMouseUp]);

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
      // repeat='none' events only show in current week
      if (weekOffset !== 0 && e.repeat === 'none') return;
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
  }, [events, monday, today, isTodayFn, weekOffset]);

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
                const isDragging = drag?.event?.id === ev.id;
                return (
                  <div key={ev.id}
                    className={`cal-event${isDragging?' dragging':''}`}
                    style={{
                      top, height,
                      background: `linear-gradient(135deg, ${bg}, ${bg}dd)`,
                      color: textColor,
                      borderLeft: `4px solid ${bdr}`,
                      boxShadow: isDragging ? '0 8px 32px rgba(0,0,0,.35)' : '0 1px 4px rgba(0,0,0,.15)',
                      opacity: isDragging ? 0.4 : (ev.isPast ? 0.55 : 1),
                      cursor: 'grab',
                      zIndex: isDragging ? 5 : 4,
                    }}
                    onMouseDown={e => handleMouseDown(ev, e)}
                    onClick={e => { if (!drag) { e.stopPropagation(); onEventClick(ev); } }}
                    title={`${ev.title} (${ev.start}–${ev.end}) — drag to move`}
                  >
                    <div className="cal-event-title">{icon} {ev.title}</div>
                    <div className="cal-event-time">{ev.start}–{ev.end}</div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* ── Drag ghost preview ── */}
        {drag && dragOffset && (() => {
          const dayShift = Math.round(dragOffset.x / drag.colWidth);
          const ghostDay = Math.max(0, Math.min(6, drag.origDay + dayShift));
          const startMin = toGridMin(drag.origStart);
          const minShift = Math.round(dragOffset.y / drag.rowHeight * 60 / 30) * 30;
          let ghostStartMin = snapMin(startMin + minShift);
          if (ghostStartMin < GRID_START) ghostStartMin = GRID_START;
          if (ghostStartMin > GRID_END - 30) ghostStartMin = GRID_END - 30;
          let ghostEndMin = ghostStartMin + drag.duration;
          if (ghostEndMin > GRID_END) ghostEndMin = GRID_END;
          const ghostTop = ((ghostStartMin - GRID_START) / TOTAL_MIN) * GRID_H;
          const ghostH = Math.max(((ghostEndMin - ghostStartMin) / TOTAL_MIN) * GRID_H, 24);
          const ev = drag.event;
          const bg = ev.color || CAT_COLORS[ev.category] || '#f5e6d8';
          const bdr = CAT_BORDER[ev.category] || CAT_BORDER.other;
          const textColor = CAT_TEXT_COLORS[ev.category] || '#2d2a24';
          const icon = ev.icon || CAT_ICONS[ev.category] || '📌';
          const ghostLeft = TIME_COL_W + ghostDay * drag.colWidth + 2;
          const ghostW = drag.colWidth - 4;
          return (
            <div className="cal-ghost" style={{
              position: 'absolute',
              top: ghostTop,
              left: ghostLeft,
              width: ghostW,
              height: ghostH,
              background: `linear-gradient(135deg, ${bg}, ${bg}dd)`,
              color: textColor,
              borderLeft: `4px solid ${bdr}`,
              borderRadius: '6px',
              padding: '3px 5px 3px 8px',
              fontSize: '.65rem',
              lineHeight: 1.2,
              border: '1px solid rgba(0,0,0,.08)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              zIndex: 15,
              pointerEvents: 'none',
              opacity: 0.85,
              boxShadow: '0 4px 20px rgba(0,0,0,.25)',
            }}>
              <div style={{ fontWeight: 600, fontSize: '.6rem' }}>{icon} {ev.title}</div>
              <div style={{ fontSize: '.5rem', opacity: .85 }}>{fromGridMin(ghostStartMin)}–{fromGridMin(ghostEndMin)}</div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

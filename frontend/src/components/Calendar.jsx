import { useMemo, Fragment, useState, useEffect, useCallback, useRef } from 'react';
import { updateEvent, createEvent } from '../api';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const HOURS = ['8AM','9AM','10AM','11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM','7PM','8PM','9PM','10PM','11PM','12AM','1AM'];
const GRID_START = 8 * 60;
const GRID_END   = 26 * 60;
const TOTAL_MIN  = GRID_END - GRID_START;
const ROW_PX     = 50;
const HEADER_PX  = 48;
const TIME_COL_W = 65;
const DRAG_THRESHOLD = 5; // px before drag activates

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

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

export default function Calendar({ events, weekOffset, onSlotClick, onEventClick, timezone, onOneOffChange }) {
  const wrapRef = useRef(null);
  const [now, setNow] = useState(() => new Date());

  // ─── Drag refs (no React state for reliable tracking) ───
  const dragRef = useRef(null); // { event, origDay, origStart, origEnd, duration, colWidth, rowHeight, gridTop, gridLeft, mouseStartX, mouseStartY, hasMoved }
  const [dragState, setDragState] = useState(null); // visual state: { ghostDay, ghostStartMin, ghostEndMin } or null

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

  // ─── Compute ghost position from drag ref ───
  const computeGhost = useCallback((dr) => {
    if (!dr) return null;
    const dayShift = Math.round(dr.deltaX / dr.colWidth);
    const ghostDay = Math.max(0, Math.min(6, dr.origDay + dayShift));
    const startMin = toGridMin(dr.origStart);
    const minShift = Math.round(dr.deltaY / dr.rowHeight * 60 / 30) * 30;
    let ghostStartMin = snapMin(startMin + minShift);
    if (ghostStartMin < GRID_START) ghostStartMin = GRID_START;
    if (ghostStartMin > GRID_END - 30) ghostStartMin = GRID_END - 30;
    let ghostEndMin = ghostStartMin + dr.duration;
    if (ghostEndMin > GRID_END) ghostEndMin = GRID_END;
    return { ghostDay, ghostStartMin, ghostEndMin };
  }, []);

  // ─── Pointer Events Drag & Drop ───
  const handlePointerDown = useCallback((ev, e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Capture pointer on the target element
    e.target.setPointerCapture(e.pointerId);
    const duration = toGridMin(ev.end) - toGridMin(ev.start);
    dragRef.current = {
      event: ev,
      origDay: ev.day,
      origStart: ev.start,
      origEnd: ev.end,
      duration: duration,
      colWidth: (rect.width - TIME_COL_W) / 7,
      rowHeight: ROW_PX,
      gridTop: rect.top + HEADER_PX,
      gridLeft: rect.left + TIME_COL_W,
      mouseStartX: e.clientX,
      mouseStartY: e.clientY,
      deltaX: 0,
      deltaY: 0,
      hasMoved: false,
      pointerId: e.pointerId,
    };
    setDragState(computeGhost(dragRef.current));
  }, [computeGhost]);

  const handlePointerMove = useCallback((e) => {
    const dr = dragRef.current;
    if (!dr) return;
    const dx = e.clientX - dr.mouseStartX;
    const dy = e.clientY - dr.mouseStartY;
    dr.deltaX = dx;
    dr.deltaY = dy;
    // Threshold: only activate drag after 5px movement
    if (!dr.hasMoved && Math.sqrt(dx*dx + dy*dy) < DRAG_THRESHOLD) {
      setDragState(null);
      return;
    }
    if (!dr.hasMoved) {
      dr.hasMoved = true;
    }
    setDragState(computeGhost(dr));
  }, [computeGhost]);

  const handlePointerUp = useCallback(async (e) => {
    const dr = dragRef.current;
    if (!dr) {
      setDragState(null);
      return;
    }
    dragRef.current = null;

    if (!dr.hasMoved) {
      // Was a click, not a drag — let the click handler handle it
      setDragState(null);
      return;
    }

    const ghost = computeGhost(dr);
    if (!ghost) {
      setDragState(null);
      return;
    }

    const newStart = fromGridMin(ghost.ghostStartMin);
    const newEnd = fromGridMin(ghost.ghostEndMin);

    if (ghost.ghostDay !== dr.origDay || newStart !== dr.origStart) {
      // Ask user: "All weeks" or "This week only"
      const isWeekly = dr.event.repeat === 'weekly';
      if (isWeekly && onOneOffChange) {
        const wantOneOff = window.confirm(
          `"${dr.event.title}"\n\nChange only this week?\n  • Cancel → change every week\n  • OK → change this week only`
        );
        if (wantOneOff) {
          // Get the specific date for this week
          const eventDate = new Date(monday.getTime() + dr.origDay * 86400000);
          const dateStr = formatDate(eventDate);
          const updated = await onOneOffChange(dr.event, {
            day: ghost.ghostDay,
            start: newStart,
            end: newEnd,
            date: dateStr,
          });
          if (updated) {
            setDragState(null);
            return;
          }
          // If it failed, fall through to normal update
        }
      }
      // Normal update (all weeks)
      try {
        await updateEvent(dr.event.id, { day: ghost.ghostDay, start: newStart, end: newEnd });
      } catch (err) {
        console.error('Drag update failed:', err);
      }
    }
    setDragState(null);
  }, [computeGhost, monday, onOneOffChange]);

  const GRID_H = HOURS.length * ROW_PX;

  const isCurrentWeek = useMemo(() => {
    return monday.getDate() <= today.getDate() &&
      today.getDate() < monday.getDate() + 7 &&
      monday.getMonth() === today.getMonth() &&
      monday.getFullYear() === today.getFullYear();
  }, [monday, today]);

  // ─── Get date strings for current week ───
  const weekDateStrs = useMemo(() => {
    return dates.map(d => formatDate(d));
  }, [dates]);

  // ─── Prepare events with grid positions + week filtering ───
  const byDay = useMemo(() => {
    const d = [[],[],[],[],[],[],[]];
    events.forEach(e => {
      // Filter by skip_dates
      const skipDates = e.skip_dates || [];
      const eventDayDate = weekDateStrs[e.day];
      if (skipDates.includes(eventDayDate)) return;

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
  }, [events, monday, today, isTodayFn, weekOffset, weekDateStrs]);

  const isDragging = dragRef.current?.hasMoved;

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
                const isDraggingThis = dragRef.current?.event?.id === ev.id && isDragging;
                return (
                  <div key={ev.id}
                    className={`cal-event${isDraggingThis?' dragging':''}`}
                    style={{
                      top, height,
                      background: `linear-gradient(135deg, ${bg}, ${bg}dd)`,
                      color: textColor,
                      borderLeft: `4px solid ${bdr}`,
                      boxShadow: isDraggingThis ? '0 8px 32px rgba(0,0,0,.35)' : '0 1px 4px rgba(0,0,0,.15)',
                      opacity: isDraggingThis ? 0.4 : (ev.isPast ? 0.55 : 1),
                      cursor: 'grab',
                      touchAction: 'none',
                      zIndex: isDraggingThis ? 5 : 4,
                    }}
                    onPointerDown={e => handlePointerDown(ev, e)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={() => { dragRef.current = null; setDragState(null); }}
                    onClick={e => {
                      if (!dragRef.current?.hasMoved) {
                        e.stopPropagation();
                        onEventClick(ev);
                      }
                    }}
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
        {dragState && isDragging && (() => {
          const dr = dragRef.current;
          if (!dr) return null;
          const { ghostDay, ghostStartMin, ghostEndMin } = dragState;
          const ghostTop = ((ghostStartMin - GRID_START) / TOTAL_MIN) * GRID_H;
          const ghostH = Math.max(((ghostEndMin - ghostStartMin) / TOTAL_MIN) * GRID_H, 24);
          const ev = dr.event;
          const bg = ev.color || CAT_COLORS[ev.category] || '#f5e6d8';
          const bdr = CAT_BORDER[ev.category] || CAT_BORDER.other;
          const textColor = CAT_TEXT_COLORS[ev.category] || '#2d2a24';
          const icon = ev.icon || CAT_ICONS[ev.category] || '📌';
          const ghostLeft = TIME_COL_W + ghostDay * dr.colWidth + 2;
          const ghostW = dr.colWidth - 4;
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

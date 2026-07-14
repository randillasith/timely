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
const CAT_ICONS = {
  lecture:'📚', lab:'🔬', movie:'🎬',
  nap:'😴', oop_videos:'📺', database:'🗄️',
  task:'📖', travel:'🚶', class:'📚',
  other:'📌'
};

export default function MonthView({ events, monday, weekOffset, onSlotClick, onEventClick }) {
  const today = new Date();

  const { year, month } = useMemo(() => ({
    year: monday.getFullYear(),
    month: monday.getMonth()
  }), [monday]);

  const monthName = new Date(year, month).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // ─── Build the 42-cell (6×7) month grid ───
  const grid = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    // Convert to Mon-based (0=Mon, 6=Sun)
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6; // Sunday → 6

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells = [];

    // Fill leading cells from previous month
    for (let i = startDow - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      cells.push({
        day: d,
        date: new Date(year, month - 1, d),
        isCurrentMonth: false,
        isToday: false,
        dayIndex: null,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      cells.push({
        day: d,
        date,
        isCurrentMonth: true,
        isToday:
          d === today.getDate() &&
          month === today.getMonth() &&
          year === today.getFullYear(),
        dayIndex: (startDow + d - 1) % 7, // 0=Mon
      });
    }

    // Fill trailing cells from next month
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      cells.push({
        day: d,
        date: new Date(year, month + 1, d),
        isCurrentMonth: false,
        isToday: false,
        dayIndex: null,
      });
    }

    return cells;
  }, [year, month, today]);

  // ─── Group events by actual date (monday + event.day) ───
  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach(ev => {
      if (ev.day == null || ev.day < 0 || ev.day > 6) return;
      const d = new Date(monday);
      d.setDate(d.getDate() + ev.day);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    return map;
  }, [events, monday]);

  const cellsWithEvents = useMemo(() => {
    return grid.map(cell => {
      const key = `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`;
      return { ...cell, events: eventsByDate[key] || [] };
    });
  }, [grid, eventsByDate]);

  return (
    <div className="calendar-wrap">
      <div className="month-view">
        <div className="month-header">
          <span className="month-label">{monthName}</span>
        </div>

        {/* Day-of-week header row */}
        <div className="month-days-header">
          {DAYS.map((day, i) => (
            <div key={i} className="month-day-name">{day.slice(0, 3)}</div>
          ))}
        </div>

        {/* 6×7 grid */}
        <div className="month-grid">
          {cellsWithEvents.map((cell, i) => (
            <div
              key={i}
              className={`month-cell${cell.isToday ? ' today' : ''}${!cell.isCurrentMonth ? ' other-month' : ''}`}
              onClick={() => {
                if (cell.isCurrentMonth && cell.dayIndex !== null) {
                  onSlotClick(cell.dayIndex, 8);
                }
              }}
            >
              <span className="month-cell-day">{cell.day}</span>
              <div className="month-cell-events">
                {cell.events.slice(0, 3).map(ev => {
                  const color = ev.color || CAT_COLORS[ev.category] || '#c4956a';
                  const borderColor = CAT_BORDER[ev.category] || CAT_BORDER.other;
                  const icon = ev.icon || CAT_ICONS[ev.category] || '📌';
                  return (
                    <div
                      key={ev.id}
                      className="month-event-dot"
                      style={{
                        background: color,
                        borderLeft: `3px solid ${borderColor}`,
                      }}
                      onClick={e => { e.stopPropagation(); onEventClick(ev); }}
                      title={`${ev.title} (${ev.start}–${ev.end})`}
                    >
                      {icon} {ev.title}
                    </div>
                  );
                })}
                {cell.events.length > 3 && (
                  <span className="month-more">+{cell.events.length - 3} more</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

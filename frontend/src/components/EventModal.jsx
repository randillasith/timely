import { useState, useEffect } from 'react';

const CATEGORIES = [
  { value: 'task',  label: '📚 Study' },
  { value: 'class', label: '🏫 Class' },
  { value: 'movie', label: '🎬 Movie' },
  { value: 'nap',   label: '😴 Nap' },
  { value: 'oop',   label: '📺 OOP Videos' },
  { value: 'db',    label: '🗄️ Database' },
  { value: 'travel',label: '🚶 Travel' },
  { value: 'other', label: '📌 Other' },
];

const PRESET_COLORS = [
  '#c4956a', '#e8a87c', '#f7b7a0', '#d4a0d4', '#89b0d4',
  '#7ec8a4', '#f5d76e', '#e88282', '#b0a8d8', '#a8d8b0',
  '#f0a0a0', '#a0c0f0',
];

export default function EventModal({ event, defaultDay, defaultHour, onSave, onDelete, onClose }) {
  const isEdit = !!event;
  const [title, setTitle] = useState(event?.title || '');
  const [day, setDay] = useState(event?.day ?? defaultDay ?? 0);
  const [start, setStart] = useState(event?.start || (defaultHour ? `${String(defaultHour).padStart(2,'0')}:00` : '09:00'));
  const [end, setEnd] = useState(event?.end || (defaultHour ? `${String(Math.min(defaultHour+1,25)).padStart(2,'0')}:00` : '10:00'));
  const [category, setCategory] = useState(event?.category || 'task');
  const [color, setColor] = useState(event?.color || '');
  const [note, setNote] = useState(event?.note || '');
  const [err, setErr] = useState('');

  useEffect(() => {
    const handleEsc = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const submit = e => {
    e.preventDefault(); setErr('');
    if (!title.trim()) { setErr('Title is required'); return; }
    if (start >= end && !(start > end && end <= '07:00')) {
      // Allow overnight (start > end only if end is next day AM)
      setErr('End time must be after start time');
      return;
    }
    onSave({ title: title.trim(), day, start, end, category, color: color || null, note });
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <h2>{isEdit ? 'Edit Event' : 'Add Event'}</h2>
        {err && <div className="error">{err}</div>}
        <form onSubmit={submit}>
          <label>Title</label>
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Study OOP" autoFocus />

          <div className="form-row">
            <div>
              <label>Day</label>
              <select value={day} onChange={e=>setDay(Number(e.target.value))}>
                {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d,i) =>
                  <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label>Category</label>
              <select value={category} onChange={e=>setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div>
              <label>Start</label>
              <input type="time" value={start} onChange={e=>setStart(e.target.value)} />
            </div>
            <div>
              <label>End</label>
              <input type="time" value={end} onChange={e=>setEnd(e.target.value)} />
            </div>
          </div>

          <label>Color (optional)</label>
          <div className="color-picker">
            <button className={`color-swatch ${!color ? 'active' : ''}`}
              onClick={e => { e.preventDefault(); setColor(''); }}
              style={{background:'transparent', border:'2px dashed #ccc', color:'#999'}}>auto</button>
            {PRESET_COLORS.map((c,i) => (
              <button key={i} className={`color-swatch ${color === c ? 'active' : ''}`}
                onClick={e => { e.preventDefault(); setColor(c); }}
                style={{background: c}} />
            ))}
          </div>

          <label>Note (optional)</label>
          <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Extra details..." rows={2} />

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            {isEdit && <button type="button" className="btn btn-danger" onClick={onDelete}>Delete</button>}
            <button type="submit" className="btn-primary">{isEdit ? 'Update' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';

export default function EventModal({ event, defaultDay, defaultHour, categories, presets, onSave, onDelete, onClose }) {
  const isEdit = !!event;
  const [title, setTitle] = useState(event?.title || '');
  const [day, setDay] = useState(event?.day ?? defaultDay ?? 0);
  const [start, setStart] = useState(event?.start || (defaultHour ? `${String(defaultHour).padStart(2,'0')}:00` : '09:00'));
  const [end, setEnd] = useState(event?.end || (defaultHour ? `${String(Math.min(defaultHour+1,25)).padStart(2,'0')}:00` : '10:00'));
  const [category, setCategory] = useState(event?.category || 'task');
  const [color, setColor] = useState(event?.color || '');
  const [note, setNote] = useState(event?.note || '');
  const [repeat, setRepeat] = useState(event?.repeat || 'none');
  const [notifyBefore, setNotifyBefore] = useState(event?.notify_before ?? null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const getCatColor = cat => {
    const p = presets.find(c => c.name.toLowerCase() === cat);
    if (p) return p.color;
    const c = categories.find(c => c.name === cat);
    return c?.color || '';
  };

  const getCatIcon = cat => {
    const p = presets.find(c => c.name.toLowerCase() === cat);
    if (p) return p.icon;
    const c = categories.find(c => c.name === cat);
    return c?.icon || '📌';
  };

  const handleCategory = val => {
    setCategory(val);
    const autoColor = getCatColor(val);
    if (autoColor && (!color || color === getCatColor(category))) {
      setColor(autoColor);
    }
  };

  const submit = e => {
    e.preventDefault(); setErr('');
    if (!title.trim()) { setErr('Title is required'); return; }
    onSave({
      title: title.trim(), day, start, end,
      category, color: color || null, note, repeat,
      notify_before: notifyBefore
    });
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <h2>{isEdit ? '✏️ Edit Event' : '➕ Add Event'}</h2>
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
              <select value={category} onChange={e => handleCategory(e.target.value)}>
                <optgroup label="Built-in">
                  {presets.map((p,i) => (
                    <option key={i} value={p.name.toLowerCase()}>{p.icon} {p.name}</option>
                  ))}
                </optgroup>
                {categories.length > 0 && (
                  <optgroup label="My Categories">
                    {categories.map(c => (
                      <option key={c.id} value={c.name}>{c.icon} {c.name}</option>
                    ))}
                  </optgroup>
                )}
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

          <div className="form-row">
            <div>
              <label>Repeat</label>
              <select value={repeat} onChange={e=>setRepeat(e.target.value)}>
                <option value="none">Does not repeat</option>
                <option value="weekly">🔁 Every week</option>
              </select>
            </div>
            <div>
              <label>Color</label>
              <input type="color" value={color || getCatColor(category) || '#f5e6d8'}
                onChange={e=>setColor(e.target.value)}
                style={{width:'100%',height:'34px',padding:0,marginBottom:0,cursor:'pointer'}} />
            </div>
          </div>

          {repeat === 'weekly' && (
            <div style={{fontSize:'.75rem',color:'var(--text2)',marginBottom:'.5rem',padding:'.4rem .6rem',background:'var(--surface2)',borderRadius:'6px'}}>
              🔁 This event repeats every {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][day]}
            </div>
          )}

          <label>Notify</label>
          <select value={notifyBefore ?? ''} onChange={e => setNotifyBefore(e.target.value ? Number(e.target.value) : null)} style={{marginBottom:'.5rem'}}>
            <option value="">🔕 Don't notify</option>
            <option value="5">⏰ 5 minutes before</option>
            <option value="15">⏰ 15 minutes before</option>
            <option value="30">⏰ 30 minutes before</option>
            <option value="60">⏰ 1 hour before</option>
          </select>

          <label>Note (optional)</label>
          <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Extra details..." rows={2} />

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            {isEdit && <button type="button" className="btn btn-danger" onClick={onDelete}>Delete</button>}
            <button type="submit" className="btn btn-primary">{isEdit ? 'Update' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

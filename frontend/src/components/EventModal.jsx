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
  const [err, setErr] = useState('');

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Auto-set color when category changes (if no custom color set)
  const handleCategory = val => {
    setCategory(val);
    if (!color || color === getCatColor(category)) {
      const autoColor = getCatColor(val);
      if (autoColor) setColor(autoColor);
    }
  };

  const getCatColor = cat => {
    const p = presets.find(c => c.name.toLowerCase() === cat);
    if (p) return p.color;
    const c = categories.find(c => c.name === cat);
    if (c) return c.color;
    return '';
  };

  const getCatIcon = cat => {
    const p = presets.find(c => c.name.toLowerCase() === cat);
    if (p) return p.icon;
    const c = categories.find(c => c.name === cat);
    return c?.icon || '📌';
  };

  const knownCategories = [
    ...presets.map(p => ({ value: p.name.toLowerCase(), label: `${p.icon} ${p.name}` })),
    ...categories.map(c => ({ value: c.name, label: `${c.icon} ${c.name}` })),
  ];

  const submit = e => {
    e.preventDefault(); setErr('');
    if (!title.trim()) { setErr('Title is required'); return; }
    // Allow overnight events (start > end means next day)
    onSave({
      title: title.trim(), day, start, end,
      category, color: color || null, note
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

          <label>Color</label>
          <div className="form-row" style={{alignItems:'center'}}>
            <div style={{flex:'0 0 50px'}}>
              <input type="color" value={color || '#f5e6d8'} onChange={e=>setColor(e.target.value)}
                style={{width:'48px',height:'34px',padding:0,marginBottom:0,cursor:'pointer'}} />
            </div>
            <div style={{flex:1}}>
              <select value={color} onChange={e=>setColor(e.target.value)}
                style={{marginBottom:0}}>
                <option value="">Auto (from category)</option>
                <option value="#f5e6d8">📚 Study</option>
                <option value="#e8e0f0">🏫 Class</option>
                <option value="#f0d8d8">🎬 Movie</option>
                <option value="#d8e8e8">😴 Nap</option>
                <option value="#d8e8d0">📺 OOP</option>
                <option value="#d8d0e8">🗄️ Database</option>
                <option value="#f0ece4">🚶 Travel</option>
                <option value="#e8829a">🌸 Pink</option>
                <option value="#89b0d4">💙 Blue</option>
                <option value="#7ec8a4">🌿 Green</option>
                <option value="#d4a0d4">💜 Purple</option>
                <option value="#f5d76e">⭐ Yellow</option>
              </select>
            </div>
          </div>

          {category !== 'custom' && (
            <div style={{marginBottom:'.75rem',display:'flex',alignItems:'center',gap:'.4rem'}}>
              <span className="tag" style={{background: (color || getCatColor(category) || '#f5e6d8')}}>
                {getCatIcon(category)} {category === 'task' ? 'Study' : category.charAt(0).toUpperCase() + category.slice(1)}
              </span>
              <span style={{fontSize:'.7rem',color:'var(--text3)'}}>auto-colored</span>
            </div>
          )}

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

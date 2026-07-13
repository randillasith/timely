const THEMES = [
  { id:'light', label:'☀️ Light', color:'#f8f5f0' },
  { id:'dark',  label:'🌙 Dark',  color:'#1a1a2e' },
  { id:'pink',  label:'🌸 Pink',  color:'#fce4ec' },
  { id:'blue',  label:'💙 Blue',  color:'#e3f2fd' },
  { id:'purple',label:'💜 Purple',color:'#f3e5f5' },
  { id:'green', label:'🌿 Green', color:'#e8f5e9' },
];

export default function ThemePicker({ current, onChange }) {
  return (
    <div className="theme-picker">
      {THEMES.map(t => (
        <button key={t.id}
          className={`theme-dot ${current === t.id ? 'active' : ''}`}
          style={{ background: t.color }}
          onClick={() => onChange(t.id)}
          title={t.label}
        />
      ))}
    </div>
  );
}

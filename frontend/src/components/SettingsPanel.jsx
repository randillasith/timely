import { useState, useEffect, useRef } from 'react';
import { exportJson, importJson, getShareInfo, refreshTokens, getNotifySettings, updateNotifySettings } from '../api';

export default function SettingsPanel({ onClose, onImport }) {
  const [tab, setTab] = useState('export');
  const [shareUrl, setShareUrl] = useState('');
  const [icalUrl, setIcalUrl] = useState('');
  const [importResult, setImportResult] = useState('');
  const [copied, setCopied] = useState('');
  const fileRef = useRef();
  const [notifySettings, setNotifySettings] = useState(null);
  const [saved, setSaved] = useState('');

  useEffect(() => {
    getShareInfo().then(d => {
      setShareUrl(d.share_url);
      setIcalUrl(d.ical_url);
    }).catch(() => {});
    getNotifySettings().then(setNotifySettings).catch(() => {});
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const doExport = async () => {
    const data = await exportJson();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'schedule.json';
    a.click(); URL.revokeObjectURL(url);
  };

  const doImport = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await importJson(data);
      setImportResult(res.message);
      if (onImport) onImport();  // Auto-refresh data
    } catch(err) {
      setImportResult('Error: ' + err.message);
    }
  };

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch {}
  };

  const doRefresh = async () => {
    const d = await refreshTokens();
    setShareUrl(d.share_url);
    setIcalUrl(d.ical_url);
  };

  const doDownloadIcal = () => {
    window.open('/api/ical', '_blank');
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{maxWidth:'480px'}}>
        <div style={{display:'flex',gap:'.3rem',marginBottom:'1rem',borderBottom:'1px solid var(--border)',paddingBottom:'.5rem'}}>
          {['export','import','share','ical','notify'].map(t => (
            <button key={t} className={`btn btn-sm ${tab===t?'btn-primary':''}`}
              onClick={() => setTab(t)}>
              {t==='export'?'📤 Export':t==='import'?'📥 Import':t==='share'?'🔗 Share':t==='ical'?'📅 iCal':'🔔 Notify'}
            </button>
          ))}
          <div style={{flex:1}} />
          <button className="btn btn-sm btn-outline" onClick={onClose}>✕</button>
        </div>

        {tab === 'export' && (
          <div>
            <h2 style={{fontSize:'1rem',marginBottom:'.5rem'}}>📤 Export Schedule</h2>
            <p style={{fontSize:'.8rem',color:'var(--text2)',marginBottom:'1rem'}}>
              Download your schedule as JSON or iCal file.
            </p>
            <div style={{display:'flex',gap:'.5rem'}}>
              <button className="btn btn-primary" onClick={doExport}>📥 Download JSON</button>
              <button className="btn" onClick={doDownloadIcal}>📅 Download iCal</button>
            </div>
          </div>
        )}

        {tab === 'import' && (
          <div>
            <h2 style={{fontSize:'1rem',marginBottom:'.5rem'}}>📥 Import Schedule</h2>
            <p style={{fontSize:'.8rem',color:'var(--text2)',marginBottom:'1rem'}}>
              Upload a previously exported JSON file. This will <strong>add</strong> events to your current schedule.
            </p>
            <input type="file" ref={fileRef} accept=".json" onChange={doImport}
              style={{marginBottom:'.5rem'}} />
            {importResult && (
              <div style={{fontSize:'.8rem',color:importResult.includes('Error')?'var(--danger)':'var(--text)',padding:'.5rem',background:'var(--surface2)',borderRadius:'8px'}}>
                {importResult}
              </div>
            )}
          </div>
        )}

        {tab === 'share' && (
          <div>
            <h2 style={{fontSize:'1rem',marginBottom:'.5rem'}}>🔗 Share Schedule</h2>
            <p style={{fontSize:'.8rem',color:'var(--text2)',marginBottom:'.5rem'}}>
              Share this link with anyone to view your schedule (read-only):
            </p>
            <div className="form-row" style={{alignItems:'center'}}>
              <input type="text" value={shareUrl} readOnly
                onClick={e => e.target.select()} style={{flex:1,marginBottom:0}} />
              <button className="btn btn-sm" onClick={() => copy(shareUrl,'share')}>
                {copied === 'share' ? '✅' : '📋 Copy'}
              </button>
            </div>
            <button className="btn btn-sm btn-outline" onClick={doRefresh}
              style={{marginTop:'.5rem',fontSize:'.72rem'}}>
              🔄 Regenerate link (invalidates old one)
            </button>
          </div>
        )}

        {tab === 'ical' && (
          <div>
            <h2 style={{fontSize:'1rem',marginBottom:'.5rem'}}>📅 iCal Feed</h2>
            <p style={{fontSize:'.8rem',color:'var(--text2)',marginBottom:'.5rem'}}>
              Subscribe to this URL in <strong>Google Calendar</strong>, <strong>Apple Calendar</strong>, or any iCal-compatible app. Events auto-update!
            </p>
            <div className="form-row" style={{alignItems:'center'}}>
              <input type="text" value={icalUrl} readOnly
                onClick={e => e.target.select()} style={{flex:1,marginBottom:0,fontSize:'.72rem'}} />
              <button className="btn btn-sm" onClick={() => copy(icalUrl,'ical')}>
                {copied === 'ical' ? '✅' : '📋 Copy'}
              </button>
            </div>
            <div style={{marginTop:'.8rem',fontSize:'.78rem',color:'var(--text2)'}}>
              <strong>How to add:</strong><br />
              <strong>Google Calendar:</strong> Other calendars → + → From URL → paste link<br />
              <strong>Apple Calendar:</strong> File → New Calendar Subscription → paste link
            </div>
          </div>
        )}

        {tab === 'notify' && (
          <div>
            <h2 style={{fontSize:'1rem',marginBottom:'.5rem'}}>🔔 Telegram Notifications</h2>
            <p style={{fontSize:'.8rem',color:'var(--text2)',marginBottom:'.8rem'}}>
              Get notified via Telegram before events start. Set per-event timing in the event editor.
            </p>
            {notifySettings && (
              <form onSubmit={async e => {
                e.preventDefault();
                setSaved('');
                try {
                  await updateNotifySettings({
                    telegram_notify: notifySettings.telegram_notify,
                    telegram_chat_id: notifySettings.telegram_chat_id,
                  });
                  setSaved('✅ Saved!');
                  setTimeout(() => setSaved(''), 3000);
                } catch(err) { setSaved('❌ ' + err.message); }
              }}>
                <label>Telegram Chat ID</label>
                <input type="text" value={notifySettings.telegram_chat_id} onChange={e => setNotifySettings({...notifySettings, telegram_chat_id: e.target.value})}
                  placeholder="Paste your Chat ID here" />

                <div style={{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.5rem'}}>
                  <input type="checkbox" id="tgNotify" checked={notifySettings.telegram_notify}
                    onChange={e => setNotifySettings({...notifySettings, telegram_notify: e.target.checked})}
                    style={{width:'auto',marginBottom:0}} />
                  <label htmlFor="tgNotify" style={{marginBottom:0}}>🤖 Enable Telegram notifications</label>
                </div>

                <div style={{background:'var(--surface2)',borderRadius:'10px',padding:'.8rem',marginBottom:'.8rem',fontSize:'.78rem',border:'1px solid var(--border-light)'}}>
                  <strong>📋 How to connect:</strong>
                  <ol style={{marginTop:'.3rem',paddingLeft:'1.2rem',lineHeight:1.8}}>
                    <li>Open <a href="https://t.me/RandilTimely_bot" target="_blank" rel="noopener" style={{color:'var(--accent)'}}>@RandilTimely_bot</a> on Telegram</li>
                    <li>Send <strong>/start</strong> to the bot</li>
                    <li>Copy the <strong>Chat ID</strong> the bot sends you</li>
                    <li>Paste it above and click <strong>Save</strong></li>
                  </ol>
                  <p style={{marginTop:'.3rem',color:'var(--text2)'}}>✅ The bot will automatically confirm the connection!</p>
                </div>

                <button type="submit" className="btn btn-primary">📥 Save & Connect</button>
                {saved && <span style={{marginLeft:'.5rem',fontSize:'.8rem',color:'var(--text)'}}>{saved}</span>}
              </form>
            )}
          </div>
        )}

        <div className="modal-actions" style={{marginTop:'.5rem'}}>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

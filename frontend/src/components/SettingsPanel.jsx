import { useState, useEffect, useRef } from 'react';
import { exportJson, importJson, getShareInfo, refreshTokens, getNotifySettings, updateNotifySettings, changePassword, getMe, testNotification, getSemesters, updateEvent, getEvents } from '../api';

const COMMON_TZ = [
  'UTC',
  'Asia/Colombo', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Kathmandu',
  'Asia/Singapore', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Tokyo',
  'Asia/Seoul', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Karachi',
  'Australia/Perth', 'Australia/Sydney', 'Pacific/Auckland',
  'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Moscow',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
];

export default function SettingsPanel({ onClose, onImport, timezone, onTimezoneChange }) {
  const [tab, setTab] = useState('profile');
  const [shareUrl, setShareUrl] = useState('');
  const [icalUrl, setIcalUrl] = useState('');
  const [importResult, setImportResult] = useState('');
  const [copied, setCopied] = useState('');
  const fileRef = useRef();
  const [notifySettings, setNotifySettings] = useState(null);
  const [saved, setSaved] = useState('');
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    getMe().then(setProfile).catch(() => {});
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
      if (onImport) onImport();
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

  const handleChangePassword = async e => {
    e.preventDefault(); setPwMsg('');
    if (pwNew !== pwConfirm) { setPwMsg('New passwords do not match'); return; }
    if (pwNew.length < 8) { setPwMsg('New password needs 8+ characters'); return; }
    try {
      const res = await changePassword(pwCurrent, pwNew);
      setPwMsg(res.message || 'Password changed successfully');
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
    } catch (err) {
      setPwMsg(err.message || 'Failed to change password');
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{maxWidth:'480px'}}>
        <div style={{display:'flex',gap:'.3rem',marginBottom:'1rem',borderBottom:'1px solid var(--border)',paddingBottom:'.5rem'}}>
          {['profile','export','import','share','ical','notify'].map(t => (
            <button key={t} className={`btn btn-sm ${tab===t?'btn-primary':''}`}
              onClick={() => setTab(t)}>
              {t==='profile'?'👤 Profile':t==='export'?'📤 Export':t==='import'?'📥 Import':t==='share'?'🔗 Share':t==='ical'?'📅 iCal':'🔔 Notify'}
            </button>
          ))}
          <div style={{flex:1}} />
          <button className="btn btn-sm btn-outline" onClick={onClose}>✕</button>
        </div>

        {tab === 'profile' && (
          <div>
            <h2 style={{fontSize:'1rem',marginBottom:'.5rem'}}>👤 My Profile</h2>
            {profile ? (
              <div style={{fontSize:'.85rem',marginBottom:'1rem',padding:'.6rem',background:'var(--surface2)',borderRadius:'8px'}}>
                <div><strong>Username:</strong> {profile.username}</div>
                <div><strong>Email:</strong> {profile.email || '(not set)'}</div>
              </div>
            ) : (
              <p style={{fontSize:'.8rem',color:'var(--text2)'}}>Loading profile...</p>
            )}

            <hr style={{border:'none',borderTop:'1px solid var(--border)',margin:'1rem 0'}} />
            <h3 style={{fontSize:'.9rem',marginBottom:'.5rem'}}>🌍 Timezone</h3>
            <p style={{fontSize:'.78rem',color:'var(--text2)',marginBottom:'.5rem'}}>
              Set your local timezone so the <strong style={{color:'#e74c3c'}}>🔴 current time line</strong> appears correctly on the calendar.
            </p>
            <select value={timezone} onChange={async e => {
              const tz = e.target.value;
              onTimezoneChange(tz);
              try {
                await updateNotifySettings({ timezone: tz });
              } catch {}
            }} style={{width:'100%',marginBottom:'.5rem'}}>
              {COMMON_TZ.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <hr style={{border:'none',borderTop:'1px solid var(--border)',margin:'1rem 0'}} />
            <h3 style={{fontSize:'.9rem',marginBottom:'.5rem'}}>🔑 Change Password</h3>
            <form onSubmit={handleChangePassword}>
              <label>Current Password</label>
              <input type="password" value={pwCurrent} onChange={e=>setPwCurrent(e.target.value)}
                placeholder="Enter current password" required />
              <label>New Password</label>
              <input type="password" value={pwNew} onChange={e=>setPwNew(e.target.value)}
                placeholder="At least 8 characters" required minLength={8} />
              <label>Confirm New Password</label>
              <input type="password" value={pwConfirm} onChange={e=>setPwConfirm(e.target.value)}
                placeholder="Re-enter new password" required />
              {pwMsg && (
                <div style={{fontSize:'.8rem',padding:'.5rem',marginBottom:'.5rem',borderRadius:'6px',
                  background: pwMsg.includes('success')?'var(--surface2)':'var(--danger-bg)',
                  color: pwMsg.includes('success')?'var(--text)':'var(--danger)'}}>
                  {pwMsg}
                </div>
              )}
              <button type="submit" className="btn btn-primary btn-sm">Change Password</button>
            </form>
          </div>
        )}

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
            {notifySettings ? (
              <form onSubmit={async e => {
                e.preventDefault();
                setSaved('');
                try {
                  await updateNotifySettings({
                    email: notifySettings.email,
                    telegram_notify: notifySettings.telegram_notify,
                    telegram_chat_id: notifySettings.telegram_chat_id,
                    timezone: notifySettings.timezone,
                  });
                  setSaved('✅ Saved!');
                  setTimeout(() => setSaved(''), 3000);
                } catch(err) { setSaved('❌ ' + err.message); }
              }}>
                <label>📧 Email Address</label>
                <input type="email" value={notifySettings.email} onChange={e => setNotifySettings({...notifySettings, email: e.target.value})}
                  placeholder="your@email.com (for welcome emails)" style={{marginBottom:'.5rem'}} />

                <label>🤖 Telegram Chat ID</label>
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
                    <li>Send <strong>{'/start'}</strong> to the bot</li>
                    <li>Copy the <strong>Chat ID</strong> the bot sends you</li>
                    <li>Paste it above and click <strong>Save</strong></li>
                  </ol>
                  <p style={{marginTop:'.3rem',color:'var(--text2)'}}>✅ The bot will automatically confirm the connection!</p>
                </div>

                <button type="submit" className="btn btn-primary">📥 Save & Connect</button>
                {saved && <span style={{marginLeft:'.5rem',fontSize:'.8rem',color:'var(--text)'}}>{saved}</span>}
                <button type="button" className="btn btn-sm" style={{marginLeft:'.5rem'}}
                  onClick={async () => {
                    try {
                      const res = await testNotification();
                      alert(res.message);
                    } catch(err) { alert('❌ ' + err.message); }
                  }}>📨 Test Notification</button>
              </form>
            ) : (
              <p style={{fontSize:'.8rem',color:'var(--text2)'}}>Loading settings...</p>
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

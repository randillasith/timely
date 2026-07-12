import { useState, useEffect, useRef } from 'react';
import { exportJson, importJson, getShareInfo, refreshTokens } from '../api';

export default function SettingsPanel({ onClose }) {
  const [tab, setTab] = useState('export');
  const [shareUrl, setShareUrl] = useState('');
  const [icalUrl, setIcalUrl] = useState('');
  const [importResult, setImportResult] = useState('');
  const [copied, setCopied] = useState('');
  const fileRef = useRef();

  useEffect(() => {
    getShareInfo().then(d => {
      setShareUrl(d.share_url);
      setIcalUrl(d.ical_url);
    }).catch(() => {});
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
      setImportResult(res.message + ' — refresh the page!');
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
    // Open iCal download in new tab
    window.open('/api/ical', '_blank');
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{maxWidth:'480px'}}>
        <div style={{display:'flex',gap:'.3rem',marginBottom:'1rem',borderBottom:'1px solid var(--border)',paddingBottom:'.5rem'}}>
          {['export','import','share','ical'].map(t => (
            <button key={t} className={`btn btn-sm ${tab===t?'btn-primary':''}`}
              onClick={() => setTab(t)}>
              {t==='export'?'📤 Export':t==='import'?'📥 Import':t==='share'?'🔗 Share': '📅 iCal'}
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

        <div className="modal-actions" style={{marginTop:'.5rem'}}>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

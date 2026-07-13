import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../App';
import {
  adminGetUsers, adminDeleteUser, adminResetPassword, adminToggleAdmin,
  adminGetStats, adminGetAnalytics, adminGetBotHealth,
  adminGetBotSettings, adminUpdateBotSettings,
  adminGetPresets, adminCreatePreset, adminUpdatePreset, adminDeletePreset,
  adminGetAnnouncements, adminCreateAnnouncement, adminUpdateAnnouncement,
  adminDeleteAnnouncement, adminBroadcastAnnouncement,
} from '../api';

const ICONS = ['📚','🏫','🎬','😴','📺','🗄️','🚶','📌','💻','📝','🎮','🎵','✏️','📖','☕','🏋️','💊','🧘','🎨','🌿'];

/* ─────────────── Responsive admin layout ─────────────── */
export default function Admin() {
  const { user } = useContext(AuthContext);
  const [tab, setTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState('');

  // ── Users ──
  const [users, setUsers] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [resetPwResult, setResetPwResult] = useState(null);

  // ── Analytics ──
  const [analytics, setAnalytics] = useState(null);
  const [botHealth, setBotHealth] = useState(null);

  // ── Bot settings ──
  const [botSettings, setBotSettings] = useState(null);
  const [botToken, setBotToken] = useState('');
  const [botSaving, setBotSaving] = useState(false);

  // ── Presets ──
  const [presets, setPresets] = useState([]);
  const [presetForm, setPresetForm] = useState(null); // null | {id?,name,color,icon}

  // ── Announcements ──
  const [announcements, setAnnouncements] = useState([]);
  const [annForm, setAnnForm] = useState(null); // null | {id?,message,type,active}
  const [broadcasting, setBroadcasting] = useState(null);

  const msg = (text, isErr) => {
    setResult(text);
    setTimeout(() => setResult(''), isErr ? 6000 : 4000);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [u, a, b, p, an, bs] = await Promise.all([
        adminGetUsers().catch(() => []),
        adminGetAnalytics().catch(() => null),
        adminGetBotHealth().catch(() => null),
        adminGetPresets().catch(() => []),
        adminGetAnnouncements().catch(() => []),
        adminGetBotSettings().catch(() => null),
      ]);
      setUsers(u); setAnalytics(a); setBotHealth(b);
      setPresets(p); setAnnouncements(an); setBotSettings(bs);
    } catch (e) { msg('❌ Failed to load: ' + e.message, true); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, []);

  /* ─── User Actions ─── */
  const handleDelete = async uid => {
    try {
      const res = await adminDeleteUser(uid);
      msg(res.message); loadAll();
    } catch (e) { msg('❌ ' + e.message, true); }
    setDeleteConfirm(null);
  };

  const handleResetPw = async uid => {
    try {
      const res = await adminResetPassword(uid);
      setResetPwResult({ username: res.temp_password ? '—' : '', ...res });
    } catch (e) { msg('❌ ' + e.message, true); }
  };

  const handleToggleAdmin = async uid => {
    try {
      const res = await adminToggleAdmin(uid);
      msg(res.message); loadAll();
    } catch (e) { msg('❌ ' + e.message, true); }
  };

  /* ─── Bot ─── */
  const handleUpdateBot = async e => {
    e.preventDefault();
    if (!botToken.trim()) return;
    setBotSaving(true);
    try {
      const res = await adminUpdateBotSettings({
        bot_token: botToken.trim(),
        webhook_url: 'https://timely.randillasith.me/api/bot-webhook',
      });
      msg(res.message || '✅ Bot token updated!');
      setTimeout(() => msg(''), 5000);
    } catch (err) { msg('❌ ' + err.message, true); }
    setBotSaving(false);
  };

  /* ─── Presets ─── */
  const handleSavePreset = async e => {
    e.preventDefault();
    if (!presetForm.name.trim()) return;
    try {
      if (presetForm.id) {
        await adminUpdatePreset(presetForm.id, presetForm);
        msg('✅ Preset updated');
      } else {
        await adminCreatePreset(presetForm);
        msg('✅ Preset created');
      }
      setPresetForm(null); loadAll();
    } catch (e) { msg('❌ ' + e.message, true); }
  };

  const handleDeletePreset = async id => {
    if (!confirm('Delete this preset?')) return;
    try { await adminDeletePreset(id); msg('✅ Preset deleted'); loadAll(); }
    catch (e) { msg('❌ ' + e.message, true); }
  };

  /* ─── Announcements ─── */
  const handleSaveAnn = async e => {
    e.preventDefault();
    if (!annForm.message.trim()) return;
    try {
      if (annForm.id) {
        await adminUpdateAnnouncement(annForm.id, annForm);
        msg('✅ Announcement updated');
      } else {
        await adminCreateAnnouncement(annForm);
        msg('✅ Announcement created');
      }
      setAnnForm(null); loadAll();
    } catch (e) { msg('❌ ' + e.message, true); }
  };

  const handleBroadcast = async id => {
    setBroadcasting(id);
    try {
      const res = await adminBroadcastAnnouncement(id);
      msg(`📢 ${res.message}`);
      loadAll();
    } catch (e) { msg('❌ ' + e.message, true); }
    setBroadcasting(null);
  };

  /* ──────────── RENDER ──────────── */
  return (
    <div className="admin-page">
      {/* ═══ HEADER ═══ */}
      <div className="admin-header">
        <h1>⚙️ Admin Panel</h1>
        <div className="admin-header-actions">
          <span className="user-badge">👑 {user}</span>
          <a href="/" className="btn btn-sm btn-outline">← Back</a>
          <button className="btn btn-sm btn-outline" onClick={loadAll}>🔄</button>
        </div>
      </div>

      {/* ═══ TABS ═══ */}
      <div className="admin-tabs">
        {[
          { key:'users', icon:'👥', label:'Users' },
          { key:'analytics', icon:'📊', label:'Analytics' },
          { key:'announcements', icon:'📢', label:'Announce' },
          { key:'presets', icon:'🏷️', label:'Presets' },
          { key:'bot', icon:'🤖', label:'Bot' },
        ].map(t => (
          <button key={t.key} className={`admin-tab ${tab===t.key?'active':''}`}
            onClick={() => setTab(t.key)}>
            <span className="admin-tab-icon">{t.icon}</span>
            <span className="admin-tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ═══ RESULT BANNER ═══ */}
      {result && (
        <div className={`admin-result ${result.includes('❌')?'err':''}`}>
          {result}
        </div>
      )}

      {loading ? (
        <div className="admin-loading"><p>Loading...</p></div>
      ) : (
        <>
          {/* ════════════════ USERS TAB ════════════════ */}
          {tab === 'users' && (
            <div className="admin-section">
              <h2>👥 All Users <span className="count-badge">{users.length}</span></h2>

              {/* Mobile card view */}
              <div className="user-grid">
                {users.map(u => (
                  <div key={u.id} className="user-card">
                    <div className="user-card-top">
                      <span className={`user-avatar ${u.is_admin?'admin':''}`}>
                        {u.is_admin ? '👑' : u.username[0].toUpperCase()}
                      </span>
                      <div className="user-card-info">
                        <div className="user-card-name">
                          {u.username}
                          {u.is_admin && <span className="admin-tag">Admin</span>}
                        </div>
                        <div className="user-card-meta">
                          {u.email || 'no email'} · 📅 {u.event_count}
                        </div>
                        <div className="user-card-meta">
                          📅 {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                          {u.telegram_chat_id ? ' · 🤖 Connected' : ''}
                        </div>
                      </div>
                    </div>
                    {!u.is_admin && (
                      <div className="user-card-actions">
                        <button className="btn btn-sm" onClick={() => handleResetPw(u.id)}
                          title="Reset password">🔑</button>
                        <button className="btn btn-sm" onClick={() => handleToggleAdmin(u.id)}
                          title="Make admin">⭐</button>
                        <button className="btn btn-sm btn-danger" onClick={() => setDeleteConfirm(u)}
                          title="Delete user">🗑️</button>
                      </div>
                    )}
                    {u.is_admin && u.id !== 1 && (
                      <div className="user-card-actions">
                        <button className="btn btn-sm" onClick={() => handleToggleAdmin(u.id)}
                          title="Remove admin">⬇️ Demote</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Reset password result */}
              {resetPwResult && (
                <div className="modal-overlay" onClick={() => setResetPwResult(null)}>
                  <div className="modal" style={{maxWidth:'400px'}}>
                    <h2>🔑 Temporary Password</h2>
                    <div style={{
                      background:'var(--surface2)', borderRadius:'10px', padding:'1rem',
                      marginTop:'1rem', textAlign:'center',
                      border:'2px dashed var(--accent)'
                    }}>
                      <div style={{fontSize:'.8rem',color:'var(--text2)',marginBottom:'.3rem'}}>
                        User: <strong>{resetPwResult.temp_password ? '—' : ''}</strong>
                      </div>
                      <code style={{
                        fontSize:'1.2rem', fontWeight:600, color:'var(--accent)',
                        wordBreak:'break-all', background:'var(--surface)', padding:'.3rem .6rem', borderRadius:'6px'
                      }}>
                        {resetPwResult.temp_password}
                      </code>
                    </div>
                    <p style={{fontSize:'.78rem',color:'var(--text2)',marginTop:'.8rem'}}>
                      Give this password to the user. They should change it after logging in.
                    </p>
                    <div className="modal-actions" style={{marginTop:'1rem'}}>
                      <button className="btn btn-primary"
                        onClick={() => { navigator.clipboard?.writeText(resetPwResult.temp_password); setResetPwResult(null); }}>
                        📋 Copy & Close
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Delete confirmation */}
              {deleteConfirm && (
                <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null); }}>
                  <div className="modal" style={{maxWidth:'380px'}}>
                    <h2>⚠️ Delete User</h2>
                    <p style={{marginTop:'.5rem',fontSize:'.85rem',color:'var(--text2)'}}>
                      Permanently delete <strong>{deleteConfirm.username}</strong>?
                    </p>
                    <ul className="delete-list">
                      <li>Their account</li>
                      <li>All {deleteConfirm.event_count} events</li>
                      <li>Categories</li>
                      <li>Telegram connection</li>
                    </ul>
                    <p style={{fontSize:'.78rem',color:'var(--danger)',marginBottom:'1rem'}}>Cannot be undone.</p>
                    <div className="modal-actions">
                      <button className="btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                      <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm.id)}>🗑️ Delete</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════ ANALYTICS TAB ════════════════ */}
          {tab === 'analytics' && (
            <div className="admin-section">
              <h2>📊 Platform Analytics</h2>

              {/* Stats cards */}
              <div className="analytics-grid">
                {[
                  { icon:'👥', label:'Total Users', value: analytics?.total_users ?? '—' },
                  { icon:'📅', label:'Total Events', value: analytics?.total_events ?? '—' },
                  { icon:'🤖', label:'Telegram Active', value: analytics?.telegram_active ?? '—' },
                  { icon:'💾', label:'Database', value: analytics ? `${analytics.db_size_mb} MB` : '—' },
                  { icon:'😴', label:'Inactive (30d)', value: analytics?.inactive_users ?? '—', warn: analytics?.inactive_users > 0 },
                ].map((s, i) => (
                  <div key={i} className="stat-card">
                    <div className="stat-icon">{s.icon}</div>
                    <div className="stat-value">{s.value}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Bot health */}
              <h2 style={{marginTop:'1.5rem'}}>🤖 Bot Health</h2>
              <div className="bot-health-card">
                {botHealth ? (
                  <>
                    <div className="health-row">
                      <span>Status</span>
                      <span className={botHealth.healthy ? 'status-ok' : 'status-err'}>
                        {botHealth.healthy ? '✅ Healthy' : '❌ Unhealthy'}
                      </span>
                    </div>
                    <div className="health-row">
                      <span>Webhook URL</span>
                      <code className="health-code">{botHealth.webhook_url || 'Not set'}</code>
                    </div>
                    <div className="health-row">
                      <span>Pending Updates</span>
                      <span>{botHealth.pending_update_count ?? '—'}</span>
                    </div>
                    <div className="health-row">
                      <span>Max Connections</span>
                      <span>{botHealth.max_connections ?? '—'}</span>
                    </div>
                    {botHealth.last_error_message && (
                      <div className="health-row err">
                        <span>Last Error</span>
                        <span className="status-err">{botHealth.last_error_message}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p style={{color:'var(--text2)',fontSize:'.85rem'}}>Bot not configured or API unreachable.</p>
                )}
              </div>
            </div>
          )}

          {/* ════════════════ ANNOUNCEMENTS TAB ════════════════ */}
          {tab === 'announcements' && (
            <div className="admin-section">
              <div className="section-header">
                <h2>📢 Announcements</h2>
                <button className="btn btn-primary btn-sm" onClick={() => setAnnForm({ message:'', type:'banner', active:true })}>
                  + New
                </button>
              </div>

              {announcements.length === 0 ? (
                <p className="empty-text">No announcements yet.</p>
              ) : (
                <div className="announcement-list">
                  {announcements.map(a => (
                    <div key={a.id} className="announcement-card">
                      <div className="ann-top">
                        <span className={`ann-type ${a.type}`}>{a.type === 'banner' ? '📢 Banner' : '📡 Telegram'}</span>
                        <span className={`ann-status ${a.active?'active':'inactive'}`}>
                          {a.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="ann-message">{a.message}</div>
                      <div className="ann-meta">
                        {new Date(a.created_at).toLocaleString()}
                        {a.sent_at ? ` · Broadcast: ${new Date(a.sent_at).toLocaleString()}` : ''}
                      </div>
                      <div className="ann-actions">
                        <button className="btn btn-sm" onClick={() => setAnnForm(a)}>✏️ Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => {
                          if (confirm('Delete this announcement?')) {
                            adminDeleteAnnouncement(a.id).then(() => { msg('✅ Deleted'); loadAll(); }).catch(e => msg('❌ '+e.message, true));
                          }
                        }}>🗑️</button>
                        {a.active && a.type === 'telegram' && (
                          <button className="btn btn-sm btn-primary"
                            onClick={() => handleBroadcast(a.id)}
                            disabled={broadcasting === a.id}>
                            {broadcasting === a.id ? '⏳' : '📡 Broadcast'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Announcement form modal */}
              {annForm && (
                <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setAnnForm(null); }}>
                  <div className="modal" style={{maxWidth:'450px'}}>
                    <h2>{annForm.id ? '✏️ Edit' : '➕ New'} Announcement</h2>
                    <form onSubmit={handleSaveAnn} style={{marginTop:'.8rem'}}>
                      <label>📝 Message</label>
                      <textarea value={annForm.message} onChange={e => setAnnForm({...annForm, message: e.target.value})}
                        rows={4} placeholder="Enter announcement message..."
                        style={{width:'100%',padding:'.6rem .75rem',border:'1px solid var(--border)',
                          borderRadius:'10px',fontSize:'.85rem',background:'var(--surface2)',color:'var(--text)',
                          resize:'vertical',fontFamily:'inherit',marginBottom:'.8rem'}} />
                      <label>📡 Type</label>
                      <select value={annForm.type} onChange={e => setAnnForm({...annForm, type: e.target.value})}
                        style={{marginBottom:'.8rem',width:'100%',padding:'.5rem .75rem',
                          borderRadius:'10px',border:'1px solid var(--border)',background:'var(--surface2)',color:'var(--text)'}}>
                        <option value="banner">📢 Dashboard Banner (all users see it)</option>
                        <option value="telegram">📡 Telegram Broadcast (send to bot users)</option>
                      </select>
                      <div className="form-row" style={{alignItems:'center',marginBottom:'1rem'}}>
                        <input type="checkbox" id="annActive" checked={annForm.active}
                          onChange={e => setAnnForm({...annForm, active: e.target.checked})}
                          style={{width:'auto',marginBottom:0}} />
                        <label htmlFor="annActive" style={{marginBottom:0,marginLeft:'.3rem'}}>Active</label>
                      </div>
                      <div className="modal-actions">
                        <button type="button" className="btn" onClick={() => setAnnForm(null)}>Cancel</button>
                        <button type="submit" className="btn btn-primary">
                          {annForm.id ? '💾 Update' : '➕ Create'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════ PRESETS TAB ════════════════ */}
          {tab === 'presets' && (
            <div className="admin-section">
              <div className="section-header">
                <h2>🏷️ Global Category Presets</h2>
                <button className="btn btn-primary btn-sm" onClick={() => setPresetForm({ name:'', color:'#c4956a', icon:'📌' })}>
                  + Add
                </button>
              </div>

              <p className="section-desc">
                These presets appear as defaults for all users when creating categories.
              </p>

              <div className="preset-grid">
                {presets.map(p => (
                  <div key={p.id} className="preset-card" style={{borderLeftColor:p.color}}>
                    <div className="preset-icon" style={{background:p.color+'30'}}>{p.icon}</div>
                    <div className="preset-info">
                      <div className="preset-name">{p.name}</div>
                      <div className="preset-meta">{p.color} · #{p.sort_order}</div>
                    </div>
                    <div className="preset-actions">
                      <button className="btn btn-sm" onClick={() => setPresetForm(p)}>✏️</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDeletePreset(p.id)}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Preset form modal */}
              {presetForm && (
                <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setPresetForm(null); }}>
                  <div className="modal" style={{maxWidth:'400px'}}>
                    <h2>{presetForm.id ? '✏️ Edit' : '➕ New'} Preset</h2>
                    <form onSubmit={handleSavePreset} style={{marginTop:'.8rem'}}>
                      <label>Name</label>
                      <input type="text" value={presetForm.name}
                        onChange={e => setPresetForm({...presetForm, name: e.target.value})}
                        placeholder="e.g. Study" style={{marginBottom:'.8rem'}} />
                      <div className="form-row" style={{gap:'.8rem',marginBottom:'.8rem'}}>
                        <div style={{flex:1}}>
                          <label>Icon</label>
                          <select value={presetForm.icon}
                            onChange={e => setPresetForm({...presetForm, icon: e.target.value})}
                            style={{width:'100%',padding:'.5rem .75rem',borderRadius:'10px',
                              border:'1px solid var(--border)',background:'var(--surface2)',color:'var(--text)'}}>
                            {ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
                          </select>
                        </div>
                        <div style={{width:'80px'}}>
                          <label>Color</label>
                          <input type="color" value={presetForm.color}
                            onChange={e => setPresetForm({...presetForm, color: e.target.value})}
                            style={{width:'100%',height:'36px',padding:0,border:'1px solid var(--border)',borderRadius:'10px',cursor:'pointer'}} />
                        </div>
                      </div>
                      <div className="modal-actions">
                        <button type="button" className="btn" onClick={() => setPresetForm(null)}>Cancel</button>
                        <button type="submit" className="btn btn-primary">
                          {presetForm.id ? '💾 Update' : '➕ Create'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════ BOT SETTINGS TAB ════════════════ */}
          {tab === 'bot' && (
            <div className="admin-section">
              <h2>🤖 Bot Settings</h2>
              <div className="bot-settings-card">
                <div className="setting-row">
                  <span>Current Token</span>
                  <code className="health-code">{botSettings?.bot_token_masked || 'None'}</code>
                  {botSettings?.bot_token_exists ? ' ✅' : ' ❌'}
                </div>
                <div className="setting-row">
                  <span>Webhook URL</span>
                  <code className="health-code">{botSettings?.webhook_url || 'Not set'}</code>
                </div>

                <form onSubmit={handleUpdateBot} style={{marginTop:'1rem'}}>
                  <label>🤖 New Bot Token</label>
                  <input type="text" value={botToken}
                    onChange={e => setBotToken(e.target.value)}
                    placeholder="Paste new Telegram bot token here..."
                    style={{marginBottom:'.8rem'}} />
                  <div className="warning-box">
                    ⚠️ Updating the token will restart the service. Users will be logged out temporarily.
                  </div>
                  <button type="submit" className="btn btn-primary"
                    disabled={botSaving || !botToken.trim()}>
                    {botSaving ? '⏳ Updating...' : '📥 Update Token & Restart'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ RESPONSIVE STYLES ═══ */}
      <style>{`
        .admin-page { max-width: 960px; margin: 0 auto; padding: 1.5rem; }
        .admin-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .8rem; margin-bottom: 1.2rem; }
        .admin-header h1 { font-size: 1.3rem; font-weight: 600; }
        .admin-header-actions { display: flex; align-items: center; gap: .5rem; }
        .admin-tabs { display: flex; gap: .3rem; margin-bottom: 1.2rem; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: .2rem; }
        .admin-tab { display: flex; align-items: center; gap: .35rem; padding: .45rem .85rem; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: var(--text2); cursor: pointer; font-size: .82rem; white-space: nowrap; transition: .2s; }
        .admin-tab:hover { border-color: var(--accent); }
        .admin-tab.active { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
        .admin-tab-icon { font-size: 1rem; }
        @media (max-width: 500px) {
          .admin-tab { padding: .35rem .6rem; font-size: .75rem; }
          .admin-tab-label { display: none; }
          .admin-tab-icon { font-size: 1.1rem; }
        }
        .admin-result { padding: .5rem .8rem; border-radius: 10px; margin-bottom: 1rem; background: var(--surface2); border: 1px solid var(--border); font-size: .82rem; }
        .admin-result.err { background: var(--danger-bg); border-color: var(--danger); color: var(--danger); }
        .admin-loading { text-align: center; padding: 3rem 1rem; color: var(--text2); }
        .admin-section h2 { font-size: 1.05rem; font-weight: 600; margin-bottom: .8rem; display: flex; align-items: center; gap: .5rem; }
        .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: .6rem; }
        .section-header h2 { margin-bottom: 0; }
        .section-desc { font-size: .8rem; color: var(--text2); margin-bottom: 1rem; }
        .empty-text { color: var(--text2); font-size: .85rem; padding: 1rem 0; }
        .count-badge { font-size: .75rem; color: var(--text2); background: var(--surface2); padding: .1rem .45rem; border-radius: 20px; font-weight: 400; }

        /* ── Users grid (responsive) ── */
        .user-grid { display: flex; flex-direction: column; gap: .4rem; }
        .user-card { background: var(--surface); border: 1px solid var(--border-light); border-radius: 12px; padding: .7rem .9rem; }
        .user-card-top { display: flex; align-items: center; gap: .7rem; }
        .user-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--surface2); display: flex; align-items: center; justify-content: center; font-size: .8rem; font-weight: 600; color: var(--text2); flex-shrink: 0; }
        .user-avatar.admin { background: var(--accent); color: var(--accent-text); }
        .user-card-info { flex: 1; min-width: 0; }
        .user-card-name { font-weight: 600; font-size: .85rem; display: flex; align-items: center; gap: .4rem; }
        .admin-tag { font-size: .65rem; background: var(--accent); color: var(--accent-text); padding: .1rem .35rem; border-radius: 6px; }
        .user-card-meta { font-size: .72rem; color: var(--text2); margin-top: .1rem; }
        .user-card-actions { display: flex; gap: .3rem; margin-top: .5rem; padding-top: .5rem; border-top: 1px solid var(--border-light); }

        /* ── Analytics ── */
        .analytics-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px,1fr)); gap: .7rem; }
        .stat-card { background: var(--surface); border: 1px solid var(--border-light); border-radius: 12px; padding: 1rem; text-align: center; }
        .stat-icon { font-size: 1.3rem; margin-bottom: .2rem; }
        .stat-value { font-size: 1.4rem; font-weight: 600; color: var(--text); }
        .stat-label { font-size: .72rem; color: var(--text2); margin-top: .15rem; }
        .bot-health-card { background: var(--surface); border: 1px solid var(--border-light); border-radius: 12px; padding: 1rem; }
        .health-row { display: flex; justify-content: space-between; align-items: center; padding: .4rem 0; font-size: .82rem; border-bottom: 1px solid var(--border-light); gap: .5rem; }
        .health-row:last-child { border-bottom: none; }
        .health-row.err { background: var(--danger-bg); margin: 0 -.5rem; padding: .4rem .5rem; border-radius: 6px; }
        .health-code { font-size: .7rem; background: var(--surface2); padding: .1rem .4rem; border-radius: 4px; word-break: break-all; max-width: 60%; text-align: right; }
        .status-ok { color: #27ae60; }
        .status-err { color: var(--danger); }

        /* ── Announcements ── */
        .announcement-list { display: flex; flex-direction: column; gap: .5rem; }
        .announcement-card { background: var(--surface); border: 1px solid var(--border-light); border-radius: 12px; padding: .8rem; }
        .ann-top { display: flex; gap: .5rem; margin-bottom: .4rem; }
        .ann-type { font-size: .7rem; padding: .15rem .45rem; border-radius: 6px; background: var(--surface2); font-weight: 500; }
        .ann-type.banner { background: #e8f0fe; color: #1a73e8; }
        .ann-type.telegram { background: #e8f5e9; color: #2e7d32; }
        .ann-status { font-size: .7rem; padding: .15rem .45rem; border-radius: 6px; }
        .ann-status.active { background: #e8f5e9; color: #2e7d32; }
        .ann-status.inactive { background: var(--surface2); color: var(--text3); }
        .ann-message { font-size: .85rem; margin: .3rem 0; word-break: break-word; }
        .ann-meta { font-size: .7rem; color: var(--text3); }
        .ann-actions { display: flex; gap: .3rem; margin-top: .5rem; padding-top: .5rem; border-top: 1px solid var(--border-light); }

        /* ── Presets ── */
        .preset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px,1fr)); gap: .5rem; }
        .preset-card { display: flex; align-items: center; gap: .7rem; background: var(--surface); border: 1px solid var(--border-light); border-left: 4px solid; border-radius: 10px; padding: .6rem .8rem; }
        .preset-icon { font-size: 1.2rem; width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .preset-info { flex: 1; min-width: 0; }
        .preset-name { font-weight: 600; font-size: .85rem; }
        .preset-meta { font-size: .7rem; color: var(--text3); }
        .preset-actions { display: flex; gap: .2rem; }

        /* ── Bot settings ── */
        .bot-settings-card { background: var(--surface); border: 1px solid var(--border-light); border-radius: 12px; padding: 1rem; }
        .setting-row { display: flex; justify-content: space-between; align-items: center; padding: .4rem 0; font-size: .82rem; border-bottom: 1px solid var(--border-light); gap: .5rem; }
        .setting-row:last-child { border-bottom: none; }
        .warning-box { background: #fef3cd; color: #856404; border-radius: 10px; padding: .7rem .8rem; font-size: .78rem; margin-bottom: 1rem; border: 1px solid #ffeeba; }
        .theme-dark .warning-box { background: #3a3200; color: #ffd54f; border-color: #5a4a00; }
        .delete-list { font-size: .8rem; color: var(--text2); margin: .5rem 0 .8rem 1.2rem; line-height: 1.8; }
        .modal-actions { display: flex; justify-content: flex-end; gap: .5rem; margin-top: 1rem; }

        @media (max-width: 600px) {
          .admin-page { padding: 1rem; }
          .analytics-grid { grid-template-columns: repeat(2,1fr); }
          .preset-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

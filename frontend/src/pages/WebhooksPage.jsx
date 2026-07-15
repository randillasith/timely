import { useState, useEffect, useCallback } from 'react';
import { getWebhooks, createWebhook, updateWebhook, deleteWebhook, toggleWebhook, testWebhook, getWebhookLogs, retryWebhook, getWebhookEvents, webhookAiAssist } from '../api';

const EVENT_GROUPS = [
  { label: '📅 Events', events: ['event.created', 'event.updated', 'event.deleted'] },
  { label: '✅ Tasks', events: ['task.created', 'task.updated', 'task.completed', 'task.deleted'] },
  { label: '⏰ Reminders', events: ['reminder.triggered'] },
  { label: '⏱ Timer', events: ['timer.started', 'timer.stopped'] },
];

export default function WebhooksPage({ onBack }) {
  const [webhooks, setWebhooks] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // list | create | edit | logs | assist
  const [editWh, setEditWh] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsFor, setLogsFor] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [whs, evs] = await Promise.all([getWebhooks(), getWebhookEvents()]);
      setWebhooks(whs);
      setEvents(evs);
    } catch(e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = useCallback((m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); }, []);

  const handleToggle = async (id) => {
    await toggleWebhook(id);
    load();
    flash('Toggled');
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this webhook and all its logs?')) return;
    await deleteWebhook(id);
    load();
    flash('Deleted');
  };

  const handleTest = async (id) => {
    await testWebhook(id);
    flash('Test event sent!');
  };

  const handleViewLogs = async (wh) => {
    setLogsFor(wh);
    const data = await getWebhookLogs(wh.id);
    setLogs(data);
    setView('logs');
  };

  const handleRetry = async (logId) => {
    if (!logsFor) return;
    const result = await retryWebhook(logsFor.id, logId);
    flash(`Retry: ${result.success ? '✅ Success' : '❌ Failed — ' + (result.error_message || `HTTP ${result.response_status}`)}`);
    const data = await getWebhookLogs(logsFor.id);
    setLogs(data);
  };

  return (
    <div className="timetable-page">
      {/* Header */}
      <div className="header">
        <h1>🔗 Webhooks</h1>
        <div className="header-actions">
          {view !== 'list' && (
            <button className="btn btn-sm" onClick={() => { setView('list'); setEditWh(null); setLogsFor(null); }}>← Back</button>
          )}
          <button className="btn btn-sm" onClick={onBack}>← Timetable</button>
        </div>
      </div>

      {msg && <div className="msg-success">{msg}</div>}

      {loading ? (
        <div className="empty-state"><p>Loading webhooks...</p></div>
      ) : view === 'list' ? (
        <Dashboard
          webhooks={webhooks}
          onEdit={(wh) => { setEditWh(wh); setView('edit'); }}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onTest={handleTest}
          onLogs={handleViewLogs}
          onCreate={() => { setEditWh(null); setView('create'); }}
          onAssist={() => setView('assist')}
        />
      ) : view === 'create' ? (
        <WebhookForm
          events={events}
          onSave={async (data) => {
            await createWebhook(data);
            flash('Webhook created!');
            setView('list');
            load();
          }}
          onCancel={() => setView('list')}
        />
      ) : view === 'edit' && editWh ? (
        <WebhookForm
          webhook={editWh}
          events={events}
          onSave={async (data) => {
            await updateWebhook(editWh.id, data);
            flash('Webhook updated!');
            setView('list');
            load();
          }}
          onCancel={() => setView('list')}
        />
      ) : view === 'logs' && logsFor ? (
        <LogsView
          webhook={logsFor}
          logs={logs}
          onRetry={handleRetry}
          onBack={() => setView('list')}
          onRefresh={async () => {
            const data = await getWebhookLogs(logsFor.id);
            setLogs(data);
          }}
        />
      ) : view === 'assist' ? (
        <AiAssist
          onConfig={(config) => {
            setEditWh({
              target_url: config.url || '',
              name: config.event ? `${config.event} → ${config.url ? new URL(config.url).hostname : '...'}` : 'AI Suggestion',
              subscribed_events: config.event ? [config.event] : [],
            });
            setView('create');
          }}
          onCancel={() => setView('list')}
        />
      ) : null}
    </div>
  );
}

/* ═══ Dashboard ═══ */
function Dashboard({ webhooks, onEdit, onToggle, onDelete, onTest, onLogs, onCreate, onAssist }) {
  const [showSecret, setShowSecret] = useState({});
  const stats = {
    total: webhooks.length,
    active: webhooks.filter(w => w.active).length,
    disabled: webhooks.filter(w => !w.active).length,
  };

  return (
    <div>
      {/* Stats bar */}
      <div className="webhook-stats">
        <div className="stat-card"><span className="stat-num">{stats.total}</span> Total</div>
        <div className="stat-card active"><span className="stat-num">{stats.active}</span> Active</div>
        <div className="stat-card disabled"><span className="stat-num">{stats.disabled}</span> Disabled</div>
        <div style={{flex:1}} />
        <button className="btn btn-sm" onClick={onAssist}>🤖 AI Assist</button>
        <button className="btn btn-primary btn-sm" onClick={onCreate}>+ New Webhook</button>
      </div>

      {webhooks.length === 0 ? (
        <div className="empty-state">
          <p style={{fontSize:'1.1rem',marginBottom:'.5rem'}}>🔗 No webhooks yet</p>
          <p style={{fontSize:'.85rem',color:'var(--text2)',marginBottom:'1rem'}}>Create a webhook to send event notifications to external services like Slack, Discord, or your own API.</p>
          <button className="btn btn-primary" onClick={onCreate}>+ Create Webhook</button>
        </div>
      ) : (
        <div className="webhook-list">
          {webhooks.map(wh => (
            <div key={wh.id} className={`webhook-card${wh.active ? '' : ' disabled'}`}>
              <div className="webhook-card-header">
                <div className="webhook-name">
                  <span className={`status-dot ${wh.active ? 'active' : 'inactive'}`} />
                  <strong>{wh.name}</strong>
                </div>
                <div className="webhook-actions">
                  <button className="btn btn-sm" onClick={() => onLogs(wh)} title="View logs">📋 Logs</button>
                  <button className="btn btn-sm" onClick={() => onTest(wh)} title="Send test">▶ Test</button>
                  <button className="btn btn-sm" onClick={() => onEdit(wh)} title="Edit">✏️</button>
                  <button className={`btn btn-sm ${wh.active ? 'btn-outline' : 'btn-primary'}`}
                    onClick={() => onToggle(wh.id)}>
                    {wh.active ? 'Disable' : 'Enable'}
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => onDelete(wh.id)} title="Delete">🗑</button>
                </div>
              </div>
              <div className="webhook-card-body">
                <div className="webhook-url"><strong>URL:</strong> <code>{wh.target_url}</code></div>
                <div className="webhook-secret">
                  <strong>Secret:</strong>
                  <code className="secret-text">{wh.secret_key_masked || '••••••••'}</code>
                  <button className="btn btn-sm" title="Full key shown only at creation — save it then">ⓘ</button>
                </div>
                <div className="webhook-events">
                  {(wh.subscribed_events || []).map(ev => (
                    <span key={ev} className="event-tag">{ev}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ Create / Edit Form ═══ */
function WebhookForm({ webhook, events, onSave, onCancel }) {
  const isEdit = !!webhook?.id;
  const [name, setName] = useState(webhook?.name || '');
  const [url, setUrl] = useState(webhook?.target_url || '');
  const [selectedEvents, setSelectedEvents] = useState(webhook?.subscribed_events || []);
  const [err, setErr] = useState('');
  const [showEvents, setShowEvents] = useState(true);

  const toggleEvent = (ev) => {
    setSelectedEvents(prev =>
      prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]
    );
  };

  const selectGroup = (groupEvents) => {
    const allSelected = groupEvents.every(e => selectedEvents.includes(e));
    if (allSelected) {
      setSelectedEvents(prev => prev.filter(e => !groupEvents.includes(e)));
    } else {
      setSelectedEvents(prev => [...new Set([...prev, ...groupEvents])]);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    if (!name.trim()) { setErr('Name is required'); return; }
    if (!url.trim()) { setErr('Target URL is required'); return; }
    if (!url.startsWith('https://')) { setErr('URL must start with https://'); return; }
    if (selectedEvents.length === 0) { setErr('Select at least one event'); return; }
    try { new URL(url); } catch { setErr('Invalid URL format'); return; }
    onSave({ name: name.trim(), target_url: url.trim(), subscribed_events: selectedEvents });
  };

  return (
    <div className="webhook-form-container">
      <div className="webhook-form-card">
        <h2>{isEdit ? '✏️ Edit Webhook' : '➕ Create Webhook'}</h2>
        {err && <div className="error">{err}</div>}
        <form onSubmit={submit}>
          <label>Webhook Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Discord Schedule Updates" autoFocus />

          <label>Target URL (HTTPS only)</label>
          <input value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..." />

          <div className="webhook-events-section">
            <div className="webhook-events-header" onClick={() => setShowEvents(!showEvents)}>
              <span>📡 Subscribed Events</span>
              <span style={{fontSize:'.72rem',color:'var(--text2)'}}>
                {selectedEvents.length} selected {showEvents ? '▲' : '▼'}
              </span>
            </div>
            {showEvents && (
              <div className="webhook-events-grid">
                {EVENT_GROUPS.map(group => (
                  <div key={group.label} className="event-group">
                    <label className="group-label">
                      <input type="checkbox"
                        checked={group.events.every(e => selectedEvents.includes(e))}
                        onChange={() => selectGroup(group.events)}
                        style={{width:'auto',marginBottom:0}} />
                      <span style={{fontWeight:600}}>{group.label}</span>
                    </label>
                    {group.events.map(ev => (
                      <label key={ev} className="event-checkbox">
                        <input type="checkbox" checked={selectedEvents.includes(ev)}
                          onChange={() => toggleEvent(ev)}
                          style={{width:'auto',marginBottom:0}} />
                        <code>{ev}</code>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="modal-actions" style={{marginTop:'1rem'}}>
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-primary">
              {isEdit ? 'Update Webhook' : 'Create Webhook'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══ Logs Viewer ═══ */
function LogsView({ webhook, logs, onRetry, onBack, onRefresh }) {
  const [filter, setFilter] = useState('all'); // all | success | failed

  const filtered = logs.filter(l => {
    if (filter === 'success') return l.success;
    if (filter === 'failed') return !l.success;
    return true;
  });

  const successCount = logs.filter(l => l.success).length;
  const failCount = logs.filter(l => !l.success).length;

  return (
    <div className="webhook-logs-container">
      <div className="webhook-logs-header">
        <h2>📋 Delivery Logs</h2>
        <div style={{fontSize:'.85rem',color:'var(--text2)',marginBottom:'.5rem'}}>
          <strong>{webhook.name}</strong> · <code>{webhook.target_url}</code>
        </div>
        <div className="logs-filter-bar">
          <span className={`log-filter-btn${filter==='all'?' active':''}`} onClick={() => setFilter('all')}>
            All ({logs.length})
          </span>
          <span className={`log-filter-btn success${filter==='success'?' active':''}`} onClick={() => setFilter('success')}>
            ✅ {successCount}
          </span>
          <span className={`log-filter-btn failed${filter==='failed'?' active':''}`} onClick={() => setFilter('failed')}>
            ❌ {failCount}
          </span>
          <div style={{flex:1}} />
          <button className="btn btn-sm" onClick={onRefresh}>🔄 Refresh</button>
          <button className="btn btn-sm" onClick={onBack}>← Back</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><p>No delivery logs yet</p></div>
      ) : (
        <div className="log-list">
          {filtered.map(log => (
            <div key={log.id} className={`log-entry${log.success ? '' : ' failed'}`}>
              <div className="log-entry-header">
                <span className={`status-badge ${log.success ? 'success' : 'failed'}`}>
                  {log.success ? '✅' : '❌'}
                </span>
                <code className="log-event">{log.event_type}</code>
                {log.response_status && (
                  <span className={`http-status ${log.success ? '' : 'failed'}`}>
                    HTTP {log.response_status}
                  </span>
                )}
                {log.response_time_ms !== null && log.response_time_ms !== undefined && (
                  <span className="response-time">{log.response_time_ms}ms</span>
                )}
                <span className="log-time">{log.created_at ? new Date(log.created_at).toLocaleString() : ''}</span>
                <div style={{flex:1}} />
                {!log.success && (
                  <button className="btn btn-sm" onClick={() => onRetry(log.id)} title="Retry">🔄 Retry</button>
                )}
              </div>
              {log.error_message && (
                <div className="log-error">{log.error_message}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ AI Assist ═══ */
function AiAssist({ onConfig, onCancel }) {
  const [prompt, setPrompt] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const examples = [
    'Send my completed tasks to Slack',
    'Notify Discord when a task is completed',
    'Send reminder alerts to Telegram',
    'Notify me on webhook when events are created',
  ];

  const ask = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setErr('');
    try {
      const data = await webhookAiAssist(prompt.trim());
      setSuggestion(data);
    } catch(e) {
      setErr(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="webhook-form-container">
      <div className="webhook-form-card">
        <h2>🤖 AI Webhook Assistant</h2>
        <p style={{fontSize:'.82rem',color:'var(--text2)',marginBottom:'1rem'}}>
          Describe what you want to automate in natural language, and the AI will suggest a webhook configuration.
        </p>

        <label>What do you want to automate?</label>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
          placeholder="e.g. Send my completed tasks to Discord..."
          rows={3} style={{resize:'vertical'}} />

        <div className="examples" style={{marginBottom:'1rem'}}>
          <span style={{fontSize:'.72rem',color:'var(--text2)',marginRight:'.3rem'}}>Try:</span>
          {examples.map((ex, i) => (
            <button key={i} className="btn btn-sm" style={{margin:'.15rem'}}
              onClick={() => setPrompt(ex)}>
              {ex}
            </button>
          ))}
        </div>

        <div className="modal-actions" style={{marginBottom:'1rem'}}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={ask} disabled={loading}>
            {loading ? 'Thinking...' : '🤖 Generate Suggestion'}
          </button>
        </div>

        {err && <div className="error">{err}</div>}

        {suggestion && (
          <div className="ai-suggestion">
            <h3>💡 Suggestion</h3>
            <div className="suggestion-row">
              <strong>Event:</strong>
              <code>{suggestion.event || '(auto-detect)'}</code>
            </div>
            <div className="suggestion-row">
              <strong>URL:</strong>
              <code style={{wordBreak:'break-all'}}>{suggestion.url || '(not specified)'}</code>
            </div>
            {suggestion.payload && Object.keys(suggestion.payload).length > 0 && (
              <div className="suggestion-row">
                <strong>Payload template:</strong>
                <pre>{JSON.stringify(suggestion.payload, null, 2)}</pre>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => onConfig(suggestion)}>
                Use This Configuration
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

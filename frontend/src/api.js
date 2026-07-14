const API = '/api';

async function req(path, opts = {}) {
  const res = await fetch(API + path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error (${res.status})`);
  return data;
}

export const login = (u, p) => req('/login', { method:'POST', body:JSON.stringify({username:u, password:p}) });
export const register = (u, p, e) => req('/register', { method:'POST', body:JSON.stringify({username:u, password:p, email:e}) });
export const logout = () => req('/logout', { method:'POST' });
export const getMe = () => req('/me');
export const getEvents = () => req('/events');
export const createEvent = e => req('/events', { method:'POST', body:JSON.stringify(e) });
export const updateEvent = (id, e) => req('/events/'+id, { method:'PUT', body:JSON.stringify(e) });
export const deleteEvent = id => req('/events/'+id, { method:'DELETE' });
export const setTheme = t => req('/theme', { method:'PUT', body:JSON.stringify({theme:t}) });
export const getCategories = () => req('/categories');
export const createCategory = c => req('/categories', { method:'POST', body:JSON.stringify(c) });
export const updateCategory = (id, c) => req('/categories/'+id, { method:'PUT', body:JSON.stringify(c) });
export const deleteCategory = id => req('/categories/'+id, { method:'DELETE' });
export const getPresets = () => req('/presets');
export const exportJson = () => req('/export');
export const importJson = d => req('/import', { method:'POST', body:JSON.stringify(d) });
export const getShareInfo = () => req('/share');
export const refreshTokens = () => req('/share/refresh', { method:'POST' });
export const getNotifySettings = () => req('/notify-settings');
export const updateNotifySettings = s => req('/notify-settings', { method:'PUT', body:JSON.stringify(s) });
export const changePassword = (current, pw) => req('/change-password', { method:'PUT', body:JSON.stringify({current_password:current, new_password:pw}) });
export const testNotification = () => req('/test-notification', { method:'POST' });
export const getSemesters = () => req('/semesters');
export const getEventsBySemester = (sem) => req('/events' + (sem ? `?semester=${encodeURIComponent(sem)}` : ''));
 
// ─── Admin ───
export const adminGetUsers = () => req('/admin/users');
export const adminDeleteUser = id => req('/admin/users/'+id, { method:'DELETE' });
export const adminResetPassword = id => req('/admin/users/'+id+'/reset-password', { method:'PUT' });
export const adminToggleAdmin = id => req('/admin/users/'+id+'/toggle-admin', { method:'PUT' });
export const adminGetStats = () => req('/admin/stats');
export const adminGetAnalytics = () => req('/admin/analytics');
export const adminGetBotHealth = () => req('/admin/bot-health');
export const adminGetBotSettings = () => req('/admin/bot-settings');
export const adminUpdateBotSettings = s => req('/admin/bot-settings', { method:'PUT', body:JSON.stringify(s) });
export const adminGetPresets = () => req('/admin/presets');
export const adminCreatePreset = p => req('/admin/presets', { method:'POST', body:JSON.stringify(p) });
export const adminUpdatePreset = (id, p) => req('/admin/presets/'+id, { method:'PUT', body:JSON.stringify(p) });
export const adminDeletePreset = id => req('/admin/presets/'+id, { method:'DELETE' });
export const adminGetAnnouncements = () => req('/admin/announcements');
export const adminCreateAnnouncement = a => req('/admin/announcements', { method:'POST', body:JSON.stringify(a) });
export const adminUpdateAnnouncement = (id, a) => req('/admin/announcements/'+id, { method:'PUT', body:JSON.stringify(a) });
export const adminDeleteAnnouncement = id => req('/admin/announcements/'+id, { method:'DELETE' });
export const adminBroadcastAnnouncement = id => req('/admin/announcements/'+id+'/broadcast', { method:'POST' });
// Public
export const getActiveAnnouncements = () => req('/announcements/active');

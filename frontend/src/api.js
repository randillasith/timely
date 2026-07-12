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
export const register = (u, p) => req('/register', { method:'POST', body:JSON.stringify({username:u, password:p}) });
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

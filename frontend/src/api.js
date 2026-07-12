const API = '/api';

async function req(path, opts = {}) {
  const res = await fetch(API + path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function login(u, p) { return req('/login', { method:'POST', body:JSON.stringify({username:u, password:p}) }); }
export function register(u, p) { return req('/register', { method:'POST', body:JSON.stringify({username:u, password:p}) }); }
export function logout() { return req('/logout', { method:'POST' }); }
export function getMe() { return req('/me'); }
export function getEvents() { return req('/events'); }
export function createEvent(e) { return req('/events', { method:'POST', body:JSON.stringify(e) }); }
export function updateEvent(id, e) { return req('/events/'+id, { method:'PUT', body:JSON.stringify(e) }); }
export function deleteEvent(id) { return req('/events/'+id, { method:'DELETE' }); }
export function setTheme(t) { return req('/theme', { method:'PUT', body:JSON.stringify({theme:t}) }); }

const base = import.meta.env.DEV ? '' : '';

async function request(path, options = {}) {
  const res = await fetch(`${base}/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error en la solicitud');
  return data;
}

export const api = {
  login: (username, password) =>
    request('/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/logout', { method: 'POST' }),
  me: () => request('/me'),
  users: () => request('/users'),
  catalog: () => request('/catalog'),
  collection: () => request('/collection'),
  togglePasted: (stickerId) =>
    request('/collection/pasted/toggle', {
      method: 'POST',
      body: JSON.stringify({ stickerId }),
    }),
  adjustAvailable: (stickerId, delta) =>
    request('/collection/available/adjust', {
      method: 'POST',
      body: JSON.stringify({ stickerId, delta }),
    }),
  trade: (otherUserId) => request(`/trade/${otherUserId}`),
  createUser: (username, password, isAdmin) =>
    request('/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username, password, isAdmin }),
    }),
  deleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
  resetPassword: (id, password) =>
    request(`/admin/users/${id}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    }),
};

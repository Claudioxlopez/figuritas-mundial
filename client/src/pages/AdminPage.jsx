import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetId, setResetId] = useState(null);
  const [newPass, setNewPass] = useState('');

  if (!user?.isAdmin) return <Navigate to="/" replace />;

  const load = () => {
    api
      .users()
      .then(setUsers)
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const name = username.trim();
      await api.createUser(name, password, isAdmin);
      setUsername('');
      setPassword('');
      setIsAdmin(false);
      setSuccess(`Usuario "${name}" creado.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (id, name) => {
    if (!confirm(`¿Eliminar a ${name}? Se borran sus figuritas.`)) return;
    try {
      await api.deleteUser(id);
      load();
      setSuccess('Usuario eliminado.');
    } catch (err) {
      setError(err.message);
    }
  };

  const resetPassword = async (id) => {
    if (!newPass || newPass.length < 4) {
      setError('Contraseña mínimo 4 caracteres');
      return;
    }
    try {
      await api.resetPassword(id, newPass);
      setResetId(null);
      setNewPass('');
      setSuccess('Contraseña actualizada.');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card">
        <h2>Crear usuario</h2>
        <p className="hint">Solo el administrador puede dar de alta usuarios.</p>
        <form onSubmit={create}>
          <label htmlFor="new-user">Usuario</label>
          <input
            id="new-user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <label htmlFor="new-pass">Contraseña inicial</label>
          <input
            id="new-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={4}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
            />
            Es administrador
          </label>
          <button type="submit" className="btn">
            Crear
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Usuarios</h2>
        <ul className="user-list">
          {users.map((u) => (
            <li key={u.id}>
              <span>
                {u.username}
                {u.isAdmin && (
                  <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}> (admin)</span>
                )}
              </span>
              <span style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                  onClick={() => setResetId(u.id)}
                >
                  Clave
                </button>
                {u.id !== user.id && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                    onClick={() => remove(u.id, u.username)}
                  >
                    Eliminar
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {resetId && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <label>Nueva contraseña para usuario #{resetId}</label>
            <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
            <button type="button" className="btn" onClick={() => resetPassword(resetId)}>
              Guardar clave
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginLeft: '0.5rem' }}
              onClick={() => {
                setResetId(null);
                setNewPass('');
              }}
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </>
  );
}

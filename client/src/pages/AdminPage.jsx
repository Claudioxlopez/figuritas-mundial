import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [newGroup, setNewGroup] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('member');
  const [groupId, setGroupId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetId, setResetId] = useState(null);
  const [newPass, setNewPass] = useState('');

  if (!['super_admin', 'group_admin'].includes(user?.role)) return <Navigate to="/" replace />;
  const isSuper = user.role === 'super_admin';

  const load = () => {
    Promise.all([api.adminUsers(), api.groups()])
      .then(([usersData, groupsData]) => {
        setUsers(usersData);
        setGroups(groupsData);
        if (!groupId && groupsData.length) {
          const defaultId = isSuper ? groupsData[0].id : user.groupId;
          setGroupId(String(defaultId || ''));
        }
      })
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
      const payload = {
        username: name,
        password,
        role,
        groupId: isSuper ? Number(groupId) : user.groupId,
      };
      await api.createUser(payload);
      setUsername('');
      setPassword('');
      setRole('member');
      setSuccess(`Usuario "${name}" creado.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const createGroup = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const name = newGroup.trim();
      await api.createGroup(name);
      setNewGroup('');
      setSuccess(`Grupo "${name}" creado.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeGroup = async (id, name) => {
    if (!confirm(`¿Eliminar el grupo ${name}?`)) return;
    try {
      await api.deleteGroup(id);
      setSuccess('Grupo eliminado.');
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

  const changeRole = async (id, nextRole, nextGroupId) => {
    try {
      await api.updateUserRole(id, nextRole, Number(nextGroupId));
      setSuccess('Rol actualizado.');
      load();
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
        <h2>{isSuper ? 'Crear usuario (grupo)' : `Crear usuario de ${user.groupName}`}</h2>
        <p className="hint">
          {isSuper
            ? 'Podés crear miembros o administradores de grupo.'
            : 'Como admin de grupo solo podés crear miembros de tu grupo.'}
        </p>
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
          {isSuper && (
            <>
              <label htmlFor="role">Rol</label>
              <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="member">Miembro</option>
                <option value="group_admin">Admin de grupo</option>
              </select>
              <label htmlFor="group">Grupo</label>
              <select id="group" value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
                <option value="">— Elegir grupo —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <button type="submit" className="btn">
            Crear
          </button>
        </form>
      </div>

      {isSuper && (
        <div className="card">
          <h2>Grupos</h2>
          <form onSubmit={createGroup}>
            <label htmlFor="group-name">Nombre del grupo</label>
            <input
              id="group-name"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              required
            />
            <button type="submit" className="btn">
              Crear grupo
            </button>
          </form>
          <ul className="user-list" style={{ marginTop: '0.75rem' }}>
            {groups.map((g) => (
              <li key={g.id}>
                <span>{g.name}</span>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                  onClick={() => removeGroup(g.id, g.name)}
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>{isSuper ? 'Usuarios (todos los grupos)' : `Usuarios de ${user.groupName}`}</h2>
        <ul className="user-list">
          {users.map((u) => (
            <li key={u.id}>
              <span>
                {u.username}
                <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                  {' '}
                  ({u.role === 'group_admin' ? 'admin grupo' : u.role === 'super_admin' ? 'admin pleno' : 'miembro'}
                  {u.groupName ? ` · ${u.groupName}` : ''})
                </span>
              </span>
              <span style={{ display: 'flex', gap: '0.35rem' }}>
                {isSuper && u.role !== 'super_admin' && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                    onClick={() =>
                      changeRole(
                        u.id,
                        u.role === 'group_admin' ? 'member' : 'group_admin',
                        u.groupId
                      )
                    }
                  >
                    {u.role === 'group_admin' ? 'Hacer miembro' : 'Hacer admin grupo'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                  onClick={() => setResetId(u.id)}
                >
                  Clave
                </button>
                {u.id !== user.id && u.role !== 'super_admin' && (
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

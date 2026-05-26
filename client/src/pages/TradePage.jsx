import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function TradePage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [otherId, setOtherId] = useState('');
  const [match, setMatch] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .users()
      .then((list) => setUsers(list.filter((u) => u.id !== user.id)))
      .catch((e) => setError(e.message));
  }, [user.id]);

  const runTrade = async () => {
    if (!otherId) return;
    setError('');
    setLoading(true);
    setMatch(null);
    try {
      const result = await api.trade(otherId);
      setMatch(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="card">
        <h2>Intercambiar con…</h2>
        <p className="hint">
          Elegí un usuario para ver qué figuritas de sus disponibles te sirven a vos (no las tenés
          pegadas) y cuáles de las tuyas le sirven a esa persona.
        </p>
        <label htmlFor="other">Usuario</label>
        <select id="other" value={otherId} onChange={(e) => setOtherId(e.target.value)}>
          <option value="">— Elegir —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.username}
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={runTrade} disabled={!otherId || loading}>
          {loading ? 'Calculando…' : 'Ver intercambio'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {match && (
        <div className="trade-columns">
          <div className="card">
            <h2>
              Te sirven de {match.other.username}
            </h2>
            <p className="hint">
              Sus disponibles que vos <strong>no</strong> tenés pegadas
            </p>
            <div className="stat" style={{ marginBottom: '0.75rem' }}>
              <strong>{match.theyOfferMeCount}</strong>
              <span>figuritas en total</span>
            </div>
            {match.theyOfferMe.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>Ninguna por ahora.</p>
            ) : (
              <div className="sticker-grid" style={{ maxHeight: 'none' }}>
                {match.theyOfferMe.map((s) => (
                  <span
                    key={s.stickerId}
                    className="badge badge-qty"
                    {...(s.quantity > 1 ? { 'data-qty': s.quantity } : {})}
                  >
                    {s.stickerId}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2>
              Le sirven a {match.other.username}
            </h2>
            <p className="hint">
              Tus disponibles que {match.other.username} <strong>no</strong> tiene pegadas
            </p>
            <div className="stat" style={{ marginBottom: '0.75rem' }}>
              <strong>{match.iOfferThemCount}</strong>
              <span>figuritas en total</span>
            </div>
            {match.iOfferThem.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>Ninguna por ahora.</p>
            ) : (
              <div className="sticker-grid" style={{ maxHeight: 'none' }}>
                {match.iOfferThem.map((s) => (
                  <span
                    key={s.stickerId}
                    className="badge badge-qty"
                    {...(s.quantity > 1 ? { 'data-qty': s.quantity } : {})}
                  >
                    {s.stickerId}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

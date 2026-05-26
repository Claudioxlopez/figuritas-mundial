import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api.js';
import AlbumGrid from '../components/AlbumGrid.jsx';
import { ALBUM_GROUPS_PLANILLA } from '../../../album-catalog.js';
import { useAuth } from '../auth.jsx';

export default function AlbumPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [mode, setMode] = useState('pasted');
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .collection()
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => {
        setData(null);
        setError(e.message || 'No se pudo cargar el álbum');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pastedSet = useMemo(() => new Set(data?.pasted ?? []), [data?.pasted]);
  const availableMap = useMemo(() => {
    const m = new Map();
    for (const a of data?.available ?? []) {
      m.set(a.stickerId, a.quantity);
    }
    return m;
  }, [data?.available]);

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return ALBUM_GROUPS_PLANILLA;
    return ALBUM_GROUPS_PLANILLA.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.code.toLowerCase().includes(q) ||
        g.stickers.some((s) => s.toLowerCase().includes(q))
    );
  }, [filter]);

  const totalAvailable = useMemo(
    () => (data?.available ?? []).reduce((s, a) => s + a.quantity, 0),
    [data?.available]
  );

  const handleToggle = async (stickerId) => {
    setError('');
    setSavingId(stickerId);
    try {
      const res = await api.togglePasted(stickerId);
      setData(res.collection);
    } catch (e) {
      setError(e.message);
      load();
    } finally {
      setSavingId(null);
    }
  };

  const handleAdjustAvailable = async (stickerId, delta) => {
    if (mode !== 'available') return;
    setError('');
    setSavingId(stickerId);
    try {
      const res = await api.adjustAvailable(stickerId, delta);
      setData(res.collection);
    } catch (e) {
      setError(e.message);
      load();
    } finally {
      setSavingId(null);
    }
  };

  if (user?.role === 'super_admin') {
    return <Navigate to="/admin" replace />;
  }

  if (loading && !data) {
    return <p>Cargando álbum… (puede tardar unos segundos en el plan free)</p>;
  }

  if (!data) {
    return (
      <div className="card">
        <div className="alert alert-error">{error || 'No se pudo cargar el álbum'}</div>
        <button type="button" className="btn" onClick={load}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="stats">
        <div className="stat">
          <strong>{data.pasted.length}</strong>
          <span>Total pegadas</span>
        </div>
        <div className="stat">
          <strong>{totalAvailable}</strong>
          <span>Total para intercambiar</span>
        </div>
        <div className="stat">
          <strong>{data.missingCount ?? 0}</strong>
          <span>Total faltantes</span>
        </div>
      </div>

      {data.warnings?.length > 0 && (
        <div className="alert alert-warning">
          <strong>Revisá estas figuritas:</strong> están como disponibles pero no como pegadas.
          <div className="sticker-grid" style={{ marginTop: '0.5rem' }}>
            {data.warnings.map((w) => (
              <span key={w.stickerId} className="badge badge-qty" data-qty={w.quantity}>
                {w.stickerId}
              </span>
            ))}
          </div>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card album-toolbar">
        <div className="mode-toggle">
          <button
            type="button"
            className={`mode-btn ${mode === 'pasted' ? 'active' : ''}`}
            onClick={() => setMode('pasted')}
          >
            Pegadas
          </button>
          <button
            type="button"
            className={`mode-btn ${mode === 'available' ? 'active' : ''}`}
            onClick={() => setMode('available')}
          >
            Disponibles
          </button>
        </div>
        <p className="hint mode-hint">
          {mode === 'pasted' ? (
            <>
              Tocá cada código para marcar o desmarcar como <strong>pegada</strong> (verde).
            </>
          ) : (
            <>
              Tocá el código para sumar. Usá <strong>-</strong> al lado para restar. Si llega a 0
              se desmarca. Verde tenue = ya pegada.
            </>
          )}
        </p>
        <label className="sr-only" htmlFor="filter-team">
          Buscar país o código
        </label>
        <input
          id="filter-team"
          type="search"
          placeholder="Buscar país o código (ej. ARG, México)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="legend">
          <span>
            <i className="legend-swatch legend-pasted" /> Pegada
          </span>
          <span>
            <i className="legend-swatch legend-available" /> Disponible
          </span>
          <span>
            <i className="legend-swatch legend-both" /> Ambas
          </span>
        </div>
      </div>

      <AlbumGrid
        groups={groups}
        mode={mode}
        pastedSet={pastedSet}
        availableMap={availableMap}
        onToggle={handleToggle}
        onAdjustAvailable={handleAdjustAvailable}
        savingId={savingId}
      />
    </>
  );
}

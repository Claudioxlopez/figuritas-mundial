import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AlbumPage from './pages/AlbumPage.jsx';
import TradePage from './pages/TradePage.jsx';
import AdminPage from './pages/AdminPage.jsx';

function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="container container-wide">
      <header className="app-header">
        <h1>Figuritas — Intercambios</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            {user.username}
            {user.groupName ? ` · Estás en: ${user.groupName}` : ''}
          </span>
          <button type="button" className="btn btn-ghost" onClick={handleLogout}>
            Salir
          </button>
        </div>
      </header>
      <nav className="tabs">
        <NavLink to="/" end>
          Mi álbum
        </NavLink>
        {user.canTrade && <NavLink to="/intercambiar">Intercambiar</NavLink>}
        {['super_admin', 'group_admin'].includes(user.role) && <NavLink to="/admin">Admin</NavLink>}
      </nav>
      {children}
    </div>
  );
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <p style={{ textAlign: 'center', padding: '2rem' }}>Cargando…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <AlbumPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/intercambiar"
        element={
          <PrivateRoute>
            <TradePage />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <PrivateRoute>
            <AdminPage />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

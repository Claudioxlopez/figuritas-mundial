export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  next();
}

export function requireSuperAdmin(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  if (req.session.role !== 'super_admin') {
    return res.status(403).json({ error: 'Solo administrador pleno' });
  }
  next();
}

export function requireAdminManager(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  if (!['super_admin', 'group_admin'].includes(req.session.role)) {
    return res.status(403).json({ error: 'Solo administradores' });
  }
  next();
}

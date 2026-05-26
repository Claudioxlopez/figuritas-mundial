import { Router } from 'express';
import bcrypt from 'bcrypt';
import {
  ALBUM_GROUPS_PLANILLA, isValidStickerId, STICKER_ID_SET,
} from '../album-catalog.js';
import {
  getUserByUsername,
  getUserById,
  listUsersForActor,
  createUser,
  deleteUser,
  updateUserRoleAndGroup,
  updateUserPassword,
  listGroups,
  createGroup,
  getGroupById,
  deleteGroup,
  listTradeCandidates,
  getCollection,
  setPasted,
  setAvailable,
  togglePasted,
  adjustAvailable,
  getTradeMatch,
  ROLE_SUPER_ADMIN,
  ROLE_GROUP_ADMIN,
  ROLE_MEMBER,
} from './db.js';
import { requireAuth, requireAdminManager, requireSuperAdmin } from './middleware.js';

const router = Router();

function normalizeStickerId(raw) {
  const s = String(raw).trim();
  if (s === '0') return '00';
  const upper = s.toUpperCase();
  if (STICKER_ID_SET.has(upper)) return upper;
  for (const id of STICKER_ID_SET) {
    if (id.toLowerCase() === s.toLowerCase()) return id;
  }
  return upper;
}

function sessionUser(req) {
  return {
    id: req.session.userId,
    role: req.session.role,
    groupId: req.session.groupId,
  };
}

function parseStickerIds(input) {
  if (!Array.isArray(input)) return { ok: false, error: 'Se esperaba una lista de códigos' };
  const ids = [];
  for (const raw of input) {
    const id = normalizeStickerId(raw);
    if (!isValidStickerId(id)) {
      return { ok: false, error: `Código inválido: ${raw}` };
    }
    ids.push(id);
  }
  return { ok: true, ids };
}

function parseAvailable(input) {
  if (!Array.isArray(input)) return { ok: false, error: 'Se esperaba una lista' };
  const items = [];
  for (const raw of input) {
    const stickerId = normalizeStickerId(raw.stickerId ?? raw.sticker_id ?? raw.id ?? '');
    const qty = parseInt(raw.quantity ?? raw.q ?? 1, 10);
    if (!isValidStickerId(stickerId)) {
      return { ok: false, error: `Código inválido: ${stickerId || raw}` };
    }
    if (Number.isNaN(qty) || qty < 1) {
      return { ok: false, error: `Cantidad inválida para ${stickerId}` };
    }
    items.push({ stickerId, quantity: qty });
  }
  return { ok: true, items };
}

function canManageTarget(actor, target) {
  if (!actor || !target) return false;
  if (actor.role === ROLE_SUPER_ADMIN) {
    return target.role !== ROLE_SUPER_ADMIN;
  }
  if (actor.role === ROLE_GROUP_ADMIN) {
    return (
      actor.groupId &&
      target.groupId === actor.groupId &&
      [ROLE_GROUP_ADMIN, ROLE_MEMBER].includes(target.role)
    );
  }
  return false;
}

router.get('/catalog', requireAuth, (_req, res) => {
  res.json({ groups: ALBUM_GROUPS_PLANILLA });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username?.trim() || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }
  const user = await getUserByUsername(username.trim());
  if (!user) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  const mustBelongToGroup = [ROLE_GROUP_ADMIN, ROLE_MEMBER].includes(user.role);
  if (mustBelongToGroup && !user.groupId) {
    return res
      .status(403)
      .json({ error: 'Tu usuario no está asociado a un grupo. Contactá al administrador pleno.' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  req.session.groupId = user.groupId;
  req.session.groupName = user.groupName;
  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    groupId: user.groupId,
    groupName: user.groupName,
    canTrade: user.role !== ROLE_SUPER_ADMIN,
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await getUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    groupId: user.groupId,
    groupName: user.groupName,
    canTrade: user.role !== ROLE_SUPER_ADMIN,
  });
});

router.get('/users', requireAuth, async (req, res) => {
  const actor = sessionUser(req);
  if (actor.role === ROLE_SUPER_ADMIN) {
    return res.json([]);
  }
  const users = await listTradeCandidates(actor.id, actor.groupId);
  res.json(users.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    groupId: u.groupId,
    groupName: u.groupName,
  })));
});

router.get('/admin/users', requireAdminManager, async (req, res) => {
  const users = await listUsersForActor(sessionUser(req));
  res.json(users.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    groupId: u.groupId,
    groupName: u.groupName,
  })));
});

router.get('/admin/groups', requireAdminManager, async (req, res) => {
  const actor = sessionUser(req);
  if (actor.role === ROLE_SUPER_ADMIN) {
    const groups = await listGroups();
    return res.json(groups);
  }
  const own = await getGroupById(actor.groupId);
  res.json(own ? [own] : []);
});

router.post('/admin/groups', requireSuperAdmin, async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nombre de grupo requerido' });
  const group = await createGroup(name);
  res.status(201).json(group);
});

router.delete('/admin/groups/:id', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const group = await getGroupById(id);
  if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });

  const users = await listUsersForActor({ role: ROLE_SUPER_ADMIN });
  if (users.some((u) => u.groupId === id)) {
    return res.status(400).json({ error: 'No podés eliminar un grupo con usuarios asignados' });
  }
  await deleteGroup(id);
  res.json({ ok: true });
});

router.get('/collection', requireAuth, async (req, res) => {
  if (req.session.role === ROLE_SUPER_ADMIN) {
    return res.status(403).json({ error: 'El administrador pleno no intercambia figuritas' });
  }
  const data = await getCollection(req.session.userId);
  res.json(data);
});

router.get('/collection/:userId', requireAuth, async (req, res) => {
  if (req.session.role === ROLE_SUPER_ADMIN) {
    return res.status(403).json({ error: 'El administrador pleno no intercambia figuritas' });
  }
  const userId = parseInt(req.params.userId, 10);
  const user = await getUserById(userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (user.groupId !== req.session.groupId) {
    return res.status(403).json({ error: 'Solo podés ver usuarios de tu grupo' });
  }
  const data = await getCollection(userId);
  res.json({ user: { id: user.id, username: user.username }, ...data });
});

router.put('/collection/pasted', requireAuth, async (req, res) => {
  if (req.session.role === ROLE_SUPER_ADMIN) {
    return res.status(403).json({ error: 'El administrador pleno no intercambia figuritas' });
  }
  const parsed = parseStickerIds(req.body.stickerIds ?? req.body.numbers);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  await setPasted(req.session.userId, parsed.ids);
  const data = await getCollection(req.session.userId);
  res.json(data);
});

router.put('/collection/available', requireAuth, async (req, res) => {
  if (req.session.role === ROLE_SUPER_ADMIN) {
    return res.status(403).json({ error: 'El administrador pleno no intercambia figuritas' });
  }
  const parsed = parseAvailable(req.body.items);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  await setAvailable(req.session.userId, parsed.items);
  const data = await getCollection(req.session.userId);
  res.json(data);
});

router.post('/collection/pasted/toggle', requireAuth, async (req, res) => {
  if (req.session.role === ROLE_SUPER_ADMIN) {
    return res.status(403).json({ error: 'El administrador pleno no intercambia figuritas' });
  }
  const stickerId = normalizeStickerId(req.body.stickerId ?? '');
  if (!isValidStickerId(stickerId)) {
    return res.status(400).json({ error: `Código inválido: ${stickerId}` });
  }
  const pasted = await togglePasted(req.session.userId, stickerId);
  const data = await getCollection(req.session.userId);
  res.json({ pasted, collection: data });
});

router.post('/collection/available/adjust', requireAuth, async (req, res) => {
  if (req.session.role === ROLE_SUPER_ADMIN) {
    return res.status(403).json({ error: 'El administrador pleno no intercambia figuritas' });
  }
  const stickerId = normalizeStickerId(req.body.stickerId ?? '');
  const delta = parseInt(req.body.delta, 10);
  if (!isValidStickerId(stickerId)) {
    return res.status(400).json({ error: `Código inválido: ${stickerId}` });
  }
  if (![-1, 1].includes(delta)) {
    return res.status(400).json({ error: 'Delta inválido (usar -1 o 1)' });
  }
  const quantity = await adjustAvailable(req.session.userId, stickerId, delta);
  const data = await getCollection(req.session.userId);
  res.json({ quantity, collection: data });
});

router.get('/trade/:otherUserId', requireAuth, async (req, res) => {
  if (req.session.role === ROLE_SUPER_ADMIN) {
    return res.status(403).json({ error: 'El administrador pleno no intercambia figuritas' });
  }
  const otherUserId = parseInt(req.params.otherUserId, 10);
  if (otherUserId === req.session.userId) {
    return res.status(400).json({ error: 'Elegí otro usuario' });
  }
  const other = await getUserById(otherUserId);
  if (!other) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (!req.session.groupId || other.groupId !== req.session.groupId) {
    return res.status(403).json({ error: 'Solo podés intercambiar dentro de tu grupo' });
  }
  if (other.role === ROLE_SUPER_ADMIN) {
    return res.status(400).json({ error: 'Ese usuario no participa en intercambios' });
  }

  const match = await getTradeMatch(req.session.userId, otherUserId);
  res.json({
    other: { id: other.id, username: other.username },
    ...match,
  });
});

router.post('/admin/users', requireAdminManager, async (req, res) => {
  const actor = sessionUser(req);
  const { username, password, role, groupId } = req.body;
  const desiredRole = role || ROLE_MEMBER;
  if (!username?.trim() || !password || password.length < 4) {
    return res.status(400).json({ error: 'Usuario y contraseña (mín. 4 caracteres) requeridos' });
  }

  if (![ROLE_MEMBER, ROLE_GROUP_ADMIN].includes(desiredRole)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }

  let targetGroupId = groupId ? parseInt(groupId, 10) : null;
  if (actor.role === ROLE_GROUP_ADMIN) {
    targetGroupId = actor.groupId;
    if (desiredRole !== ROLE_MEMBER) {
      return res.status(403).json({ error: 'El admin de grupo solo puede crear miembros' });
    }
  }

  if (!targetGroupId) return res.status(400).json({ error: 'Grupo requerido' });
  const group = await getGroupById(targetGroupId);
  if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });
  if (actor.role === ROLE_GROUP_ADMIN && actor.groupId !== targetGroupId) {
    return res.status(403).json({ error: 'Solo podés gestionar tu grupo' });
  }

  const existing = await getUserByUsername(username.trim());
  if (existing) return res.status(409).json({ error: 'El usuario ya existe' });
  const hash = await bcrypt.hash(password, 10);
  const user = await createUser({
    username: username.trim(),
    passwordHash: hash,
    role: desiredRole,
    groupId: targetGroupId,
  });
  res.status(201).json({
    id: user.id,
    username: user.username,
    role: user.role,
    groupId: user.groupId,
    groupName: group.name,
  });
});

router.put('/admin/users/:id/role', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { role, groupId } = req.body;
  if (![ROLE_MEMBER, ROLE_GROUP_ADMIN].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }
  const target = await getUserById(id);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (target.role === ROLE_SUPER_ADMIN) {
    return res.status(400).json({ error: 'No podés modificar un admin pleno desde aquí' });
  }
  const group = await getGroupById(parseInt(groupId, 10));
  if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });
  await updateUserRoleAndGroup(id, role, group.id);
  res.json({ ok: true });
});

router.delete('/admin/users/:id', requireAdminManager, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.session.userId) {
    return res.status(400).json({ error: 'No podés eliminarte a vos mismo' });
  }
  const actor = sessionUser(req);
  const user = await getUserById(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (!canManageTarget(actor, user)) {
    return res.status(403).json({ error: 'No tenés permisos para eliminar ese usuario' });
  }
  await deleteUser(id);
  res.json({ ok: true });
});

router.put('/admin/users/:id/password', requireAdminManager, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { password } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Contraseña mínimo 4 caracteres' });
  }
  const actor = sessionUser(req);
  const user = await getUserById(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (!canManageTarget(actor, user) && id !== actor.id) {
    return res.status(403).json({ error: 'No tenés permisos para cambiar esa contraseña' });
  }
  const hash = await bcrypt.hash(password, 10);
  await updateUserPassword(id, hash);
  res.json({ ok: true });
});

export default router;

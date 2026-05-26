import { Router } from 'express';
import bcrypt from 'bcrypt';
import {
  ALBUM_GROUPS_PLANILLA,
  isValidStickerId,
  STICKER_ID_SET,
} from '../album-catalog.js';

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
import {
  getUserByUsername,
  getUserById,
  listUsers,
  createUser,
  deleteUser,
  updateUserPassword,
  getCollection,
  setPasted,
  setAvailable,
  togglePasted,
  adjustAvailable,
  getTradeMatch,
} from './db.js';
import { requireAuth, requireAdmin } from './middleware.js';
import { USE_POSTGRES } from './config.js';

const router = Router();

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
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.isAdmin = USE_POSTGRES ? user.is_admin : Boolean(user.is_admin);
  res.json({
    id: user.id,
    username: user.username,
    isAdmin: req.session.isAdmin,
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
    isAdmin: USE_POSTGRES ? user.is_admin : Boolean(user.is_admin),
  });
});

router.get('/users', requireAuth, async (_req, res) => {
  const users = await listUsers();
  res.json(users.map((u) => ({
    id: u.id,
    username: u.username,
    isAdmin: USE_POSTGRES ? u.is_admin : Boolean(u.is_admin),
  })));
});

router.get('/collection', requireAuth, async (req, res) => {
  const data = await getCollection(req.session.userId);
  res.json(data);
});

router.get('/collection/:userId', requireAuth, async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const user = await getUserById(userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const data = await getCollection(userId);
  res.json({ user: { id: user.id, username: user.username }, ...data });
});

router.put('/collection/pasted', requireAuth, async (req, res) => {
  const parsed = parseStickerIds(req.body.stickerIds ?? req.body.numbers);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  await setPasted(req.session.userId, parsed.ids);
  const data = await getCollection(req.session.userId);
  res.json(data);
});

router.put('/collection/available', requireAuth, async (req, res) => {
  const parsed = parseAvailable(req.body.items);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  await setAvailable(req.session.userId, parsed.items);
  const data = await getCollection(req.session.userId);
  res.json(data);
});

router.post('/collection/pasted/toggle', requireAuth, async (req, res) => {
  const stickerId = normalizeStickerId(req.body.stickerId ?? '');
  if (!isValidStickerId(stickerId)) {
    return res.status(400).json({ error: `Código inválido: ${stickerId}` });
  }
  const pasted = await togglePasted(req.session.userId, stickerId);
  const data = await getCollection(req.session.userId);
  res.json({ pasted, collection: data });
});

router.post('/collection/available/adjust', requireAuth, async (req, res) => {
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
  const otherUserId = parseInt(req.params.otherUserId, 10);
  if (otherUserId === req.session.userId) {
    return res.status(400).json({ error: 'Elegí otro usuario' });
  }
  const other = await getUserById(otherUserId);
  if (!other) return res.status(404).json({ error: 'Usuario no encontrado' });

  const match = await getTradeMatch(req.session.userId, otherUserId);
  res.json({
    other: { id: other.id, username: other.username },
    ...match,
  });
});

router.post('/admin/users', requireAdmin, async (req, res) => {
  const { username, password, isAdmin } = req.body;
  if (!username?.trim() || !password || password.length < 4) {
    return res.status(400).json({ error: 'Usuario y contraseña (mín. 4 caracteres) requeridos' });
  }
  const existing = await getUserByUsername(username.trim());
  if (existing) return res.status(409).json({ error: 'El usuario ya existe' });
  const hash = await bcrypt.hash(password, 10);
  const user = await createUser(username.trim(), hash, Boolean(isAdmin));
  res.status(201).json({
    id: user.id,
    username: user.username,
    isAdmin: USE_POSTGRES ? user.is_admin : Boolean(user.is_admin),
  });
});

router.delete('/admin/users/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.session.userId) {
    return res.status(400).json({ error: 'No podés eliminarte a vos mismo' });
  }
  const user = await getUserById(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  await deleteUser(id);
  res.json({ ok: true });
});

router.put('/admin/users/:id/password', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { password } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Contraseña mínimo 4 caracteres' });
  }
  const user = await getUserById(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const hash = await bcrypt.hash(password, 10);
  await updateUserPassword(id, hash);
  res.json({ ok: true });
});

export default router;

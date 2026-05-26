import Database from 'better-sqlite3';
import pg from 'pg';
import { DATABASE_URL, USE_POSTGRES } from './config.js';
import { ALL_STICKER_IDS, isValidStickerId } from '../album-catalog.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ROLE_SUPER_ADMIN = 'super_admin';
export const ROLE_GROUP_ADMIN = 'group_admin';
export const ROLE_MEMBER = 'member';
const VALID_ROLES = new Set([ROLE_SUPER_ADMIN, ROLE_GROUP_ADMIN, ROLE_MEMBER]);
const DEFAULT_GROUP_NAME = 'General';
const MAX_AVAILABLE_QTY = 9;

let sqlite;
let pgPool;

const SCHEMA_SQLITE = `
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pasted_stickers (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sticker_id TEXT NOT NULL,
  PRIMARY KEY (user_id, sticker_id)
);

CREATE TABLE IF NOT EXISTS available_stickers (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sticker_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  PRIMARY KEY (user_id, sticker_id)
);
`;

async function pgQuery(text, params = []) {
  return pgPool.query(text, params);
}

function sqliteGet(sql, params = []) {
  return sqlite.prepare(sql).get(...params);
}

function sqliteAll(sql, params = []) {
  return sqlite.prepare(sql).all(...params);
}

function sqliteRun(sql, params = []) {
  return sqlite.prepare(sql).run(...params);
}

function sqliteColumns(table) {
  try {
    return sqlite.prepare(`PRAGMA table_info(${table})`).all();
  } catch {
    return [];
  }
}

async function pgHasColumn(table, column) {
  const { rows } = await pgQuery(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rows.length > 0;
}

async function ensureDefaultGroup() {
  if (USE_POSTGRES) {
    const { rows } = await pgQuery('SELECT id FROM groups WHERE LOWER(name)=LOWER($1)', [DEFAULT_GROUP_NAME]);
    if (rows[0]) return rows[0].id;
    const created = await pgQuery('INSERT INTO groups (name) VALUES ($1) RETURNING id', [DEFAULT_GROUP_NAME]);
    return created.rows[0].id;
  }
  const existing = sqliteGet('SELECT id FROM groups WHERE name = ? COLLATE NOCASE', [DEFAULT_GROUP_NAME]);
  if (existing) return existing.id;
  const result = sqliteRun('INSERT INTO groups (name) VALUES (?)', [DEFAULT_GROUP_NAME]);
  return result.lastInsertRowid;
}

async function migrateUsersAndGroups() {
  if (USE_POSTGRES) {
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS groups (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    if (await pgHasColumn('users', 'is_admin')) {
      if (!(await pgHasColumn('users', 'role'))) {
        await pgQuery("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
      }
      if (!(await pgHasColumn('users', 'group_id'))) {
        await pgQuery('ALTER TABLE users ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL');
      }
      await pgQuery(`
        UPDATE users
        SET role = CASE WHEN is_admin THEN 'super_admin' ELSE 'member' END
        WHERE role IS NULL OR role = '' OR role = 'member'
      `);
      await pgQuery('ALTER TABLE users DROP COLUMN is_admin');
    } else {
      if (!(await pgHasColumn('users', 'role'))) {
        await pgQuery("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
      }
      if (!(await pgHasColumn('users', 'group_id'))) {
        await pgQuery('ALTER TABLE users ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL');
      }
    }

    const defaultGroupId = await ensureDefaultGroup();
    await pgQuery(
      `UPDATE users SET group_id = $1
       WHERE role IN ('group_admin','member') AND group_id IS NULL`,
      [defaultGroupId]
    );
    return;
  }

  const userCols = sqliteColumns('users');
  const hasIsAdmin = userCols.some((c) => c.name === 'is_admin');
  const hasRole = userCols.some((c) => c.name === 'role');
  const hasGroupId = userCols.some((c) => c.name === 'group_id');

  if (!hasRole || !hasGroupId || hasIsAdmin) {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    const defaultGroupId = await ensureDefaultGroup();
    if (hasIsAdmin) {
      sqliteRun(
        `INSERT INTO users_new (id, username, password_hash, role, group_id, created_at)
         SELECT id, username, password_hash,
                CASE WHEN is_admin = 1 THEN '${ROLE_SUPER_ADMIN}' ELSE '${ROLE_MEMBER}' END,
                CASE WHEN is_admin = 1 THEN NULL ELSE ? END,
                created_at
         FROM users`,
        [defaultGroupId]
      );
    } else {
      sqliteRun(
        `INSERT INTO users_new (id, username, password_hash, role, group_id, created_at)
         SELECT id, username, password_hash,
                COALESCE(NULLIF(role,''), '${ROLE_MEMBER}'),
                COALESCE(group_id, ?),
                created_at
         FROM users`,
        [defaultGroupId]
      );
    }
    sqlite.exec('DROP TABLE users');
    sqlite.exec('ALTER TABLE users_new RENAME TO users');
  } else {
    const defaultGroupId = await ensureDefaultGroup();
    sqliteRun(
      `UPDATE users SET group_id = ?
       WHERE role IN ('group_admin','member') AND group_id IS NULL`,
      [defaultGroupId]
    );
  }
}

async function migrateStickerSchema() {
  if (USE_POSTGRES) {
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS pasted_stickers (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sticker_id TEXT NOT NULL,
        PRIMARY KEY (user_id, sticker_id)
      )
    `);
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS available_stickers (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sticker_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
        PRIMARY KEY (user_id, sticker_id)
      )
    `);
    if (await pgHasColumn('pasted_stickers', 'number')) {
      await pgQuery('DROP TABLE IF EXISTS available_stickers');
      await pgQuery('DROP TABLE IF EXISTS pasted_stickers');
      await migrateStickerSchema();
    }
    return;
  }

  const pastedCols = sqliteColumns('pasted_stickers');
  if (pastedCols.some((c) => c.name === 'number')) {
    sqlite.exec('DROP TABLE IF EXISTS available_stickers');
    sqlite.exec('DROP TABLE IF EXISTS pasted_stickers');
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS pasted_stickers (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sticker_id TEXT NOT NULL,
      PRIMARY KEY (user_id, sticker_id)
    );
    CREATE TABLE IF NOT EXISTS available_stickers (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sticker_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
      PRIMARY KEY (user_id, sticker_id)
    );
  `);
}

export async function initDb() {
  if (USE_POSTGRES) {
    pgPool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await migrateUsersAndGroups();
    await migrateStickerSchema();
    return;
  }
  sqlite = new Database(join(__dirname, '..', 'data', 'figuritas.db'));
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(SCHEMA_SQLITE);
  await migrateUsersAndGroups();
  await migrateStickerSchema();
}

function normalizeRole(role) {
  const value = String(role || '').trim();
  if (!VALID_ROLES.has(value)) return ROLE_MEMBER;
  return value;
}

function mapUserRow(row) {
  if (!row) return null;
  return {
    ...row,
    role: normalizeRole(row.role),
    groupId: row.group_id ?? row.groupId ?? null,
    groupName: row.group_name ?? row.groupName ?? null,
  };
}

export async function getUserByUsername(username) {
  if (USE_POSTGRES) {
    const { rows } = await pgQuery(
      `SELECT u.*, g.name AS group_name
       FROM users u
       LEFT JOIN groups g ON g.id = u.group_id
       WHERE LOWER(u.username)=LOWER($1)`,
      [username]
    );
    return mapUserRow(rows[0] || null);
  }
  const row = sqliteGet(
    `SELECT u.*, g.name AS group_name
     FROM users u
     LEFT JOIN groups g ON g.id = u.group_id
     WHERE u.username = ? COLLATE NOCASE`,
    [username]
  );
  return mapUserRow(row);
}

export async function getUserById(id) {
  if (USE_POSTGRES) {
    const { rows } = await pgQuery(
      `SELECT u.id, u.username, u.role, u.group_id, g.name AS group_name, u.created_at
       FROM users u
       LEFT JOIN groups g ON g.id = u.group_id
       WHERE u.id = $1`,
      [id]
    );
    return mapUserRow(rows[0] || null);
  }
  const row = sqliteGet(
    `SELECT u.id, u.username, u.role, u.group_id, g.name AS group_name, u.created_at
     FROM users u
     LEFT JOIN groups g ON g.id = u.group_id
     WHERE u.id = ?`,
    [id]
  );
  return mapUserRow(row);
}

export async function countUsers() {
  if (USE_POSTGRES) {
    const { rows } = await pgQuery('SELECT COUNT(*)::int AS count FROM users');
    return rows[0].count;
  }
  const row = sqliteGet('SELECT COUNT(*) AS count FROM users');
  return row.count;
}

export async function listGroups() {
  if (USE_POSTGRES) {
    const { rows } = await pgQuery('SELECT id, name, created_at FROM groups ORDER BY name');
    return rows;
  }
  return sqliteAll('SELECT id, name, created_at FROM groups ORDER BY name');
}

export async function createGroup(name) {
  if (USE_POSTGRES) {
    const { rows } = await pgQuery(
      'INSERT INTO groups (name) VALUES ($1) RETURNING id, name, created_at',
      [name]
    );
    return rows[0];
  }
  const result = sqliteRun('INSERT INTO groups (name) VALUES (?)', [name]);
  return sqliteGet('SELECT id, name, created_at FROM groups WHERE id = ?', [result.lastInsertRowid]);
}

export async function deleteGroup(id) {
  if (USE_POSTGRES) {
    await pgQuery('DELETE FROM groups WHERE id = $1', [id]);
    return;
  }
  sqliteRun('DELETE FROM groups WHERE id = ?', [id]);
}

export async function getGroupById(id) {
  if (USE_POSTGRES) {
    const { rows } = await pgQuery('SELECT id, name, created_at FROM groups WHERE id = $1', [id]);
    return rows[0] || null;
  }
  return sqliteGet('SELECT id, name, created_at FROM groups WHERE id = ?', [id]) || null;
}

export async function listUsersForActor(actor) {
  if (actor.role === ROLE_SUPER_ADMIN) {
    if (USE_POSTGRES) {
      const { rows } = await pgQuery(
        `SELECT u.id, u.username, u.role, u.group_id, g.name AS group_name, u.created_at
         FROM users u LEFT JOIN groups g ON g.id = u.group_id
         ORDER BY u.username`
      );
      return rows.map(mapUserRow);
    }
    return sqliteAll(
      `SELECT u.id, u.username, u.role, u.group_id, g.name AS group_name, u.created_at
       FROM users u LEFT JOIN groups g ON g.id = u.group_id
       ORDER BY u.username`
    ).map(mapUserRow);
  }

  if (!actor.groupId) return [];
  if (USE_POSTGRES) {
    const { rows } = await pgQuery(
      `SELECT u.id, u.username, u.role, u.group_id, g.name AS group_name, u.created_at
       FROM users u LEFT JOIN groups g ON g.id = u.group_id
       WHERE u.group_id = $1
       ORDER BY u.username`,
      [actor.groupId]
    );
    return rows.map(mapUserRow);
  }
  return sqliteAll(
    `SELECT u.id, u.username, u.role, u.group_id, g.name AS group_name, u.created_at
     FROM users u LEFT JOIN groups g ON g.id = u.group_id
     WHERE u.group_id = ?
     ORDER BY u.username`,
    [actor.groupId]
  ).map(mapUserRow);
}

export async function createUser({ username, passwordHash, role, groupId }) {
  const userRole = normalizeRole(role);
  const normalizedGroupId = userRole === ROLE_SUPER_ADMIN ? null : groupId;
  if (USE_POSTGRES) {
    const { rows } = await pgQuery(
      `INSERT INTO users (username, password_hash, role, group_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, role, group_id, created_at`,
      [username, passwordHash, userRole, normalizedGroupId]
    );
    return mapUserRow(rows[0]);
  }
  const result = sqliteRun(
    'INSERT INTO users (username, password_hash, role, group_id) VALUES (?, ?, ?, ?)',
    [username, passwordHash, userRole, normalizedGroupId]
  );
  return getUserById(result.lastInsertRowid);
}

export async function updateUserRoleAndGroup(id, role, groupId) {
  const userRole = normalizeRole(role);
  const normalizedGroupId = userRole === ROLE_SUPER_ADMIN ? null : groupId;
  if (USE_POSTGRES) {
    await pgQuery('UPDATE users SET role = $1, group_id = $2 WHERE id = $3', [userRole, normalizedGroupId, id]);
    return;
  }
  sqliteRun('UPDATE users SET role = ?, group_id = ? WHERE id = ?', [userRole, normalizedGroupId, id]);
}

export async function deleteUser(id) {
  if (USE_POSTGRES) {
    await pgQuery('DELETE FROM users WHERE id = $1', [id]);
    return;
  }
  sqliteRun('DELETE FROM users WHERE id = ?', [id]);
}

export async function updateUserPassword(id, passwordHash) {
  if (USE_POSTGRES) {
    await pgQuery('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
    return;
  }
  sqliteRun('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
}

export async function listTradeCandidates(userId, groupId) {
  if (!groupId) return [];
  if (USE_POSTGRES) {
    const { rows } = await pgQuery(
      `SELECT id, username, role, group_id FROM users
       WHERE group_id = $1 AND id <> $2 AND role <> $3
       ORDER BY username`,
      [groupId, userId, ROLE_SUPER_ADMIN]
    );
    return rows.map(mapUserRow);
  }
  return sqliteAll(
    `SELECT id, username, role, group_id FROM users
     WHERE group_id = ? AND id <> ? AND role <> ?
     ORDER BY username`,
    [groupId, userId, ROLE_SUPER_ADMIN]
  ).map(mapUserRow);
}

export async function getPasted(userId) {
  if (USE_POSTGRES) {
    const { rows } = await pgQuery('SELECT sticker_id FROM pasted_stickers WHERE user_id = $1 ORDER BY sticker_id', [userId]);
    return rows.map((r) => r.sticker_id);
  }
  return sqliteAll('SELECT sticker_id FROM pasted_stickers WHERE user_id = ? ORDER BY sticker_id', [userId]).map((r) => r.sticker_id);
}

export async function getAvailable(userId) {
  if (USE_POSTGRES) {
    const { rows } = await pgQuery('SELECT sticker_id, quantity FROM available_stickers WHERE user_id = $1 ORDER BY sticker_id', [userId]);
    return rows.map((r) => ({ stickerId: r.sticker_id, quantity: r.quantity }));
  }
  return sqliteAll('SELECT sticker_id, quantity FROM available_stickers WHERE user_id = ? ORDER BY sticker_id', [userId]).map((r) => ({ stickerId: r.sticker_id, quantity: r.quantity }));
}

export async function setPasted(userId, stickerIds) {
  const unique = [...new Set(stickerIds)].sort();
  for (const id of unique) {
    if (!isValidStickerId(id)) throw new Error(`Figurita inválida: ${id}`);
  }

  if (USE_POSTGRES) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM pasted_stickers WHERE user_id = $1', [userId]);
      for (const stickerId of unique) {
        await client.query('INSERT INTO pasted_stickers (user_id, sticker_id) VALUES ($1, $2)', [userId, stickerId]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return;
  }
  const tx = sqlite.transaction(() => {
    sqliteRun('DELETE FROM pasted_stickers WHERE user_id = ?', [userId]);
    const stmt = sqlite.prepare('INSERT INTO pasted_stickers (user_id, sticker_id) VALUES (?, ?)');
    for (const stickerId of unique) stmt.run(userId, stickerId);
  });
  tx();
}

export async function setAvailable(userId, items) {
  const map = new Map();
  for (const item of items) {
    const stickerId = item.stickerId ?? item.sticker_id;
    const q = Math.max(1, parseInt(item.quantity, 10) || 1);
    if (!isValidStickerId(stickerId)) throw new Error(`Figurita inválida: ${stickerId}`);
    map.set(stickerId, (map.get(stickerId) || 0) + q);
  }
  const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  if (USE_POSTGRES) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM available_stickers WHERE user_id = $1', [userId]);
      for (const [stickerId, quantity] of entries) {
        await client.query('INSERT INTO available_stickers (user_id, sticker_id, quantity) VALUES ($1, $2, $3)', [userId, stickerId, quantity]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return;
  }
  const tx = sqlite.transaction(() => {
    sqliteRun('DELETE FROM available_stickers WHERE user_id = ?', [userId]);
    const stmt = sqlite.prepare('INSERT INTO available_stickers (user_id, sticker_id, quantity) VALUES (?, ?, ?)');
    for (const [stickerId, quantity] of entries) stmt.run(userId, stickerId, quantity);
  });
  tx();
}

export async function togglePasted(userId, stickerId) {
  if (!isValidStickerId(stickerId)) throw new Error(`Figurita inválida: ${stickerId}`);
  if (USE_POSTGRES) {
    const { rows } = await pgQuery('SELECT 1 FROM pasted_stickers WHERE user_id = $1 AND sticker_id = $2', [userId, stickerId]);
    if (rows.length) {
      await pgQuery('DELETE FROM pasted_stickers WHERE user_id = $1 AND sticker_id = $2', [userId, stickerId]);
      return false;
    }
    await pgQuery('INSERT INTO pasted_stickers (user_id, sticker_id) VALUES ($1, $2)', [userId, stickerId]);
    return true;
  }
  const exists = sqliteGet('SELECT 1 FROM pasted_stickers WHERE user_id = ? AND sticker_id = ?', [userId, stickerId]);
  if (exists) {
    sqliteRun('DELETE FROM pasted_stickers WHERE user_id = ? AND sticker_id = ?', [userId, stickerId]);
    return false;
  }
  sqliteRun('INSERT INTO pasted_stickers (user_id, sticker_id) VALUES (?, ?)', [userId, stickerId]);
  return true;
}

export async function adjustAvailable(userId, stickerId, delta) {
  if (!isValidStickerId(stickerId)) throw new Error(`Figurita inválida: ${stickerId}`);
  const step = parseInt(delta, 10);
  if (![-1, 1].includes(step)) throw new Error('Delta inválido');

  if (USE_POSTGRES) {
    const { rows } = await pgQuery('SELECT quantity FROM available_stickers WHERE user_id = $1 AND sticker_id = $2', [userId, stickerId]);
    const current = rows[0]?.quantity || 0;
    const next = Math.max(0, Math.min(MAX_AVAILABLE_QTY, current + step));
    if (next === 0) {
      await pgQuery('DELETE FROM available_stickers WHERE user_id = $1 AND sticker_id = $2', [userId, stickerId]);
      return 0;
    }
    if (!current) {
      await pgQuery('INSERT INTO available_stickers (user_id, sticker_id, quantity) VALUES ($1, $2, $3)', [userId, stickerId, next]);
      return next;
    }
    await pgQuery('UPDATE available_stickers SET quantity = $1 WHERE user_id = $2 AND sticker_id = $3', [next, userId, stickerId]);
    return next;
  }

  const row = sqliteGet('SELECT quantity FROM available_stickers WHERE user_id = ? AND sticker_id = ?', [userId, stickerId]);
  const current = row?.quantity || 0;
  const next = Math.max(0, Math.min(MAX_AVAILABLE_QTY, current + step));
  if (next === 0) {
    sqliteRun('DELETE FROM available_stickers WHERE user_id = ? AND sticker_id = ?', [userId, stickerId]);
    return 0;
  }
  if (!current) {
    sqliteRun('INSERT INTO available_stickers (user_id, sticker_id, quantity) VALUES (?, ?, ?)', [userId, stickerId, next]);
    return next;
  }
  sqliteRun('UPDATE available_stickers SET quantity = ? WHERE user_id = ? AND sticker_id = ?', [next, userId, stickerId]);
  return next;
}

export async function getCollection(userId) {
  const [pasted, available] = await Promise.all([getPasted(userId), getAvailable(userId)]);
  const pastedSet = new Set(pasted);
  const missingCount = ALL_STICKER_IDS.length - pastedSet.size;
  const warnings = available
    .filter((a) => !pastedSet.has(a.stickerId))
    .map((a) => ({ stickerId: a.stickerId, quantity: a.quantity }));
  return { pasted, available, missingCount, warnings };
}

export async function getTradeMatch(userId, otherUserId) {
  const [mine, other] = await Promise.all([getCollection(userId), getCollection(otherUserId)]);
  const myPasted = new Set(mine.pasted);
  const otherPasted = new Set(other.pasted);
  const theyOfferMe = other.available
    .filter((a) => !myPasted.has(a.stickerId))
    .map((a) => ({ stickerId: a.stickerId, quantity: a.quantity }));
  const iOfferThem = mine.available
    .filter((a) => !otherPasted.has(a.stickerId))
    .map((a) => ({ stickerId: a.stickerId, quantity: a.quantity }));
  return {
    theyOfferMe,
    iOfferThem,
    theyOfferMeCount: theyOfferMe.reduce((s, x) => s + x.quantity, 0),
    iOfferThemCount: iOfferThem.reduce((s, x) => s + x.quantity, 0),
  };
}

export { pgPool };

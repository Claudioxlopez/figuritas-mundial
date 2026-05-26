import Database from 'better-sqlite3';
import pg from 'pg';
import { DATABASE_URL, USE_POSTGRES } from './config.js';
import { ALL_STICKER_IDS, isValidStickerId } from '../album-catalog.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let sqlite;
let pgPool;

const SCHEMA_USERS_SQLITE = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const SCHEMA_USERS_PG = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const SCHEMA_STICKERS_SQLITE = `
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

const SCHEMA_STICKERS_PG = `
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

function sqliteTableColumns(table) {
  try {
    return sqlite.prepare(`PRAGMA table_info(${table})`).all();
  } catch {
    return [];
  }
}

async function pgTableHasColumn(table, column) {
  const { rows } = await pgQuery(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rows.length > 0;
}

async function migrateStickerSchema() {
  if (USE_POSTGRES) {
    const hasOld = await pgTableHasColumn('pasted_stickers', 'number');
    if (hasOld) {
      await pgQuery('DROP TABLE IF EXISTS available_stickers');
      await pgQuery('DROP TABLE IF EXISTS pasted_stickers');
    }
    await pgQuery(SCHEMA_STICKERS_PG);
    return;
  }

  const pastedCols = sqliteTableColumns('pasted_stickers');
  if (pastedCols.some((c) => c.name === 'number')) {
    sqlite.exec('DROP TABLE IF EXISTS available_stickers');
    sqlite.exec('DROP TABLE IF EXISTS pasted_stickers');
  }
  sqlite.exec(SCHEMA_STICKERS_SQLITE);
}

export async function initDb() {
  if (USE_POSTGRES) {
    pgPool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await pgQuery(SCHEMA_USERS_PG);
    await migrateStickerSchema();
    return;
  }
  sqlite = new Database(join(__dirname, '..', 'data', 'figuritas.db'));
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(SCHEMA_USERS_SQLITE);
  await migrateStickerSchema();
}

async function pgQuery(text, params = []) {
  const res = await pgPool.query(text, params);
  return res;
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

export async function getUserByUsername(username) {
  if (USE_POSTGRES) {
    const { rows } = await pgQuery('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    return rows[0] || null;
  }
  return sqliteGet('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
}

export async function getUserById(id) {
  if (USE_POSTGRES) {
    const { rows } = await pgQuery('SELECT id, username, is_admin, created_at FROM users WHERE id = $1', [id]);
    return rows[0] || null;
  }
  const row = sqliteGet('SELECT id, username, is_admin, created_at FROM users WHERE id = ?', [id]);
  if (row) row.is_admin = Boolean(row.is_admin);
  return row;
}

export async function listUsers() {
  if (USE_POSTGRES) {
    const { rows } = await pgQuery(
      'SELECT id, username, is_admin, created_at FROM users ORDER BY username'
    );
    return rows;
  }
  return sqliteAll('SELECT id, username, is_admin, created_at FROM users ORDER BY username').map((u) => ({
    ...u,
    is_admin: Boolean(u.is_admin),
  }));
}

export async function countUsers() {
  if (USE_POSTGRES) {
    const { rows } = await pgQuery('SELECT COUNT(*)::int AS count FROM users');
    return rows[0].count;
  }
  const row = sqliteGet('SELECT COUNT(*) AS count FROM users');
  return row.count;
}

export async function createUser(username, passwordHash, isAdmin = false) {
  if (USE_POSTGRES) {
    const { rows } = await pgQuery(
      'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING id, username, is_admin, created_at',
      [username, passwordHash, isAdmin]
    );
    return rows[0];
  }
  const result = sqliteRun(
    'INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)',
    [username, passwordHash, isAdmin ? 1 : 0]
  );
  return getUserById(result.lastInsertRowid);
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

export async function getPasted(userId) {
  if (USE_POSTGRES) {
    const { rows } = await pgQuery(
      'SELECT sticker_id FROM pasted_stickers WHERE user_id = $1 ORDER BY sticker_id',
      [userId]
    );
    return rows.map((r) => r.sticker_id);
  }
  return sqliteAll('SELECT sticker_id FROM pasted_stickers WHERE user_id = ? ORDER BY sticker_id', [
    userId,
  ]).map((r) => r.sticker_id);
}

export async function getAvailable(userId) {
  if (USE_POSTGRES) {
    const { rows } = await pgQuery(
      'SELECT sticker_id, quantity FROM available_stickers WHERE user_id = $1 ORDER BY sticker_id',
      [userId]
    );
    return rows.map((r) => ({ stickerId: r.sticker_id, quantity: r.quantity }));
  }
  return sqliteAll(
    'SELECT sticker_id, quantity FROM available_stickers WHERE user_id = ? ORDER BY sticker_id',
    [userId]
  ).map((r) => ({ stickerId: r.sticker_id, quantity: r.quantity }));
}

export async function setPasted(userId, stickerIds) {
  const unique = [...new Set(stickerIds)];
  for (const id of unique) {
    if (!isValidStickerId(id)) throw new Error(`Figurita inválida: ${id}`);
  }
  unique.sort();

  if (USE_POSTGRES) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM pasted_stickers WHERE user_id = $1', [userId]);
      for (const stickerId of unique) {
        await client.query('INSERT INTO pasted_stickers (user_id, sticker_id) VALUES ($1, $2)', [
          userId,
          stickerId,
        ]);
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
        await client.query(
          'INSERT INTO available_stickers (user_id, sticker_id, quantity) VALUES ($1, $2, $3)',
          [userId, stickerId, quantity]
        );
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
    const stmt = sqlite.prepare(
      'INSERT INTO available_stickers (user_id, sticker_id, quantity) VALUES (?, ?, ?)'
    );
    for (const [stickerId, quantity] of entries) stmt.run(userId, stickerId, quantity);
  });
  tx();
}

export async function togglePasted(userId, stickerId) {
  if (!isValidStickerId(stickerId)) throw new Error(`Figurita inválida: ${stickerId}`);

  if (USE_POSTGRES) {
    const { rows } = await pgQuery(
      'SELECT 1 FROM pasted_stickers WHERE user_id = $1 AND sticker_id = $2',
      [userId, stickerId]
    );
    if (rows.length) {
      await pgQuery('DELETE FROM pasted_stickers WHERE user_id = $1 AND sticker_id = $2', [
        userId,
        stickerId,
      ]);
      return false;
    }
    await pgQuery('INSERT INTO pasted_stickers (user_id, sticker_id) VALUES ($1, $2)', [
      userId,
      stickerId,
    ]);
    return true;
  }

  const exists = sqliteGet(
    'SELECT 1 FROM pasted_stickers WHERE user_id = ? AND sticker_id = ?',
    [userId, stickerId]
  );
  if (exists) {
    sqliteRun('DELETE FROM pasted_stickers WHERE user_id = ? AND sticker_id = ?', [
      userId,
      stickerId,
    ]);
    return false;
  }
  sqliteRun('INSERT INTO pasted_stickers (user_id, sticker_id) VALUES (?, ?)', [
    userId,
    stickerId,
  ]);
  return true;
}

const MAX_AVAILABLE_QTY = 9;

export async function cycleAvailable(userId, stickerId) {
  if (!isValidStickerId(stickerId)) throw new Error(`Figurita inválida: ${stickerId}`);

  if (USE_POSTGRES) {
    const { rows } = await pgQuery(
      'SELECT quantity FROM available_stickers WHERE user_id = $1 AND sticker_id = $2',
      [userId, stickerId]
    );
    if (!rows.length) {
      await pgQuery(
        'INSERT INTO available_stickers (user_id, sticker_id, quantity) VALUES ($1, $2, 1)',
        [userId, stickerId]
      );
      return 1;
    }
    const next = rows[0].quantity + 1;
    if (next > MAX_AVAILABLE_QTY) {
      await pgQuery('DELETE FROM available_stickers WHERE user_id = $1 AND sticker_id = $2', [
        userId,
        stickerId,
      ]);
      return 0;
    }
    await pgQuery(
      'UPDATE available_stickers SET quantity = $1 WHERE user_id = $2 AND sticker_id = $3',
      [next, userId, stickerId]
    );
    return next;
  }

  const row = sqliteGet(
    'SELECT quantity FROM available_stickers WHERE user_id = ? AND sticker_id = ?',
    [userId, stickerId]
  );
  if (!row) {
    sqliteRun(
      'INSERT INTO available_stickers (user_id, sticker_id, quantity) VALUES (?, ?, 1)',
      [userId, stickerId]
    );
    return 1;
  }
  const next = row.quantity + 1;
  if (next > MAX_AVAILABLE_QTY) {
    sqliteRun('DELETE FROM available_stickers WHERE user_id = ? AND sticker_id = ?', [
      userId,
      stickerId,
    ]);
    return 0;
  }
  sqliteRun(
    'UPDATE available_stickers SET quantity = ? WHERE user_id = ? AND sticker_id = ?',
    [next, userId, stickerId]
  );
  return next;
}

export async function adjustAvailable(userId, stickerId, delta) {
  if (!isValidStickerId(stickerId)) throw new Error(`Figurita inválida: ${stickerId}`);
  const step = parseInt(delta, 10);
  if (![-1, 1].includes(step)) throw new Error('Delta inválido');

  if (USE_POSTGRES) {
    const { rows } = await pgQuery(
      'SELECT quantity FROM available_stickers WHERE user_id = $1 AND sticker_id = $2',
      [userId, stickerId]
    );
    const current = rows[0]?.quantity || 0;
    const next = Math.max(0, Math.min(MAX_AVAILABLE_QTY, current + step));

    if (next === 0) {
      await pgQuery('DELETE FROM available_stickers WHERE user_id = $1 AND sticker_id = $2', [
        userId,
        stickerId,
      ]);
      return 0;
    }

    if (current === 0) {
      await pgQuery(
        'INSERT INTO available_stickers (user_id, sticker_id, quantity) VALUES ($1, $2, $3)',
        [userId, stickerId, next]
      );
      return next;
    }

    await pgQuery(
      'UPDATE available_stickers SET quantity = $1 WHERE user_id = $2 AND sticker_id = $3',
      [next, userId, stickerId]
    );
    return next;
  }

  const row = sqliteGet(
    'SELECT quantity FROM available_stickers WHERE user_id = ? AND sticker_id = ?',
    [userId, stickerId]
  );
  const current = row?.quantity || 0;
  const next = Math.max(0, Math.min(MAX_AVAILABLE_QTY, current + step));

  if (next === 0) {
    sqliteRun('DELETE FROM available_stickers WHERE user_id = ? AND sticker_id = ?', [
      userId,
      stickerId,
    ]);
    return 0;
  }

  if (current === 0) {
    sqliteRun(
      'INSERT INTO available_stickers (user_id, sticker_id, quantity) VALUES (?, ?, ?)',
      [userId, stickerId, next]
    );
    return next;
  }

  sqliteRun(
    'UPDATE available_stickers SET quantity = ? WHERE user_id = ? AND sticker_id = ?',
    [next, userId, stickerId]
  );
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

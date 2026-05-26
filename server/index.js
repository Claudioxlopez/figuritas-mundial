import express from 'express';
import session from 'express-session';
import cors from 'cors';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import connectPgSimple from 'connect-pg-simple';
import router from './routes.js';
import {
  initDb,
  pgPool,
  getUserByUsername,
  createUser,
  countUsers,
  updateUserPassword,
  ROLE_SUPER_ADMIN,
} from './db.js';
import {
  PORT,
  SESSION_SECRET,
  IS_PROD,
  USE_POSTGRES,
  NODE_ENV,
} from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
if (!USE_POSTGRES && !existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

await initDb();

async function ensureAdminFromEnv() {
  const adminUsername = process.env.ADMIN_USERNAME?.trim() || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;
  const resetPassword = process.env.ADMIN_RESET_PASSWORD === 'true';

  const existing = await getUserByUsername(adminUsername);
  const totalUsers = await countUsers();

  if (existing && resetPassword && adminPassword) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await updateUserPassword(existing.id, hash);
    console.log(`Contraseña de admin actualizada: ${adminUsername}`);
    return;
  }

  if (existing) return;

  if (!adminPassword && totalUsers > 0) {
    console.warn('No hay ADMIN_PASSWORD en env y la base ya tiene usuarios.');
    return;
  }

  const password = adminPassword || 'admin123';
  const hash = await bcrypt.hash(password, 10);
  await createUser({
    username: adminUsername,
    passwordHash: hash,
    role: ROLE_SUPER_ADMIN,
    groupId: null,
  });
  console.log(`Admin inicial creado: ${adminUsername}`);
}

await ensureAdminFromEnv();

const app = express();

// Render (y otros proxies) necesitan esto para cookies secure en HTTPS
if (IS_PROD) {
  app.set('trust proxy', 1);
}

if (!IS_PROD) {
  app.use(
    cors({
      origin: 'http://localhost:5173',
      credentials: true,
    })
  );
}

app.use(express.json());

let sessionStore;
if (USE_POSTGRES) {
  const PgSession = connectPgSimple(session);
  sessionStore = new PgSession({
    pool: pgPool,
    createTableIfMissing: true,
  });
}

app.use(
  session({
    store: sessionStore,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: IS_PROD,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: IS_PROD ? 'lax' : 'lax',
    },
  })
);

app.use('/api', router);

const clientDist = join(__dirname, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Figuritas en http://localhost:${PORT} (${NODE_ENV}, ${USE_POSTGRES ? 'postgres' : 'sqlite'})`);
});

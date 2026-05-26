import express from 'express';
import session from 'express-session';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import connectPgSimple from 'connect-pg-simple';
import router from './routes.js';
import { initDb, pgPool } from './db.js';
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

const app = express();

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

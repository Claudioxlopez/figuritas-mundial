import bcrypt from 'bcrypt';
import { initDb, getUserByUsername, createUser } from '../db.js';
import { mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', '..', 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

await initDb();

const adminUser = process.env.ADMIN_USERNAME || 'admin';
const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

const existing = await getUserByUsername(adminUser);
if (existing) {
  console.log(`Usuario admin "${adminUser}" ya existe.`);
} else {
  const hash = await bcrypt.hash(adminPass, 10);
  await createUser(adminUser, hash, true);
  console.log(`Admin creado: usuario="${adminUser}" contraseña="${adminPass}"`);
  console.log('Cambiá la contraseña después del primer login.');
}

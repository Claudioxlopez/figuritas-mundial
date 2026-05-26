import dotenv from 'dotenv';
import { ALBUM_TOTAL } from '../album-catalog.js';

dotenv.config();

export const ALBUM_MAX = ALBUM_TOTAL;
export const PORT = process.env.PORT || 3000;
export const SESSION_SECRET = process.env.SESSION_SECRET || 'cambiar-en-produccion';
export const DATABASE_URL = process.env.DATABASE_URL;
export const USE_POSTGRES = Boolean(DATABASE_URL);
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PROD = NODE_ENV === 'production';

# Figuritas — Intercambios del álbum

App para un grupo pequeño que intercambia figuritas del Mundial 2026 (códigos tipo **USA10**, **ARG3**, **FWC12**, **CC5** — **994** figuritas según la planilla de control).

## Funciones

- **Login** por usuario y contraseña (usuarios creados solo por admin).
- **Mi álbum**: grilla interactiva por país / FWC / Coca-Cola (clic para pegadas; en disponibles, clic suma cantidad 1–9).
- **Aviso** si una figurita está como disponible pero no como pegada.
- **Intercambiar**: elegís otro usuario y ves:
  - qué de sus disponibles te sirven (no las tenés pegadas);
  - qué de las tuyas le sirven a esa persona.
- **Admin**: crear usuarios, resetear contraseña, eliminar.

## Stack (recomendado para Render)

- **Node.js + Express** (API y sirve el frontend en producción)
- **PostgreSQL** en Render (persistencia)
- **SQLite** en local si no configurás `DATABASE_URL`
- **React** (Vite)

Pocos usuarios → plan free de Render alcanza.

## Desarrollo local

```bash
npm install
npm install --prefix client
npm run db:init
npm run dev
```

El servidor en desarrollo no usa auto-reload (evita errores `EMFILE` en macOS). Si cambiás código del backend, reiniciá `npm run dev`.

- Frontend: http://localhost:5173  
- API: http://localhost:3000  

Admin por defecto tras `db:init`: usuario `admin`, contraseña `admin123` (cambiala en producción).

## Deploy en Render

1. Subí el repo a GitHub.
2. En Render: **New → Blueprint** (o Web Service) y usá `render.yaml`, o:
   - **Build**: `npm install && npm install --prefix client && npm run build && npm run db:init`
   - **Start**: `npm start`
3. Creá una base **PostgreSQL** y asigná `DATABASE_URL`.
4. Variables:
   - `SESSION_SECRET` (aleatorio)
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` (solo la primera vez, para crear el admin)
5. Después del primer deploy, entrá como admin y creá a Sabrina, Santi, etc.

## Códigos de figuritas

Cada celda usa el código de la planilla (ej. `MEX15`, `CAW3`, `00`, `FWC7`, `CC12`). Curaçao = **CAW**, Escocia = **SCO**, Inglaterra = **ENG**.

# TopHorses

Análisis de datos del caballo deportivo en todas las disciplinas: carreras (Pura Sangre, Árabe, Quarter Horse), raid, reining, doma clásica, salto y concurso completo.

Plataforma independiente: su propio repositorio, su propio backend en Railway (con su base de datos) y su propia web en Vercel.

## Estructura

- `backend/` — API Node/Express + PostgreSQL (SQL directo con `pg`). Las migraciones de `backend/db/migrations` se aplican solas al arrancar.
  - `src/lib/disciplines.js` — catálogo de disciplinas, razas y datos de resultado (única fuente; la web lo recibe en `GET /api/catalog`).
  - `src/lib/documents.js` — lectura con IA de documentación y de resultados.
  - `src/lib/ai.js` — conector de IA (Claude nativo o API compatible con OpenAI) y motor genérico de análisis de fotos y vídeo.
- `frontend/` — React + Vite.

## Railway (backend)

1. New Project → Deploy from GitHub → `equhorses/tophorse`, carpeta raíz `backend`.
2. Añadir PostgreSQL al proyecto (variable `DATABASE_URL`).
3. Añadir un Volume montado en `/data`.
4. Variables: ver `backend/.env.example` (mínimo `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `UPLOAD_DIR=/data/uploads`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`).

## Vercel (frontend)

1. New Project → `equhorses/tophorse`, carpeta raíz `frontend`.
2. Variable `VITE_API_URL` = URL pública del backend de Railway.

## Local

```
cd backend && npm install && cp .env.example .env && npm run dev
cd frontend && npm install && npm run dev
```

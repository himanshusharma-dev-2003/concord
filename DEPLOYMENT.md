# Deployment

Concord has two independently deployable pieces:

| Part | What it is | Platform requirements |
|---|---|---|
| `concord-text` | Static React + Vite build | Any static host (Vercel, Netlify, Cloudflare Pages) |
| `concord-sync-server` | Node.js server with WebSocket | Must support persistent connections (Railway, Render, Fly.io) |

> **Important:** Vercel serverless functions **do not** support long-lived WebSocket connections. Deploy the sync server on a platform that provides a real Node.js process.

---

## Frontend (concord-text) — Vercel

### 1. Set the API URL

In your Vercel project settings, add an environment variable:

```
VITE_API_URL=https://your-sync-server.up.railway.app
```

### 2. Deploy

Push to `main`. Vercel picks up `vercel.json` and runs:

```bash
pnpm --filter concord-core run build && pnpm --filter concord-text run build
```

Output directory: `apps/text-editor/dist`

---

## Sync Server (concord-sync-server) — Railway

### 1. Create a Railway project

Link your GitHub repository.

### 2. Set environment variables

In the Railway project settings:

```
DATABASE_URL=postgresql://...   # Railway provides this automatically if you add a Postgres plugin
JWT_SECRET=<openssl rand -hex 32>
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://your-frontend.vercel.app
```

### 3. Set the start command

```
node dist/index.js
```

### 4. Add a build command

```
pnpm --filter concord-core run build && pnpm --filter concord-sync-server run build
```

### 5. Database

Railway's Postgres plugin automatically provides `DATABASE_URL`. The Concord schema will be applied automatically on first run (SQLite) — for PostgreSQL, run the schema manually once:

```bash
railway run psql $DATABASE_URL -f apps/sync-server/src/persistence/schema.sql
```

---

## Render (alternative)

Render supports Node.js web services with persistent connections.

1. Create a new **Web Service** and connect your GitHub repo.
2. Build command: `pnpm install && pnpm --filter concord-core run build && pnpm --filter concord-sync-server run build`
3. Start command: `node apps/sync-server/dist/index.js`
4. Add environment variables (same as Railway above).
5. Add a **PostgreSQL** database from the Render dashboard and copy the connection string to `DATABASE_URL`.

---

## Local Production Build

To test the production build locally:

```bash
# Build everything
pnpm build

# Start the server
pnpm start

# Serve the frontend (separate terminal)
pnpm --filter concord-text run preview
```

---

## Health Check

The sync server exposes `GET /health` which returns:

```json
{ "status": "ok", "timestamp": "..." }
```

Use this as your platform's health check endpoint. Railway and Render will automatically restart the service if this returns a non-200 status.

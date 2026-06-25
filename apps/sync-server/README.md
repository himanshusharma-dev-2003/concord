# CRDT Backend (Node + Fastify + Socket.io)

This package orchestrates the CRDT module over the network.

## Setup

1. **Database**
   ```bash
   createdb crdt_editor
   psql -d crdt_editor -f src/persistence/schema.sql
   ```

2. **Environment**
   ```bash
   cp .env.example .env
   # Edit DATABASE_URL if needed
   ```

3. **Run**
   ```bash
   npm install
   npm run dev
   ```

Server runs on `http://localhost:3001`

## API Endpoints

- `GET /health`
- `GET /documents/:id`
- `GET /documents/:id/reconstruct?at=2026-06-22T10:00:00Z` — time travel

## WebSocket Events

**Client → Server**
- `join-document` → `{ documentId, clientId }`
- `crdt-op` → `{ documentId, op: RGANode }`

**Server → Client**
- `initial-state` → `{ documentId, snapshot, operations, serverTime }`
- `crdt-op` → `{ documentId, op, fromClientId }`

## Architecture Notes

- CRDT logic lives exclusively in `@crdt-text-editor/crdt`
- Backend only persists, broadcasts, and replays operations
- Snapshot compaction is available via `SyncService.compactSnapshot()` (call periodically)
# Architecture

This document explains the technical design of Concord — the CRDT algorithm, data flow, persistence model, and WebSocket protocol.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [The CRDT Engine (concord-core)](#the-crdt-engine)
3. [WebSocket Sync Protocol](#websocket-sync-protocol)
4. [Persistence Layer](#persistence-layer)
5. [Authentication Model](#authentication-model)
6. [Time-Travel Reconstruction](#time-travel-reconstruction)
7. [Design Decisions](#design-decisions)

---

## System Overview

Concord is decomposed into three independently versioned packages in a pnpm monorepo:

| Package | Role | Key dependency |
|---|---|---|
| `concord-core` | Pure CRDT engine — no I/O | None |
| `concord-sync-server` | Fastify HTTP + Socket.io sync server | `concord-core` |
| `concord-text` | React + Vite frontend | `concord-core` |

Both the frontend and backend depend on the same `concord-core` package. This means the **same CRDT logic** runs in the browser and on the server — no translation layer, no impedance mismatch.

```
Browser                           Server
──────────────────────────────    ──────────────────────────────
RgaDocument (concord-core)        RgaDocument (concord-core)
      │                                   │
      │  Socket.io (CRDT ops)             │
      └──────────────────────────────────►│
                                          │
                                    PostgreSQL / SQLite
                                    (operation log + snapshots)
```

---

## The CRDT Engine

### Why CRDT?

Operational Transformation (OT), used by Google Docs, requires a **central server** to sequence and transform all operations before broadcasting them. This creates a bottleneck and makes offline editing hard.

CRDTs (Conflict-free Replicated Data Types) are mathematically guaranteed to converge to the same state on all replicas **without coordination** — operations can be applied in any order, any number of times, and the result is always the same.

### Algorithm: Replicated Growable Array (RGA)

RGA represents a sequence as a directed graph of nodes. Each node is an `RGANode`:

```typescript
interface RGANode {
  id: ID;               // globally unique (clientId, clock) pair
  char: string;         // the character this node represents
  deleted: boolean;     // tombstone flag — never truly removed
  leftOrigin: ID | null;  // the node to the left at insertion time
  rightOrigin: ID | null; // the node to the right at insertion time
}
```

**Insert algorithm:**

1. Increment the client's logical clock.
2. Capture the left and right neighbours at the target position (`leftOrigin`, `rightOrigin`).
3. Create an `RGANode` with the new unique ID and both origin pointers.
4. Call `integrate(node)` — add the node to the graph.
5. Emit the node as a CRDT operation to the network.

**Linearization (toString):**

The in-memory graph is linearized lazily on every `toString()` call:

1. Collect all non-deleted nodes.
2. Sort by `leftOrigin` key, then by ID for nodes sharing the same left origin.
3. Join characters.

The sort is deterministic on all replicas because IDs are globally unique and ordered by `(clientId, clock)`. **Lower `clientId` wins** when two nodes share the same `leftOrigin`.

**Delete algorithm:**

Deletion sets `deleted = true` on the target node (a **tombstone**). The node stays in the graph indefinitely. This ensures that a concurrent insert adjacent to a concurrently deleted node is still correctly positioned — the causal ancestry is preserved.

### Convergence Properties

The test suite (`packages/core/src/document.test.ts`) contains explicit proofs of the three CRDT guarantees:

| Property | Meaning | Test |
|---|---|---|
| **Commutativity** | `apply(A, B) == apply(B, A)` | Out-of-order delivery test |
| **Idempotence** | `apply(A, A) == apply(A)` | Duplicate op delivery test |
| **Associativity** | Merging sets in any order gives the same result | `mergeSiteState` commutativity test |

---

## WebSocket Sync Protocol

All real-time synchronisation goes through `SyncService` (`apps/sync-server/src/websocket/sync.ts`), which wraps a Socket.io server.

### Room model

Each document has a **Socket.io room** identified by `documentId`. When a client joins a document, it:

1. Emits `join-document { documentId, clientId }` to the server.
2. The server loads the snapshot + all operations since creation from the DB.
3. The server emits `initial-state { snapshot, operations, serverTime }` to the joining client.
4. The server emits `presence-sync [existing clients]` so the new client knows who is already in the room.
5. The server broadcasts `user-joined` to all other clients in the room.

### Operation broadcast

When a client makes a local edit:

1. The CRDT engine produces an `RGANode`.
2. The client emits `crdt-op { documentId, op }` to the server.
3. The server persists the operation to the database.
4. The server broadcasts `crdt-op { op, fromClientId }` to all **other** clients in the room (not back to the sender).
5. Each receiving client calls `doc.applyRemoteOp(op)` on its local CRDT instance and re-renders.

The sender's local CRDT is already updated, so it does not need to apply its own op again. This is the standard optimistic-local-apply pattern.

### Cursor presence

Clients emit `cursor-move { documentId, offset }` on every key/click event. The server broadcasts `cursor-update { clientId, offset }` to the room. Each client renders a coloured cursor overlay at the reported offset.

---

## Persistence Layer

### Dual-database adapter

`apps/sync-server/src/persistence/db.ts` exposes a unified `query(sql, params)` function that transparently routes to either PostgreSQL or SQLite depending on whether `DATABASE_URL` is set.

The SQLite path translates PostgreSQL syntax at query time:
- `NOW()` → `CURRENT_TIMESTAMP`
- `$1, $2, ...` placeholders → `?`
- JSONB columns → serialised JSON strings, deserialised on read

This means all application code uses PostgreSQL-style SQL — a single dialect, two runtimes.

### Schema

```
users
  id, email, password_hash, created_at

documents
  id (text PK), owner_id (FK), title, snapshot (JSONB), share_token, updated_at

operations
  id, document_id (FK), op (JSONB), client_id, clock, created_at

document_shares
  id, document_id (FK), shared_with (FK nullable), share_token, permission, created_at
```

See [DATABASE.md](DATABASE.md) for full schema documentation.

### Snapshot compaction

`SyncService.compactSnapshot(documentId)` reconstructs the current document state from all operations and writes it back to `documents.snapshot`. This can be called periodically (e.g. from a cron job) to cap the number of operations that need to be replayed on join.

After compaction, `getOperationsSince` can be called with a `since` timestamp equal to the snapshot time to fetch only the delta since the last snapshot.

---

## Authentication Model

- **Signup**: email + bcrypt-hashed password (`cost=10`) stored in `users`.
- **Login**: bcrypt compare → JWT signed with `JWT_SECRET` (HS256, 7-day expiry).
- **Protected routes**: `requireAuth` Fastify preHandler validates the `Authorization: Bearer <token>` header.
- **WebSocket auth**: Currently not enforced at the Socket.io connection level — clients must authenticate via REST before joining a document. Hardening the WebSocket handshake (passing the JWT during the Socket.io connection upgrade) is on the roadmap.

---

## Time-Travel Reconstruction

`GET /documents/:id/reconstruct?at=<ISO8601>` replays the operation log for a document up to the given timestamp:

```typescript
// documentService.ts
async reconstructDocumentAt(docId: string, targetTime: Date): Promise<string> {
  const ops = await query(
    `SELECT op FROM operations WHERE document_id = $1 AND created_at <= $2 ORDER BY created_at ASC`,
    [docId, targetTime]
  );
  const doc = new RgaDocument(999);
  for (const row of ops.rows) {
    doc.applyRemoteOp(row.op);
  }
  return doc.toString();
}
```

Because the operation log is append-only and operations are causally ordered by `created_at`, replaying up to any timestamp yields the exact document state at that point in time — a property that falls directly out of the CRDT's idempotence guarantee.

---

## Design Decisions

| Decision | Rationale |
|---|---|
| Custom RGA vs. Yjs | Demonstrates deep understanding of CRDT internals. Yjs is a better choice for production; RGA from scratch is a better choice for a learning project. |
| SQLite fallback | Eliminates the "I need to set up PostgreSQL first" friction for first-time contributors. Zero external dependencies in development. |
| Tombstone deletions | Simpler than proper GC; sufficient for a text editor where documents are typically small enough that tombstone accumulation is not a problem in practice. |
| Fastify over Express | Schema-based request validation, better TypeScript support, measurably faster request handling. |
| `(clientId, clock)` IDs | Lamport-clock-style IDs are cheap to generate, globally unique within the system, and trivially orderable — ideal for a tie-breaking CRDT. |

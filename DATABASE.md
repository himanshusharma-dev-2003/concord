# Database

This document covers the Concord database schema, indexing strategy, dual-database adapter, and operational notes.

---

## Database Strategy

Concord uses a **dual-database adapter** (`apps/sync-server/src/persistence/db.ts`) that supports both PostgreSQL and SQLite.

| Mode | When | Use case |
|---|---|---|
| **PostgreSQL** | `DATABASE_URL` is set and reachable | Production, staging |
| **SQLite** | `DATABASE_URL` unset or connection fails | Local development, demos |

All application code writes standard PostgreSQL SQL. The adapter translates to SQLite syntax at runtime:

- `$1, $2, ...` → `?` positional parameters
- `NOW()` → `CURRENT_TIMESTAMP`
- `JSONB` columns → serialised JSON strings, auto-parsed on read

This means **no separate code paths** for the two databases — the application logic is identical.

---

## Schema

### `users`

```sql
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

| Column | Type | Notes |
|---|---|---|
| `id` | integer | Auto-incrementing primary key |
| `email` | text | Unique, used as login identity |
| `password_hash` | text | bcrypt hash (cost factor 10) |
| `created_at` | timestamptz | Account creation time |

---

### `documents`

```sql
CREATE TABLE IF NOT EXISTS documents (
    id          TEXT PRIMARY KEY,
    owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT 'Untitled Document',
    snapshot    JSONB,
    share_token TEXT UNIQUE,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

| Column | Type | Notes |
|---|---|---|
| `id` | text | Application-generated ID (`doc_<timestamp>_<random>`) |
| `owner_id` | integer | FK → `users.id` |
| `title` | text | Editable document name |
| `snapshot` | JSONB | Compacted `RGANode[]` array, `null` until first compaction |
| `share_token` | text | Unique token for link sharing, `null` if not shared |
| `updated_at` | timestamptz | Updated on every snapshot write |

---

### `operations`

```sql
CREATE TABLE IF NOT EXISTS operations (
    id          SERIAL PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    op          JSONB NOT NULL,
    client_id   INTEGER NOT NULL,
    clock       INTEGER NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

| Column | Type | Notes |
|---|---|---|
| `id` | integer | Auto-incrementing |
| `document_id` | text | FK → `documents.id` |
| `op` | JSONB | Full `RGANode` as JSON |
| `client_id` | integer | The `clientId` field of the RGA node ID |
| `clock` | integer | The `clock` field of the RGA node ID |
| `created_at` | timestamptz | Server-assigned timestamp; used for time-travel ordering |

The operations table is an **append-only log**. Operations are never updated or deleted (cascade deletes apply only when the parent document is deleted).

---

### `document_shares`

```sql
CREATE TABLE IF NOT EXISTS document_shares (
    id            SERIAL PRIMARY KEY,
    document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    shared_with   INTEGER REFERENCES users(id) ON DELETE CASCADE,
    share_token   TEXT UNIQUE,
    permission    TEXT NOT NULL DEFAULT 'read',
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

| Column | Type | Notes |
|---|---|---|
| `shared_with` | integer | FK → `users.id`; `null` means the link is public |
| `share_token` | text | Random token used in share URLs |
| `permission` | text | `'read'` or `'edit'` |

---

## Indexes

```sql
CREATE INDEX idx_operations_document_created ON operations(document_id, created_at);
CREATE INDEX idx_documents_owner             ON documents(owner_id);
CREATE INDEX idx_document_shares_token       ON document_shares(share_token);
```

| Index | Purpose |
|---|---|
| `idx_operations_document_created` | Efficient operation log retrieval ordered by time (used on every document join and time-travel query) |
| `idx_documents_owner` | Fast `listUserDocuments` query |
| `idx_document_shares_token` | Fast share link resolution |

---

## Snapshot Compaction

As a document accumulates operations, joining a room requires replaying the full operation log from the beginning. Snapshot compaction bounds this cost.

`SyncService.compactSnapshot(documentId)`:

1. Calls `reconstructCurrentState(documentId)` — replays all operations.
2. Writes the resulting `RGANode[]` array to `documents.snapshot`.

On the next join, `getOperationsSince` can be called with a `since` timestamp to fetch only the delta after the snapshot was written, reducing replay work.

**Current status:** Compaction is available as a public method on `SyncService` but is not scheduled automatically. A cron job or manual trigger is required. Scheduling is on the roadmap.

---

## Initialization

### PostgreSQL

```bash
createdb crdt_editor
psql -U postgres -d crdt_editor -f apps/sync-server/src/persistence/schema.sql
```

### SQLite

No action required. The schema is created automatically in `crdt_editor.db` on first run.

---

## Operational Notes

- The operations table will grow indefinitely without compaction. For a demo workload this is fine; for a production deployment, schedule regular snapshot compaction.
- `documents.updated_at` is only updated during snapshot writes, not on every operation. It is therefore a coarse recency signal rather than a precise last-edit timestamp.
- The `share_token` column on `documents` is a legacy field from an earlier design. The canonical share mechanism uses the `document_shares` table.

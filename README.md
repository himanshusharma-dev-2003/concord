# Concord

A local-first, collaborative text editor powered by a custom CRDT engine.

## Why it's interesting
Concord implements Replicated Growable Arrays (RGA) and conflict-free replicated data types from scratch to handle real-time document synchronization. Instead of relying on central authority for conflict resolution, operations naturally converge across all connected clients, enabling true offline-first capabilities and seamless peer-to-peer merging.

## Architecture

```mermaid
graph TD
    subgraph "concord-text (React Frontend)"
        UI[Editor UI]
        Sync[WebSocket Client]
        Doc[RGA Document Instance]
        UI <-->|Local Edits / Re-renders| Doc
        Doc <-->|Generate / Apply Ops| Sync
    end

    subgraph "concord-core (CRDT Engine)"
        RGA[OrderedSequence (RGA)]
        Map[CRDTMap (Metadata)]
    end

    subgraph "concord-sync-server (Fastify Backend)"
        WSS[Socket.io Server]
        DB[(PostgreSQL / SQLite)]
        WSS -->|Broadcast Ops| Clients
        WSS <-->|Persist Snapshots| DB
    end

    Doc --> RGA
    Doc --> Map
    Sync <-->|CRDT Operations| WSS
```

## Tech Stack
- **Engine:** TypeScript, Yjs-style RGA structures
- **Backend:** Node.js, Fastify, Socket.io, PostgreSQL/SQLite
- **Frontend:** React, Vite, Lucide Icons
- **Tooling:** npm workspaces

## Setup Instructions

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Initialize Database (Optional if using SQLite):**
   Ensure PostgreSQL is running, then create the database and run the schema:
   ```bash
   createdb crdt_editor
   npm run db:init --workspace=concord-sync-server
   ```
   *Note: If no PostgreSQL connection is provided, it falls back to a local SQLite database (`crdt_editor.db`).*

3. **Start the development servers:**
   ```bash
   npm run dev
   ```
   This command starts both the sync server (port 3002) and the text editor (port 5173).

## Folder Structure

```text
concord/
├── packages/
│   └── core/              # concord-core: CRDT engine implementation (RGA, Map)
└── apps/
    ├── text-editor/       # concord-text: React frontend
    └── sync-server/       # concord-sync-server: Node.js/Fastify sync and persistence layer
```

## Out of Scope
- **Rich Text Formatting:** The engine currently focuses strictly on plain text convergence and operational consistency. Complex block formatting (like Notion) introduces mapping complexities that distract from the core CRDT demonstration.
- **Access Control:** All users can currently view and edit all documents. Granular permissions are omitted to keep the sync protocol lightweight and focused on state reconciliation.

# Roadmap

This document describes planned improvements to Concord, organised by timeframe and theme.

> Items marked ⭐ are the highest-value improvements from an engineering standpoint.

---

## Near-Term

### CRDT Engine

- **⭐ Run-length encoding** — Consecutive characters from the same client can be grouped into a single `RGANode` with a `length` field, reducing node count by ~10×–100× for typical typing patterns.
- **Tombstone garbage collection** — Implement a GC protocol using vector clocks to safely remove tombstones once all peers have acknowledged a deletion.
- **`findNextVisible` O(n) → linked list** — The current `findNextVisible` scans all nodes. Maintaining an explicit linked list (or skip list) would make traversal O(1) per step.

### Sync Server

- **⭐ WebSocket authentication** — Validate the JWT during the Socket.io connection upgrade (pass token as a query param or handshake auth object). Currently the WS layer trusts the `clientId` asserted by the client.
- **Automatic snapshot compaction** — Schedule `SyncService.compactSnapshot` with a configurable interval (e.g. every 100 operations per document).
- **Rate limiting** — Apply `fastify-rate-limit` to the auth endpoints to prevent brute-force attacks.
- **Input validation** — Add JSON Schema validation to all Fastify routes using Fastify's built-in `schema` option.

### Frontend

- **⭐ Offline queue** — Buffer local CRDT operations while disconnected and replay them in order on reconnect.
- **Keyboard shortcuts** — Cmd+S to export, Cmd+Z/Y for undo/redo (requires an operation history stack).
- **Document rename** — Persist title changes to the server via a `PATCH /documents/:id` endpoint.

---

## Mid-Term

- **Awareness protocol** — Share user display names and avatar colours via the server rather than deriving them from `clientId`.
- **Share link expiry** — Add an `expires_at` column to `document_shares` and reject expired tokens at the API layer.
- **Token refresh** — Implement JWT refresh tokens to allow sessions longer than 7 days without re-authentication.
- **⭐ Operation log pagination** — Cap the number of operations returned on `join-document` and implement a catch-up protocol for clients that have been offline for a long time.
- **Export** — `GET /documents/:id/export?format=txt` endpoint.

---

## Long-Term

- **Vector clocks** — Replace the `created_at`-based ordering with a true vector clock per client for causal consistency without relying on server timestamps.
- **Peer-to-peer mode** — Replace the central relay server with a WebRTC-based P2P mesh using the same CRDT engine.
- **Binary encoding** — Replace JSON operation serialisation with a compact binary format (e.g. MessagePack or a custom wire format) to reduce bandwidth.
- **Fuzzer** — Build a property-based fuzzer that generates random sequences of concurrent operations across N clients and verifies convergence.
- **Collaborative cursors with names** — Display collaborator names (not just IDs) next to remote cursors.

---

## Out of Scope (permanent)

- **Rich text** — Block-level formatting significantly complicates the CRDT mapping. This is a deliberate scope boundary.
- **File attachments** — Out of scope for a text-focused editor.

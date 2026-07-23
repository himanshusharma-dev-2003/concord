# API Reference

Concord exposes a REST API for authentication and document management, and a Socket.io interface for real-time synchronization.

---

## Base URL

| Environment | URL |
|---|---|
| Local development | `http://localhost:3001` |
| Production | Your deployed backend URL |

---

## Authentication

All protected endpoints require a `Bearer` token in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

Tokens are obtained from `POST /auth/login` and expire after **7 days**.

---

## REST Endpoints

### `POST /auth/signup`

Register a new user account.

**Request body**

```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response `200`**

```json
{
  "user": {
    "id": 1,
    "email": "user@example.com"
  }
}
```

**Errors**

| Code | Reason |
|---|---|
| `400` | Missing fields or email already registered |

---

### `POST /auth/login`

Authenticate and receive a JWT.

**Request body**

```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response `200`**

```json
{
  "user": {
    "id": 1,
    "email": "user@example.com"
  },
  "token": "<jwt>"
}
```

**Errors**

| Code | Reason |
|---|---|
| `400` | Missing fields |
| `401` | Invalid credentials |

---

### `GET /documents` 🔒

List all documents owned by the authenticated user, ordered by most recently updated.

**Response `200`**

```json
[
  {
    "id": "doc_1721234567890_abc123",
    "owner_id": 1,
    "title": "Meeting Notes",
    "snapshot": null,
    "updated_at": "2024-07-18T10:30:00Z"
  }
]
```

---

### `POST /documents` 🔒

Create a new document.

**Request body**

```json
{
  "title": "My Document",
  "id": "custom-id-optional"
}
```

If `id` is omitted, a unique ID is generated (`doc_<timestamp>_<random>`).

**Response `200`** — the created document record.

---

### `GET /documents/:id` 🔒

Fetch a specific document. Requires that the authenticated user is the owner or has a share entry.

**Response `200`** — the document record, or `403 Access denied`.

---

### `POST /documents/:id/share` 🔒

Generate a shareable link for a document.

**Request body**

```json
{
  "permission": "edit"
}
```

`permission` is `"read"` or `"edit"` (default: `"edit"`).

**Response `200`**

```json
{
  "shareToken": "share_1721234567890_xyz789",
  "url": "/join?token=share_1721234567890_xyz789"
}
```

---

### `GET /documents/:id/reconstruct?at=<ISO8601>` 🔒

Replay the operation log for document `:id` up to the given timestamp and return the reconstructed text.

**Query parameters**

| Param | Required | Description |
|---|---|---|
| `at` | Yes | ISO 8601 datetime (e.g. `2024-07-18T10:30:00Z`) |

**Response `200`**

```json
{
  "documentId": "doc_1721234567890_abc123",
  "at": "2024-07-18T10:30:00.000Z",
  "text": "Hello, world!"
}
```

**Errors**

| Code | Reason |
|---|---|
| `400` | Missing or invalid `at` parameter |
| `500` | Reconstruction failed |

---

### `GET /join?token=<token>`

Resolve a share token (no authentication required).

**Response `200`**

```json
{
  "document": { "id": "...", "title": "...", "snapshot": null, "updated_at": "..." },
  "permission": "edit",
  "shareToken": "share_..."
}
```

**Errors** — `400` missing token, `404` invalid token.

---

### `GET /health`

Health check endpoint (no authentication).

**Response `200`**

```json
{ "status": "ok", "timestamp": "2024-07-18T10:30:00.000Z" }
```

---

## WebSocket (Socket.io)

Connect to the same base URL. Concord uses the `websocket` transport by default.

```typescript
import { io } from 'socket.io-client';
const socket = io('http://localhost:3001', { transports: ['websocket'] });
```

### Client → Server events

#### `join-document`

Join a document room and receive the current state.

```typescript
socket.emit('join-document', {
  documentId: string,
  clientId: number,  // your user.id from the auth response
});
```

#### `crdt-op`

Send a CRDT operation (insert or delete node) to be persisted and broadcast.

```typescript
socket.emit('crdt-op', {
  documentId: string,
  op: RGANode,  // as returned by doc.insert() or doc.delete()
});
```

#### `cursor-move`

Broadcast your cursor position to other clients in the room.

```typescript
socket.emit('cursor-move', {
  documentId: string,
  offset: number,  // character offset from the start of the document
});
```

---

### Server → Client events

#### `initial-state`

Sent to a client immediately after `join-document`. Contains the full document state.

```typescript
socket.on('initial-state', (data: {
  documentId: string;
  snapshot: RGANode[] | null;  // compacted snapshot (may be null)
  operations: RGANode[];       // all ops since last snapshot
  serverTime: string;          // ISO 8601
}) => { ... });
```

Apply `snapshot` first (if present), then all `operations` in order.

#### `crdt-op`

An operation broadcast from another client.

```typescript
socket.on('crdt-op', (data: {
  documentId: string;
  op: RGANode;
  fromClientId: number;
}) => {
  doc.applyRemoteOp(data.op);
});
```

#### `cursor-update`

Another client's cursor moved.

```typescript
socket.on('cursor-update', (data: {
  clientId: number;
  offset: number;
}) => { ... });
```

#### `presence-sync`

Sent once on join with the list of currently connected clients.

```typescript
socket.on('presence-sync', (users: Array<{
  clientId: number;
  socketId: string;
}>) => { ... });
```

#### `user-joined`

A new client joined the room.

```typescript
socket.on('user-joined', (user: { clientId: number; socketId: string }) => { ... });
```

#### `user-left`

A client disconnected from the room.

```typescript
socket.on('user-left', (user: { clientId: number; socketId: string }) => { ... });
```

#### `error`

An error occurred processing a client request.

```typescript
socket.on('error', (err: { message: string }) => { ... });
```

---

## Error Response Format

All REST error responses use a consistent shape:

```json
{
  "error": "Human-readable error message"
}
```

# Security

This document describes the security model of Concord, known limitations, and how to report vulnerabilities.

---

## Authentication

| Mechanism | Implementation | Notes |
|---|---|---|
| Password hashing | bcrypt, cost factor **10** | ~100ms per hash on a modern CPU |
| Session tokens | JWT (HS256), signed with `JWT_SECRET` | 7-day expiry |
| Token transmission | `Authorization: Bearer <token>` header | Standard HTTP auth scheme |

### JWT configuration

The `JWT_SECRET` environment variable must be set to a cryptographically random value in production:

```bash
openssl rand -hex 32
```

> **The server will log a warning at startup** if `JWT_SECRET` is unset or is the default value (`dev-secret-change-in-production`) when `NODE_ENV=production`.

Tokens currently have a fixed 7-day expiry with no refresh mechanism. Logout on the client side simply discards the token from memory (there is no server-side token revocation list in the current implementation).

---

## CORS

CORS is configured via the `CORS_ORIGIN` environment variable:

```env
CORS_ORIGIN=https://concord.example.com
```

If `CORS_ORIGIN` is not set, the server defaults to `*` (all origins). This is acceptable for local development but **must be set in production**.

---

## Transport Security

- Use HTTPS and WSS in production. Concord itself does not terminate TLS — this should be handled by your reverse proxy (nginx, Caddy, etc.) or your hosting platform.
- Socket.io connections use the `websocket` transport exclusively (no long-polling fallback enabled).

---

## Known Limitations

| Limitation | Status |
|---|---|
| No rate limiting on auth endpoints | Known gap — brute-force attacks on `/auth/login` are possible. Mitigation: deploy behind a rate-limiting proxy (e.g. nginx `limit_req`, Cloudflare). |
| WebSocket connections are not authenticated | JWT validation happens at the REST layer. A client that obtains a valid document ID could connect to the WebSocket room without a token. Hardening the Socket.io handshake is on the roadmap. |
| No token revocation | Signing out does not invalidate issued JWTs. Tokens remain valid until expiry. |
| `share_token` not time-limited | Share links do not expire. Expiry-based sharing is on the roadmap. |
| Tombstones are never GC'd | Deleted characters remain in memory and in the database indefinitely. For typical document sizes this is not a problem, but it is a potential DoS vector if a client inserts and deletes a very large number of characters. |

---

## Responsible Disclosure

If you discover a security vulnerability, please **do not open a public GitHub issue**.

Email: [your contact email]

Please include:
- A description of the vulnerability
- Steps to reproduce
- Your assessment of impact

You can expect a response within 72 hours.

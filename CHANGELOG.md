# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- `ARCHITECTURE.md` — deep technical documentation of the CRDT algorithm, sync protocol, and persistence layer
- `API.md` — full REST and Socket.io API reference
- `DATABASE.md` — schema documentation, indexing strategy, and operational notes
- `SECURITY.md` — auth model, known limitations, and responsible disclosure process
- `ROADMAP.md` — near/mid/long-term engineering improvements
- `CONTRIBUTING.md` — developer setup, branching strategy, and PR guidelines
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) — builds core, runs CRDT tests, type-checks all packages
- GitHub issue templates for bug reports and feature requests
- GitHub pull request template
- `CORS_ORIGIN` and `JWT_SECRET` to `.env.example` with inline documentation
- Meta description and Open Graph tags to `index.html`
- In-component toast notification in the editor (replaces `alert()`)
- Input validation for the `at` query parameter in the time-travel endpoint

### Changed
- `server.ts` — removed debug `preHandler` hook that logged `Authorization` headers
- `server.ts` — replaced inline `require('./middleware/auth')` with the top-level import
- `server.ts` — startup warning if `JWT_SECRET` is the default value in `NODE_ENV=production`
- `server.ts` — CORS origin is now configurable via `CORS_ORIGIN` environment variable
- `authService.ts` — removed `require()` escape hatch in `verifyToken`; uses direct import
- Root `package.json` — updated scripts to use `pnpm` consistently; added `dev`, `test` scripts
- `index.html` — descriptive `<title>` tag

### Removed
- `apps/text-editor/src/App.js` — duplicate of `App.tsx`
- `apps/text-editor/src/main.js` — duplicate of `main.tsx`
- `apps/text-editor/src/components/AuthForm.js` — duplicate of `AuthForm.tsx`
- `apps/text-editor/src/components/DocumentList.js` — duplicate of `DocumentList.tsx`
- `apps/text-editor/src/components/Editor.js` — duplicate of `Editor.tsx`

---

## [0.1.0] — Initial release

### Added
- `concord-core` — from-scratch RGA CRDT engine
  - `RgaDocument` with `insert`, `delete`, `applyRemoteOp`, `mergeSiteState`, `toString`
  - Full convergence property test suite (12 tests)
- `concord-sync-server` — Fastify + Socket.io sync server
  - JWT authentication (signup / login)
  - Document CRUD API
  - Document sharing via tokens
  - Real-time CRDT operation broadcast
  - Presence system (cursor tracking, avatar stack)
  - Time-travel document reconstruction
  - Dual-database persistence (PostgreSQL + SQLite fallback)
- `concord-text` — React + Vite collaborative editor frontend
  - `contenteditable` editor with CRDT integration
  - Authentication forms (login / signup)
  - Document list with creation
  - Remote cursor rendering
  - Command palette (Cmd+K)
  - Connection status indicator

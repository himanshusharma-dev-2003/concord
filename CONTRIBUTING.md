# Contributing to Concord

Thank you for your interest in contributing. This document explains how to set up your development environment, run tests, and submit changes.

---

## Development Setup

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- PostgreSQL ≥ 14 *(optional — SQLite fallback works out of the box)*

### Install

```bash
git clone https://github.com/himanshusharma-dev-2003/concord.git
cd concord
pnpm install
```

### Configure environment

```bash
cp apps/sync-server/.env.example apps/sync-server/.env
# Edit apps/sync-server/.env — at minimum set JWT_SECRET
```

### Start development servers

```bash
pnpm dev
```

This starts both the sync server (port `3001`) and the Vite dev server (port `5173`) in parallel.

---

## Running Tests

```bash
pnpm test
```

Tests are in `packages/core/src/document.test.ts` and run with Vitest.

To run in watch mode during development:

```bash
pnpm --filter concord-core run test
```

---

## Type Checking

```bash
pnpm --filter concord-core exec tsc --noEmit
pnpm --filter concord-sync-server exec tsc --noEmit
pnpm --filter concord-text exec tsc --noEmit
```

---

## Project Structure

See [README.md](README.md#folder-structure) for a full breakdown of every directory.

Key locations for contributors:

| What you want to change | Where |
|---|---|
| CRDT algorithm | `packages/core/src/document.ts` |
| CRDT tests | `packages/core/src/document.test.ts` |
| WebSocket sync protocol | `apps/sync-server/src/websocket/sync.ts` |
| REST API routes | `apps/sync-server/src/services/` |
| Database queries | `apps/sync-server/src/persistence/db.ts` |
| Frontend editor | `apps/text-editor/src/components/Editor.tsx` |
| Styles | `apps/text-editor/src/index.css` |

---

## Branching Strategy

- `main` — stable, deployable branch
- Feature branches: `feature/<short-description>`
- Bug fixes: `fix/<short-description>`

Please open an issue before starting work on a large change, so we can align on the approach.

---

## Pull Request Guidelines

1. Keep PRs focused — one concern per PR.
2. All existing tests must pass.
3. Add tests for new behaviour in `concord-core`.
4. TypeScript type-check must pass for all packages.
5. Use the PR template provided in `.github/pull_request_template.md`.

---

## Commit Style

Use short, imperative subject lines:

```
feat: add snapshot compaction scheduler
fix: correct tombstone handling in findNextVisible
docs: add API reference for /join endpoint
refactor: extract cursor logic to useCursor hook
test: add out-of-order delivery convergence proof
```

---

## Code Style

- TypeScript strict mode is enabled — no `any` without a comment explaining why.
- No unused imports or variables.
- Prefer explicit types over inferred types for public APIs.
- Comments should explain *why*, not *what*.

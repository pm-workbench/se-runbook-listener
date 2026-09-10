# SE Runbook listener service

Small Node/TypeScript API sitting between the runbook SPA and Postgres, so
the app never talks to the database directly. See `CLAUDE.md` at the repo
root for the identity/trust model this rests on — short version: it trusts
whatever `tenantId`/`userId`/email the app asserts, no signature to verify
any of it, accepted because nothing here is sensitive (progress + doc links).

## Endpoints

- `POST /progress/sync` — body `{tenantId, userId, userInfo, completed: string[]}`. Upserts the user, replaces their completed-item set.
- `GET /progress/:tenantId/:userId` — one user's completed item ids.
- `GET /users?tenantId=` — roster (**manager-only**, see below).
- `GET /users/:tenantId/:userId/progress` — one user's detail (**manager-only**).

## Manager access

`GET /users` and `GET /users/:tenantId/:userId/progress` require an
`X-Island-User-Email` header whose value is on the `MANAGER_EMAILS`
allowlist (comma-separated env var). Anyone else gets `403`.

To add/remove a manager: edit `MANAGER_EMAILS` in the Portainer stack's
environment variables and restart the container — no rebuild, no redeploy.

## Local dev

```
cp .env.example .env   # edit MANAGER_EMAILS to your own email
docker compose up --build
```

API on `http://localhost:8080`, throwaway Postgres alongside it. First
start runs `schema.sql` automatically (idempotent — fine on every restart).

## Deploying to your real Postgres via Portainer

You don't need `docker-compose.yml` for this — that file is dev-only, spinning
up its own Postgres. Use `portainer-stack.yml` instead, which points at
whatever `DATABASE_URL` you give it:

1. **Stacks → Add stack → Repository.** Point it at this repo (branch
   `main`), **Compose path**: `portainer-stack.yml`.
2. In the stack's **Environment variables** section, set:
   - `DATABASE_URL` — `postgres://<user>:<password>@<host>:<port>/<db>` for your existing Postgres
   - `MANAGER_EMAILS` — comma-separated list of manager emails
   - `CORS_ORIGIN` — leave unset for now (defaults to `*`); tighten to the app's real published origin once known
3. **Deploy the stack.** First boot runs the migration (`schema.sql`) against
   that database automatically, then starts serving.

If Postgres isn't reachable by container name (not on the same Docker
network as this stack), use the host machine's address + Postgres's
published port in `DATABASE_URL` instead.

## What's not done yet

- `CORS_ORIGIN` needs to move off `*` once the app's published origin is known.
- No rate limiting / request size limits — fine for a small internal team,
  revisit if that stops being true.
- The manager-allowlist model is flat (any listed manager sees every SE).
  `se_manager_claims` exists in the schema but is unused — that's where
  "a manager claims their own SEs" plugs in later without a migration.

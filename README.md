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

## HTTPS (self-signed)

The image bakes in a self-signed cert at build time (`CERT_SAN_IP` build
arg, defaults to `192.168.86.205` — see `portainer-stack.yml`), and
`src/server.ts` serves HTTPS whenever it finds one at `/app/certs`. This
exists because a page served over HTTPS (the published app, most likely)
can't call a plain HTTP API without the browser silently blocking it as
mixed content — self-signed HTTPS fixes that specific problem.

It does **not** make the connection "trusted" the way a real cert does.
Browsers reject unknown certs by default, so **every browser/device that
will use the app has to do this once**:

1. Visit `https://<host>:<port>/health` directly in that browser.
2. Click through the warning (Chrome: **Advanced → Proceed to \<host\> (unsafe)**; Firefox: **Advanced → Accept the Risk and Continue**).
3. That's it — that browser now trusts this cert for this host:port, and the app's own fetch calls to it will succeed from then on.

Skip that step and the app's connection-status dot just shows "not
connected" — same failure mode as an unreachable address, silent, nothing
crashes, but nothing syncs either.

If the service ever moves to a different host/IP, the cert has to be
rebuilt (`CERT_SAN_IP` is baked in, not read at runtime) and everyone
re-does the click-through for the new address.

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
No cert is baked in for this path, so it's always plain HTTP — fine, it's
only ever hit from `localhost` here.

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
   - `CERT_SAN_IP` — only if the service's address isn't `192.168.86.205` (the current default)
3. **Deploy the stack.** First boot runs the migration (`schema.sql`) against
   that database automatically, then starts serving over HTTPS (self-signed — see above).

If Postgres isn't reachable by container name (not on the same Docker
network as this stack), use the host machine's address + Postgres's
published port in `DATABASE_URL` instead.

**Redeploying after a Dockerfile/build-arg change:** Portainer doesn't
always rebuild automatically on "Update the stack" — look for a "Re-pull
image and rebuild" / "Force rebuild" option, or it may just reuse the old
image.

## What's not done yet

- `CORS_ORIGIN` needs to move off `*` once the app's published origin is known.
- No rate limiting / request size limits — fine for a small internal team,
  revisit if that stops being true.
- The manager-allowlist model is flat (any listed manager sees every SE).
  `se_manager_claims` exists in the schema but is unused — that's where
  "a manager claims their own SEs" plugs in later without a migration.

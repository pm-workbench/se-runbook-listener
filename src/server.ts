import express, { type NextFunction, type Request, type Response } from 'express'
import { pool } from './db.js'
import { isManagerEmail } from './managerAllowlist.js'

const app = express()
app.use(express.json())

// The published app runs on whatever origin Island's platform gives it —
// lock this down to that origin once known (CORS_ORIGIN env var); '*' is a
// permissive default so this isn't dead-on-arrival before that's known.
const corsOrigin = process.env.CORS_ORIGIN ?? '*'
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', corsOrigin)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Island-User-Email')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.get('/health', (_req, res) => res.json({ ok: true }))

// -- manager-only endpoints -------------------------------------------------

/** Requires `x-island-user-email` to be on the MANAGER_EMAILS allowlist.
 *  See managerAllowlist.ts for the trust model this rests on. */
function requireManager(req: Request, res: Response, next: NextFunction) {
  const email = req.header('x-island-user-email')
  if (!isManagerEmail(email)) {
    return res.status(403).json({ error: 'Not on the manager allowlist.' })
  }
  next()
}

app.get('/users', requireManager, async (req, res) => {
  const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined
  const { rows } = await pool.query(
    `select tenant_id, user_id, email, name, given_name, family_name, last_seen
       from se_users
      where $1::text is null or tenant_id = $1
      order by last_seen desc`,
    [tenantId ?? null],
  )
  res.json({ users: rows })
})

app.get('/users/:tenantId/:userId/progress', requireManager, async (req, res) => {
  const { tenantId, userId } = req.params
  const { rows } = await pool.query(
    `select item_id, completed_at from se_runbook_progress where tenant_id = $1 and user_id = $2`,
    [tenantId, userId],
  )
  res.json({ tenantId, userId, completed: rows.map((r) => r.item_id), completedAt: rows })
})

// -- self-service endpoints ---------------------------------------------
// Not gated by requireManager — any caller can read/write any tenantId +
// userId here, same "trust what's asserted" model as everywhere else in
// this app. The frontend only ever sends its own identity's tenantId/userId,
// but that's a convention, not something this service enforces.

interface SyncBody {
  tenantId: string
  userId: string
  userInfo?: { email?: string; name?: string; givenName?: string; familyName?: string }
  completed: string[]
}

app.post('/progress/sync', async (req, res) => {
  const body = req.body as Partial<SyncBody>
  if (!body.tenantId || !body.userId || !Array.isArray(body.completed)) {
    return res.status(400).json({ error: 'tenantId, userId, and completed[] are required.' })
  }
  const { tenantId, userId, userInfo, completed } = body as SyncBody

  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(
      `insert into se_users (tenant_id, user_id, email, name, given_name, family_name, last_seen)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (tenant_id, user_id) do update
         set email = excluded.email, name = excluded.name, given_name = excluded.given_name,
             family_name = excluded.family_name, last_seen = now()`,
      [tenantId, userId, userInfo?.email ?? null, userInfo?.name ?? null, userInfo?.givenName ?? null, userInfo?.familyName ?? null],
    )
    // Replace-not-merge: this sync is the frontend's full completed-set.
    await client.query(`delete from se_runbook_progress where tenant_id = $1 and user_id = $2`, [tenantId, userId])
    for (const itemId of completed) {
      await client.query(
        `insert into se_runbook_progress (tenant_id, user_id, item_id) values ($1, $2, $3)
         on conflict do nothing`,
        [tenantId, userId, itemId],
      )
    }
    await client.query('commit')
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }

  res.json({ ok: true, saved: completed.length })
})

app.get('/progress/:tenantId/:userId', async (req, res) => {
  const { tenantId, userId } = req.params
  const { rows } = await pool.query(
    `select item_id from se_runbook_progress where tenant_id = $1 and user_id = $2`,
    [tenantId, userId],
  )
  res.json({ tenantId, userId, completed: rows.map((r) => r.item_id) })
})

const port = Number(process.env.PORT ?? 8080)
app.listen(port, () => console.log(`se-runbook-listener listening on :${port}`))

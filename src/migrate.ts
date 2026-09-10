import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pool } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Applies schema.sql. Idempotent (the schema is all IF NOT EXISTS) — safe
 *  to run on every deploy, not just the first one. */
export async function migrate() {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8')
  await pool.query(sql)
  console.log('schema.sql applied')
  await pool.end()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

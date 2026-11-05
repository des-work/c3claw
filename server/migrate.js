import 'dotenv/config'
import { getPool, migrateDb } from './db.js'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for migration')
try {
  await migrateDb()
} finally {
  await getPool()?.end()
}

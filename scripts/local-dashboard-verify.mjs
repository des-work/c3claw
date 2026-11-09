// Local end-to-end verification: the real built Worker bundle, a real local D1,
// the real Discord channel, and the real built frontend. Nothing in either
// Cloudflare account is touched and no production data is read or written.
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare'
import { Store } from '/home/lrd_wrkmn/Documents/Codex/2026-11-02/i-h/work/c3claw/cloudflare/store.js'
import { syncDiscord } from '/home/lrd_wrkmn/Documents/Codex/2026-11-02/i-h/work/c3claw/cloudflare/discord.js'

const REPO = '/home/lrd_wrkmn/Documents/Codex/2026-11-02/i-h/work/c3claw'
const DIST = join(REPO, 'dist')
const PORT = 3001
const settings = JSON.parse(await readFile(
  '/home/lrd_wrkmn/Documents/Codex/Deliveries/Discord/Private/reader-settings.json', 'utf8'))

const bindings = {
  TELEMETRY_SOURCE: 'discord',
  SEMESTER_START_AT: settings.SEMESTER_START_AT,
  ALLOWED_CHANNELS: settings.ALLOWED_CHANNELS,
  DISCORD_SOURCE_POLICY_JSON: settings.DISCORD_SOURCE_POLICY_JSON,
  DISCORD_BOT_TOKEN: settings.DISCORD_BOT_TOKEN,
  EVENT_API_KEY: 'local-verification-only-not-a-production-key',
  RELEASE_ID: 'local-verification',
}

const options = convertV4MiniflareOptions({
  modules: true,
  scriptPath: join(REPO, '.cloudflare/output/v0/workers/default/bundle/index.js'),
  compatibilityDate: '2026-11-04', compatibilityFlags: ['nodejs_compat'],
  bindings, d1Databases: ['DB'], log: new Log(LogLevel.ERROR),
  // outboundService deliberately omitted: this run must reach Discord for real.
})
options.enableDevRegistry = false
const mf = new Miniflare(options)

const db = await mf.getD1Database('DB')
const sql = await readFile(join(REPO, 'cloudflare/migrations/0001_initial.sql'), 'utf8')
const statements = sql.replace(/^--.*$/gm, '').split(/(?=^CREATE )/m)
  .map(p => p.trim()).filter(p => p.startsWith('CREATE '))
await db.batch(statements.map(s => db.prepare(s)))
console.log(JSON.stringify({ step: 'migrated', schema_objects: statements.length }))

// Prefer the bundle's own scheduled handler so the deployed code path runs.
let ingestion
const scheduled = await mf.dispatchFetch('http://localhost/cdn-cgi/handler/scheduled')
if (scheduled.ok) {
  ingestion = { via: 'worker scheduled handler (built bundle)', http: scheduled.status }
} else {
  await syncDiscord(new Store(db), bindings)
  ingestion = { via: 'syncDiscord from source (bundle scheduled endpoint unavailable)', http: scheduled.status }
}
console.log(JSON.stringify({ step: 'ingested', ...ingestion }))

const json = async path => {
  const response = await mf.dispatchFetch(`http://localhost${path}`)
  return { path, status: response.status, body: await response.json() }
}
for (const path of ['/api/health', '/api/status', '/api/events?limit=20']) {
  console.log(JSON.stringify({ step: 'api', ...(await json(path)) }, null, 1))
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' }

createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`)
  if (url.pathname.startsWith('/api')) {
    const upstream = await mf.dispatchFetch(`http://localhost${url.pathname}${url.search}`,
      { method: request.method, headers: request.headers })
    response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json' })
    response.end(Buffer.from(await upstream.arrayBuffer()))
    return
  }
  let file = join(DIST, url.pathname === '/' ? 'index.html' : url.pathname.slice(1))
  try { if (!(await stat(file)).isFile()) throw new Error('not a file') }
  catch { file = join(DIST, 'index.html') }   // SPA fallback, matching the Worker's asset handling
  response.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' })
  createReadStream(file).pipe(response)
}).listen(PORT, '127.0.0.1', () =>
  console.log(JSON.stringify({ step: 'serving', url: `http://127.0.0.1:${PORT}` })))

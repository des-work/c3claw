// Reproduce the Worker's Discord read sequence inside the Workers runtime and
// surface the raw exception, which syncDiscord masks before it reaches logs.
// Read-only: GETs only, no writes, no posts, no checkpoint changes.
import { readFile } from 'node:fs/promises'
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare'

const settings = JSON.parse(await readFile(
  '/home/lrd_wrkmn/Documents/Codex/Deliveries/Discord/Private/dogpark-settings.json', 'utf8'))
const channelId = settings.ALLOWED_CHANNELS

// Mirrors cloudflare/discord.js discordGet + boundedJson exactly.
const script = `
const LIMIT = 1024 * 1024
async function boundedJson(response, label, maxBytes) {
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) throw new Error(label + ' exceeds the response limit')
    chunks.push(value)
  }
  const joined = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength }
  return { json: JSON.parse(new TextDecoder().decode(joined)), bytes: size }
}
async function step(path, env) {
  const started = Date.now()
  try {
    const response = await fetch('https://discord.com/api/v10' + path, {
      headers: { Authorization: 'Bot ' + env.DISCORD_BOT_TOKEN },
      redirect: 'manual', signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) {
      return { path, ok: false, http: response.status, ms: Date.now() - started,
               error: 'Discord read returned HTTP ' + response.status }
    }
    const { json, bytes } = await boundedJson(response, 'Discord response', LIMIT)
    return { path, ok: true, http: response.status, ms: Date.now() - started, bytes,
             isArray: Array.isArray(json), length: Array.isArray(json) ? json.length : undefined,
             value: json }
  } catch (error) {
    return { path, ok: false, ms: Date.now() - started,
             error: String(error && error.message || error), name: error && error.name }
  }
}
export default {
  async fetch(request, env) {
    const channel = env.CHANNEL_ID
    const out = { steps: [] }
    const me = await step('/users/@me', env)
    out.steps.push({ ...me, value: me.value ? { id: me.value.id, bot: me.value.bot } : undefined })
    if (!me.ok) return Response.json(out)
    const ch = await step('/channels/' + channel, env)
    out.steps.push({ ...ch, value: ch.value ? { id: ch.value.id, type: ch.value.type,
      guild_id: ch.value.guild_id, overwrites: (ch.value.permission_overwrites || []).length } : undefined })
    if (!ch.ok) return Response.json(out)
    const guild = ch.value.guild_id
    const member = await step('/guilds/' + guild + '/members/' + me.value.id, env)
    out.steps.push({ ...member, value: member.value ? { roles: member.value.roles,
      rolesIsArray: Array.isArray(member.value.roles) } : undefined })
    const roles = await step('/guilds/' + guild + '/roles', env)
    out.steps.push({ ...roles, value: undefined })
    const messages = await step('/channels/' + channel + '/messages?limit=1', env)
    out.steps.push({ ...messages, value: undefined })
    return Response.json(out)
  },
}
`

const options = convertV4MiniflareOptions({
  modules: true, script, modulesRoot: '/', scriptPath: '/diagnose.js',
  compatibilityDate: '2026-11-04', compatibilityFlags: ['nodejs_compat'],
  bindings: { DISCORD_BOT_TOKEN: settings.DISCORD_BOT_TOKEN, CHANNEL_ID: channelId },
  log: new Log(LogLevel.ERROR),
})
options.enableDevRegistry = false
const mf = new Miniflare(options)
try {
  const response = await mf.dispatchFetch('http://localhost/')
  const report = await response.json()
  for (const s of report.steps) {
    const tag = s.ok ? 'OK ' : 'FAIL'
    console.log(`${tag} ${s.path}  ${s.ms}ms` +
      (s.bytes !== undefined ? `  ${s.bytes}B` : '') +
      (s.length !== undefined ? `  len=${s.length}` : '') +
      (s.error ? `  ${s.name || 'Error'}: ${s.error}` : ''))
    if (s.value !== undefined) console.log('     ', JSON.stringify(s.value))
  }
} finally {
  await mf.dispose()
}

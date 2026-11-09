import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { discordConfiguration, discordPolicy, effectivePermissions, initialCursor } from '../cloudflare/discord.js'
import { topology } from '../cloudflare/worker.js'
import { parseDiscordTelemetry, authorizedDiscordSource } from '../shared/discord.js'
import { parseEvent } from '../shared/events.js'
import { boundedJson } from '../shared/backend-transport.js'

// Read-only: never posts a message, writes an event or changes permissions.
// Reports contain counts and fixed diagnostics, never tokens or message text.
export async function telemetryPreflight(env, { network = false, fetchFn = fetch } = {}) {
  const configuration = discordConfiguration(env)
  const report = { checked_at: new Date().toISOString(), mode: network ? 'read_only_network' : 'offline',
    configuration, inventory: {}, reader: { checked: false, channels: [] },
    production_delivery_verified: false,
    remaining_proof: ['A real approved publisher event must reach production exactly once.',
      'Machine status requires a separate reporter heartbeat; Discord chat is not a heartbeat.'] }
  try { initialCursor(env.SEMESTER_START_AT); report.semester_cutover_valid = true } catch { report.semester_cutover_valid = false }
  try {
    const teams = topology(env)
    report.inventory = { valid: true, teams: teams.length, machines: teams.reduce((sum, team) => sum + team.machines.length, 0),
      configured: Boolean(env.TOPOLOGY_JSON), host_mapping_verified: false }
  } catch { report.inventory = { valid: false, error: 'Invalid topology configuration; inspect privately.' } }
  report.event_write_secret_present = typeof env.EVENT_API_KEY === 'string' && Boolean(env.EVENT_API_KEY.trim())
  if (!network || !configuration.configured || !report.semester_cutover_valid) return report
  const { channels, sources } = discordPolicy(env)
  const get = async path => {
    let response
    try {
      response = await fetchFn(`https://discord.com/api/v10${path}`, {
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }, redirect: 'error', signal: AbortSignal.timeout(5000),
      })
    } catch { throw new Error('Discord network request failed or timed out; no state changed.') }
    if (!response.ok) throw new Error(response.status === 429 ? 'Discord HTTP 429; stopped checks. Retry later without changing checkpoints.' :
      `Discord HTTP ${response.status}; check the existing reader credential and scoped channel access.`)
    try { return await boundedJson(response, 'Discord response', 1024 * 1024) } catch {
      throw new Error('Discord response was invalid or oversized; inspect privately.')
    }
  }
  const guilds = new Map()
  try {
    const user = await get('/users/@me')
    if (!/^\d{15,22}$/.test(user.id) || user.bot !== true) throw new Error('The supplied credential did not identify a bot account.')
    report.reader.checked = true
    for (const id of channels) {
      const row = { channel_id: id, readable: false }
      report.reader.channels.push(row)
      const channel = await get(`/channels/${id}`)
      if (!/^\d{15,22}$/.test(channel.guild_id) || ![0, 5].includes(channel.type)) {
        row.error = 'Use a server text or announcement channel; private threads are not supported.'
        continue
      }
      if (!guilds.has(channel.guild_id)) {
        const member = await get(`/guilds/${channel.guild_id}/members/${user.id}`)
        const roles = await get(`/guilds/${channel.guild_id}/roles`)
        if (member.user?.id !== user.id || !Array.isArray(member.roles) || !Array.isArray(roles)) throw new Error('Invalid Discord permission response.')
        guilds.set(channel.guild_id, { member, roles })
      }
      const { member, roles } = guilds.get(channel.guild_id)
      const permissions = effectivePermissions(channel.guild_id, roles, member, channel)
      const read = (1n << 10n) | (1n << 16n)
      row.readable = Boolean(permissions & 8n) || (permissions & read) === read
      if (!row.readable) { row.error = 'Reader lacks effective View Channel and Read Message History.'; continue }
      const messages = await get(`/channels/${id}/messages?limit=20`)
      if (!Array.isArray(messages) || messages.length > 20) throw new Error('Invalid Discord message sample response.')
      row.sample = { total: messages.length, before_cutover: 0, empty_content: 0, non_telemetry: 0,
        malformed: 0, untrusted_source: 0, authorized_telemetry: 0 }
      const floor = BigInt(initialCursor(env.SEMESTER_START_AT))
      for (const message of messages) {
        if (!/^\d{15,22}$/.test(message.id) || typeof message.content !== 'string') throw new Error('Invalid Discord message sample response.')
        if (BigInt(message.id) <= floor) { row.sample.before_cutover++; continue }
        if (!message.content) { row.sample.empty_content++; continue }
        const payload = parseDiscordTelemetry(message.content)
        if (payload === null) row.sample.non_telemetry++
        else if (payload === false || !parseEvent(payload)) row.sample.malformed++
        else if (!authorizedDiscordSource(sources, { channelId: id, webhookId: message.webhook_id }, payload.team_id)) row.sample.untrusted_source++
        else row.sample.authorized_telemetry++
      }
      row.content_availability_verified = row.sample.total > row.sample.before_cutover + row.sample.empty_content
      // Nonempty unrelated chat is not proof of telemetry compatibility or intent settings.
      row.publisher_contract_observed = row.sample.authorized_telemetry > 0
    }
  } catch (error) {
    // Only our own fixed diagnostics reach output. Never emit upstream exception messages.
    const known = /^(Discord (HTTP \d+|network request|response)|The supplied credential|Invalid Discord)/
    report.reader.error = known.test(error.message) ? error.message : 'Reader validation failed; inspect configuration privately.'
  }
  report.reader.access_verified = !report.reader.error && report.reader.channels.length === channels.size &&
    report.reader.channels.every(row => row.readable && row.sample)
  return report
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.log('Read-only telemetry checks. Usage: npm run telemetry:check -- [--config /private/settings.json] [--network] [--report /private/report.json]')
    console.log('Settings JSON uses Worker environment keys. With no config file, reads process environment. No credentials or message bodies are printed. No live writes.')
    return
  }
  const options = {}
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]
    if (flag === '--network') options.network = true
    else if (['--config', '--report'].includes(flag) && args[index + 1] && !args[index + 1].startsWith('--')) options[flag.slice(2)] = args[++index]
    else throw new Error('Invalid arguments; use --help.')
  }
  let env = process.env
  if (options.config) {
    const raw = await readFile(options.config, 'utf8')
    if (Buffer.byteLength(raw) > 2 * 1024 * 1024) throw new Error('Configuration file exceeds 2 MiB.')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Configuration must be a JSON object.')
    env = parsed
  }
  const report = await telemetryPreflight(env, options)
  const encoded = JSON.stringify(report, null, 2)
  if (options.report) await writeFile(options.report, encoded + '\n', { mode: 0o600, flag: 'wx' })
  console.log(encoded)
  if (!report.configuration.configured || !report.semester_cutover_valid || !report.inventory.valid ||
      (options.network && !report.reader.access_verified)) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  main().catch(() => { console.error('Preflight failed. Check arguments, private JSON configuration and report path; no secrets are printed.'); process.exitCode = 1 })
}

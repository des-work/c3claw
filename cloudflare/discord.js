import { parseDiscordSources, parseDiscordTelemetry, authorizedDiscordSource } from '../shared/discord.js'
import { parseEvent } from '../shared/events.js'
import { boundedJson } from '../shared/backend-transport.js'

const SNOWFLAKE = /^\d{15,22}$/
const EPOCH = 1420070400000n
export function initialCursor(startAt) {
  const timestamp = Date.parse(startAt)
  if (!Number.isSafeInteger(timestamp) || timestamp < Number(EPOCH) || timestamp > Date.now() + 60_000) {
    throw new Error('SEMESTER_START_AT must be an explicit current or past ISO timestamp')
  }
  return ((BigInt(timestamp) - EPOCH) << 22n).toString()
}
export function discordPolicy(env) {
  const channels = new Set((env.ALLOWED_CHANNELS || '').split(',').map(x => x.trim()).filter(Boolean))
  if (!channels.size || channels.size > 100 || [...channels].some(id => !SNOWFLAKE.test(id))) {
    throw new Error('Configure 1-100 explicit Discord telemetry channel IDs')
  }
  if (!env.DISCORD_SOURCE_POLICY_JSON || env.DISCORD_SOURCE_POLICY_JSON.length > 1024 * 1024) {
    throw new Error('Configure DISCORD_SOURCE_POLICY_JSON with exact channel/webhook/team mappings')
  }
  let payload
  try { payload = JSON.parse(env.DISCORD_SOURCE_POLICY_JSON) } catch { throw new Error('Invalid Discord source policy JSON') }
  return { channels, sources: parseDiscordSources(payload, channels) }
}

// Validate each setting independently. A missing token must not imply that a
// source policy is also missing, or hide a policy error until credentials arrive.
export function discordConfiguration(env) {
  const required = ['DISCORD_BOT_TOKEN', 'ALLOWED_CHANNELS', 'DISCORD_SOURCE_POLICY_JSON']
  const missing = required.filter(name => typeof env[name] !== 'string' || !env[name].trim())
  let policyValid = false
  if (!missing.includes('ALLOWED_CHANNELS') && !missing.includes('DISCORD_SOURCE_POLICY_JSON')) {
    try { discordPolicy(env); policyValid = true } catch { /* Only expose a fixed diagnostic, never config values. */ }
  }
  return {
    configured: missing.length === 0 && policyValid,
    missing_settings: missing,
    policy_valid: policyValid,
    last_error: missing.length ? `Missing Discord settings: ${missing.join(', ')}` :
      !policyValid ? 'Discord source policy or channel configuration is invalid' : null,
  }
}
export function effectivePermissions(guildId, roles, member, channel) {
  const roleIds = new Set(member.roles)
  let permissions = roles.filter(role => role.id === guildId || roleIds.has(role.id))
    .reduce((bits, role) => bits | BigInt(role.permissions), 0n)
  if (permissions & 8n) return permissions // Administrator bypasses channel overrides.
  const overrides = channel.permission_overwrites || []
  const apply = overwrite => { permissions = (permissions & ~BigInt(overwrite.deny)) | BigInt(overwrite.allow) }
  const everyone = overrides.find(item => item.id === guildId && item.type === 0)
  if (everyone) apply(everyone)
  const assigned = overrides.filter(item => item.type === 0 && roleIds.has(item.id))
  const deny = assigned.reduce((bits, role) => bits | BigInt(role.deny), 0n)
  const allow = assigned.reduce((bits, role) => bits | BigInt(role.allow), 0n)
  permissions = (permissions & ~deny) | allow
  const own = overrides.find(item => item.type === 1 && item.id === member.user.id)
  if (own) apply(own)
  return permissions
}

async function discordGet(path, env, fetchFn) {
  const response = await fetchFn(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
    redirect: 'error', signal: AbortSignal.timeout(5_000),
  })
  if (response.status === 429) {
    const body = await boundedJson(response, 'Discord rate limit', 16_384)
    const error = new Error('Discord rate limited; durable checkpoint retained')
    error.retryAt = Date.now() + Math.min(Math.max(Number(body.retry_after) || 60, 1), 3600) * 1000
    error.globalRateLimit = body.global === true
    throw error
  }
  if (!response.ok) throw new Error(`Discord read returned HTTP ${response.status}; check bot membership and channel permissions`)
  return boundedJson(response, 'Discord response', 1024 * 1024)
}

async function checkReadPermissions(channelId, env, fetchFn, cache) {
  cache.user ||= await discordGet('/users/@me', env, fetchFn)
  const channel = await discordGet(`/channels/${channelId}`, env, fetchFn)
  if (!channel.guild_id || ![0, 5].includes(channel.type)) throw new Error('Telemetry requires a server text or announcement channel')
  const guildId = channel.guild_id
  if (!cache.guilds.has(guildId)) {
    const member = await discordGet(`/guilds/${guildId}/members/${cache.user.id}`, env, fetchFn)
    const roles = await discordGet(`/guilds/${guildId}/roles`, env, fetchFn)
    if (!Array.isArray(roles) || !Array.isArray(member.roles)) throw new Error('Invalid Discord permission response')
    cache.guilds.set(guildId, { member, roles })
  }
  const { member, roles } = cache.guilds.get(guildId)
  const permissions = effectivePermissions(guildId, roles, member, channel)
  const required = (1n << 10n) | (1n << 16n)
  if (!(permissions & 8n) && (permissions & required) !== required) {
    throw new Error('Bot needs effective View Channel and Read Message History permissions')
  }
}

function validateMessages(messages, channel) {
  if (!Array.isArray(messages) || messages.length > 100 || messages.some(message =>
    !SNOWFLAKE.test(message.id) || message.channel_id !== channel ||
    !Number.isInteger(message.type) || typeof message.content !== 'string' || message.content.length > 10_000)) {
    throw new Error('Malformed Discord message page; checkpoint retained')
  }
  return messages.sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0)
}

export async function pollChannel(store, env, row, sources, fetchFn = fetch) {
  const channel = row.channel_id
  if (!row.scan_head) {
    const latest = validateMessages(await discordGet(`/channels/${channel}/messages?limit=1`, env, fetchFn), channel)
    if (!latest.length || BigInt(latest[0].id) <= BigInt(row.message_id)) return { caughtUp: true }
    row.scan_head = latest[0].id
    row.scan_before = (BigInt(row.scan_head) + 1n).toString()
    row.scan_complete = 0
    await store.run('UPDATE discord_cursors SET scan_head=?, scan_before=?, scan_complete=0 WHERE channel_id=?',
      row.scan_head, row.scan_before, channel)
  }
  // Bound the scan and persist progress. A huge gap resumes next scheduled run.
  if (!row.scan_complete) {
    const messages = validateMessages(await discordGet(
      `/channels/${channel}/messages?limit=100&before=${row.scan_before}`, env, fetchFn), channel)
    if (messages.some(message => BigInt(message.id) >= BigInt(row.scan_before))) {
      throw new Error('Discord pagination did not move backward; checkpoint retained')
    }
    const relevant = messages.filter(message => BigInt(message.id) > BigInt(row.message_id) &&
      BigInt(message.id) <= BigInt(row.scan_head))
    const before = messages[0]?.id || row.scan_before
    row.scan_complete = messages.length < 100 || BigInt(before) <= BigInt(row.message_id) ? 1 : 0
    await store.stage(channel, relevant.map(message => ({
      id: message.id, channel_id: channel, webhook_id: message.webhook_id || null,
      type: message.type, content: message.content,
    })), before, Boolean(row.scan_complete))
    if (!row.scan_complete) return { caughtUp: false, phase: 'scanning' }
  }
  const pending = await store.rows('SELECT payload FROM discord_inbox WHERE channel_id=? ORDER BY message_key LIMIT 100', channel)
  const events = []
  const rejections = []
  let lastId = row.message_id
  for (const { payload: encoded } of pending) {
    const message = JSON.parse(encoded)
    lastId = message.id
    if (BigInt(message.id) <= BigInt(row.message_id)) continue
    if (![0, 19].includes(message.type)) continue
    if (!message.content) throw new Error('Unreadable message content; check Message Content intent before retrying')
    const payload = parseDiscordTelemetry(message.content)
    if (payload === null) continue
    const source = { channelId: channel, webhookId: message.webhook_id }
    let reason = payload === false ? 'Missing required telemetry fields' :
      !authorizedDiscordSource(sources, source, payload.team_id) ? 'Webhook/channel is not authorized for this team' : null
    const event = reason ? null : parseEvent({ ...payload, source_id: `discord:${message.id}`,
      timestamp: new Date(Number((BigInt(message.id) >> 22n) + EPOCH)).toISOString() })
    if (!event && !reason) reason = 'Invalid telemetry fields'
    if (reason) rejections.push({ id: message.id, reason, content: message.content.slice(0, 2000) })
    else events.push(event)
  }
  // Insert events, rejection receipts, checkpoint and queue deletion atomically.
  // A failed database batch keeps the previous checkpoint and inbox intact.
  if (pending.length) await store.commitDiscord(channel, events, rejections, lastId)
  if (pending.length === 100) return { caughtUp: false, phase: 'importing' }
  await store.run(`UPDATE discord_cursors SET message_id=?, scan_head=NULL, scan_before=NULL,
    scan_complete=0 WHERE channel_id=? AND
    (length(message_id)<length(?) OR (length(message_id)=length(?) AND message_id<=?))`,
  row.scan_head, channel, row.scan_head, row.scan_head, row.scan_head)
  return { caughtUp: true, imported: events.length, rejected: rejections.length }
}

export async function syncDiscord(store, env, fetchFn = fetch) {
  const { channels, sources } = discordPolicy(env)
  await store.ensureChannels([...channels], initialCursor(env.SEMESTER_START_AT))
  const global = await store.state('discord-rate-limit')
  if (global?.retryAt > Date.now()) return
  // More teams can share class telemetry channels. Extra channels rotate fairly.
  const rows = await store.rows(`SELECT * FROM discord_cursors WHERE channel_id IN
    (SELECT value FROM json_each(?)) AND retry_at<=?
    ORDER BY last_attempt IS NOT NULL, last_attempt, channel_id LIMIT 2`, JSON.stringify([...channels]), Date.now())
  const cache = { guilds: new Map() }
  for (const row of rows) {
    if (row.retry_at > Date.now()) continue
    await store.run('UPDATE discord_cursors SET last_attempt=? WHERE channel_id=?', new Date().toISOString(), row.channel_id)
    try {
      await checkReadPermissions(row.channel_id, env, fetchFn, cache)
      const result = await pollChannel(store, env, row, sources, fetchFn)
      await store.run(`UPDATE discord_cursors SET last_success=?, last_error=?, retry_at=0 WHERE channel_id=?`,
        result.caughtUp ? new Date().toISOString() : row.last_success,
        result.caughtUp ? null : `Backlog ${result.phase}; resumes next scheduled run`, row.channel_id)
    } catch (error) {
      const message = error.message.startsWith('Discord') || error.message.startsWith('Bot ') ||
        error.message.startsWith('Unreadable') || error.message.startsWith('Telemetry')
        ? error.message : 'Discord synchronization failed; checkpoint retained; inspect private logs'
      await store.run('UPDATE discord_cursors SET last_error=?, retry_at=? WHERE channel_id=?',
        message, error.retryAt || 0, row.channel_id)
      console.error(JSON.stringify({ process: 'discord-sync', channel_id: row.channel_id, error: message }))
      if (error.globalRateLimit) {
        await store.saveState('discord-rate-limit', { retryAt: error.retryAt })
        break
      }
    }
  }
}

export async function discordHealth(store, env) {
  if (env.TELEMETRY_SOURCE !== 'discord') return { enabled: false }
  const configuration = discordConfiguration(env)
  if (!configuration.configured) return { enabled: true, ...configuration }
  const policy = discordPolicy(env)
  const rows = await store.rows('SELECT last_success, last_error, scan_head FROM discord_cursors WHERE channel_id IN (SELECT value FROM json_each(?))',
    JSON.stringify([...policy.channels]))
  const times = rows.filter(row => row.last_success).map(row => Date.parse(row.last_success))
  return { enabled: true, configured: true, channels: policy.channels.size,
    synced_channels: times.length, oldest_sync: times.length ? new Date(Math.min(...times)).toISOString() : null,
    failed_channels: rows.filter(row => row.last_error).length,
    backlogged_channels: rows.filter(row => row.scan_head).length,
    last_error: rows.find(row => row.last_error)?.last_error || null }
}

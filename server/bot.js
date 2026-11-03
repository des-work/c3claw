import { Client, GatewayIntentBits } from 'discord.js'
import { getPool, getDiscordCursor, saveDiscordCursor, recordDiscordRejection } from './db.js'

const MESSAGE_PREFIX = '[OCRT]'
const botState = { connected: false, last_sync: null, last_error: null, channels: 0 }
const channelSync = new Map()
const channelErrors = new Map()

export function getBotHealth() {
  const syncTimes = [...channelSync.values()]
  return { ...botState, enabled: Boolean(process.env.DISCORD_BOT_TOKEN),
    synced_channels: channelSync.size,
    oldest_sync: syncTimes.length ? new Date(Math.min(...syncTimes)).toISOString() : null,
    failed_channels: channelErrors.size }
}

export function parseDiscordTelemetry(content) {
  if (!content.startsWith(MESSAGE_PREFIX)) return null
  const parts = content.slice(MESSAGE_PREFIX.length).trim().split('|').map(part => part.trim())
  if (parts.length < 4 || parts.slice(0, 4).some(part => !part)) return false
  const [team_id, tool, target, result, ...details] = parts
  return { team_id, tool, target, result, details: details.join(' | ') }
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function replayHistory(channel, checkpoint, processMessage, maxPages = 1000) {
  // Freeze the head, discover page boundaries, then refetch oldest first.
  // Keep only page IDs in memory even when the channel has a large history.
  const head = (await channel.messages.fetch({ limit: 1, cache: false })).first()
  if (!head) return
  const boundaries = []
  let before = (BigInt(head.id) + 1n).toString()
  for (let page = 0; page < maxPages; page++) {
    const batch = await channel.messages.fetch({ limit: 100, cache: false, before })
    if (!batch.size) break
    const sorted = [...batch.values()].sort((a, b) =>
      BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0)
    boundaries.push(before)
    before = sorted[0].id
    if (checkpoint && BigInt(before) <= BigInt(checkpoint)) break
    if (batch.size < 100) break
    if (page === maxPages - 1) throw new Error('Replay page limit reached; manual recovery required')
  }
  for (const boundary of boundaries.reverse()) {
    const batch = await channel.messages.fetch({ limit: 100, cache: false, before: boundary })
    if (!batch.size) throw new Error('Discord replay page disappeared; retrying from cursor')
    const sorted = [...batch.values()].sort((a, b) =>
      BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0)
    for (const message of sorted) {
      if (!checkpoint || BigInt(message.id) > BigInt(checkpoint)) await processMessage(message)
    }
  }
}

export function startBot() {
  const token = process.env.DISCORD_BOT_TOKEN
  const apiKey = process.env.EVENT_API_KEY
  if (!token) {
    console.warn('DISCORD_BOT_TOKEN is not set — Discord import disabled')
    return
  }
  if (!apiKey) {
    console.error('EVENT_API_KEY is required for Discord import')
    return
  }
  const channels = new Set((process.env.ALLOWED_CHANNELS || '').split(',').map(id => id.trim()).filter(Boolean))
  if (!channels.size) throw new Error('Discord import requires explicit ALLOWED_CHANNELS')
  if ([...channels].some(id => !/^\d{15,22}$/.test(id))) throw new Error('ALLOWED_CHANNELS contains an invalid Discord channel ID')
  botState.channels = channels.size
  const cursors = new Map()
  const syncing = new Set()
  const resyncNeeded = new Set()
  const pendingTimers = new Map()
  const client = new Client({ intents: [GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] })
  let initialized = false
  const syncAll = () => { for (const channelId of channels) requestSync(channelId) }

  async function cursorFor(channelId) {
    if (!cursors.has(channelId)) {
      cursors.set(channelId, getPool() ? await getDiscordCursor(channelId) : null)
    }
    return cursors.get(channelId)
  }

  async function advance(channelId, messageId) {
    if (getPool()) await saveDiscordCursor(channelId, messageId)
    cursors.set(channelId, messageId)
  }

  async function processMessage(message) {
    const previous = await cursorFor(message.channelId)
    if (previous && BigInt(message.id) <= BigInt(previous)) return
    if (message.system) {
      await advance(message.channelId, message.id)
      return
    }
    if (typeof message.content !== 'string' || message.content.length === 0) {
      throw new Error(`Message ${message.id} has no readable content; check Discord Message Content intent and telemetry channel policy`)
    }
    const payload = parseDiscordTelemetry(message.content)
    if (payload === null) {
      await advance(message.channelId, message.id)
      return
    }
    if (payload === false) {
      console.error(`[bot] Invalid telemetry in channel ${message.channelId}, message ${message.id}`)
      if (getPool()) await recordDiscordRejection(message, 'Missing required telemetry fields')
      await advance(message.channelId, message.id)
      return
    }
    let delay = 1000
    while (true) {
      try {
        const response = await fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/events`, {
          method: 'POST', signal: AbortSignal.timeout(10_000),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ ...payload, source_id: `discord:${message.id}` }),
        })
        if (response.ok) {
          await advance(message.channelId, message.id)
          return
        }
        const body = (await response.text()).slice(0, 300)
        if ([400, 409, 413, 422].includes(response.status)) {
          console.error(`[bot] Rejected message ${message.id} (${response.status}): ${body}`)
          if (getPool()) await recordDiscordRejection(message, `${response.status}: ${body}`)
          await advance(message.channelId, message.id)
          return
        }
        if (response.status === 429) {
          const retrySeconds = Number(response.headers.get('retry-after'))
          if (Number.isFinite(retrySeconds) && retrySeconds > 0) {
            delay = Math.max(delay, Math.min(retrySeconds * 1000, 60_000))
          }
        }
        console.error(`[bot] Ingest failed for ${message.id} (${response.status}): ${body}`)
      } catch (error) {
        console.error(`[bot] Ingest error for ${message.id}: ${error.message}`)
      }
      await wait(delay)
      delay = Math.min(delay * 2, 60_000)
    }
  }

  function requestSync(channelId, debounce = false) {
    if (syncing.has(channelId)) {
      resyncNeeded.add(channelId)
      return
    }
    if (debounce) {
      if (!pendingTimers.has(channelId)) {
        pendingTimers.set(channelId, setTimeout(() => {
          pendingTimers.delete(channelId)
          requestSync(channelId)
        }, 500))
      }
      return
    }
    if (pendingTimers.has(channelId)) {
      clearTimeout(pendingTimers.get(channelId))
      pendingTimers.delete(channelId)
    }
    syncing.add(channelId)
    void (async () => {
      let delay = 1000
      do {
        resyncNeeded.delete(channelId)
        try {
          await replay(channelId)
          delay = 1000
          botState.last_sync = new Date().toISOString()
          channelSync.set(channelId, Date.now())
          channelErrors.delete(channelId)
          botState.last_error = channelErrors.values().next().value || null
        } catch (error) {
          channelErrors.set(channelId, error.message)
          botState.last_error = error.message
          console.error(`[bot] Channel ${channelId} retrying after error: ${error.stack || error}`)
          resyncNeeded.add(channelId)
          await wait(delay)
          delay = Math.min(delay * 2, 60_000)
        }
      } while (resyncNeeded.has(channelId))
      syncing.delete(channelId)
    })()
  }

  async function replay(channelId) {
    const channel = await client.channels.fetch(channelId)
    if (!channel?.messages) throw new Error(`Channel ${channelId} is not readable`)
    const checkpoint = await cursorFor(channelId)
    if (!checkpoint && process.env.DISCORD_INITIAL_BACKFILL !== 'true') {
      const latest = await channel.messages.fetch({ limit: 1, cache: false })
      const first = latest.first()
      if (first) await advance(channelId, first.id)
      console.log(`[bot] Channel ${channelId} initialized at current head; set DISCORD_INITIAL_BACKFILL=true for a new installation that needs history`)
      return
    }
    await replayHistory(channel, checkpoint, processMessage)
    console.log(`[bot] Channel ${channelId} replay complete`)
  }

  client.once('clientReady', c => {
    initialized = true
    botState.connected = true
    console.log(`Discord bot connected as ${c.user.tag}; monitoring ${channels.size} channel(s)`)
    syncAll()
  })
  client.on('shardResume', () => { botState.connected = true; if (initialized) syncAll() })
  client.on('shardReady', () => { botState.connected = true; if (initialized) syncAll() })
  client.on('shardDisconnect', () => { botState.connected = false })
  client.on('messageCreate', message => {
    if (channels.has(message.channelId)) requestSync(message.channelId, true)
  })
  setInterval(() => { if (initialized) syncAll() }, 60_000).unref()
  client.login(token).catch(error => {
    botState.connected = false
    botState.last_error = `Discord login failed: ${error.message}`
    console.error(`[bot] ${botState.last_error}`)
  })
}

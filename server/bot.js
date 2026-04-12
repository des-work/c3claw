import { Client, GatewayIntentBits } from 'discord.js'

const MESSAGE_PREFIX = '[OCRT]'

export function startBot() {
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
  const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID
  const PORT = process.env.PORT || 3001
  const EVENT_API_KEY = process.env.EVENT_API_KEY || ''

  if (!BOT_TOKEN) {
    console.warn('WARNING: DISCORD_BOT_TOKEN is not set — Discord bot will not start')
    return
  }
  if (!CHANNEL_ID) {
    console.warn('WARNING: DISCORD_CHANNEL_ID is not set — Discord bot will not start')
    return
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  })

  client.once('clientReady', (c) => {
    console.log(`Discord bot connected as ${c.user.tag}`)
  })

  client.on('messageCreate', async (message) => {
if (message.channelId !== CHANNEL_ID) return
    if (!message.content.startsWith(MESSAGE_PREFIX)) return

    // Expected format: [OCRT] team-id | Tool | Target | Result | Details
    const body = message.content.slice(MESSAGE_PREFIX.length).trim()
    const parts = body.split('|').map(p => p.trim())

    if (parts.length < 4) {
      console.error(`[bot] Parse failed — expected at least 4 pipe-delimited fields in: ${message.content}`)
      return
    }

    const [team_id, tool, target, result, ...rest] = parts
    const details = rest.join(' | ')

    if (!team_id || !tool || !target || !result) {
      console.error(`[bot] Parse failed — one or more required fields are empty in: ${message.content}`)
      return
    }

    try {
      const res = await fetch(`http://localhost:${PORT}/api/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${EVENT_API_KEY}`
        },
        body: JSON.stringify({ team_id, tool, target, result, details })
      })

      if (!res.ok) {
        const text = await res.text()
        console.error(`[bot] POST /api/events failed (${res.status}): ${text}`)
        return
      }

      console.log(`[bot] Event forwarded — ${team_id} | ${tool} | ${target} | ${result}`)
    } catch (err) {
      console.error(`[bot] POST /api/events error: ${err.message}`)
    }
  })

  client.login(BOT_TOKEN).catch(err => {
    console.error(`[bot] Login failed: ${err.message}`)
  })
}

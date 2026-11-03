import { readFileSync, statSync } from 'node:fs'

const SNOWFLAKE = /^\d{15,22}$/
const TEAM = /^[A-Za-z0-9_-]{1,64}$/

export function parseDiscordSources(payload, allowedChannels) {
  if (!payload || payload.version !== 1 || Object.keys(payload).some(k => !['version', 'sources'].includes(k)) ||
      !Array.isArray(payload.sources) || !payload.sources.length || payload.sources.length > 5000) {
    throw new Error('Discord source policy requires version 1 and 1-5000 webhook/team mappings')
  }
  const mappings = new Map()
  const covered = new Set()
  for (const source of payload.sources) {
    if (!source || Object.keys(source).some(k => !['channel_id', 'webhook_id', 'team_ids'].includes(k)) ||
        typeof source.channel_id !== 'string' || !SNOWFLAKE.test(source.channel_id) ||
        typeof source.webhook_id !== 'string' || !SNOWFLAKE.test(source.webhook_id) ||
        !Array.isArray(source.team_ids) || !source.team_ids.length || source.team_ids.length > 100 ||
        source.team_ids.some(team => typeof team !== 'string' || !TEAM.test(team)) ||
        new Set(source.team_ids).size !== source.team_ids.length || !allowedChannels.has(source.channel_id)) {
      throw new Error('Invalid Discord source channel, webhook or explicit team mapping')
    }
    const key = `${source.channel_id}:${source.webhook_id}`
    if (mappings.has(key)) throw new Error('Duplicate Discord webhook/channel source mapping')
    mappings.set(key, new Set(source.team_ids))
    covered.add(source.channel_id)
  }
  if ([...allowedChannels].some(channel => !covered.has(channel))) {
    throw new Error('Every allowlisted Discord telemetry channel needs a source mapping')
  }
  return mappings
}

export function loadDiscordSources(allowedChannels) {
  const path = process.env.DISCORD_SOURCE_POLICY_FILE
  if (!path) throw new Error('DISCORD_SOURCE_POLICY_FILE is required for trusted webhook telemetry')
  if (statSync(path).size > 1024 * 1024) throw new Error('Discord source policy exceeds 1 MiB')
  let payload
  try { payload = JSON.parse(readFileSync(path, 'utf8')) } catch {
    throw new Error('Discord source policy is not readable JSON')
  }
  return parseDiscordSources(payload, allowedChannels)
}

export function authorizedDiscordSource(mappings, message, teamId) {
  return typeof message.webhookId === 'string' &&
    Boolean(mappings.get(`${message.channelId}:${message.webhookId}`)?.has(teamId))
}

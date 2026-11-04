import { readFileSync, statSync } from 'node:fs'
import { parseDiscordSources } from '../shared/discord.js'
export { parseDiscordSources, authorizedDiscordSource } from '../shared/discord.js'

export function loadDiscordSources(allowedChannels, environment = process.env) {
  const path = environment.DISCORD_SOURCE_POLICY_FILE
  const inline = environment.DISCORD_SOURCE_POLICY_JSON
  if (Boolean(path) === Boolean(inline)) {
    throw new Error('Configure exactly one of DISCORD_SOURCE_POLICY_FILE or DISCORD_SOURCE_POLICY_JSON')
  }
  if ((inline ? Buffer.byteLength(inline, 'utf8') : statSync(path).size) > 1024 * 1024) {
    throw new Error('Discord source policy exceeds 1 MiB')
  }
  let payload
  try { payload = JSON.parse(inline || readFileSync(path, 'utf8')) } catch {
    throw new Error('Discord source policy is not readable JSON')
  }
  return parseDiscordSources(payload, allowedChannels)
}

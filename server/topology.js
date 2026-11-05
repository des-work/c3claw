import fs from 'node:fs'
import { parseTopology } from '../shared/topology.js'
export * from '../shared/topology.js'

export function loadTopology(file = process.env.TOPOLOGY_FILE, inline = process.env.TOPOLOGY_JSON) {
  if (!file && !inline) return []
  return parseTopology(JSON.parse(inline || fs.readFileSync(file, 'utf8')))
}

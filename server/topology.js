import fs from 'node:fs'

export const MACHINE_ZONES = ['operator', 'wan', 'dmz', 'lan']
export const MACHINE_STATES = ['online', 'degraded', 'offline']

const DEGRADED_AFTER_MS = 60 * 1000
const OFFLINE_AFTER_MS = 5 * 60 * 1000

export function loadTopology(file = process.env.TOPOLOGY_FILE, inline = process.env.TOPOLOGY_JSON) {
  if (!file && !inline) return []
  const parsed = JSON.parse(inline || fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(parsed.teams)) throw new Error('TOPOLOGY_FILE must contain a teams array')
  return parsed.teams.map(team => {
    if (typeof team.team_id !== 'string' || !team.team_id.trim() || !Array.isArray(team.machines)) {
      throw new Error('Each topology team needs team_id and machines')
    }
    return {
      team_id: team.team_id.trim(),
      class_id: typeof team.class_id === 'string' && team.class_id.trim() ? team.class_id.trim() : null,
      cidr: typeof team.cidr === 'string' ? team.cidr : null,
      machines: team.machines.map(machine => {
        if (typeof machine.machine_id !== 'string' || !machine.machine_id.trim() ||
            !MACHINE_ZONES.includes(machine.zone)) {
          throw new Error(`Invalid machine in topology for ${team.team_id}`)
        }
        return {
          machine_id: machine.machine_id.trim(),
          label: typeof machine.label === 'string' ? machine.label : machine.machine_id,
          zone: machine.zone,
          address: typeof machine.address === 'string' ? machine.address : null,
        }
      }),
    }
  })
}

export function machineState(machine, now = Date.now()) {
  if (!machine.last_seen) return 'unknown'
  const age = now - Date.parse(machine.last_seen)
  if (!Number.isFinite(age)) return 'unknown'
  if (machine.status === 'offline' || age > OFFLINE_AFTER_MS) return 'offline'
  if (machine.status === 'degraded' || age > DEGRADED_AFTER_MS) return 'degraded'
  return 'online'
}

export function attachTopology(teams, inventory, observations, now = Date.now()) {
  const byTeam = new Map(teams.map(team => [team.team_id, { ...team, machines: [] }]))

  for (const entry of inventory) {
    const team = byTeam.get(entry.team_id) || {
      team_id: entry.team_id, status: 'unknown', phase: null, last_action: null,
      last_seen: null, cidr: null, blocked_count: 0, event_count: 0, machines: [],
    }
    team.cidr ||= entry.cidr
    team.class_id = entry.class_id || team.class_id || null
    for (const field of ['term_id', 'display_name', 'member_count']) {
      if (entry[field] !== undefined) team[field] = entry[field]
    }
    team.machines = entry.machines.map(machine => ({ ...machine, status: 'unknown', last_seen: null }))
    byTeam.set(entry.team_id, team)
  }

  for (const observation of observations) {
    const team = byTeam.get(observation.team_id) || {
      team_id: observation.team_id, status: 'unknown', phase: null, last_action: null,
      last_seen: null, cidr: null, blocked_count: 0, event_count: 0, machines: [],
    }
    const index = team.machines.findIndex(machine => machine.machine_id === observation.machine_id)
    const existing = index < 0 ? {} : team.machines[index]
    const machine = {
      ...existing, ...observation,
      label: observation.label === observation.machine_id && existing.label
        ? existing.label : (observation.label || existing.label || observation.machine_id),
      zone: existing.zone || observation.zone,
      address: observation.address || existing.address || null,
      status: machineState(observation, now),
    }
    if (index < 0) team.machines.push(machine)
    else team.machines[index] = machine
    byTeam.set(team.team_id, team)
  }

  return [...byTeam.values()].sort((a, b) => a.team_id.localeCompare(b.team_id))
}

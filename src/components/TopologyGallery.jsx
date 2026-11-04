import { useMemo, useState } from 'react'
import { Network, Search } from 'lucide-react'
import { STANDARD_POLICY, refreshSeconds } from '../../shared/refresh-policy.js'

const ZONES = [
  { id: 'operator', label: 'Operator' },
  { id: 'wan', label: 'WAN' },
  { id: 'dmz', label: 'DMZ' },
  { id: 'lan', label: 'LAN' },
]
const STATES = ['online', 'degraded', 'offline', 'unknown']

function professorOf(teamId = '') {
  const match = teamId.match(/^([A-Za-z]{3,})\d*[_-]/)
  if (!match || ['TEAM', 'DEV', 'TEST'].includes(match[1].toUpperCase())) return null
  return match[1]
}

function Machine({ machine }) {
  const state = STATES.includes(machine.status) ? machine.status : 'unknown'
  const seen = machine.last_seen ? new Date(machine.last_seen).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }) : 'never'
  return (
    <div className={`machine machine--${state}`} aria-label={`${machine.label || machine.machine_id}: ${state}`}>
      <span className="machine__signal" aria-hidden="true" />
      <div className="machine__copy">
        <strong title={machine.label || machine.machine_id}>{machine.label || machine.machine_id}</strong>
        <small title={machine.address || 'No address'}>{machine.address || 'Address unlisted'}</small>
        <span className="machine__state" title={`Last report: ${seen}`}>{state}</span>
        <small>Report: {seen}</small>
      </div>
    </div>
  )
}

function TopologyCard({ team }) {
  const machines = Array.isArray(team.machines) ? team.machines : []
  const counts = Object.fromEntries(STATES.map(state => [state, machines.filter(machine => machine.status === state).length]))
  const cardState = counts.offline ? 'offline' : counts.degraded ? 'degraded' :
    counts.unknown || !machines.length ? 'unknown' : 'online'
  const cardLabel = counts.offline ? `${counts.offline} machine${counts.offline === 1 ? '' : 's'} down` :
    counts.degraded ? `${counts.degraded} degraded` :
      counts.unknown ? `${counts.unknown} unreported` :
        machines.length ? 'all online' : 'no inventory'

  return (
    <article className={`topology-card topology-card--${cardState}`} aria-label={`${team.team_id} network topology`}>
      <div className="topology-card__heading">
        <div className="topology-card__title">
          <span className="topology-card__eyebrow">TEAM NETWORK / {team.cidr || 'CIDR UNLISTED'}</span>
          <h3>{team.team_id}</h3>
        </div>
        <span className={`topology-card__team-status status--${cardState}`}>
          <span className="status-dot" aria-hidden="true" />{cardLabel}
        </span>
      </div>

      <div className="topology-card__summary" aria-label="Machine status counts">
        <span><b className="status-text--online">{counts.online}</b> online</span>
        <span><b className="status-text--degraded">{counts.degraded}</b> degraded</span>
        <span><b className="status-text--offline">{counts.offline}</b> offline</span>
        <span><b className="status-text--unknown">{counts.unknown}</b> unknown</span>
      </div>

      {machines.length ? (
        <div className="topology-card__network" aria-label="Operator to WAN to DMZ to LAN">
          {ZONES.map(zone => {
            const nodes = machines.filter(machine => machine.zone === zone.id)
            return (
              <div className="topology-zone" key={zone.id}>
                <div className="topology-zone__heading"><span className="topology-zone__junction" />{zone.label}</div>
                <div className="topology-zone__nodes">
                  {nodes.length ? nodes.map(machine => <Machine key={machine.machine_id} machine={machine} />) : (
                    <div className="topology-zone__empty">No node listed</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="topology-card__unmapped">Machine inventory not configured for this team</div>
      )}
    </article>
  )
}

export default function TopologyGallery({ teams = [], policy = STANDARD_POLICY, generatedAt = null, pipelineHealth = null }) {
  const [search, setSearch] = useState('')
  const [selectedClass, setSelectedClass] = useState('ALL')
  const classes = useMemo(() => ['ALL', ...[...new Set(teams.map(team => team.class_id || professorOf(team.team_id))
    .filter(Boolean))].sort((a, b) => a.localeCompare(b))], [teams])
  const filtered = useMemo(() => teams.filter(team =>
    team.team_id.toLowerCase().includes(search.toLowerCase()) &&
    (selectedClass === 'ALL' || (team.class_id || professorOf(team.team_id))?.toLowerCase() === selectedClass.toLowerCase())
  ), [teams, search, selectedClass])
  const machineCount = teams.reduce((total, team) => total + (team.machines?.length || 0), 0)

  return (
    <section className="topology-gallery" aria-label="Team network topology gallery">
      <div className="topology-gallery__header">
        <div className="topology-gallery__intro">
          <div className="topology-gallery__kicker"><Network size={15} aria-hidden="true" /> NETWORK STATUS SNAPSHOT</div>
          <h2>Team topologies</h2>
          <p>{teams.length} teams · {machineCount} mapped machines · refresh every {refreshSeconds(policy.refresh_seconds) / 60} min</p>
          <p>Snapshot: {generatedAt ? new Date(generatedAt).toLocaleTimeString() : 'awaiting data'} · Standard reporting</p>
          {pipelineHealth?.status === 'degraded' && <p role="status">Source feed needs setup or repair. Check service health.</p>}
        </div>
        <div className="topology-gallery__tools">
          <label className="topology-gallery__search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search teams</span>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search teams" />
          </label>
          <div className="topology-gallery__filters" aria-label="Filter by class">
            {classes.map(name => <button key={name} type="button" aria-pressed={selectedClass === name}
              onClick={() => setSelectedClass(name)}>{name}</button>)}
          </div>
        </div>
      </div>
      <div className="topology-gallery__legend" aria-label="Machine status legend">
        {STATES.map(state => <span key={state} className={`status--${state}`}><i className="status-dot" />{state}</span>)}
        <span className="topology-gallery__source">Health reports every {policy.heartbeat_seconds / 60} min · degraded after {policy.degraded_after_seconds / 60} min · offline after {policy.offline_after_seconds / 60} min</span>
      </div>
      <div className="topology-gallery__scroll">
        {filtered.length ? <div className="topology-gallery__grid">
          {filtered.map(team => <TopologyCard key={team.team_id} team={team} />)}
        </div> : <div className="topology-gallery__empty">
          {teams.length ? 'No teams match this filter' : <div><strong>Awaiting this semester’s teams</strong><p>Teams and machines will appear when inventory or live reports arrive.</p><p>No sample activity is loaded.</p></div>}
        </div>}
      </div>
    </section>
  )
}

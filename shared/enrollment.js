const ID = /^[A-Za-z0-9_-]{1,64}$/

export function parseEnrollmentSnapshot(payload) {
  if (payload?.version !== 1 || !Array.isArray(payload.teams) || payload.teams.length > 1000 ||
      Object.keys(payload).some(key => !['version', 'teams'].includes(key))) throw new Error('Invalid enrollment export envelope')
  const seen = new Set()
  const fields = ['team_id', 'class_id', 'term_id', 'display_name', 'member_count', 'cidr']
  const teams = payload.teams.map(team => {
    if (!team || Object.keys(team).some(key => !fields.includes(key)) ||
        ['team_id', 'class_id', 'term_id'].some(key => typeof team[key] !== 'string' || !ID.test(team[key])) ||
        typeof team.display_name !== 'string' || !team.display_name.trim() || team.display_name.length > 120 ||
        !Number.isSafeInteger(team.member_count) || team.member_count < 0 ||
        (team.cidr !== null && (typeof team.cidr !== 'string' || team.cidr.length > 120)) || seen.has(team.team_id)) {
      throw new Error('Invalid or duplicate enrollment team; no student identities are accepted')
    }
    seen.add(team.team_id)
    return Object.fromEntries(fields.map(key => [key, team[key]]))
  })
  return { version: 1, teams }
}

export function mergeEnrollmentInventory(configured, snapshot) {
  const byId = new Map(configured.map(team => [team.team_id, { ...team }]))
  for (const team of snapshot) {
    const manual = byId.get(team.team_id)
    if (manual?.class_id && manual.class_id !== team.class_id) throw new Error('Configured topology class conflicts with enrollment class')
    byId.set(team.team_id, { ...team, ...manual, class_id: team.class_id, term_id: team.term_id,
      display_name: team.display_name, member_count: team.member_count,
      cidr: manual?.cidr || team.cidr, machines: manual?.machines || [] })
  }
  return [...byId.values()]
}


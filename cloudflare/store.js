const EVENT_COLUMNS = ['id', 'team_id', 'timestamp', 'tool', 'target', 'result', 'details', 'source_id']
export const snowflakeKey = value => value.padStart(22, '0')

export class Store {
  constructor(db) { this.db = db }
  statement(sql, ...values) { return this.db.prepare(sql).bind(...values) }
  async rows(sql, ...values) { return (await this.statement(sql, ...values).all()).results }
  async first(sql, ...values) { return this.statement(sql, ...values).first() }
  async run(sql, ...values) { return this.statement(sql, ...values).run() }

  eventsInsert(events) {
    return this.statement(`INSERT INTO events (${EVENT_COLUMNS.join(',')})
      SELECT ${EVENT_COLUMNS.map(key => `json_extract(value, '$.${key}')`).join(',')}
      FROM json_each(?) WHERE true ON CONFLICT(source_id) DO NOTHING RETURNING *`, JSON.stringify(events))
  }
  async ingestMany(events) {
    if (!events.length) return 0
    return (await this.eventsInsert(events).all()).results.length
  }
  async ingest(event) {
    const inserted = (await this.eventsInsert([event]).all()).results[0]
    if (inserted) return { event: inserted, duplicate: false }
    const previous = await this.first('SELECT * FROM events WHERE source_id = ?', event.source_id)
    if (!previous) throw new Error('Unable to locate persisted event')
    return { event: previous, duplicate: true }
  }
  async recent(limit) {
    return (await this.rows('SELECT * FROM events ORDER BY timestamp DESC, id DESC LIMIT ?', limit)).reverse()
  }
  async snapshot() {
    const saved = await this.first("SELECT payload, fetched_at FROM enrollment_snapshots WHERE source = 'scoring'")
    return saved ? { payload: JSON.parse(saved.payload), fetchedAt: saved.fetched_at } : null
  }
  async saveSnapshot(payload, fetchedAt) {
    await this.run(`INSERT INTO enrollment_snapshots VALUES ('scoring', ?, ?)
      ON CONFLICT(source) DO UPDATE SET payload=excluded.payload, fetched_at=excluded.fetched_at`,
    JSON.stringify(payload), fetchedAt)
  }
  async state(source) {
    const row = await this.first('SELECT payload FROM sync_state WHERE source = ?', source)
    return row ? JSON.parse(row.payload) : null
  }
  async saveState(source, payload) {
    await this.run(`INSERT INTO sync_state VALUES (?, ?) ON CONFLICT(source)
      DO UPDATE SET payload=excluded.payload`, source, JSON.stringify(payload))
  }
  async lease() {
    const owner = crypto.randomUUID()
    const now = Date.now()
    const row = await this.first(`INSERT INTO sync_locks VALUES ('scheduled', ?, ?)
      ON CONFLICT(name) DO UPDATE SET owner=excluded.owner, expires_at=excluded.expires_at
      WHERE sync_locks.expires_at < ? RETURNING owner`, owner, now + 180_000, now)
    return row?.owner === owner ? owner : null
  }
  async release(owner) {
    await this.run("DELETE FROM sync_locks WHERE name='scheduled' AND owner=?", owner)
  }
  async ensureChannels(channels, floor) {
    await this.run(`INSERT INTO discord_cursors(channel_id, message_id)
      SELECT value, ? FROM json_each(?) WHERE true ON CONFLICT(channel_id) DO NOTHING`,
    floor, JSON.stringify(channels))
  }
  async stage(channel, messages, before, complete) {
    await this.db.batch([
      this.statement(`INSERT INTO discord_inbox(channel_id, message_key, payload)
        SELECT ?, json_extract(value, '$.id_key'), json_extract(value, '$.payload')
        FROM json_each(?) WHERE true ON CONFLICT DO NOTHING`, channel,
      JSON.stringify(messages.map(message => ({ id_key: snowflakeKey(message.id), payload: JSON.stringify(message) })))),
      this.statement('UPDATE discord_cursors SET scan_before=?, scan_complete=? WHERE channel_id=?',
        before, complete ? 1 : 0, channel),
    ])
  }
  async commitDiscord(channel, events, rejections, messageId) {
    await this.db.batch([
      this.eventsInsert(events),
      this.statement(`INSERT INTO discord_rejections(message_id, channel_id, reason, content, rejected_at)
        SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.reason'),
          json_extract(value, '$.content'), ? FROM json_each(?) WHERE true
        ON CONFLICT(message_id) DO NOTHING`, channel, new Date().toISOString(), JSON.stringify(rejections)),
      this.statement(`UPDATE discord_cursors SET message_id=? WHERE channel_id=?
        AND (length(message_id)<length(?) OR (length(message_id)=length(?) AND message_id<?))`,
      messageId, channel, messageId, messageId, messageId),
      this.statement('DELETE FROM discord_inbox WHERE channel_id=? AND message_key<=?', channel, snowflakeKey(messageId)),
    ])
  }
  async heartbeat(machine) {
    await this.run(`INSERT INTO machine_status VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(team_id, machine_id) DO UPDATE SET label=excluded.label, zone=excluded.zone,
        address=excluded.address, status=excluded.status, last_seen=excluded.last_seen
      WHERE excluded.last_seen >= machine_status.last_seen`,
    machine.team_id, machine.machine_id, machine.label, machine.zone, machine.address, machine.status, machine.last_seen)
  }
}

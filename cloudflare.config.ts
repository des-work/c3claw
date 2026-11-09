import { bindings, defineConfig, triggers } from 'cf/config'

// Keep the current production default until the Nestler endpoint passes cutover checks.
const targets = {
  nestler: {
    accountId: '7dc280ecf2c85a687171fd25c4cf25aa',
    databaseId: 'a9dea873-de71-4c5d-9586-d49fd6aa88cc',
  },
  desmond: {
    accountId: '8e2b6acfb4425a0f89ddbbbb85993894',
    databaseId: '1b405da4-cdc6-4087-8194-295f22f8b74a',
  },
}
const targetName = process.env.CLAW_DEPLOY_TARGET || 'desmond'
if (!Object.hasOwn(targets, targetName)) throw new Error('CLAW_DEPLOY_TARGET must be nestler or desmond')
const target = targets[targetName as keyof typeof targets]
const collectorPaused = process.env.CLAW_COLLECTOR_PAUSED || '0'
if (!['0', '1'].includes(collectorPaused)) throw new Error('CLAW_COLLECTOR_PAUSED must be 0 or 1')
const publicAddressDisabled = process.env.CLAW_WORKERS_DEV_DISABLED || '0'
if (!['0', '1'].includes(publicAddressDisabled)) throw new Error('CLAW_WORKERS_DEV_DISABLED must be 0 or 1')

export default defineConfig({
  accountId: target.accountId,
  worker: {
    name: 'claw-and-order',
    entrypoint: './cloudflare/worker.js',
    compatibilityDate: '2026-11-04',
    compatibilityFlags: ['nodejs_compat'],
    workersDev: publicAddressDisabled !== '1',
    previewUrls: false,
    cache: { enabled: true, crossVersionCache: false },
    assets: { notFoundHandling: 'single-page-application', runWorkerFirst: ['/api', '/api/*'] },
    observability: {
      enabled: true, redactQueryString: true,
      logs: { enabled: true, headSamplingRate: 1 },
      traces: { enabled: true, headSamplingRate: 0.01 },
    },
    triggers: collectorPaused === '1' ? [] : [triggers.scheduled({ schedule: '*/5 * * * *' })],
    env: {
      DB: bindings.d1({ name: 'claw-and-order', id: target.databaseId }),
      ASSETS: bindings.assets(),
      RELEASE_ID: bindings.text(process.env.CLAW_RELEASE_ID || 'development'),
      SEMESTER_START_AT: bindings.text('2026-11-04T21:12:10.000Z'),
      TELEMETRY_SOURCE: bindings.text('discord'),
      EVENT_API_KEY: bindings.secret(),
      // Optional settings stay absent until configured as protected secrets:
      // DISCORD_BOT_TOKEN, ALLOWED_CHANNELS, DISCORD_SOURCE_POLICY_JSON,
      // TOPOLOGY_JSON, BACKEND_EXPORT_URL, BACKEND_EXPORT_SECRET.
    },
  },
})

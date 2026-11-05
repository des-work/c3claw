import { bindings, defineConfig, triggers } from 'cf/config'

export default defineConfig({
  accountId: '8e2b6acfb4425a0f89ddbbbb85993894',
  worker: {
    name: 'claw-and-order',
    entrypoint: './cloudflare/worker.js',
    compatibilityDate: '2026-11-04',
    compatibilityFlags: ['nodejs_compat'],
    workersDev: true,
    previewUrls: false,
    cache: { enabled: true, crossVersionCache: false },
    assets: { notFoundHandling: 'single-page-application', runWorkerFirst: ['/api', '/api/*'] },
    observability: {
      enabled: true, redactQueryString: true,
      logs: { enabled: true, headSamplingRate: 1 },
      traces: { enabled: true, headSamplingRate: 0.01 },
    },
    triggers: [triggers.scheduled({ schedule: '*/5 * * * *' })],
    env: {
      DB: bindings.d1({ name: 'claw-and-order', id: '1b405da4-cdc6-4087-8194-295f22f8b74a' }),
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

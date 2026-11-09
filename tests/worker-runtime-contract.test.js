import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The Discord reader shipped broken because `redirect: 'error'` is accepted by
// Node and rejected outright by the Workers runtime, so every read threw before
// leaving the edge. The existing runtime suite could not catch it: it injects a
// stub fetchFn, so real request options never reach the runtime at all.
//
// These checks read the source instead. They are cheap, they run without a
// network, and they fail loudly if anyone reintroduces an option the Workers
// runtime refuses. `server/` is deliberately excluded: it runs only on Node.

const root = fileURLToPath(new URL('..', import.meta.url))
const WORKER_DIRS = ['cloudflare', 'shared']

// Comments explaining why 'error' must not be used would otherwise match the
// very pattern being searched for, so they are removed before scanning.
const stripComments = source => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

async function workerSources() {
  const files = []
  for (const dir of WORKER_DIRS) {
    for (const entry of await readdir(join(root, dir), { withFileTypes: true, recursive: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.js') || entry.name.endsWith('.test.js')) continue
      const path = join(entry.parentPath ?? entry.path, entry.name)
      files.push({ path: path.slice(root.length), source: stripComments(await readFile(path, 'utf8')) })
    }
  }
  return files
}

test('worker-path code never uses redirect: "error", which the Workers runtime rejects', async () => {
  const offenders = (await workerSources())
    .filter(file => /redirect:\s*['"]error['"]/.test(file.source))
    .map(file => file.path)
  assert.deepEqual(offenders, [],
    `Use redirect: 'manual' and reject a 3xx via !response.ok instead. ` +
    `The Workers runtime throws "Invalid redirect value" for 'error', and the thrown ` +
    `TypeError is easily swallowed by a generic error handler. Offending files: ${offenders.join(', ')}`)
})

test('every worker-path fetch that forbids redirects still refuses a 3xx response', async () => {
  // 'manual' returns the 3xx rather than following it, so the caller must check.
  // A file that opts out of following redirects without checking response.ok
  // would silently parse a redirect body as if it were real data.
  const unchecked = (await workerSources())
    .filter(file => /redirect:\s*['"]manual['"]/.test(file.source) && !/!\w*\.?ok|\.ok\s*===?\s*false|status\s*===\s*429/.test(file.source))
    .map(file => file.path)
  assert.deepEqual(unchecked, [],
    `These files suppress redirect following but never inspect response.ok: ${unchecked.join(', ')}`)
})

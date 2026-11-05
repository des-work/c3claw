// Restrict the origin before attaching the export secret; never follow redirects.
export function backendUrl(baseUrl, pathname) {
  const url = new URL(baseUrl)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname) ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new Error('BACKEND_EXPORT_URL must be a trusted HTTPS origin or loopback HTTP origin')
  }
  return new URL(pathname, url)
}

export async function boundedJson(response, label, maxBytes = 4 * 1024 * 1024) {
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error(`${label} exceeds the response limit`)
      chunks.push(Buffer.from(value))
    }
  } finally {
    await reader.cancel()
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error(`${label} is not valid JSON`)
  }
}

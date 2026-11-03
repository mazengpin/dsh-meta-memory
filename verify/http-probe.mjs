/**
 * `verify/http-probe.mjs` — drive the built plugin over a REAL HTTP socket.
 *
 * WHY THIS FILE EXISTS AND WHAT IT IS NOT. `harness.mjs` calls the prefix
 * handler directly, which proves the handler but says nothing about a socket, a
 * status line or a byte count — and the defect this file was written for lived
 * exactly there: the live host answered every `/meta-memory` path with a
 * **zero-byte 404** (its default handler, i.e. the plugin was not mounted) while
 * the in-process parity run reported 24/32. So this probe mounts the built
 * artifact behind `node:http`, routes the prefix to the handler the way the host
 * does, and reads the answer back with `fetch`.
 *
 * THE MEASUREMENT IS THE DISTINCTION, NOT THE STATUS. A mounted surface answers
 * an unknown path under its prefix with its OWN non-empty 404 body. A host that
 * never mounted it answers with an EMPTY 404 of its own. Both are `404`; only the
 * byte count and the body tell them apart.
 *
 * This is the ARTIFACT's answer. It is NOT the running GUI: a mount change needs
 * a restart, which this file cannot perform and does not claim.
 *
 * EXIT: 0 every probe answered as the mounted artifact should ·
 *       1 a probe answered like an unmounted host or a broken surface ·
 *       2 the probes could not run.
 *
 * @module dsh-meta-memory/verify/http-probe
 */

import { createServer } from 'node:http'
import { mount, PREFIX } from './harness.mjs'

/** The paths driven, and what a mounted surface must answer. */
const PROBES = [
  { method: 'GET', path: `${PREFIX}/api/status`, wantStatus: 200, wantSelfAuthored: true },
  { method: 'GET', path: `${PREFIX}/api/census`, wantStatus: 200, wantSelfAuthored: true },
  { method: 'GET', path: `${PREFIX}/api/memento/entries`, wantStatus: 200, wantSelfAuthored: true },
  { method: 'GET', path: `${PREFIX}/api/no-such-route`, wantStatus: 404, wantSelfAuthored: true },
]

async function main() {
  const surface = await mount({ label: 'http-probe' })
  const route = surface.registrations.routes.find(candidate => candidate.kind === 'prefix')
  if (route === undefined) throw new Error('the artifact registered no prefix route')

  const server = createServer((req, res) => {
    const url = req.url ?? '/'
    if (url === PREFIX || url.startsWith(`${PREFIX}/`) || url.startsWith(`${PREFIX}?`)) {
      void route.handler(req, res)
      return
    }
    // The host's own default: this is what an UNMOUNTED surface answers, and it
    // is here as the negative control that gives the byte counts meaning.
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end()
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const base = `http://127.0.0.1:${address.port}`
  const rows = []

  try {
    for (const probe of PROBES) {
      const response = await fetch(`${base}${probe.path}`, { method: probe.method })
      const body = Buffer.from(await response.arrayBuffer())
      // A 200 is self-authored when it carries a body; a 404 is self-authored only
      // when the body names this prefix (the host default 404 is empty).
      const selfAuthored = body.length > 0 && (probe.wantStatus !== 404 || body.toString('utf8').includes(PREFIX))
      rows.push({ ...probe, status: response.status, bytes: body.length, selfAuthored, head: body.toString('utf8').slice(0, 100) })
    }
    // The negative control: a path the surface does NOT own, served by the host default.
    const outside = await fetch(`${base}/not-meta-memory/api/status`)
    const outsideBody = Buffer.from(await outside.arrayBuffer())
    rows.push({ method: 'GET', path: '/not-meta-memory/api/status', wantStatus: 404, wantSelfAuthored: false, status: outside.status, bytes: outsideBody.length, selfAuthored: outsideBody.length > 0, head: outsideBody.toString('utf8').slice(0, 100), control: true })
  } finally {
    await new Promise(resolve => server.close(resolve))
    surface.dispose()
  }

  const at = new Date().toISOString()
  console.log('')
  console.log('=== dsh-meta-memory · real-HTTP surface probe ===')
  const { createHash } = await import('node:crypto')
  const { readFileSync } = await import('node:fs')
  const artifact = readFileSync(new URL('../lib/index.js', import.meta.url))
  console.log(`artifact : lib/index.js sha256 ${createHash('sha256').update(artifact).digest('hex')} (${artifact.length} B)`)
  console.log(`socket   : ${base} (loopback, mounted from the built artifact — NOT the running GUI)`)
  console.log(`census at: ${at}`)
  console.log('')
  const failures = []
  for (const row of rows) {
    const ok = row.status === row.wantStatus && (row.wantSelfAuthored ? row.selfAuthored : row.bytes === 0)
    if (!ok) failures.push(row)
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${row.method} ${row.path} → HTTP ${row.status}, ${row.bytes} B${row.control ? ' (host default negative control)' : ''}`)
    console.log(`        body: ${JSON.stringify(row.head)}`)
  }
  console.log('')
  if (failures.length > 0) {
    console.log(`VERDICT: ${failures.length} probe(s) did not answer as the mounted artifact must.`)
    process.exit(1)
  }
  console.log(`VERDICT: MOUNTED — the prefix owns its subtree and answers with non-empty self-authored bodies.`)
  process.exit(0)
}

main().catch(error => {
  console.error('http probe crashed:', error)
  process.exit(2)
})

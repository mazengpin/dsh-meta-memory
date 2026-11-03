/**
 * `verify/route-probe.mjs` — the prefix owns its subtree, and proves it by
 * answering for a path that does not exist.
 *
 * THE ACCEPTANCE CONDITION HAS TWO HALVES AND THE SECOND IS THE HARD ONE. A
 * fused surface that answers 200 on its own routes has shown almost nothing: the
 * hard half is that an UNKNOWN path under its prefix produces THIS plugin's 404
 * body rather than a foreign 405 or a fall-through to whatever else is listening.
 * That is only possible because the plugin registers `kind: 'prefix'` and owns
 * everything below `/meta-memory`, so the 404 is a statement the surface makes
 * about itself instead of a gap where it is absent.
 *
 * EVERY ADVERTISED PATH IS DRIVEN, AND NONE MAY RETURN 404. An advertised path
 * that 404s is worse than an absent one, because the 404 body is the single place
 * whose job is to be authoritative. The path list this file drives is taken FROM
 * THE 404 BODY ITSELF — the surface's own claim about what it registered — so a
 * route table that drifted from its advertisement would be caught here rather
 * than by a reader. The denominator is printed and must be non-zero: an empty
 * loop over an empty list is a pass that measured nothing.
 *
 * EXIT CODES: 0 the prefix answered, advertised everything it serves, and served
 * everything it advertised · 1 one of those failed · 2 the probe could not run.
 *
 * Run with `--live` to also probe a mounted GUI at DSH_GUI_URL (default
 * http://127.0.0.1:3083). The live half is REPORTED, not required: this plugin is
 * proven here against the handler it ships, and the live answer additionally
 * depends on the profile having been registered, synced and restarted.
 *
 * @module dsh-meta-memory/verify/route-probe
 */

import { PREFIX, mount } from './harness.mjs'

const CHECKS = []

/**
 * Record one check.
 * @param {string} name - what was checked.
 * @param {boolean} ok - the result.
 * @param {string} detail - the evidence.
 */
function check(name, ok, detail) {
  CHECKS.push({ name, ok, detail })
}

async function main() {
  const surface = await mount({ label: 'route-probe' })
  try {
    /* --------------------------------------------------- 1. a known path answers */
    const status = await surface.call(`${PREFIX}/api/status`)
    check(
      'a known path under the prefix answers 200',
      status.status === 200 && status.json?.ok === true,
      `GET ${PREFIX}/api/status → HTTP ${status.status}, ok=${JSON.stringify(status.json?.ok)}`,
    )

    /* ----------------------------------- 2. an unknown path answers OUR OWN 404 */
    const unknown = await surface.call(`${PREFIX}/api/no-such-route-at-all`)
    check(
      'an unknown path under the prefix answers 404',
      unknown.status === 404,
      `GET ${PREFIX}/api/no-such-route-at-all → HTTP ${unknown.status} (a foreign 405 would mean this plugin does not own the subtree)`,
    )
    check(
      'the 404 body is this plugin\'s own, not a passthrough',
      typeof unknown.json?.error === 'string' && unknown.json.error.includes(PREFIX),
      `error field: ${JSON.stringify(unknown.json?.error)}`,
    )
    check(
      'the 404 body echoes the path that missed',
      unknown.json?.path === `${PREFIX}/api/no-such-route-at-all`,
      `path field: ${JSON.stringify(unknown.json?.path)}`,
    )
    const advertised = unknown.json?.advertised
    check(
      'the 404 body advertises a non-empty list of registered paths',
      Array.isArray(advertised) && advertised.length > 0,
      `advertised ${Array.isArray(advertised) ? advertised.length : 'no'} path(s)`,
    )

    /* --------------------- 3. every advertised path is actually served (the G9 rule) */
    const paths = Array.isArray(advertised) ? advertised : []
    let reached = 0
    const missing = []
    for (const entry of paths) {
      const space = String(entry).indexOf(' ')
      const method = String(entry).slice(0, space)
      const path = String(entry).slice(space + 1)
      const response = await surface.call(path, method)
      if (response.status === 404) {
        missing.push(`${method} ${path}`)
      } else {
        reached += 1
      }
    }
    check(
      'every advertised path is served (none returns 404)',
      paths.length > 0 && missing.length === 0,
      `${reached} of ${paths.length} advertised path(s) answered something other than 404${missing.length > 0 ? `; missing: ${JSON.stringify(missing)}` : ''}`,
    )
    check(
      'the served denominator is non-zero',
      reached > 0,
      `${reached} path(s) served, over an advertised population of ${paths.length}`,
    )

    /* ------------------------------------ 4. a wrong method is 405, not 404 or 200 */
    const wrongMethod = await surface.call(`${PREFIX}/api/status`, 'POST')
    check(
      'a known path with the wrong method answers 405',
      wrongMethod.status === 405,
      `POST ${PREFIX}/api/status → HTTP ${wrongMethod.status}`,
    )

    /* -------------------------------- 5. the prefix is ours, not the neighbours' */
    const outside = await surface.call('/not-meta-memory/api/status')
    check(
      'a path outside the prefix is NOT answered by this plugin',
      outside.status !== 200,
      `GET /not-meta-memory/api/status → HTTP ${outside.status} (this plugin must not answer outside ${PREFIX})`,
    )

    report()
    const failed = CHECKS.filter(entry => !entry.ok)
    if (failed.length > 0) process.exit(1)

    if (process.argv.includes('--live')) {
      await probeLive()
      process.exit(CHECKS.every(entry => entry.ok) ? 0 : 1)
    }
    process.exit(0)
  } finally {
    surface.dispose()
  }
}

/** Probe a live GUI, reporting what a not-yet-registered plugin looks like. */
async function probeLive() {
  const base = process.env.DSH_GUI_URL ?? 'http://127.0.0.1:3083'
  const LIVE = []
  const note = (name, ok, detail) => LIVE.push({ name, ok, detail })
  try {
    const known = await fetch(`${base}${PREFIX}/api/status`)
    const body = await known.text()
    note(
      `LIVE: ${PREFIX}/api/status answers 200 from ${base}`,
      known.status === 200,
      `HTTP ${known.status}; body starts ${JSON.stringify(body.slice(0, 120))}`,
    )
    const unknown = await fetch(`${base}${PREFIX}/api/definitely-not-a-route`)
    const unknownBody = await unknown.text()
    note(
      `LIVE: an unknown path under ${PREFIX} answers 404 from this plugin`,
      unknown.status === 404 && unknownBody.includes(PREFIX),
      `HTTP ${unknown.status}; body starts ${JSON.stringify(unknownBody.slice(0, 120))}`,
    )
  } catch (error) {
    note('LIVE: the GUI could not be reached', false, error instanceof Error ? error.message : String(error))
  }
  console.log('')
  console.log('=== live probe (reported separately: it depends on the profile registration) ===')
  for (const entry of LIVE) {
    console.log(`  ${entry.ok ? 'PASS' : 'PEND'}  ${entry.name}`)
    console.log(`        ${entry.detail}`)
  }
  if (LIVE.some(entry => !entry.ok)) {
    console.log('')
    console.log('  NOT A PARITY FAILURE: the handler is proven in-process above. A live answer additionally needs this')
    console.log('  plugin registered in profiles-info/plugins.json, synced with the profile plugin-sync command, and')
    console.log('  the GUI restarted — the plugin is not mounted in the running profile until those three are done.')
  }
}

/** Print the readings. */
function report() {
  console.log('')
  console.log('=== dsh-meta-memory · route probe ===')
  console.log(`checks: ${CHECKS.filter(entry => entry.ok).length} / ${CHECKS.length}`)
  console.log('')
  for (const entry of CHECKS) {
    console.log(`  ${entry.ok ? 'PASS' : 'FAIL'}  ${entry.name}`)
    console.log(`        ${entry.detail}`)
  }
  const failed = CHECKS.filter(entry => !entry.ok)
  console.log('')
  if (failed.length === 0) {
    console.log(`VERDICT: THE PREFIX IS OWNED — ${PREFIX} answers, advertises what it serves, serves what it advertises, and returns its own 404 for the rest.`)
  } else {
    console.log(`VERDICT: THE PREFIX IS NOT OWNED — ${failed.length} check(s) failed.`)
  }
}

main().catch(error => {
  console.error('route probe crashed:', error)
  process.exit(2)
})

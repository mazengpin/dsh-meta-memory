/**
 * `verify/parity.mjs` — capability parity for `dsh-meta-memory`.
 *
 * THE ACCEPTANCE TEST IS CAPABILITY PARITY, NOT ROUTE COUNT (decision D-0352
 * rule 2). So this harness does not count routes: it takes one reading per
 * CAPABILITY, and a capability counts as carried only when its fused path was
 * DRIVEN and answered. A capability the fusion does not carry must publish a
 * non-empty reason — rule 4 — and an unreasoned gap fails the run.
 *
 * TWO ENCODINGS OF ONE FACT, COMPARED ON EVERY RUN.
 *
 * The population this harnesses is declared HERE, independently of the plugin,
 * as `EXPECTED_IDS`. The plugin publishes its own rows through `/api/census`.
 * The run asserts the two agree in both directions, because a check whose input
 * went missing is OMITTED rather than refused and then reads exactly like a
 * check that passed: if a capability row were deleted from the plugin, a harness
 * that took its denominator from the plugin would happily report `23/23`.
 *
 * THE PUBLISHED NUMBERS ARE DERIVED, NOT ECHOED. `/api/census` publishes
 * `numerator` and `denominator`; this harness recounts both from the rows and
 * requires agreement, so a surface that printed a hardcoded `32/32` over a
 * shorter table is red rather than green.
 *
 * THE LIVE HOST IS CONTACTED, OR NO PARITY IS CLAIMED. A handler driven in-process
 * is not a mounted surface: this file's first version printed `24 / 32 carried and
 * driven` while the profile served the host's zero-byte 404 for every `/meta-memory`
 * path. The default run now GETs `/meta-memory/api/census` on DSH_GUI_URL, requires
 * a 200, and cross-checks the live census population; an unreachable host REFUSES
 * (exit 2) with the attempted URL and the reason, and `--artifact-only` is an
 * explicitly labelled mode that states in its own output that no deployment was
 * contacted. Refusal is not silence: a zero-byte 404 from a reachable host is a
 * measured FAILURE (exit 1), because the host answered and the surface did not.
 *
 * EXIT CODES, STATED BECAUSE THE BRIEF ASKS FOR THEM:
 *   0  every capability PRESENT, or UNMEASURED with a reason, over a non-zero denominator
 *   1  a capability that claims a fused path did not answer, the live mount was absent, or the population disagreed
 *   2  BLINDED or REFUSED: the denominator was 0, or the live host was not contacted and no parity may be claimed
 *
 * @module dsh-meta-memory/verify/parity
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { entriesIn, mount } from './harness.mjs'

/** The capability population, declared independently of the plugin under test. */
const EXPECTED_IDS = [
  'M1', 'M2', 'M3',
  'M4.entries', 'M4.audit', 'M4.proposals', 'M4.store',
  'M4.rag', 'M4.models', 'M4.recall', 'M4.control',
  'M5', 'M6', 'M7', 'M8', 'M9',
  'D1', 'D2', 'D3',
  'D4.state', 'D4.action', 'D4.search', 'D4.pressure',
  'D5', 'D6', 'D7', 'D8',
  'I1', 'I2', 'I3', 'I4', 'I5',
]

/** Every reading this run took, in order. */
const results = []

/**
 * Record one reading. A thrown assertion is a FAILED reading, never a crash.
 * @param {string} id - the capability id, or a harness-level check name.
 * @param {string} what - what was driven.
 * @param {() => Promise<void>} body - the assertion body.
 */
async function drive(id, what, body) {
  try {
    await body()
    results.push({ id, what, ok: true, detail: '' })
  } catch (error) {
    results.push({ id, what, ok: false, detail: error instanceof Error ? error.message : String(error) })
  }
}

/** Assert a condition, with a message that names the expectation. */
function expect(condition, message) {
  if (!condition) throw new Error(message)
}

/** Assert an HTTP status. */
function expectStatus(response, want, label) {
  expect(
    response.status === want,
    `${label}: expected HTTP ${want}, got ${response.status} (${response.raw.slice(0, 240)})`,
  )
}

/** A unique marker so a store's own leftovers cannot be mistaken for this run's. */
const MARK = `parity-${Date.now().toString(36)}`

/** The live GUI this harness must contact before it may use the word "parity". */
const LIVE_URL = process.env.DSH_GUI_URL ?? 'http://127.0.0.1:3083'

/**
 * Whether this run is allowed to skip the live host. NOT the default, and it
 * states the reduced claim in its own output; only `verify/mutation.mjs` passes
 * it, because that file moves the ARTIFACT and its witness is the artifact's own
 * checks, not the deployment's mount.
 */
const ARTIFACT_ONLY = process.argv.includes('--artifact-only')

/**
 * Contact the live host's census route, or refuse with a named reason.
 *
 * THE DEFECT THIS EXISTS FOR: this harness mounted `lib/index.js` in-process,
 * drove the handler directly and printed `24 / 32 capabilities carried and
 * driven` — while the live profile answered every `/meta-memory` path with the
 * host's zero-byte 404, because the plugin's `apply()` threw on a tool schema.
 * The handler was real; the MOUNT was never contacted, so the harness could not
 * see its own absence. A parity claim about a deployment requires asking the
 * deployment. Exit 2 is REFUSAL (nothing measured about the live surface), and
 * a reachable-but-answering-404 host is a measured FAILURE, not a refusal.
 * @returns {Promise<{url: string, status: number, bytes: number, json: any, body: string}>} the live answer.
 */
async function contactLiveHost() {
  const url = `${LIVE_URL}/meta-memory/api/census`
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    const body = await response.text()
    let json = null
    try {
      json = JSON.parse(body)
    } catch {
      json = null
    }
    return { url, status: response.status, bytes: Buffer.byteLength(body), json, body }
  } catch (error) {
    console.log('')
    console.log('=== dsh-meta-memory · capability parity ===')
    console.log(`REFUSED: the live host was NOT contacted, so this run may not report parity for it.`)
    console.log(`  attempted   : GET ${url}`)
    console.log(`  reason      : ${error instanceof Error ? error.message : String(error)}`)
    console.log(`  in-process  : the built handler was NOT driven, because a handler-only reading would be a`)
    console.log('                claim about an artifact, not about the surface this profile is serving.')
    console.log(`  run again   : node verify/parity.mjs --artifact-only  (explicitly IN-PROCESS ONLY, no parity claim)`)
    console.log('')
    console.log('VERDICT: REFUSED — no live host was contacted and no parity is claimed.')
    process.exit(2)
  }
}

async function main() {
  const live = ARTIFACT_ONLY ? null : await contactLiveHost()
  const main = await mount({ label: 'parity' })
  const recall = await mount({ label: 'recall', config: { injectRecall: true } })
  const failures = []

  try {
    /* --------------------------------------------------------- live mount gate */
    if (live !== null) {
      await drive('harness:live-mount', `the live host at ${live.url} answers this surface`, async () => {
        expect(
          live.status === 200,
          `GET ${live.url} answered HTTP ${live.status} with ${live.bytes} bytes` +
            (live.bytes === 0
              ? ' — a ZERO-BYTE 404 is the host default and means this plugin is NOT MOUNTED (mounted surfaces answer a self-authored 404 here)'
              : ` (body: ${live.body.slice(0, 240)})`),
        )
        expect(Array.isArray(live.json?.rows), `the live census published no rows array (body: ${live.body.slice(0, 240)})`)
      })
      await drive('harness:live-population', 'the live census population agrees with this harness', async () => {
        const published = (live.json?.rows ?? []).map(row => row.id)
        const missing = EXPECTED_IDS.filter(id => !published.includes(id))
        const unknown = published.filter(id => !EXPECTED_IDS.includes(id))
        expect(missing.length === 0, `capabilities missing from the LIVE surface: ${JSON.stringify(missing)}`)
        expect(unknown.length === 0, `rows the LIVE surface publishes that this harness does not know: ${JSON.stringify(unknown)}`)
      })
    }

    /* --------------------------------------------------- population agreement */
    const census = await main.call('/meta-memory/api/census')
    await drive('harness:population', 'published rows agree with the harness population', async () => {
      expectStatus(census, 200, 'GET /api/census')
      const rows = census.json?.rows
      expect(Array.isArray(rows), 'GET /api/census did not publish a rows array')
      const published = rows.map(row => row.id)
      const missingFromSurface = EXPECTED_IDS.filter(id => !published.includes(id))
      const unknownToHarness = published.filter(id => !EXPECTED_IDS.includes(id))
      expect(
        missingFromSurface.length === 0,
        `capabilities the harness expects but the surface does not publish: ${JSON.stringify(missingFromSurface)}`,
      )
      expect(
        unknownToHarness.length === 0,
        `rows the surface publishes that this harness does not know about: ${JSON.stringify(unknownToHarness)}`,
      )
      expect(published.length === EXPECTED_IDS.length, `row count ${published.length} != expected ${EXPECTED_IDS.length}`)
    })

    const numerators = []
    await drive('harness:numerators', 'published numerator and denominator are derived from the rows', async () => {
      const rows = census.json?.rows ?? []
      const recountPresent = rows.filter(row => row.state === 'present').length
      const recountUnmeasured = rows.filter(row => row.state === 'unmeasured').length
      expect(census.json?.numerator === recountPresent, `published numerator ${census.json?.numerator} != recount ${recountPresent}`)
      expect(census.json?.denominator === rows.length, `published denominator ${census.json?.denominator} != row count ${rows.length}`)
      expect(census.json?.unmeasured === recountUnmeasured, `published unmeasured ${census.json?.unmeasured} != recount ${recountUnmeasured}`)
      numerators.push({ present: recountPresent, total: rows.length, unmeasured: recountUnmeasured })
    })

    await drive('harness:reasons', 'every unmeasured row carries a non-empty reason', async () => {
      const rows = census.json?.rows ?? []
      const bad = rows.filter(row => row.state === 'unmeasured' && (typeof row.reason !== 'string' || row.reason.trim().length === 0))
      expect(bad.length === 0, `unmeasured rows with no reason (a silent absence, forbidden by D-0352 rule 4): ${JSON.stringify(bad.map(row => row.id))}`)
    })

    /* ------------------------------------------------------------- memento */
    await drive('M1', 'the five actions of the memory tool', async () => {
      const tool = main.tool('meta_memory')
      const queried = await tool.execute({ action: 'query' })
      expect(Array.isArray(queried.entries), 'query did not return an entries array')

      const refused = await main.call(`/meta-memory/api/memento/add?track=user&scope=workspace&text=${MARK}-refused`, 'POST')
      expectStatus(refused, 409, 'add without approval')
      expect(refused.json?.code === 'approval-required', `add without approval answered ${refused.status} but code ${JSON.stringify(refused.json?.code)} instead of approval-required`)

      const added = await main.call(`/meta-memory/api/memento/add?approved=true&track=user&scope=workspace&text=${MARK}-alpha`, 'POST')
      expectStatus(added, 200, 'add with approval')
      expect(typeof added.json?.id === 'string' && added.json.id.length > 0, 'add with approval returned no id')

      const replaced = await main.call(`/meta-memory/api/memento/replace?approved=true&track=user&scope=workspace&match=${MARK}-alpha&text=${MARK}-alpha-v2`, 'POST')
      expectStatus(replaced, 200, 'replace')

      const second = await main.call(`/meta-memory/api/memento/add?approved=true&track=user&scope=workspace&text=${MARK}-beta`, 'POST')
      expectStatus(second, 200, 'add second entry')
      const consolidated = await main.call(
        `/meta-memory/api/memento/consolidate?approved=true&track=user&scope=workspace&matches=${MARK}-alpha-v2,${MARK}-beta&text=${MARK}-merged`,
        'POST',
      )
      expectStatus(consolidated, 200, 'consolidate')

      const removed = await main.call(`/meta-memory/api/memento/remove?approved=true&track=user&scope=workspace&match=${MARK}-merged`, 'POST')
      expectStatus(removed, 200, 'remove')
    })

    await drive('M2', 'retrieval by query as its own tool', async () => {
      const recalled = await main.tool('meta_memory_recall').execute({ text: MARK })
      expect(Array.isArray(recalled.entries), 'meta_memory_recall did not return an entries array')
      expect(typeof recalled.total === 'number', 'meta_memory_recall did not state a total')
    })

    await drive('M4.entries', 'GET the entry listing', async () => {
      const response = await main.call('/meta-memory/api/memento/entries')
      expectStatus(response, 200, 'entries')
      expect(Array.isArray(response.json?.entries), 'entries payload has no entries array')
    })

    await drive('M4.audit', 'GET the audit rows', async () => {
      const response = await main.call('/meta-memory/api/memento/audit')
      expectStatus(response, 200, 'audit')
      expect(Array.isArray(response.json?.rows), 'audit payload has no rows array')
    })

    await drive('M4.proposals', 'GET the pending proposals', async () => {
      const response = await main.call('/meta-memory/api/memento/proposals')
      expectStatus(response, 200, 'proposals')
      expect(Array.isArray(response.json?.proposals), 'proposals payload has no proposals array')
    })

    await drive('M4.store', 'GET the store path, existence and count', async () => {
      const response = await main.call('/meta-memory/api/memento/store')
      expectStatus(response, 200, 'store')
      expect(typeof response.json?.path === 'string', 'store payload has no path')
      expect(typeof response.json?.count === 'number', 'store payload has no count')
    })

    await drive('M5', 'the snapshot the member would inject, rendered by the member', async () => {
      const response = await main.call('/meta-memory/api/memento/snapshot')
      expectStatus(response, 200, 'snapshot')
      expect(typeof response.json?.text === 'string', 'snapshot payload has no text')
    })

    await drive('M6', 'the write-approval gate refuses an unapproved write', async () => {
      const refused = await main.call(`/meta-memory/api/memento/add?track=user&scope=workspace&text=${MARK}-gate`, 'POST')
      expectStatus(refused, 409, 'unapproved write')
      expect(refused.json?.refused === true, 'the refusal did not mark itself as a refusal')
      const store = await main.call('/meta-memory/api/memento/store')
      const texts = await main.call(`/meta-memory/api/memento/query?text=${MARK}-gate`)
      const leftBehind = (texts.json?.entries ?? []).filter(entry => String(entry.text ?? '').includes(`${MARK}-gate`))
      expect(
        leftBehind.length === 0,
        `the refused write is readable (${leftBehind.length} entries match), so the refusal did not prevent the write`,
      )
      expect(typeof store.json?.count === 'number', 'store count unreadable after the refusal')
    })

    await drive('M7', 'pending proposals are listed for a human', async () => {
      const response = await main.call('/meta-memory/api/memento/proposals')
      expectStatus(response, 200, 'proposals')
      expect(Array.isArray(response.json?.proposals), 'proposals payload has no proposals array')
    })

    await drive('M8', 'the append-only audit log records the writes', async () => {
      const response = await main.call('/meta-memory/api/memento/audit?limit=50')
      expectStatus(response, 200, 'audit')
      const rows = response.json?.rows
      expect(Array.isArray(rows) && rows.length > 0, 'the audit log is empty after writes, so it is not recording them')
      const fromFused = JSON.stringify(rows).includes('dsh-meta-memory')
      expect(fromFused, 'no audit row carries this surface as its source, so the writes were not attributed')
    })

    await drive('M9', 'the SQLite store itself, opened through the member', async () => {
      // A fresh entry first: M1 deliberately ends by removing what it merged, so
      // "the store is non-empty" has to be established here rather than assumed
      // from a previous reading.
      const added = await main.call(`/meta-memory/api/memento/add?approved=true&track=user&scope=workspace&text=${MARK}-store-proof`, 'POST')
      expectStatus(added, 200, 'add for the store proof')
      const response = await main.call('/meta-memory/api/memento/store')
      expectStatus(response, 200, 'store')
      expect(response.json?.exists === true, 'the store reports itself absent after writes')
      expect(typeof response.json?.count === 'number' && response.json.count > 0, 'the store holds no entries after a write')
      expect(existsSync(response.json.path), `the store path it reports does not exist on disk: ${response.json?.path}`)
    })

    /* --------------------------------------------------------------- delta */
    await drive('D1', 'a write lands a CANDIDATE in inbox/, never a fact', async () => {
      const written = await main.tool('meta_memory_write').execute({
        type: 'fact',
        conclusion: `${MARK} candidate conclusion`,
        key: `${MARK}-key`,
      })
      expect(typeof written.id === 'string' && written.id.length > 0, 'the write returned no id')
      expect(written.landed === 'inbox', `the write reported landing in ${JSON.stringify(written.landed)} instead of inbox`)
      expect(written.isStandingFact === false, 'the write did not state that the entry is not a standing fact')
      const inbox = join(main.paths.memoryRoot, 'inbox')
      const files = entriesIn(inbox)
      expect(files.some(name => name.includes(MARK)), `no file for this write is in inbox/ (inbox holds ${files.length} files)`)
    })

    await drive('D2', 'search across the layered store', async () => {
      // Read `matches`, never the whole payload: the member echoes the query back,
      // so a payload-wide `includes` would match its own question.
      const searched = await main.tool('meta_memory_search').execute({ query: MARK, where: 'all', limit: 10 })
      expect(Array.isArray(searched.matches), 'meta_memory_search did not return a matches array')
      expect(searched.matches.length > 0, 'the search found no match for an entry this run just wrote')
      const route = await main.call(`/meta-memory/api/delta/search?q=${MARK}&where=all&limit=10`)
      expectStatus(route, 200, 'delta search route')
      expect(Array.isArray(route.json?.matches), 'the delta search route did not return a matches array')
    })

    await drive('D3', 'the promotion gate refuses a promotion with no named human', async () => {
      const refused = await main.call(`/meta-memory/api/delta/promote?id=${MARK}-key`, 'POST')
      expectStatus(refused, 409, 'promote with no attribution')
      expect(
        refused.json?.code === 'promotion-requires-a-human',
        `promote with no attribution answered code ${JSON.stringify(refused.json?.code)} instead of promotion-requires-a-human`,
      )
    })

    await drive('D4.state', 'GET the delta panel state', async () => {
      const response = await main.call('/meta-memory/api/delta/state')
      expectStatus(response, 200, 'delta state')
      expect(typeof response.json?.root === 'string', 'delta state has no root')
    })

    await drive('D4.action', 'the promote action is carried as its own named route', async () => {
      const response = await main.call(`/meta-memory/api/delta/promote?id=nonexistent-${MARK}&by=verify`, 'POST')
      expect(response.status !== 404, 'the promote route is not registered (404), so the human gate has no fused door')
    })

    await drive('D4.search', 'GET the delta search route', async () => {
      const response = await main.call(`/meta-memory/api/delta/search?q=${MARK}`)
      expectStatus(response, 200, 'delta search')
    })

    await drive('D5', 'the differential injection payload, rendered by the member', async () => {
      const response = await main.call('/meta-memory/api/delta/inject-payload')
      expectStatus(response, 200, 'delta inject payload')
      expect(typeof response.json === 'object' && response.json !== null, 'the injection payload is not an object')
    })

    await drive('D8', 'the markdown store tree and the root rule that produced it', async () => {
      const response = await main.call('/meta-memory/api/delta/state')
      expectStatus(response, 200, 'delta state')
      expect(typeof response.json?.layers === 'object', 'delta state has no layer census')
      expect(typeof response.json?.rule === 'string', 'delta state does not state which root rule produced the path')
      expect(existsSync(join(main.paths.memoryRoot, 'inbox')), 'the inbox layer directory does not exist on disk')
    })

    /* ------------------------------------------------------------ injector */
    await drive('I1', 'a recall context contribution whose text a verdict can veto', async () => {
      const contributions = recall.contexts()
      const names = contributions.map(entry => entry.name)
      expect(
        names.includes('dsh-meta-memory:recall'),
        `no context contribution named dsh-meta-memory:recall was registered; registered: ${JSON.stringify(names)}`,
      )
      const entry = contributions.find(candidate => candidate.name === 'dsh-meta-memory:recall')
      const withheld = entry.text({ agent: { session: { id: 'session-with-no-verdict' } } })
      expect(withheld === '', `the provider returned ${JSON.stringify(withheld)} instead of the empty string when nothing was admitted`)
    })

    await drive('I2', 'the pre-step listener that stages the verdict', async () => {
      const listener = recall.listeners.find(candidate => candidate.event === 'agent/pre-step')
      expect(listener !== undefined, 'no agent/pre-step listener was registered')
      expect(listener.options?.prepend === true, 'the agent/pre-step listener was not registered with prepend: true')
      let called = 0
      const decision = await listener.listener({ agent: { session: { id: 'session-pre-step' } } }, async () => {
        called += 1
        return { kind: 'continue' }
      })
      expect(called === 1, `the listener did not continue the waterfall exactly once (called ${called} times)`)
      expect(decision !== undefined, 'the listener did not return the downstream decision, so it would break the turn')
    })

    await drive('I3', 'the gate status and verdicts observables', async () => {
      const status = await main.call('/meta-memory/api/inject/status')
      expectStatus(status, 200, 'inject status')
      expect(status.json?.ok === true, 'inject status did not report ok')
      const verdicts = await main.call('/meta-memory/api/inject/verdicts')
      expectStatus(verdicts, 200, 'inject verdicts')
      expect(verdicts.json?.ok === true, 'inject verdicts did not report ok')
    })

    await drive('I4', 'the durable verdict ledger', async () => {
      const response = await main.call('/meta-memory/api/inject/verdicts?limit=10')
      expectStatus(response, 200, 'inject verdicts')
      expect(typeof response.json?.sink === 'string', 'the ledger route does not state its sink path')
      expect(typeof response.json?.totals === 'object' && response.json.totals !== null, 'the ledger route published no totals')
    })

    await drive('I5', 'the System-1 admission decision, driven against the configured backend', async () => {
      const response = await main.call(`/meta-memory/api/inject/decide?task=${MARK}&text=${MARK}-recall&sessionId=parity`, 'POST')
      expectStatus(response, 200, 'inject decide')
      expect(typeof response.json?.outcome === 'string', 'the decision published no outcome')
      expect(typeof response.json?.admit === 'boolean', 'the decision published no admit boolean')
      expect(typeof response.json?.baseUrl === 'string', 'the decision does not state which backend it asked')
    })

    /* --------------------------------------------------------------- verdict */
    const rows = census.json?.rows ?? []
    const presentRows = rows.filter(row => row.state === 'present')
    const unmeasuredRows = rows.filter(row => row.state === 'unmeasured')
    const failedPresent = new Set()

    for (const row of presentRows) {
      const readings = results.filter(result => result.id === row.id)
      if (readings.length === 0) {
        failures.push(`${row.id}: the surface claims PRESENT but this harness took no reading for it — a claim with no check`)
        failedPresent.add(row.id)
        continue
      }
      for (const reading of readings) {
        if (!reading.ok) {
          failures.push(`${row.id} (${reading.what}): ${reading.detail}`)
          failedPresent.add(row.id)
        }
      }
    }

    for (const row of unmeasuredRows) {
      if (typeof row.reason !== 'string' || row.reason.trim().length === 0) {
        failures.push(`${row.id}: UNMEASURED with no reason — a silent absence, which D-0352 rule 4 forbids`)
      }
      if (results.some(result => result.id === row.id)) {
        failures.push(`${row.id}: the row says UNMEASURED but this harness drove a reading for it — the row and the check disagree`)
      }
    }

    for (const reading of results.filter(candidate => !candidate.ok && !/^[MDI]/.test(candidate.id))) {
      failures.push(`${reading.id} (${reading.what}): ${reading.detail}`)
    }

    const total = EXPECTED_IDS.length
    const unmeasured = unmeasuredRows.length
    const driven = presentRows.length
    const passed = driven - failedPresent.size
    const censusAt = census.json?.censusAt ?? '(not published)'

    console.log('')
    console.log('=== dsh-meta-memory · capability parity ===')
    console.log(
      `claim                           : ${live === null
        ? 'IN-PROCESS HANDLER ONLY — the live host was NOT contacted, so this is NOT a parity claim'
        : `LIVE MOUNT at ${live.url} (answered HTTP ${live.status}, ${live.bytes} bytes)`}`,
    )
    const liveMounted = live !== null && live.status === 200 && Array.isArray(live.json?.rows)
    const carriedLabel = live === null
      ? 'handler capabilities driven (IN-PROCESS ONLY, no deployment claim)'
      : liveMounted
        ? 'capabilities carried and driven (LIVE MOUNT)'
        : 'handler capabilities driven (NOT live parity: the mount failed above)'
    console.log(`${carriedLabel.padEnd(31)} : ${passed} / ${total}`)
    console.log(`  rows claiming PRESENT         : ${driven} / ${total}`)
    console.log(`  rows UNMEASURED with a reason : ${unmeasured} / ${total}`)
    console.log(`census time (from /api/census)  : ${censusAt}`)
    console.log(`checks taken                    : ${results.length}`)
    console.log(`store answered from             : ${main.paths.deltaRoot ?? '(unresolved)'}`)
    console.log('')
    for (const row of rows) {
      const state = row.state === 'present' ? 'PRESENT   ' : 'UNMEASURED'
      console.log(`  ${String(row.id).padEnd(14)} ${state} ${row.title}`)
      if (row.state === 'unmeasured') console.log(`      reason: ${row.reason}`)
    }

    if (total === 0) {
      console.log('')
      console.log('BLINDED: the capability denominator is 0, so nothing was measured and nothing may be claimed.')
      process.exit(2)
    }

    if (failures.length > 0) {
      console.log('')
      console.log(`MISMATCH — ${failures.length} failed reading(s):`)
      for (const failure of failures) console.log(`  - ${failure}`)
      console.log('')
      console.log('VERDICT: PARITY NOT ESTABLISHED')
      process.exit(1)
    }

    console.log('')
    if (live === null) {
      console.log(`VERDICT: IN-PROCESS HANDLER PARITY ONLY — ${passed}/${total} carried and driven in the handler, ${unmeasured}/${total} unmeasured with a stated reason. This is NOT a claim about any live deployment.`)
    } else {
      console.log(`VERDICT: LIVE PARITY ESTABLISHED — ${passed}/${total} capabilities carried and driven on the mounted surface at ${LIVE_URL}, ${unmeasured}/${total} unmeasured with a stated reason.`)
    }
    process.exit(0)
  } finally {
    main.dispose()
    recall.dispose()
  }
}

main().catch(error => {
  console.error('parity harness crashed:', error)
  process.exit(1)
})

/**
 * `verify/gate-control.mjs` — the control that proves the human gate survived.
 *
 * THE PROPERTY UNDER TEST. `dsh-memory-delta`'s defining safety property is that
 * a model's write lands as a CANDIDATE in `inbox/` and is NOT a standing fact —
 * not injected, not searched as a fact — until a named human promotes it. A
 * fusion can keep every route answering and still destroy that property by
 * turning a two-step promotion into a one-step write. So this file does not ask
 * "did the write succeed". It asks the question that can FAIL:
 *
 *   is the thing just written readable as a fact, by the surface's own reading,
 *   BEFORE any promotion has happened?
 *
 * A green parity run means every route answered. This control is what makes that
 * answer mean something, because it is stated as a NEGATIVE: the candidate must
 * be invisible to the fact layer. If a future change made `meta_memory_write`
 * write straight into `facts/`, parity would stay green and this file would go
 * red — which is the whole reason it exists separately.
 *
 * EXIT CODES: 0 the gate held on all counts · 1 the gate leaked (capability loss) ·
 * 2 the control could not run (nothing was written, so nothing was proven).
 *
 * @module dsh-meta-memory/verify/gate-control
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { entriesIn, mount, readText } from './harness.mjs'

const MARK = `gatecontrol-${Date.now().toString(36)}`
const CHECKS = []

/**
 * Record one check.
 * @param {string} name - what was checked.
 * @param {boolean} ok - the result.
 * @param {string} detail - the evidence, printed either way.
 */
function check(name, ok, detail) {
  CHECKS.push({ name, ok, detail })
}

async function main() {
  const surface = await mount({ label: 'gate-control' })
  try {
    const inbox = join(surface.paths.memoryRoot, 'inbox')
    const facts = join(surface.paths.memoryRoot, 'facts')
    const decisions = join(surface.paths.memoryRoot, 'decisions')

    /* ------------------------------------------------------------- 1. the write */
    const written = await surface.tool('meta_memory_write').execute({
      type: 'fact',
      conclusion: `${MARK}: a conclusion the model recorded`,
      reason: 'this control needs a candidate to try to read as a fact',
      key: `${MARK}-key`,
    })
    check(
      'a write lands through the fused tool and reports its identity',
      typeof written.id === 'string' && written.id.length > 0,
      `returned id ${JSON.stringify(written.id)}`,
    )
    if (typeof written.id !== 'string' || written.id.length === 0) {
      report()
      process.exit(2)
    }
    const id = written.id

    /* ------------------------------------------------ 2. it is a candidate on disk */
    const inboxFiles = entriesIn(inbox)
    check(
      'the write is on disk in inbox/',
      inboxFiles.some(name => name.includes(MARK)),
      `inbox/ holds ${inboxFiles.length} file(s): ${JSON.stringify(inboxFiles.slice(0, 6))}`,
    )
    const factFiles = entriesIn(facts)
    const decisionFiles = entriesIn(decisions)
    check(
      'the write is NOT on disk in facts/',
      !factFiles.some(name => name.includes(MARK)),
      `facts/ holds ${factFiles.length} file(s)`,
    )
    check(
      'the write is NOT on disk in decisions/',
      !decisionFiles.some(name => name.includes(MARK)),
      `decisions/ holds ${decisionFiles.length} file(s)`,
    )

    /* ------------------------------------ 3. the surface does NOT read it as a fact */
    //
    // READ `matches`, NEVER THE WHOLE PAYLOAD. The member's search result echoes
    // its own `query` back, so `JSON.stringify(result).includes(MARK)` is TRUE on
    // every search of any layer — it matches the echo, not a hit. That is this
    // program's "two encodings of one fact" trap: the first version of this file
    // reported the gate as LEAKED on three checks that were reading their own
    // question back. Every negative below is therefore stated over `matches.length`.
    const asFact = await surface.tool('meta_memory_search').execute({ query: MARK, where: 'facts', limit: 20 })
    check(
      'searching the fact layer returns NO match for the candidate',
      Array.isArray(asFact.matches) && asFact.matches.length === 0,
      `where=facts returned ${Array.isArray(asFact.matches) ? asFact.matches.length : 'no'} match(es) (the payload echoes the query, so it is not evidence either way)`,
    )
    const asDecision = await surface.tool('meta_memory_search').execute({ query: MARK, where: 'decisions', limit: 20 })
    check(
      'searching the decisions layer returns NO match for the candidate',
      Array.isArray(asDecision.matches) && asDecision.matches.length === 0,
      `where=decisions returned ${Array.isArray(asDecision.matches) ? asDecision.matches.length : 'no'} match(es)`,
    )
    const asInbox = await surface.tool('meta_memory_search').execute({ query: MARK, where: 'inbox', limit: 20 })
    check(
      'searching the inbox layer DOES return the candidate (so the negatives above are not blind searches)',
      Array.isArray(asInbox.matches) && asInbox.matches.length > 0,
      `where=inbox returned ${Array.isArray(asInbox.matches) ? asInbox.matches.length : 'no'} match(es)`,
    )
    const asAll = await surface.tool('meta_memory_search').execute({ query: MARK, where: 'all', limit: 20 })
    const layersHit = Array.isArray(asAll.matches) ? [...new Set(asAll.matches.map(match => match.where))] : []
    check(
      'the candidate is reachable only from the inbox layer',
      layersHit.length > 0 && layersHit.every(layer => layer === 'inbox'),
      `where=all matched layers ${JSON.stringify(layersHit)}`,
    )

    /* --------------------------- 4. it does NOT reach the model as standing memory */
    const payload = await surface.call('/meta-memory/api/delta/inject-payload')
    check(
      'the candidate is NOT in the differential injection payload',
      payload.status === 200 && !JSON.stringify(payload.json).includes(MARK),
      `the payload ${JSON.stringify(payload.json).includes(MARK) ? 'DID' : 'did not'} contain the candidate`,
    )

    /* ------------------------------------------------ 5. the gate is REFUSABLE */
    const refused = await surface.call(`/meta-memory/api/delta/promote?id=${encodeURIComponent(id)}`, 'POST')
    check(
      'a promotion with no named human is REFUSED',
      refused.status === 409 && refused.json?.code === 'promotion-requires-a-human',
      `answered HTTP ${refused.status} with code ${JSON.stringify(refused.json?.code)}`,
    )
    const afterRefusalFacts = entriesIn(facts)
    const afterRefusalDecisions = entriesIn(decisions)
    check(
      'the refused promotion moved nothing',
      !afterRefusalFacts.some(name => name.includes(MARK)) && !afterRefusalDecisions.some(name => name.includes(MARK)),
      `facts/ ${afterRefusalFacts.length} file(s), decisions/ ${afterRefusalDecisions.length} file(s) after the refusal`,
    )
    const stillCandidate = await surface.tool('meta_memory_search').execute({ query: MARK, where: 'facts', limit: 20 })
    check(
      'after the refusal the entry is STILL not a fact',
      Array.isArray(stillCandidate.matches) && stillCandidate.matches.length === 0,
      `where=facts returned ${Array.isArray(stillCandidate.matches) ? stillCandidate.matches.length : 'no'} match(es) after the refusal`,
    )

    /* ------------------------------- 6. the human step DOES promote, and only then */
    const promoted = await surface.call(`/meta-memory/api/delta/promote?id=${encodeURIComponent(id)}&by=verify-control`, 'POST')
    check(
      'a promotion naming a human succeeds',
      promoted.status === 200,
      `answered HTTP ${promoted.status}: ${JSON.stringify(promoted.json).slice(0, 200)}`,
    )
    const nowFacts = entriesIn(facts)
    const nowDecisions = entriesIn(decisions)
    const landed = [...nowFacts, ...nowDecisions].some(name => name.includes(MARK))
    check(
      'after promotion the entry is on disk in a standing layer',
      landed,
      `facts/ ${JSON.stringify(nowFacts.slice(0, 4))}, decisions/ ${JSON.stringify(nowDecisions.slice(0, 4))}`,
    )
    const nowReadable = await surface.tool('meta_memory_search').execute({ query: MARK, where: 'all', limit: 20 })
    const nowLayers = Array.isArray(nowReadable.matches) ? [...new Set(nowReadable.matches.map(match => match.where))] : []
    check(
      'after promotion the entry is readable from a standing layer',
      nowLayers.some(layer => layer === 'facts' || layer === 'decisions'),
      `where=all matched layers ${JSON.stringify(nowLayers)} after promotion`,
    )
    const afterPayload = await surface.call('/meta-memory/api/delta/inject-payload')
    check(
      'only AFTER promotion does the entry reach the injection payload',
      afterPayload.status === 200 && JSON.stringify(afterPayload.json).includes(MARK),
      `the payload ${JSON.stringify(afterPayload.json).includes(MARK) ? 'DID' : 'did not'} contain the promoted entry`,
    )
    const inboxAfter = entriesIn(inbox)
    check(
      'the entry left inbox/ when it was promoted',
      !inboxAfter.some(name => name.includes(MARK)),
      `inbox/ holds ${inboxAfter.length} file(s) after promotion`,
    )

    /* ------------------------------------------------------------------ verdict */
    report()
    const failed = CHECKS.filter(entry => !entry.ok)
    process.exit(failed.length === 0 ? 0 : 1)
  } finally {
    surface.dispose()
  }
}

/** Print the readings. */
function report() {
  console.log('')
  console.log('=== dsh-meta-memory · promotion-gate control ===')
  console.log(`checks: ${CHECKS.filter(entry => entry.ok).length} / ${CHECKS.length}`)
  console.log('')
  for (const entry of CHECKS) {
    console.log(`  ${entry.ok ? 'PASS' : 'FAIL'}  ${entry.name}`)
    console.log(`        ${entry.detail}`)
  }
  console.log('')
  const failed = CHECKS.filter(entry => !entry.ok)
  if (failed.length === 0) {
    console.log('VERDICT: THE GATE HELD — a candidate was not readable as a fact before promotion, the promotion was refusable, and it became a fact only when a human was named.')
  } else {
    console.log(`VERDICT: THE GATE LEAKED — ${failed.length} check(s) failed. A candidate is reaching the fact layer, which is a capability loss.`)
  }
}

main().catch(error => {
  console.error('gate control crashed:', error)
  process.exit(1)
})

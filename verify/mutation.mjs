/**
 * `verify/mutation.mjs` — the test of the tests.
 *
 * A GREEN RUN SAYS "NOTHING THAT RAN DISAGREED WITH ITS EXPECTATION". It does
 * not say any check has ever been shown able to disagree. So this file moves a
 * value in the SHIPPED ARTIFACT and requires the harness to go red, then restores
 * the bytes and requires green again. It mutates `lib/index.js` — the built file,
 * not the source — because the harnesses import the artifact, and a mutation
 * applied to `src/` would be tested only after a rebuild nobody performed.
 *
 * EACH MUTATION NAMES ITS TARGET AND ITS WITNESS. A mutation asserts three
 * things, and a mutation that only asserted the last would pass while the
 * replacement silently matched nothing:
 *   1. the pattern was FOUND in the artifact (a replacement of zero occurrences
 *      would make every harness green and read as a harness failure);
 *   2. the witness harness went RED with a non-zero exit;
 *   3. the artifact was restored BYTE-IDENTICALLY (sha256 compared, algorithm
 *      named, because a digest without its algorithm is not a value) and the
 *      witness went GREEN again.
 *
 * THE 404 MUTATION IS THE ONE THAT MATTERS MOST. Acceptance requires that an
 * unknown path under `/meta-memory` produces this plugin's own 404. Turning that
 * 404 into a 200 is a one-token change that no reading of the source would flag,
 * and it is exactly the shape of failure a prefix registration exists to prevent.
 *
 * EXIT CODES: 0 every mutation went red and every restore went green ·
 * 1 a mutation did NOT move its witness (a check nobody has shown able to fail) ·
 * 2 a mutation could not be applied (the artifact did not contain its target).
 *
 * @module dsh-meta-memory/verify/mutation
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ARTIFACT = join(HERE, '..', 'lib', 'index.js')
const BACKUP = join(HERE, '..', 'lib', 'index.js.mutation-backup')

/** sha256 of a file, stated with its algorithm wherever it is printed. */
function digestOf(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * The mutations. Each names a pattern that MUST occur in the artifact, its
 * replacement, and the harness that must notice.
 *
 * THE PATTERNS ARE THE EMITTED FORMS, NOT THE SOURCE FORMS. Relaxed here after
 * the first run: two mutations matched nothing because `tsdown` emits double
 * quotes where the source has single ones, so `code: 'approval-required'` occurs
 * zero times in the artifact while `RefusalError("approval-required"` occurs
 * once. That run refused rather than reporting a false green — which is the
 * behaviour this file wants — and the fix belongs in the pattern, not in a
 * looser check.
 */
const MUTATIONS = [
  {
    id: 'drop-a-route',
    why: 'a route the census claims PRESENT is no longer dispatched — parity must refuse to call the capability carried',
    find: 'path: "/api/memento/entries"',
    replace: 'path: "/api/memento/entries-dropped"',
    // `--artifact-only` because this mutation moves the ARTIFACT and its witness is
    // the artifact's own capability checks; the live-mount gate is a deployment
    // check that a byte edit cannot move, and it states its reduced claim in output.
    witness: { file: 'parity.mjs', args: ['--artifact-only'] },
    expectRed: /M4\.entries/,
  },
  {
    id: 'inflate-the-numerator',
    why: 'the surface publishes a count its own rows do not support — the derived-number check must cross-examine it',
    find: 'numerator: counts.present',
    replace: 'numerator: counts.present + 1',
    witness: { file: 'parity.mjs', args: ['--artifact-only'] },
    expectRed: /harness:numerators|numerator/,
  },
  {
    id: 'rename-the-approval-refusal',
    why: 'an unapproved memento write stops identifying itself as approval-required — the write policy check must notice',
    find: 'RefusalError("approval-required"',
    replace: 'RefusalError("approval-not-required"',
    witness: { file: 'parity.mjs', args: ['--artifact-only'] },
    expectRed: /approval-required/,
  },
  {
    id: 'rename-the-promotion-refusal',
    why: 'the human gate stops identifying itself as human-only — the promotion control must notice',
    find: 'RefusalError("promotion-requires-a-human"',
    replace: 'RefusalError("promotion-not-required"',
    witness: { file: 'gate-control.mjs', args: [] },
    // The witness reports a failing check by its NAME, and the mutated code word
    // appears only inside the detail line beneath it — so the expected evidence is
    // the FAIL line, not the string that changed.
    expectRed: /FAIL\s+a promotion with no named human/i,
  },
  {
    id: 'drop-the-tool-output-schema',
    why: 'the defect that made the plugin load-but-not-serve: a tool whose output has no schema is refused by the real registry, apply() throws, and the registered prefix rolls back — the harness must refuse to mount it',
    find: 'schema: { type: "object" },',
    replace: 'schema: undefined,',
    witness: { file: 'parity.mjs', args: ['--artifact-only'] },
    expectRed: /output\.schema|schema object|harness crashed/i,
  },
  {
    id: 'answer-200-for-an-unknown-path',
    why: 'the prefix stops reporting its own 404 and claims to serve a path it does not have — the route probe must notice',
    find: 'sendJson(res, 404, {',
    replace: 'sendJson(res, 200, {',
    witness: { file: 'route-probe.mjs', args: [] },
    expectRed: /unknown path|404/,
  },
]

/** Run one harness as a child process and return its exit code and output. */
async function runHarness(file, args) {
  const { spawnSync } = await import('node:child_process')
  const result = spawnSync(process.execPath, [join(HERE, file), ...args], {
    cwd: join(HERE, '..'),
    encoding: 'utf8',
    timeout: 180_000,
  })
  return { code: result.status ?? 1, stdout: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

async function main() {
  const original = digestOf(ARTIFACT)
  copyFileSync(ARTIFACT, BACKUP)
  const rows = []
  let couldNotApply = false

  try {
    for (const mutation of MUTATIONS) {
      const text = readFileSync(BACKUP, 'utf8')
      const occurrences = text.split(mutation.find).length - 1
      if (occurrences === 0) {
        rows.push({ ...mutation, applied: false, reason: `the artifact does not contain ${JSON.stringify(mutation.find)}` })
        couldNotApply = true
        continue
      }
      writeFileSync(ARTIFACT, text.replace(mutation.find, mutation.replace))

      const red = await runHarness(mutation.witness.file, mutation.witness.args)
      const namedTheDefect = mutation.expectRed.test(red.stdout)

      writeFileSync(ARTIFACT, text)
      const green = await runHarness(mutation.witness.file, mutation.witness.args)

      rows.push({
        id: mutation.id,
        why: mutation.why,
        applied: true,
        occurrences,
        witness: mutation.witness.file,
        redExit: red.code,
        redNamedDefect: namedTheDefect,
        redEvidence: (red.stdout.split('\n').find(line => mutation.expectRed.test(line)) ?? '(no line matched)').trim(),
        greenExit: green.code,
        greenEvidence: (green.stdout.split('\n').filter(line => /MISMATCH|VERDICT|crashed|- M/.test(line)).slice(-4).join(' | ') || '(no failure line)').trim(),
        ok: red.code !== 0 && namedTheDefect && green.code === 0,
      })
    }
  } finally {
    writeFileSync(ARTIFACT, readFileSync(BACKUP, 'utf8'))
    rmSync(BACKUP, { force: true })
  }

  const restored = digestOf(ARTIFACT)
  const restoredIdentical = restored === original

  console.log('')
  console.log('=== dsh-meta-memory · falsification (mutation) ===')
  console.log(`artifact            : lib/index.js`)
  console.log(`sha256 before       : ${original}`)
  console.log(`sha256 after restore: ${restored}`)
  console.log(`restored identically: ${restoredIdentical ? 'yes' : 'NO'}`)
  console.log(`mutations defined   : ${MUTATIONS.length}`)
  console.log(`mutations applied   : ${rows.filter(row => row.applied).length} / ${MUTATIONS.length}`)
  console.log(`mutations that moved their witness: ${rows.filter(row => row.ok).length} / ${MUTATIONS.length}`)
  console.log('')
  for (const row of rows) {
    console.log(`  ${row.applied === false ? 'NOT APPLIED' : row.ok ? 'RED THEN GREEN' : 'DID NOT MOVE'}  ${row.id}`)
    console.log(`        why: ${row.why}`)
    if (row.applied === false) {
      console.log(`        ${row.reason}`)
      continue
    }
    console.log(`        target found ${row.occurrences}×; witness ${row.witness}`)
    console.log(`        mutated: exit ${row.redExit}${row.redNamedDefect ? '' : ' (but the witness did not name the defect)'} — ${row.redEvidence}`)
    console.log(`        restored: exit ${row.greenExit}${row.greenExit === 0 ? '' : ` — ${row.greenEvidence}`}`)
  }

  console.log('')
  if (!restoredIdentical) {
    console.log('VERDICT: THE ARTIFACT WAS NOT RESTORED — run `pnpm run build` before using it.')
    process.exit(1)
  }
  if (couldNotApply) {
    console.log('VERDICT: A MUTATION COULD NOT BE APPLIED — the artifact has drifted from the mutations that are supposed to test it, so nothing below is evidence.')
    process.exit(2)
  }
  const unmoved = rows.filter(row => !row.ok)
  if (unmoved.length > 0) {
    console.log(`VERDICT: ${unmoved.length} MUTATION(S) DID NOT MOVE THEIR WITNESS — those checks have never been shown able to fail.`)
    process.exit(1)
  }
  console.log(`VERDICT: FALSIFIABLE — all ${MUTATIONS.length} mutations were detected, and every restore returned the artifact to its original bytes.`)
  process.exit(0)
}

main().catch(error => {
  console.error('mutation harness crashed:', error)
  process.exit(2)
})

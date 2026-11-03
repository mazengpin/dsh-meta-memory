/**
 * `verify/client-bundle.mjs` — drive the browser half, because a bundle that
 * parses is not a bundle that registers.
 *
 * WHY THIS FILE EXISTS SEPARATELY. The host harness imports `lib/index.js`, so
 * the client half is executed by nothing: `pnpm run build` would report a clean
 * client bundle while the tab it is supposed to produce never appeared.
 *
 * CORRECTED 2026-11-03 — THIS HARNESS WAS ONE CODE CHANGE BEHIND, AND IT FAILED
 * ON A DELIBERATE RETIREMENT RATHER THAN ON A DEFECT. `src/client/index.ts:67`
 * sets `MEMORY_TAB_RETIRED = true`: the owner saw two sidebar entries named
 * "Memory" (this census panel and `dsh-memento`'s real memory GUI), and the
 * duplication was resolved by retiring THIS tab while keeping
 * `/meta-memory/api/*` intact. The harness still demanded "exactly one tab
 * type", read `undefined` off an empty registration list, and reported 10
 * failures — a check measuring the PRE-retirement contract. It is not weakened
 * by this correction: it now asserts exactly one of TWO states, and both can go
 * RED.
 *
 *   A. RETIRED (the shipped state): zero tab types AND zero body seats, AND the
 *      retirement was ANNOUNCED on a warn line naming `dsh-memento`. A silent
 *      retirement fails, because a tab that vanishes with no message cannot be
 *      told apart from a bundle that never loaded.
 *   B. LIVE (flip the flag to `false`): one tab type, one body seat, an id and
 *      kind of this package's own, `priority` `extension`, a thunk title, a
 *      guide entry, and the body seat key EQUAL to the tab id — the property
 *      whose violation is invisible at runtime.
 *
 * A HALF-APPLIED two-stage registration (a type with no seat, or a seat with no
 * type) fails under BOTH readings, so neither state can hide it.
 *
 * EXIT CODES: 0 the client half is in one coherent, announced state · 1 it is
 * not · 2 the bundle could not be loaded at all.
 *
 * @module dsh-meta-memory/verify/client-bundle
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const BUNDLE = join(HERE, '..', 'lib', 'client.js')
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

/** The tab ids and kinds the product and the members already own, which this plugin must not reuse. */
const TAKEN = [
  'dsh-memento',
  'dsh-memory-delta',
  'dsh-memory-injector',
  '@deepseek-ai/dsh-client-ui-sidebar-right/guide',
  'guide',
  'documentpreview',
  'file',
  'editor',
]

async function main() {
  const source = readFileSync(BUNDLE, 'utf8')

  /* ---------------------------------------------- 1. the module-loader contract */
  let loaded = null
  const windowStub = {
    __ModuleLoader__: {
      load(entry) {
        loaded = entry
      },
    },
  }
  const requireStub = id => {
    if (id === 'react') return { createElement: (type, props, ...children) => ({ type, props, children }) }
    throw new Error(`the client bundle required ${JSON.stringify(id)}, which the module table stub does not provide`)
  }
  new Function('window', source)(windowStub)

  check(
    'the bundle registers through window.__ModuleLoader__.load',
    loaded !== null && typeof loaded.factory === 'function',
    loaded === null ? 'the bundle never called load()' : `load() got id ${JSON.stringify(loaded.id)}`,
  )
  if (loaded === null || typeof loaded.factory !== 'function') {
    report()
    process.exit(2)
  }
  check(
    "the bundle id is this package's own name",
    loaded.id === 'dsh-meta-memory',
    `id = ${JSON.stringify(loaded.id)}`,
  )

  const exports = loaded.factory(requireStub)
  check(
    'the factory exports name, inject and apply',
    exports.name === 'dsh-meta-memory' &&
      Array.isArray(exports.inject) &&
      exports.inject.includes('slots') &&
      typeof exports.apply === 'function',
    `name=${JSON.stringify(exports.name)}, inject=${JSON.stringify(exports.inject)}`,
  )
  check(
    'the factory exports the pane component, so a retired tab still ships a mountable body',
    typeof exports.MemoryPane === 'function',
    `MemoryPane type = ${typeof exports.MemoryPane}`,
  )

  /* ------------------------------------------------- 2. run apply against a stub */
  const registrations = { types: [], seats: [] }
  const warns = []
  const ctx = {
    sidebarRightTabs: {
      register(definition) {
        registrations.types.push(definition)
        return () => {}
      },
    },
    slots: {
      register(entry, component) {
        registrations.seats.push({ entry, component })
        return () => {}
      },
      inject(_name, contribute) {
        const dispose = contribute()
        return typeof dispose === 'function' ? dispose : () => {}
      },
    },
    effect(description) {
      const dispose = description()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    logger: {
      info() {},
      warn(...args) {
        warns.push(args.map(value => String(value)).join(' '))
      },
    },
  }
  exports.apply(ctx)

  const types = registrations.types
  const seats = registrations.seats
  const retired = types.length === 0 && seats.length === 0
  const retirementLine = warns.find(line => /RETIRED/.test(line)) ?? null

  check(
    'the two stages never half-apply: a tab type with no body seat, or a body seat with no tab type, is a broken registration',
    !(types.length === 1 && seats.length === 0) && !(types.length === 0 && seats.length === 1),
    `${types.length} type registration(s), ${seats.length} seat registration(s)`,
  )
  check(
    'the surface is in exactly one of the two recorded states: retired (0 and 0) or live (1 and 1)',
    retired || (types.length === 1 && seats.length === 1),
    `${types.length} type registration(s), ${seats.length} seat registration(s) — a third count is neither state`,
  )

  if (retired) {
    check(
      'the retirement was ANNOUNCED on a warn line, not silent',
      retirementLine !== null,
      retirementLine ?? (warns.length === 0 ? 'apply() emitted no warn line at all' : `warns: ${JSON.stringify(warns)}`),
    )
    check(
      'the retirement line names dsh-memento as the surface that owns Memory',
      retirementLine !== null && /dsh-memento/.test(retirementLine),
      retirementLine ?? 'no retirement line',
    )
    check(
      'the retirement line states that the route surface is unaffected',
      retirementLine !== null && /\/meta-memory\/api\//.test(retirementLine),
      retirementLine ?? 'no retirement line',
    )
    let renderError = null
    let rendered = null
    try {
      rendered = exports.MemoryPane({})
    } catch (error) {
      renderError = error instanceof Error ? error.message : String(error)
    }
    check(
      'the retired pane still renders, so re-enabling the tab is one flag rather than a repair',
      renderError === null,
      renderError === null ? `produced a ${typeof rendered} element` : renderError,
    )
  }
  else {
    const type = types[0] ?? {}
    const seat = seats[0] ?? { entry: {} }

    check(
      'the tab id is distinct from every member and product id',
      typeof type.id === 'string' && type.id.length > 0 && !TAKEN.includes(type.id),
      `id = ${JSON.stringify(type.id)}`,
    )
    check(
      "the tab kind is this package's own and is not a member or product kind",
      typeof type.kind === 'string' && type.kind.length > 0 && !TAKEN.includes(type.kind),
      `kind = ${JSON.stringify(type.kind)}`,
    )
    check(
      'the priority band is extension, never builtin',
      type.priority === 'extension',
      `priority = ${JSON.stringify(type.priority)} (an extension registration may take over a builtin kind, so claiming builtin could hide the workbench)`,
    )
    check(
      'the title is a thunk, so a language change needs no re-registration',
      typeof type.title === 'function' && typeof type.title() === 'string',
      `title() = ${JSON.stringify(typeof type.title === 'function' ? type.title() : type.title)}`,
    )
    check(
      'the guide entry carries the id, order and title the guide page reads',
      Array.isArray(type.guide) &&
        type.guide.length > 0 &&
        typeof type.guide[0].id === 'string' &&
        typeof type.guide[0].order === 'number' &&
        typeof type.guide[0].title === 'function',
      `guide = ${JSON.stringify((type.guide ?? []).map(entry => ({ id: entry.id, order: entry.order })))}`,
    )
    check(
      'the body seat is the keyed right-pane tab slot',
      seat.entry.name === 'sidebar.right.pane.tab',
      `seat name = ${JSON.stringify(seat.entry.name)}`,
    )
    check(
      'the body seat key EQUALS the tab definition id',
      seat.entry.key === type.id,
      `seat key ${JSON.stringify(seat.entry.key)} vs definition id ${JSON.stringify(type.id)} — keying the body by the KIND instead renders an empty pane with no error`,
    )
    check(
      'the body is a function the slot can mount',
      typeof seat.component === 'function',
      `component type = ${typeof seat.component}`,
    )

    let renderError = null
    let rendered = null
    try {
      rendered = seat.component({})
    } catch (error) {
      renderError = error instanceof Error ? error.message : String(error)
    }
    check(
      'the body renders without throwing',
      renderError === null,
      renderError === null ? `produced a ${typeof rendered} element` : renderError,
    )
  }

  check(
    'the body reaches React through the module table rather than bundling its own copy',
    source.includes('require("react")'),
    'the bundle calls require("react") inside the component, so the shell\'s frozen module table supplies it',
  )

  report()
  process.exit(CHECKS.every(entry => entry.ok) ? 0 : 1)
}

/** Print the readings. */
function report() {
  console.log('')
  console.log('=== dsh-meta-memory · client bundle ===')
  console.log(`checks: ${CHECKS.filter(entry => entry.ok).length} / ${CHECKS.length}`)
  console.log('')
  for (const entry of CHECKS) {
    console.log(`  ${entry.ok ? 'PASS' : 'FAIL'}  ${entry.name}`)
    console.log(`        ${entry.detail}`)
  }
  const failed = CHECKS.filter(entry => !entry.ok)
  console.log('')
  if (failed.length === 0) {
    console.log('VERDICT: THE CLIENT HALF IS COHERENT — either the tab is RETIRED and says so on a warn line while its pane still renders, or it is LIVE as one tab type with an id and kind of its own in the extension band and a body keyed by that same id.')
  } else {
    console.log(`VERDICT: THE CLIENT HALF IS NOT IN A COHERENT STATE — ${failed.length} check(s) failed.`)
  }
}

main().catch(error => {
  console.error('client bundle harness crashed:', error)
  process.exit(2)
})

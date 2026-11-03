/**
 * Client half of `dsh-meta-memory` — the ONE sidebar entry the fusion adds.
 *
 * WHAT IT REGISTERS, AND THE TWO THINGS THAT MUST DIFFER FROM UPSTREAM
 *
 * 1. A tab TYPE through the sidebar-right registry: `{ id, kind, priority }`.
 *    The `id` is this package's own namespace and the `kind` is `meta-memory` —
 *    neither is a member's, and neither is a product kind. That is not
 *    fastidiousness: a kind may carry one `builtin` and one `extension`
 *    registration at once, the extension is the one IN FORCE, and everything
 *    else colliding on a kind throws. So a fused plugin that reused a product
 *    kind, or claimed `priority: 'builtin'`, could take that kind over and hide
 *    whatever shipped under it. This tab therefore declares
 *    `priority: 'extension'` with its own kind, and cannot shadow anything.
 *
 * 2. The keyed body for that tab, in slot `sidebar.right.pane.tab`, keyed by the
 *    definition's own `id` — the seat looks the body up under the definition id,
 *    so the two are one value declared once and referenced, not two spellings
 *    that have to be kept equal by hand.
 *
 * NO STATIC `react` IMPORT, ON PURPOSE: the browser module-loader factory hands
 * the artifact a `require` that resolves the shell's frozen module table, so
 * `require('react')` inside the component is the supported way to reach React
 * from a bundle that must not carry its own copy. It also keeps this package's
 * typecheck free of a React type dependency it does not otherwise need.
 *
 * @module dsh-meta-memory/client
 */

/** The loader row and browser bundle id. */
export const name = 'dsh-meta-memory'

/** The three client services this half reads. */
export const inject = ['slots', 'sidebarRightTabs']

/** The tab definition's identity, and the keyed slot's key. ONE value, two uses. */
export const TAB_ID = 'dsh-meta-memory:memory'

/** This plugin's OWN tab kind. Never a product kind, never a member's. */
export const TAB_KIND = 'meta-memory'

/**
 * The priority band. `extension` is the band for a type from outside the product
 * and is the only band that may take over a `builtin` kind — which is exactly why
 * this plugin declares its own kind as well, so the band cannot be used to
 * shadow one.
 */
export const TAB_PRIORITY = 'extension' as const

/**
 * RETIRED 2026-11-01: this plugin's "Memory" tab, because it was the SECOND memory surface.
 *
 * The owner reported two memory surfaces in the chrome and asked for one. `dsh-memento` owns the
 * usable one — a store browser with entries, audit rows and the RAG card — while THIS plugin's tab
 * is a CAPABILITY CENSUS (numerator/denominator of what is carried, PRESENT/UNMEASURED per row).
 * It was still titled "Memory", so the sidebar offered two entries by that name for two different
 * things, which is the duplication the owner saw.
 *
 * The RETIREMENT is recorded rather than silently dropped, and the same applies as the one
 * `dsh-system-status` set when it retired its own Memory row: **the route surface is unaffected** —
 * `/meta-memory/api/census` and `/meta-memory/api/status` still answer, so anything that read this
 * plugin programmatically keeps working. Only the TAB and its pane are gone.
 *
 * Set this to `false` to bring the tab back; it is a flag rather than deleted code so the reversal
 * is one edit and cannot be mistaken for work that was never done.
 */
const MEMORY_TAB_RETIRED = true as const

/** The route root the panel reads. Kept as one constant so it cannot drift from the host half. */
export const ROUTES = {
  /** Route prefix owned by the host half. */
  root: '/meta-memory',
  /** The census payload. */
  census: '/meta-memory/api/census',
  /** The fused status payload. */
  status: '/meta-memory/api/status',
} as const

/** The `require` the module-loader factory supplies. Declared, never imported. */
declare const require: (id: string) => {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
}

/** The client context this half uses, declared structurally. */
interface ClientContext {
  readonly sidebarRightTabs?: {
    register(definition: Record<string, unknown>): () => void
  }
  readonly slots: {
    register(entry: Record<string, unknown>, component: unknown): () => void
    inject(name: string, contribute: () => () => void): () => void
  }
  effect(description: () => void | (() => void), label?: string): void
  get?(name: string): unknown
  logger?: { info(...args: unknown[]): void; warn?(...args: unknown[]): void }
}

/**
 * The tab body: a small census panel that shows the fused surface's own claim
 * and lets a reader reload it. It renders its summary imperatively into one node,
 * so the panel needs no hooks and no build-time React types.
 * @returns the panel element.
 */
export function MemoryPane(): unknown {
  const h = require('react').createElement
  const style = {
    font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
    padding: '12px 14px',
    whiteSpace: 'pre-wrap',
    color: 'inherit',
  } as const

  const load = (node: unknown): void => {
    const el = node as { textContent: string } | null
    if (el === null) return
    el.textContent = 'loading /meta-memory/api/census …'
    void fetch(ROUTES.census)
      .then(response => response.json() as Promise<Record<string, unknown>>)
      .then((payload: Record<string, unknown>) => {
        const numerator = payload['numerator']
        const denominator = payload['denominator']
        const unmeasured = payload['unmeasured']
        const censusAt = payload['censusAt']
        const rows = Array.isArray(payload['rows']) ? (payload['rows'] as Array<Record<string, unknown>>) : []
        const lines = [
          'Memory — dsh-meta-memory',
          '',
          `capabilities carried: ${String(numerator)} / ${String(denominator)}`,
          `unmeasured (with reasons): ${String(unmeasured)}`,
          `census at: ${String(censusAt)}`,
          '',
          ...rows.map(row => {
            const state = row['state'] === 'present' ? 'PRESENT' : 'UNMEASURED'
            return `${String(row['id']).padEnd(12)} ${state.padEnd(10)} ${String(row['title'])}`
          }),
        ]
        el.textContent = lines.join('\n')
      })
      .catch((error: unknown) => {
        el.textContent = `/meta-memory/api/census did not answer: ${error instanceof Error ? error.message : String(error)}`
      })
  }

  return h(
    'div',
    { style, 'data-meta-memory-panel': 'census' },
    h(
      'div',
      { ref: (node: unknown) => load(node) },
      'loading /meta-memory/api/census …',
    ),
    h(
      'button',
      {
        type: 'button',
        style: { marginTop: '10px', font: 'inherit', padding: '2px 8px' },
        onClick: (event: unknown) => {
          const target = (event as { currentTarget?: { parentElement?: unknown } } | null)?.currentTarget
          const sibling = (target?.parentElement as { firstElementChild?: unknown } | undefined)?.firstElementChild
          load(sibling)
        },
      },
      'Reload census',
    ),
  )
}

/**
 * Mount the client half.
 * @param ctx - the host client context.
 */
export function apply(ctx: ClientContext): void {
  // Read the tab registry defensively. It is provided by `ui-sidebar-right` as a
  // reflect-provided service, and a deployment without that package must lose the
  // TAB rather than the whole plugin: a pending loader row on a client half is a
  // silent nothing, whereas a warn line names what is missing.
  const registry =
    ctx.sidebarRightTabs ??
    (typeof ctx.get === 'function' ? (ctx.get('sidebarRightTabs') as ClientContext['sidebarRightTabs']) : undefined)
  if (MEMORY_TAB_RETIRED) {
    ctx.logger?.warn?.(
      'dsh-meta-memory: the Memory tab is RETIRED — dsh-memento owns the single memory surface; /meta-memory/api/* routes are unaffected',
    )
  } else if (registry === undefined) {
    ctx.logger?.warn?.(
      'dsh-meta-memory: the sidebarRightTabs service is absent, so the Memory tab type was not registered (the route surface is unaffected)',
    )
  } else {
    ctx.effect(
      () =>
        registry.register({
          id: TAB_ID,
          kind: TAB_KIND,
          priority: TAB_PRIORITY,
          multiple: false,
          title: () => 'Memory',
          guide: [
            {
              id: 'census',
              order: 40,
              title: () => 'Memory',
              description: () => 'The fused cross-session memory surface: what it carries and what it does not.',
            },
          ],
        }),
      'dsh-meta-memory: tab type',
    )
  }

  // Stage two: the body, keyed by the DEFINITION'S OWN `id` — which is the key
  // the seat looks the body up under (`ui-sidebar-right/src/client/tab-registry.ts`
  // header: "the body and title, which the seat finds under the definition's own
  // `id`"). Keying it by the KIND instead is the plausible mistake and it renders
  // nothing at all: the tab still appears, and its pane is empty with no error.
  if (!MEMORY_TAB_RETIRED) ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, MemoryPane),
      ),
    'dsh-meta-memory: tab body',
  )

  ctx.logger?.info(
    'dsh-meta-memory: sidebar tab %s registered as kind %s in band %s',
    TAB_ID,
    TAB_KIND,
    TAB_PRIORITY,
  )
}

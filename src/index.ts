/**
 * `dsh-meta-memory` — the memory half of the meta layer.
 *
 * WHAT THIS PLUGIN IS
 *
 * ONE fused surface over three member plugins that share the noun "cross-session
 * memory" and share very little else:
 *
 *  - `dsh-memento` is the family's STORE: SQLite entries on tracks and layers, a
 *    typed query seam, a frozen per-session snapshot, an approval-policy write
 *    gate and an append-only audit log.
 *  - `dsh-memory-delta` is the family's CURATED STORE: markdown layers whose
 *    defining property is that the MODEL can write only `inbox/` and only a
 *    named HUMAN can promote a candidate into `facts/` or `decisions/`.
 *  - `dsh-memory-injector` is the family's ADMISSION CONTROL: a
 *    `systemPrompt.context()` contribution whose text a pre-step System-1
 *    verdict can veto back to the empty string.
 *
 * WHAT "FUSE" MEANS HERE, AND WHAT IT DELIBERATELY DOES NOT MEAN
 *
 * One sidebar tab. One route prefix (`/meta-memory`). Four tools. Behind that,
 * the members are COMPOSED — their own library modules are imported and called,
 * never copied — and both curation postures are kept as SEPARATE, labelled
 * layers. They are not merged, and the reason is not tidiness: memento lets the
 * model add an entry under an approval policy, delta forbids the model from
 * writing a fact at all. A fusion that picked one of those postures would either
 * relax delta's human gate or remove memento's model-write capability, and
 * "every route still answered" would not make that less of a capability loss.
 *
 * WHY THE RECALL SEAM IS OFF BY DEFAULT
 *
 * Decision D-0352 rule 3 keeps every member mounted while fusion is in progress.
 * While `dsh-memory-injector`'s own context provider is mounted, a second
 * contribution here would put the same recall block into the prompt twice per
 * turn. So this plugin registers its provider and its pre-step listener only
 * when `injectRecall: true` is set, and `/meta-memory/api/inject/status` states
 * which of the two states it is in rather than leaving a reader to infer it. The
 * capability is real and `verify/parity.mjs` drives it — with the flag on, in a
 * harness of its own — which is how a capability can be PRESENT while a
 * deployment default keeps it quiet.
 *
 * @module dsh-meta-memory
 */

import { CONTEXT_ORDER_BASE, CONTEXT_ORDER_OFFSET, PREFIX, RECALL_CONTEXT_NAME } from './shared/protocol.ts'
import { compose } from './host/compose.ts'
import { createRouteHandler, type RouteDeps } from './host/routes.ts'
import { createOperations } from './host/stores.ts'
import { buildTools } from './host/tools.ts'
import { resolvePaths } from './host/stores.ts'
import type { FusedConfig, HostContext } from './host/types.ts'

/** The loader row and bundle id. */
export const name = 'dsh-meta-memory'

/**
 * All three services are required, because all three are the seams this plugin
 * exists to occupy: `tools` publishes the fused tool list, `webServer` owns the
 * prefix, and `systemPrompt` is where the admission seam lives.
 */
export const inject = ['tools', 'webServer', 'systemPrompt']

/**
 * Normalise the loader-row config.
 * @param raw - the config object from the loader row, if any.
 * @returns the config, with only recognised fields carried.
 */
export function resolveConfig(raw: unknown): FusedConfig {
  const input = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const text = (key: string): string | undefined => {
    const value = input[key]
    return typeof value === 'string' ? value : undefined
  }
  const number = (key: string): number | undefined => {
    const value = input[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
  }
  return {
    mementoDbPath: text('mementoDbPath'),
    deltaRoot: text('deltaRoot'),
    requireApproval: input['requireApproval'] !== false,
    injectRecall: input['injectRecall'] === true,
    gateBaseUrl: text('gateBaseUrl'),
    gateThreshold: number('gateThreshold'),
  }
}

/** Read a session id off a pre-step payload, defensively. */
function sessionIdOf(payload: unknown): string | null {
  const agent = (payload as { agent?: { session?: { id?: unknown } } } | null | undefined)?.agent
  const id = agent?.session?.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

/**
 * Mount the fused surface.
 * @param ctx - the host context.
 * @param rawConfig - the loader row's config.
 */
export async function apply(ctx: HostContext, rawConfig?: unknown): Promise<void> {
  const config = resolveConfig(rawConfig)
  const paths = resolvePaths(config, process.env, process.cwd())
  const composed = await compose()
  const ops = createOperations({ composed, config, paths })

  /** The staged recall text per session: absent means "withheld", which is the veto. */
  const recalls = new Map<string, string>()

  const order = ctx.systemPrompt.getContextOrder(CONTEXT_ORDER_BASE) + CONTEXT_ORDER_OFFSET

  const routeDeps: RouteDeps = {
    ops,
    composed,
    config,
    order,
    contextName: RECALL_CONTEXT_NAME,
    injectRecall: config.injectRecall === true,
    setRecall: (sessionId, text) => {
      if (text === null) recalls.delete(sessionId)
      else recalls.set(sessionId, text)
    },
    getRecall: sessionId => recalls.get(sessionId) ?? '',
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: PREFIX,
        handler: createRouteHandler(routeDeps),
      }),
    'dsh-meta-memory: /meta-memory prefix',
  )

  for (const tool of buildTools(ops)) ctx.tools.register(tool)

  if (config.injectRecall === true) {
    // One context contribution, whose text the pre-step verdict can empty. An
    // empty string is dropped by the host before the sections are joined, which
    // is the veto mechanism the injector member documents at its own
    // src/index.ts:15-30 — reused rather than re-invented.
    ctx.effect(
      () =>
        ctx.systemPrompt.context({
          name: RECALL_CONTEXT_NAME,
          order,
          text: (assemble?: unknown) => {
            const sessionId = sessionIdOf(assemble)
            return sessionId === null ? '' : (recalls.get(sessionId) ?? '')
          },
        }),
      'dsh-meta-memory: recall context',
    )

    // A pre-step listener that clears the slot, asks the member's gate over the
    // standing entries, and stages the block only when the gate admits it. Every
    // failure path leaves the slot empty: a broken gate withholds recall and never
    // breaks a turn.
    ctx.on(
      'agent/pre-step',
      async (payload: unknown, next: () => Promise<unknown>) => {
        const sessionId = sessionIdOf(payload)
        if (sessionId !== null) recalls.delete(sessionId)
        const gate = composed.injectorGate
        const recall = composed.injectorRecall
        const ledger = composed.injectorLedger
        if (sessionId !== null && gate !== null && recall !== null) {
          try {
            const candidates = ops.deltaCandidates(8)
            if (candidates.length > 0) {
              const block = recall.renderRecallBlock(candidates)
              const baseUrl = config.gateBaseUrl ?? 'http://127.0.0.1:8011'
              const answer = await gate.askGate({
                baseUrl,
                state: block,
                timeoutMs: 5000,
                threshold: config.gateThreshold ?? 0.5,
              })
              if (answer['admit'] === true) recalls.set(sessionId, block)
              if (ledger !== null) {
                const instance = new ledger.VerdictLedger(paths.injectLedger, 200, () => {})
                instance.commit({
                  at: new Date().toISOString(),
                  sessionId,
                  turn: 0,
                  step: 0,
                  outcome: String(answer['outcome'] ?? 'unavailable'),
                  admit: answer['admit'] === true,
                  reason: String(answer['reason'] ?? ''),
                  baseUrl,
                  lane: String(answer['lane'] ?? ''),
                  httpStatus: typeof answer['status'] === 'number' ? answer['status'] : null,
                  probabilities: (answer['probabilities'] as Record<string, number> | undefined) ?? null,
                  top: typeof answer['top'] === 'string' ? answer['top'] : null,
                  task: 'pre-step recall',
                  blockHash: recall.hashText(block),
                })
              }
            }
          } catch (error) {
            ctx.logger.warn(
              'dsh-meta-memory: recall withheld, gate path failed: %s',
              error instanceof Error ? error.message : String(error),
            )
            recalls.delete(sessionId)
          }
        }
        return next()
      },
      { prepend: true },
    )
  }

  ctx.logger.info(
    'dsh-meta-memory: fused surface at %s (memento %s, delta %s, injector %s; recall seam %s; gaps %d)',
    PREFIX,
    composed.memento === null ? 'absent' : composed.memento.version,
    composed.delta === null ? 'absent' : composed.delta.version,
    composed.injector === null ? 'absent' : composed.injector.version,
    config.injectRecall === true ? 'registered' : 'not registered',
    composed.gaps.length,
  )
}

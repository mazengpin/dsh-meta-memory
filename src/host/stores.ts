/**
 * The fused surface's three store handles, and the refusals that keep its gates.
 *
 * This module is where "compose, do not copy" is either true or false, so it is
 * worth being exact about what it does and does not do:
 *
 *  - Every WRITE and every READ of a store calls a function the MEMBER exports.
 *    memento's `openMemoryStore` / `insertEntry` / `replaceEntry` /
 *    `removeEntry` / `consolidateEntries` / `queryEntries` / `auditAppend` /
 *    `proposalList`; delta's `ensureLayout` / `createEntry` / `promoteEntry` /
 *    `searchLibrary` / `activeEntries` / `injectPayload` / `readAll`. This file
 *    adds path resolution and refusal rules around them, and no store format of
 *    its own.
 *  - It opens NO embedding backend, schedules NO publish, and calls NO model.
 *
 * THE TWO REFUSALS ARE THE POINT OF THE FILE.
 *
 * 1. A memento write needs `approved: true`. Memento reaches the same property
 *    through an `approval/request` waterfall; the fused surface has no approval
 *    prompt, so it carries the approval as an explicit argument and REFUSES a
 *    write that does not state one. The refusal is a thrown `RefusalError`, so a
 *    caller cannot silently get an unaudited write by omitting a field.
 * 2. A delta promotion needs `by` — a named human. Delta's structural property
 *    is that the MODEL cannot promote; the fused surface therefore exposes no
 *    tool that promotes at all, and the route that can refuses without an
 *    attribution. A two-step promotion turned into a one-step write is the
 *    regression this refusal exists to prevent.
 *
 * @module dsh-meta-memory/host/stores
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Composed, DeltaLibrary, MementoStore } from './compose.ts'
import type { FusedConfig } from './types.ts'

/** A refusal the fused surface makes on purpose. Distinct from a failure. */
export class RefusalError extends Error {
  /** Stable reason code, for a harness to assert on rather than on wording. */
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'RefusalError'
    this.code = code
  }
}

/** How one path was resolved, so a reader can see which store answered. */
export type RootRule = 'explicit-config' | 'DSH_MEMORY_ROOT' | 'cwd/memory' | 'member-default'

/** Every path the fused surface touches, each with the rule that produced it. */
export interface FusedPaths {
  /** DSH home, absolute. */
  readonly dshHome: string
  /** memento's SQLite file. */
  readonly mementoDb: string
  /** Which rule produced {@link mementoDb}. */
  readonly mementoRule: RootRule
  /** delta's markdown store root. */
  readonly deltaRoot: string
  /** Which rule produced {@link deltaRoot}. */
  readonly deltaRule: RootRule
  /** injector's verdict ledger. */
  readonly injectLedger: string
  /** injector's fallback candidate file. */
  readonly injectMemories: string
}

/**
 * Resolve every path once, recording the rule for each.
 * @param config - the plugin config.
 * @param env - the environment to read `DSH_HOME` / `DSH_MEMORY_ROOT` from.
 * @param cwd - the working directory used by the last-resort rules.
 * @returns the resolved paths and their rules.
 */
export function resolvePaths(config: FusedConfig, env: NodeJS.ProcessEnv, cwd: string): FusedPaths {
  const dshHome =
    typeof env['DSH_HOME'] === 'string' && env['DSH_HOME'].length > 0
      ? env['DSH_HOME']
      : join(homedir(), '.dsh')

  const mementoConfig = typeof config.mementoDbPath === 'string' ? config.mementoDbPath : ''
  const mementoDb =
    mementoConfig.length > 0
      ? resolve(mementoConfig)
      : join(dshHome, 'dsh-memento', 'memory.db')
  const mementoRule: RootRule = mementoConfig.length > 0 ? 'explicit-config' : 'member-default'

  let deltaRoot: string
  let deltaRule: RootRule
  if (typeof config.deltaRoot === 'string' && config.deltaRoot.length > 0) {
    deltaRoot = resolve(config.deltaRoot)
    deltaRule = 'explicit-config'
  } else if (typeof env['DSH_MEMORY_ROOT'] === 'string' && env['DSH_MEMORY_ROOT'].length > 0) {
    deltaRoot = resolve(env['DSH_MEMORY_ROOT'])
    deltaRule = 'DSH_MEMORY_ROOT'
  } else {
    deltaRoot = join(cwd, 'memory')
    deltaRule = 'cwd/memory'
  }

  return {
    dshHome,
    mementoDb,
    mementoRule,
    deltaRoot,
    deltaRule,
    injectLedger: join(dshHome, 'memory-injector', 'verdicts.jsonl'),
    injectMemories: join(dshHome, 'memory-injector', 'memories.json'),
  }
}

/** What one memory write reports back. */
export interface WriteResult {
  /** The member's own identifier for the new row or file. */
  readonly id: string
  /** Where it landed, in the store's own vocabulary. */
  readonly landed: string
  /** True only when the caller stated an approval. */
  readonly audited: boolean
}

/** The fused surface's operations. Both the routes and the tools call these. */
export interface FusedOperations {
  /** Resolved paths. */
  readonly paths: FusedPaths
  /** The composition's named gaps, for the status payload. */
  gaps(): readonly string[]
  /** memento: read. */
  mementoQuery(filter: Record<string, unknown>): { entries: unknown[]; total: number; truncated: boolean }
  /** memento: write one of add/replace/remove/consolidate, refusing without an approval. */
  mementoWrite(action: string, input: Record<string, unknown>, approved: boolean): WriteResult
  /** memento: the audit rows. */
  mementoAudit(limit?: number): unknown[]
  /** memento: the pending proposals. */
  mementoProposals(): unknown[]
  /** memento: the snapshot text the member would inject. */
  mementoSnapshot(cwd: string | undefined, agentPreset: string | undefined): { text: string; entries: number; proposals: number }
  /** memento: the store's own path/existence/count. */
  mementoStoreInfo(): { path: string; exists: boolean; count: number }
  /** delta: search the layered store. */
  deltaSearch(query: string, where: string, limit: number): Record<string, unknown>
  /** delta: land a CANDIDATE in inbox/. Never a fact. */
  deltaWrite(input: Record<string, unknown>): WriteResult
  /** delta: the human promotion step. Refuses without a named human. */
  deltaPromote(id: string, by: string): Record<string, unknown>
  /** delta: the layer census. */
  deltaState(): Record<string, unknown>
  /** delta: the rendered, budget-checked injection payload. */
  deltaInjectPayload(): Record<string, unknown>
  /** delta: the standing (already promoted) entries, as recall candidates. Read-only. */
  deltaCandidates(limit: number): Array<{ text: string }>
  /** Close any handle this plugin opened. */
  close(): void
}

/** Which member modules the operations need. */
export interface OperationDeps {
  readonly composed: Composed
  readonly config: FusedConfig
  readonly paths: FusedPaths
}

/**
 * Build the fused operations over the composed members.
 *
 * A handle is opened LAZILY, per call, and closed when the operation returns:
 * memento's SQLite store is opened by the member's own opener and closed by the
 * member's own `close`, so the fused plugin never holds a long-lived second
 * writer over a database the member's process also has open.
 *
 * @param deps - the composition, the config and the resolved paths.
 * @returns the operations object.
 */
export function createOperations(deps: OperationDeps): FusedOperations {
  const { composed, paths } = deps

  /**
   * Open memento's store through the member's own opener.
   * @returns the member store object.
   * @throws RefusalError when memento's modules are not composed.
   */
  const memento = (): MementoStore => {
    if (composed.mementoStore === null) {
      throw new RefusalError('member-unavailable', 'dsh-memento/lib/store.mjs is not composed, so the store cannot answer')
    }
    return composed.mementoStore.openMemoryStore(paths.mementoDb)
  }

  /**
   * Open delta's library through the member's own layout function.
   * @param create - whether the call may build the directories.
   * @returns the member's library handle.
   * @throws RefusalError when delta's store module is not composed.
   */
  const delta = (create: boolean): DeltaLibrary => {
    if (composed.deltaStore === null) {
      throw new RefusalError('member-unavailable', 'dsh-memory-delta store library is not composed, so the store cannot answer')
    }
    return composed.deltaStore.ensureLayout(paths.deltaRoot, { create })
  }

  /**
   * Append one audit row through the member's own audit method.
   * @param store - the member store.
   * @param row - the row to append.
   */
  const audit = (store: MementoStore, row: Record<string, unknown>): void => {
    store.auditAppend({
      action: 'write',
      outcome: 'ok',
      source: 'dsh-meta-memory',
      ...row,
    })
  }

  return {
    paths,
    gaps: () => composed.gaps,

    mementoQuery(filter) {
      const store = memento()
      try {
        return store.queryEntries(filter)
      } finally {
        store.close?.()
      }
    },

    mementoWrite(action, input, approved) {
      if (!approved) {
        throw new RefusalError(
          'approval-required',
          'this write is refused: the fused surface requires `approved: true` because a memento write is an approved, audited act (dsh-memento/index.mjs:1342 gates the same property through approval/request)',
        )
      }
      const store = memento()
      try {
        let id = ''
        let landed = action
        switch (action) {
          case 'add': {
            const entry = store.insertEntry(input) as { id: string }
            id = entry.id
            break
          }
          case 'replace': {
            const result = store.replaceEntry(input) as { entry: { id: string } }
            id = result.entry.id
            break
          }
          case 'remove': {
            const result = store.removeEntry(input) as { id: string }
            id = result.id
            landed = 'removed'
            break
          }
          case 'consolidate': {
            const result = store.consolidateEntries(input) as { entry: { id: string } }
            id = result.entry.id
            break
          }
          default:
            throw new RefusalError('unknown-action', `unknown memento action ${JSON.stringify(action)}`)
        }
        audit(store, { track: input['track'] ?? null, scope: input['scope'] ?? null, entryId: id, text: typeof input['text'] === 'string' ? input['text'] : null })
        return { id, landed, audited: true }
      } finally {
        store.close?.()
      }
    },

    mementoAudit(limit) {
      const store = memento()
      try {
        return store.auditList(limit ?? 50)
      } finally {
        store.close?.()
      }
    },

    mementoProposals() {
      const store = memento()
      try {
        return store.proposalList('pending', 50)
      } finally {
        store.close?.()
      }
    },

    mementoSnapshot(cwd, agentPreset) {
      const store = memento()
      try {
        const snapshot = composed.mementoSnapshot
        const workspace = composed.mementoWorkspace
        if (snapshot === null || workspace === null) {
          throw new RefusalError('member-unavailable', 'dsh-memento snapshot modules are not composed')
        }
        const workspaceKey = workspace.workspaceKeyOf(cwd)
        const agentKey = workspace.agentKeyOf(agentPreset)
        const entries = snapshot.visibleEntries(store.listEntries(), workspaceKey, agentKey)
        const proposals = snapshot.visibleProposals(
          store.proposalList('pending', 8) as ReadonlyArray<Record<string, unknown>>,
          workspaceKey,
          agentKey,
        )
        // The budget shape is the member's own: `{ track: { userGlobal, workspace } }`
        // (dsh-memento/lib/budget.mjs:69-78 reads exactly these four keys).
        const text = snapshot.renderSnapshot(
          entries,
          { user: { userGlobal: 1200, workspace: 900 }, agent: { userGlobal: 800, workspace: 600 } },
          proposals,
          'en',
        )
        return { text, entries: entries.length, proposals: proposals.length }
      } finally {
        store.close?.()
      }
    },

    mementoStoreInfo() {
      const store = memento()
      try {
        const count = store.listEntries().length
        return { path: store.path, exists: true, count }
      } finally {
        store.close?.()
      }
    },

    deltaSearch(query, where, limit) {
      const library = delta(false)
      const store = composed.deltaStore
      if (store === null) throw new RefusalError('member-unavailable', 'delta store library is not composed')
      return store.searchLibrary(library, { query, where, limit }) as Record<string, unknown>
    },

    deltaWrite(input) {
      const library = delta(true)
      const store = composed.deltaStore
      if (store === null) throw new RefusalError('member-unavailable', 'delta store library is not composed')
      const created = store.createEntry(library, input) as { id: string }
      return { id: created.id, landed: 'inbox', audited: false }
    },

    deltaPromote(id, by) {
      if (typeof by !== 'string' || by.trim().length === 0) {
        throw new RefusalError(
          'promotion-requires-a-human',
          'this promotion is refused: delta\'s inbox -> facts gate is a HUMAN step, so the fused surface requires the `by` attribution of the person performing it (dsh-memory-delta/bin/mem.mjs:952 promotes, and the model-side tool cannot reach it)',
        )
      }
      const library = delta(true)
      const store = composed.deltaStore
      if (store === null) throw new RefusalError('member-unavailable', 'delta store library is not composed')
      const result = store.promoteEntry(library, id, {}) as Record<string, unknown>
      return { ...result, promotedBy: by }
    },

    deltaState() {
      const library = delta(false)
      const store = composed.deltaStore
      if (store === null) throw new RefusalError('member-unavailable', 'delta store library is not composed')
      const all = store.readAll(library)
      const byLayer: Record<string, number> = { facts: 0, decisions: 0, inbox: 0, archive: 0 }
      for (const entry of all) {
        const where = typeof entry['where'] === 'string' ? entry['where'] : ''
        if (where in byLayer) byLayer[where] = (byLayer[where] ?? 0) + 1
      }
      return { root: library.root, rule: paths.deltaRule, layers: byLayer, total: all.length }
    },

    deltaInjectPayload() {
      const library = delta(false)
      const store = composed.deltaStore
      if (store === null) throw new RefusalError('member-unavailable', 'delta store library is not composed')
      return store.injectPayload(library, 3072) as Record<string, unknown>
    },

    deltaCandidates(limit) {
      const library = delta(false)
      const store = composed.deltaStore
      if (store === null) throw new RefusalError('member-unavailable', 'delta store library is not composed')
      // `activeEntries` is the member's own filter for the STANDING layers: only
      // facts/ and decisions/ entries are candidates. Inbox entries are not, which
      // is what keeps an unpromoted candidate out of the recall block.
      const standing = store.activeEntries(library)
      const out: Array<{ text: string }> = []
      for (const entry of standing) {
        if (out.length >= limit) break
        const data = entry['data'] as { conclusion?: unknown } | undefined
        const body = entry['body']
        const conclusion =
          typeof data?.conclusion === 'string'
            ? data.conclusion
            : typeof body === 'string'
              ? String(body).split('\n')[0]
              : ''
        if (conclusion.length > 0) out.push({ text: conclusion })
      }
      return out
    },

    close() {
      /* Every handle above is opened and closed inside its own call. */
    },
  }
}

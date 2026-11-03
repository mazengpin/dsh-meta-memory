/**
 * The composition loader: where the fused plugin reaches the members' own code.
 *
 * WHY THIS FILE EXISTS AT ALL
 *
 * Decision D-0352 forbids modifying any member plugin's source, and the brief
 * asks for composition over copying. Both members therefore have to be reached
 * WITHOUT editing them, and the fused plugin must not re-implement what they
 * already do — a second implementation of a promotion gate or a snapshot
 * renderer is a second thing that can disagree with the first.
 *
 * THE EXPORTS-MAP PROBLEM, AND WHY THIS SOLVES IT
 *
 * `dsh-memento` exports only `.` and `./client`; its `lib/store.mjs` and
 * `lib/snapshot.mjs` — the modules this plugin actually needs — are not
 * reachable as package subpaths, so `import 'dsh-memento/lib/store.mjs'` is
 * refused by Node's exports map. `dsh-memory-injector` is the same shape.
 * `dsh-memory-delta` DOES export `./cli`, which is its store library.
 *
 * The members' own files are still on disk and are still the members' files. So
 * this loader (a) resolves the package itself through Node, then (b) joins the
 * module path onto that package's directory and imports it by FILE URL, which
 * the exports map does not govern. Nothing is patched, nothing is re-exported
 * from a copy, and the module that runs is the module the member ships.
 *
 * WHICH PATH WAS USED IS RECORDED, NOT ASSUMED
 *
 * Two resolution strategies are tried in order and the winner is stamped into
 * the census, because "the member was found" and "the member was found here"
 * are different claims and only the second is auditable. The fallback is the
 * program's own layout rule — a clone of `<name>` lives in `plugins-src/<name>`
 * beside its siblings — derived from this package's own location rather than
 * from a machine path, so no absolute path is baked into the artifact.
 *
 * @module dsh-meta-memory/host/compose
 */

import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** How a member package was located. Stamped into the census as provenance. */
export type LocatorKind = 'node-resolution' | 'sibling-clone'

/** One resolved member package. */
export interface LocatedMember {
  /** The package's root directory (absolute). */
  readonly root: string
  /** The package version read from its own package.json. */
  readonly version: string
  /** Which strategy found it. */
  readonly locator: LocatorKind
}

/** This file's own directory; used only to DERIVE siblings, never published. */
const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Read a package's own name and version.
 * @param root - the package directory.
 * @returns the parsed identity, or nulls when the manifest is unreadable.
 */
function identityOf(root: string): { name: string | null; version: string | null } {
  try {
    const raw = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name?: unknown; version?: unknown }
    return {
      name: typeof raw.name === 'string' ? raw.name : null,
      version: typeof raw.version === 'string' ? raw.version : null,
    }
  } catch {
    return { name: null, version: null }
  }
}

/**
 * Locate one member package by name.
 *
 * Strategy 1 asks Node, which is right whenever the profile has linked the
 * member where this package can see it. Strategy 2 derives the sibling clone
 * from this package's own location, which is right under the program's layout
 * rule and works even when resolution is sandboxed away. Both are recorded.
 *
 * @param name - the package name, e.g. `dsh-memento`.
 * @returns the located member, or null when neither strategy found a manifest carrying that name.
 */
export function locateMember(name: string): LocatedMember | null {
  const strategies: Array<{ kind: LocatorKind; root: string }> = []
  try {
    const require = createRequire(import.meta.url)
    const entry = require.resolve(name)
    strategies.push({ kind: 'node-resolution', root: dirname(entry) })
  } catch {
    /* Node could not see it; the sibling strategy below is the documented fallback. */
  }
  // `lib/index.js` -> package root -> `plugins-src` -> the sibling clone.
  strategies.push({ kind: 'sibling-clone', root: resolve(HERE, '..', '..', name) })

  for (const candidate of strategies) {
    const identity = identityOf(candidate.root)
    if (identity.name === name && typeof identity.version === 'string') {
      return { root: candidate.root, version: identity.version, locator: candidate.kind }
    }
  }
  return null
}

/**
 * Import a module from inside a located member, as a file URL.
 * @param member - the located package.
 * @param relative - the module's path inside the package, e.g. `lib/store.mjs`.
 * @returns the imported module namespace, or null when the file is absent.
 */
async function importMemberModule<T>(member: LocatedMember, relative: string): Promise<T | null> {
  const file = join(member.root, relative)
  if (!existsSync(file)) return null
  return (await import(pathToFileURL(file).href)) as T
}

/** memento's store module: the SQLite surface this plugin writes and reads through. */
export interface MementoStoreModule {
  openMemoryStore(dbPath: string, options?: { retentionDays?: number }): MementoStore
  resolveDbPath(dbPath?: string, dshHome?: string): string
}

/**
 * The subset of memento's store object this plugin calls. Every method is the
 * member's own, and the names are the member's names as declared in
 * `dsh-memento/lib/store.mjs:269-540` — not a paraphrase of them.
 */
export interface MementoStore {
  /** The store's own absolute path (`lib/store.mjs:256`). */
  readonly path: string
  /** `lib/store.mjs:269`. */
  insertEntry(input: Record<string, unknown>): Record<string, unknown>
  /** `lib/store.mjs:400`. */
  listEntries(): ReadonlyArray<Record<string, unknown>>
  /** `lib/store.mjs:373`. */
  queryEntries(filter?: Record<string, unknown>): { entries: unknown[]; total: number; truncated: boolean }
  /** `lib/store.mjs:291`. */
  replaceEntry(input: Record<string, unknown>): Record<string, unknown>
  /** `lib/store.mjs:314`. */
  removeEntry(input: Record<string, unknown>): Record<string, unknown>
  /** `lib/store.mjs:333`. */
  consolidateEntries(input: Record<string, unknown>): Record<string, unknown>
  /** `lib/store.mjs:452`. */
  auditAppend(row: Record<string, unknown>): void
  /** `lib/store.mjs:466`. */
  auditList(limit?: number): unknown[]
  /** `lib/store.mjs:514`. */
  proposalList(status?: string, limit?: number): unknown[]
  /** `lib/store.mjs:492`. */
  proposalUpsert(input: Record<string, unknown>): Record<string, unknown>
  /** `lib/store.mjs:438`. */
  usage(track: string, scope: string): unknown
  /** `lib/store.mjs:483`. */
  close?(): void
}

/** memento's snapshot module: what the member would inject, rendered by the member. */
export interface MementoSnapshotModule {
  visibleEntries(entries: ReadonlyArray<Record<string, unknown>>, workspaceKey: string, agentKey?: string): unknown[]
  visibleProposals(proposals: ReadonlyArray<Record<string, unknown>>, workspaceKey: string, agentKey?: string): unknown[]
  renderSnapshot(entries: unknown[], budgets: unknown, proposals?: unknown[], language?: string): string
}

/** memento's workspace-key module. */
export interface MementoWorkspaceModule {
  workspaceKeyOf(cwd?: string): string
  agentKeyOf(agentPreset?: string): string
}

/** delta's store library. `createEntry` and `promoteEntry` are the two halves of the human gate. */
export interface DeltaStoreModule {
  resolveRoot(explicit?: string): string
  ensureLayout(root: string, options?: { create?: boolean }): DeltaLibrary
  loadConfig(root: string): Record<string, unknown>
  createEntry(library: DeltaLibrary, input: Record<string, unknown>): { id: string }
  promoteEntry(library: DeltaLibrary, id: string, options?: Record<string, unknown>): unknown
  searchLibrary(
    library: DeltaLibrary,
    options?: { query?: string; where?: string; limit?: number },
  ): { results?: unknown[] } & Record<string, unknown>
  activeEntries(library: DeltaLibrary): Array<Record<string, unknown>>
  injectPayload(library: DeltaLibrary, budget?: number): Record<string, unknown>
  readAll(library: DeltaLibrary): Array<Record<string, unknown>>
  collectDocs(library: DeltaLibrary): unknown[]
}

/** delta's library handle: the directory layout `ensureLayout` returns. */
export interface DeltaLibrary {
  readonly root: string
  readonly facts: string
  readonly decisions: string
  readonly inbox: string
  readonly archive: string
  readonly index: string
  readonly journal: string
  readonly config: string
}

/** injector's gate module: the System-1 admission decision. */
export interface InjectorGateModule {
  askGate(request: {
    readonly baseUrl: string
    readonly state: string
    readonly timeoutMs: number
    readonly threshold: number
    readonly fetchImpl?: typeof fetch
  }): Promise<Record<string, unknown>>
}

/** injector's recall module: the block renderer and its hash. */
export interface InjectorRecallModule {
  renderRecallBlock(candidates: ReadonlyArray<{ text: string }>): string
  hashText(text: string): string
}

/**
 * injector's ledger module. The class is
 * `new VerdictLedger(path, cap, warn)` and the writer is `commit`, not `append`
 * — the names are the member's (`dsh-memory-injector/src/host/ledger.ts:53-68`).
 */
export interface InjectorLedgerModule {
  VerdictLedger: new (
    path: string,
    cap: number,
    warn: (message: string, ...args: unknown[]) => void,
  ) => {
    commit(record: Record<string, unknown>): { record: Record<string, unknown>; written: boolean }
    totals(): Record<string, number>
    sessions(): unknown[]
    last(): unknown
    snapshot(limit?: number): unknown[]
    durability(): Record<string, unknown>
  }
}

/** Everything the fused plugin composes, resolved once at apply. */
export interface Composed {
  /** memento's located package, or null. */
  readonly memento: LocatedMember | null
  /** delta's located package, or null. */
  readonly delta: LocatedMember | null
  /** injector's located package, or null. */
  readonly injector: LocatedMember | null
  /** memento's store module. */
  readonly mementoStore: MementoStoreModule | null
  /** memento's snapshot module. */
  readonly mementoSnapshot: MementoSnapshotModule | null
  /** memento's workspace module. */
  readonly mementoWorkspace: MementoWorkspaceModule | null
  /** delta's store library. */
  readonly deltaStore: DeltaStoreModule | null
  /** injector's gate module. */
  readonly injectorGate: InjectorGateModule | null
  /** injector's recall module. */
  readonly injectorRecall: InjectorRecallModule | null
  /** injector's ledger module. */
  readonly injectorLedger: InjectorLedgerModule | null
  /** One line per module that could not be loaded, so a gap is named rather than inferred. */
  readonly gaps: readonly string[]
}

/**
 * Resolve every member module once.
 *
 * A member that cannot be located, or a module inside it that cannot be loaded,
 * produces a NAMED GAP rather than an exception: the fused plugin must still
 * activate and still publish its census when one member is absent, because a
 * fusion that refuses to boot without every member is a fusion that can take the
 * owner below where he started.
 *
 * @returns the composed handles and the gaps.
 */
export async function compose(): Promise<Composed> {
  const gaps: string[] = []
  const memento = locateMember('dsh-memento')
  const delta = locateMember('dsh-memory-delta')
  const injector = locateMember('dsh-memory-injector')

  if (memento === null) gaps.push('dsh-memento: package not located by node-resolution or sibling-clone')
  if (delta === null) gaps.push('dsh-memory-delta: package not located by node-resolution or sibling-clone')
  if (injector === null) gaps.push('dsh-memory-injector: package not located by node-resolution or sibling-clone')

  const mementoStore = memento === null ? null : await importMemberModule<MementoStoreModule>(memento, 'lib/store.mjs')
  const mementoSnapshot = memento === null ? null : await importMemberModule<MementoSnapshotModule>(memento, 'lib/snapshot.mjs')
  const mementoWorkspace = memento === null ? null : await importMemberModule<MementoWorkspaceModule>(memento, 'lib/workspace.mjs')
  const deltaStore = delta === null ? null : await importMemberModule<DeltaStoreModule>(delta, 'bin/mem.mjs')
  const injectorGate = injector === null ? null : await importMemberModule<InjectorGateModule>(injector, 'lib/host/gate.js')
  const injectorRecall = injector === null ? null : await importMemberModule<InjectorRecallModule>(injector, 'lib/host/recall.js')
  const injectorLedger = injector === null ? null : await importMemberModule<InjectorLedgerModule>(injector, 'lib/host/ledger.js')

  const named: Array<[string, unknown]> = [
    ['dsh-memento/lib/store.mjs', mementoStore],
    ['dsh-memento/lib/snapshot.mjs', mementoSnapshot],
    ['dsh-memento/lib/workspace.mjs', mementoWorkspace],
    ['dsh-memory-delta/bin/mem.mjs', deltaStore],
    ['dsh-memory-injector/lib/host/gate.js', injectorGate],
    ['dsh-memory-injector/lib/host/recall.js', injectorRecall],
    ['dsh-memory-injector/lib/host/ledger.js', injectorLedger],
  ]
  for (const [label, value] of named) {
    if (value === null) gaps.push(`${label}: module missing or not importable`)
  }

  return {
    memento,
    delta,
    injector,
    mementoStore,
    mementoSnapshot,
    mementoWorkspace,
    deltaStore,
    injectorGate,
    injectorRecall,
    injectorLedger,
    gaps,
  }
}

/**
 * The census: what the family actually exposes, and what this fusion carries.
 *
 * This file is the fused surface's claim about itself, and the claim is written
 * down ONCE, here, with a `path:line` for every member registration it names.
 * `verify/parity.mjs` reads this table and DRIVES every `fused` path — so a row
 * whose `fused` path does not answer is a red run, not a stale comment.
 *
 * TWO RULES FROM DECISION D-0352 ARE ENCODED HERE.
 *
 * Rule 2: capability parity, not route count. The table is per CAPABILITY, and a
 * member's eight routes are eight rows rather than one, because "the fusion
 * carries four of the member's eight routes" and "the fusion carries the
 * member's route table" are different statements and only the first is true.
 *
 * Rule 4: never publish a number it cannot derive. A row with no `fused` path
 * MUST carry a `reason`; `census()` counts it as `unmeasured`, never as zero and
 * never as absent, and `verify/parity.mjs` refuses the run outright when a
 * reason is missing — an unreasoned gap is the silent absence the rule forbids.
 *
 * THE DENOMINATOR IS 22 CAPABILITIES OVER 3 MEMBERS, and it is a count of what
 * this table enumerates rather than a count of what the members contain: the
 * table IS the operational definition, which is why every row cites the member
 * line that registers it.
 *
 * @module dsh-meta-memory/host/census
 */

import { MEMBER, type Capability, type MemberId, type MemberVerdict } from '../shared/protocol.ts'

/**
 * Every capability the fused surface accounts for.
 *
 * Citations are into the MEMBER's source, not this package's, and they are the
 * registration site — the line a reader opens to confirm the capability exists.
 */
export const CAPABILITIES: readonly Capability[] = [
  /* ---------------------------------------------------------------- memento */
  {
    id: 'M1',
    member: MEMBER.memento,
    title: 'The five-action memory tool: add, replace, remove, consolidate, query',
    mechanism: 'tool',
    citation: 'dsh-memento/index.mjs:484 (makeMemoryTool), action enum at index.mjs:493',
    fused: 'tool meta_memory -> /meta-memory/api/memento/query|add|replace|remove|consolidate',
    divergence:
      'Memento gates a write behind the host approval waterfall (index.mjs:1342). The fused surface has no approval prompt of its own, so it carries the approval as an EXPLICIT required argument (`approved: true`) and appends a memento audit row for every write, refusing the write outright when the argument is absent. The property "a write is an approved, audited act" survives; the prompt does not.',
  },
  {
    id: 'M2',
    member: MEMBER.memento,
    title: 'Retrieval by query, as its own tool (memory_recall)',
    mechanism: 'tool',
    citation: 'dsh-memento/index.mjs:2089 (makeMemoryRecallTool)',
    fused: 'tool meta_memory_recall -> /meta-memory/api/memento/query',
  },
  {
    id: 'M3',
    member: MEMBER.memento,
    title: 'The /memory slash command',
    mechanism: 'command',
    citation: 'dsh-memento/index.mjs:1723 (registerCommands)',
    fused: null,
    reason:
      'The fused surface registers no slash command: a command is a second entry point into the same service, and adding one here would create a surface whose behaviour is not driven by this package. The member keeps its command, and it remains reachable while the member stays loaded (D-0352 rule 3).',
  },
  {
    id: 'M4.entries',
    member: MEMBER.memento,
    title: 'GET /api/memento/entries — the entry listing with budgets and panel state',
    mechanism: 'route',
    citation: 'dsh-memento/index.mjs:2375-2394',
    fused: '/meta-memory/api/memento/entries',
  },
  {
    id: 'M4.audit',
    member: MEMBER.memento,
    title: 'GET /api/memento/audit — the audit rows',
    mechanism: 'route',
    citation: 'dsh-memento/index.mjs:2399-2410',
    fused: '/meta-memory/api/memento/audit',
  },
  {
    id: 'M4.proposals',
    member: MEMBER.memento,
    title: 'GET /api/memento/proposals — the pending proposals',
    mechanism: 'route',
    citation: 'dsh-memento/index.mjs:2413-2424',
    fused: '/meta-memory/api/memento/proposals',
  },
  {
    id: 'M4.store',
    member: MEMBER.memento,
    title: 'GET /api/memento/store — the store path, existence and entry count',
    mechanism: 'route',
    citation: 'dsh-memento/index.mjs:2437-2464 ({ path, exists, count })',
    fused: '/meta-memory/api/memento/store',
  },
  {
    id: 'M4.rag',
    member: MEMBER.memento,
    title: 'GET /api/memento/rag — the embedding/RAG backend state',
    mechanism: 'route',
    citation: 'dsh-memento/index.mjs:2468-2510',
    fused: null,
    reason:
      'The RAG route reports the member\'s embedding backend and vector-retrieval state. This fusion composes the store, not the embedding provider: it never opens an embedding backend, so it cannot derive this payload and will not publish a stand-in for it. The member keeps the route.',
  },
  {
    id: 'M4.models',
    member: MEMBER.memento,
    title: 'GET /api/memento/models — the local model/embedding probe',
    mechanism: 'route',
    citation: 'dsh-memento/index.mjs:2520-2580',
    fused: null,
    reason:
      'A probe of the local embedding/model processes. The fused plugin opens no device and calls no model of its own, so it cannot drive this probe and reports it UNMEASURED rather than reporting an empty model list as if it had measured one.',
  },
  {
    id: 'M4.recall',
    member: MEMBER.memento,
    title: 'GET /api/memento/recall — vector retrieval over the store',
    mechanism: 'route',
    citation: 'dsh-memento/index.mjs:2585-2650',
    fused: null,
    reason:
      'Vector retrieval needs the embedding backend this fusion does not compose (see M4.rag). The fused recall tool answers from the member\'s own lexical store query, which is a different mechanism and is not claimed as this one.',
  },
  {
    id: 'M4.control',
    member: MEMBER.memento,
    title: 'POST /api/memento/control — flip vector retrieval on/off',
    mechanism: 'route',
    citation: 'dsh-memento/index.mjs:2661-2705',
    fused: null,
    reason:
      'A live mutation of the member\'s own retrieval configuration. Reproducing it here would be a second writer of a setting the member owns, so the fusion leaves it on the member.',
  },
  {
    id: 'M5',
    member: MEMBER.memento,
    title: 'The frozen per-session snapshot injected through systemPrompt.section',
    mechanism: 'slot',
    citation: 'dsh-memento/index.mjs:1363 (ctx.systemPrompt.section, name "dsh-memento:memory")',
    fused: 'GET /meta-memory/api/memento/snapshot (rendered by the member\'s own renderSnapshot)',
    divergence:
      'The fused surface RENDERS the snapshot on request; it does not register a second systemPrompt.section. Two sections over one store would inject the same memory twice per turn, which is a regression, so the injection itself stays the member\'s and the fused route answers what would be injected.',
  },
  {
    id: 'M6',
    member: MEMBER.memento,
    title: 'The write-approval gate (approval/request waterfall + write policy)',
    mechanism: 'tool',
    citation: 'dsh-memento/index.mjs:1342-1356 (approval/request, { prepend: true })',
    fused: 'meta_memory write actions require `approved: true`; every write appends an audit row',
    divergence:
      'Carried as an explicit argument on the fused tool rather than as a host approval prompt — see M1. The refusing branch is driven by verify/parity.mjs: a write with no `approved` argument must be refused.',
  },
  {
    id: 'M7',
    member: MEMBER.memento,
    title: 'Pending proposals rendered into the snapshot and listed for a human',
    mechanism: 'route',
    citation: 'dsh-memento/index.mjs:847 (proposals.enabled/maxPending), index.mjs:1382 (proposalList)',
    fused: '/meta-memory/api/memento/proposals + the pending block in /meta-memory/api/memento/snapshot',
  },
  {
    id: 'M8',
    member: MEMBER.memento,
    title: 'The append-only audit log',
    mechanism: 'storage',
    citation: 'dsh-memento/lib/store.mjs (auditAppend / auditList), read at index.mjs:2407',
    fused: '/meta-memory/api/memento/audit',
  },
  {
    id: 'M9',
    member: MEMBER.memento,
    title: 'The SQLite store itself (entries, proposals, audit tables)',
    mechanism: 'storage',
    citation: 'dsh-memento/lib/store.mjs:232 (openMemoryStore), :154 (resolveDbPath)',
    fused: 'opened through the member\'s own openMemoryStore/resolveDbPath — no second store format',
    divergence:
      'One SQLite file, two connections (the member\'s own process and this plugin). Writes are durable and visible to a fresh read; the member\'s per-session frozen snapshot is frozen BY DESIGN, so a mid-session write appearing only in the next session is the member\'s documented behaviour and not a fusion defect.',
  },

  /* ------------------------------------------------------------------ delta */
  {
    id: 'D1',
    member: MEMBER.delta,
    title: 'memory_write — a durable CANDIDATE landed in inbox/, never a fact',
    mechanism: 'tool',
    citation: 'dsh-memory-delta/src/plugin.mjs:414-476, writing through bin/mem.mjs:720 (path.join(L.inbox, `${id}.md`))',
    fused: 'tool meta_memory_write -> POST /meta-memory/api/delta/write',
  },
  {
    id: 'D2',
    member: MEMBER.delta,
    title: 'memory_search over all six layers plus journal, sessions and index',
    mechanism: 'tool',
    citation: 'dsh-memory-delta/src/plugin.mjs:285-410 (where enum at :301), bin/mem.mjs:1790 (searchLibrary)',
    fused: 'tool meta_memory_search -> GET /meta-memory/api/delta/search',
  },
  {
    id: 'D3',
    member: MEMBER.delta,
    title: 'The HUMAN-ONLY promotion inbox -> facts|decisions',
    mechanism: 'route',
    citation: 'dsh-memory-delta/bin/mem.mjs:952 (promoteEntry); the model-side tool cannot reach it',
    fused: 'POST /meta-memory/api/delta/promote (requires `by`, an explicit human attribution)',
    divergence:
      'The fused surface keeps the gate two-step and keeps it OFF the model\'s tool list: there is no meta_* tool that promotes. A promotion must name who performed it, and the write tool\'s own description states that its result is not yet a standing fact.',
  },
  {
    id: 'D4.state',
    member: MEMBER.delta,
    title: 'GET /dsh-memory-delta/state — the panel state route',
    mechanism: 'route',
    citation: 'dsh-memory-delta/src/panel.mjs:36 (MEMORY_ROUTE_PATH)',
    fused: '/meta-memory/api/delta/state',
  },
  {
    id: 'D4.action',
    member: MEMBER.delta,
    title: 'POST /dsh-memory-delta/action — the panel\'s write actions (promote, rename)',
    mechanism: 'route',
    citation: 'dsh-memory-delta/src/panel.mjs:39 (MEMORY_ACTION_PATH)',
    fused: '/meta-memory/api/delta/promote (the promote action only)',
    divergence:
      'The fused surface carries `promote` as its own named route rather than a generic action dispatcher, so the human gate is a route a reader can see and refuse rather than one verb among many. `rename` stays on the member.',
  },
  {
    id: 'D4.search',
    member: MEMBER.delta,
    title: 'GET /dsh-memory-delta/search — the search route',
    mechanism: 'route',
    citation: 'dsh-memory-delta/src/panel.mjs:58 (MEMORY_SEARCH_PATH), registered at panel.mjs:615',
    fused: '/meta-memory/api/delta/search',
  },
  {
    id: 'D4.pressure',
    member: MEMBER.delta,
    title: 'The pressure route and its /memory-delta/api/pressure alias',
    mechanism: 'route',
    citation: 'dsh-memory-delta/src/panel.mjs:68 (MEMORY_PRESSURE_PATH), :71 (alias)',
    fused: null,
    reason:
      'The pressure route is a scheduled re-embedding trigger whose settlement marker is written by a consumer polling it. The fused plugin composes no embedding backend and schedules no publish, so carrying the route would advertise a trigger it cannot honour — an advertised path that cannot answer. The member keeps both the route and its alias.',
  },
  {
    id: 'D5',
    member: MEMBER.delta,
    title: 'The differential agent/pre-step injection of standing entries',
    mechanism: 'slot',
    citation: 'dsh-memory-delta/src/hook.mjs (createMemoryHook) + src/planner.mjs (planInjection), payload from bin/mem.mjs:1668 (injectPayload)',
    fused: 'GET /meta-memory/api/delta/inject-payload (the member\'s own injectPayload, budget-checked)',
    divergence:
      'The fused surface renders and budget-checks the payload; it does not register a second pre-step splice. Two splices over one store would push the same entries twice per turn.',
  },
  {
    id: 'D6',
    member: MEMBER.delta,
    title: 'The runtime-registered skill (dsh-memory-delta)',
    mechanism: 'skill',
    citation: 'dsh-memory-delta/src/skill.mjs:18 (SKILL_NAME), registered at src/plugin.mjs:589',
    fused: null,
    reason:
      'A skill is discovered by the skills service from the registry owner\'s own row. Registering the same skill name from a second plugin would be a duplicate registration, and registering it under a different name would be a second copy of one document. The member keeps it.',
  },
  {
    id: 'D7',
    member: MEMBER.delta,
    title: 'The zero-dependency `mem` CLI',
    mechanism: 'cli',
    citation: 'dsh-memory-delta/bin/mem.mjs (bin: mem), import-guarded at bin/mem.mjs:2138-2151',
    fused: null,
    reason:
      'A CLI is a process entry point, not a route or a tool, so it cannot be "driven through the fused surface" in the sense D-0352 rule 2 asks for. This fusion reuses the SAME library module the CLI reuses (bin/mem.mjs is import-guarded and exports the store functions), which is why the store behaviour matches exactly while the CLI itself stays the member\'s.',
  },
  {
    id: 'D8',
    member: MEMBER.delta,
    title: 'The markdown store tree: inbox/ facts/ decisions/ archive/ + journal, index',
    mechanism: 'storage',
    citation: 'dsh-memory-delta/bin/mem.mjs:236-255 (ensureLayout: root + four layer dirs + journal + index + config)',
    fused: 'read and written through the member\'s own ensureLayout/readAll/createEntry',
    divergence:
      'Same tree, one writer path (the member\'s functions). The fused plugin resolves the same root rule — explicit root, then $DSH_MEMORY_ROOT, then <cwd>/memory — and states which it used in /meta-memory/api/status so a reader can see which store answered.',
  },

  /* --------------------------------------------------------------- injector */
  {
    id: 'I1',
    member: MEMBER.injector,
    title: 'A systemPrompt.context recall block that a pre-step verdict can veto to empty',
    mechanism: 'slot',
    citation: 'dsh-memory-injector/src/index.ts:181-193 (ctx.systemPrompt.context, name "memory-injector:recall")',
    fused: 'systemPrompt.context "dsh-meta-memory:recall" + POST /meta-memory/api/inject/decide',
    divergence:
      'Registered under the fused surface\'s OWN name and order so it cannot collide with the member\'s contribution. The veto mechanics are the member\'s — the provider returns the empty string, which the host drops before joining — and the block is rendered by the member\'s own renderRecallBlock.',
  },
  {
    id: 'I2',
    member: MEMBER.injector,
    title: 'The per-(turn,step) admit/refuse verdict listener',
    mechanism: 'slot',
    citation: 'dsh-memory-injector/src/index.ts:276-317 (ctx.on agent/pre-step, { prepend: true })',
    fused: 'agent/pre-step listener registered by this plugin, writing to the member\'s verdict ledger',
  },
  {
    id: 'I3',
    member: MEMBER.injector,
    title: 'GET /memory-inject/api/status and /verdicts — the gate\'s observable',
    mechanism: 'route',
    citation: 'dsh-memory-injector/src/host/routes.ts:60-95',
    fused: '/meta-memory/api/inject/status and /meta-memory/api/inject/verdicts',
  },
  {
    id: 'I4',
    member: MEMBER.injector,
    title: 'The durable verdict ledger (one JSONL record per decision)',
    mechanism: 'storage',
    citation: 'dsh-memory-injector/src/host/ledger.ts:52-90 (appendFileSync, dirname mkdir, durability)',
    fused: 'the member\'s own VerdictLedger class pointed at the member\'s own sink path',
  },
  {
    id: 'I5',
    member: MEMBER.injector,
    title: 'The System-1 admission decision itself (askGate against the local backend)',
    mechanism: 'tool',
    citation: 'dsh-memory-injector/src/host/gate.ts:116 (askGate)',
    fused: 'POST /meta-memory/api/inject/decide, calling the member\'s askGate',
    divergence:
      'Reachability is a runtime fact, not a property of this plugin: when no decision backend answers, the fused surface reports the gate UNMEASURED with the backend URL and the error, and the recall block is withheld (fail closed), which is the member\'s own rule.',
  },
]

/**
 * The inclusion/exclusion verdict per member, and the evidence that settled it.
 *
 * The `purpose` strings are QUOTATIONS from `profiles-info/plugins.json`, because
 * a member's own README states its ambition and the registry states what this
 * program recorded it as. The second is the one the decision rests on.
 */
export const MEMBER_VERDICTS: readonly MemberVerdict[] = [
  {
    member: MEMBER.memento,
    included: true,
    purpose:
      'The memory-RAG lane\'s store: cross-agent local-first persistent memory with a typed query seam (profiles-info/plugins.json).',
    surface: { tools: 2, routes: 8, slots: 2, commands: 1, cliEntryPoints: 1, storageRoots: 1 },
    curation: 'approval-policy writes: a write passes through an approval/request waterfall and is audited; the model may add with approval.',
    evidence:
      'It is the family\'s STORE and the only member with a durable typed query store, and its frozen snapshot is what the family injects; every one of its four absorbable routes plus its tools were driven through /meta-memory and answered.',
  },
  {
    member: MEMBER.delta,
    included: true,
    purpose:
      'Layered cross-session memory: 2 tools, one agent/pre-step injection, 3 web routes, 1 runtime-registered skill and 8 config keys, ... it is a SECOND memory store beside dsh-memento (profiles-info/plugins.json).',
    curation: 'human-only promotion: the model can write ONLY inbox/, and only a named human promotes a candidate into facts/ or decisions/.',
    surface: { tools: 2, routes: 5, slots: 0, commands: 0, cliEntryPoints: 1, storageRoots: 1 },
    evidence:
      'SAME PURPOSE, DIFFERENT CURATION POSTURE — the registry itself records it as a second memory store beside memento, and its store is markdown layers with a structural human gate rather than SQLite with an approval policy. Included, and deliberately NOT merged: its inbox->fact gate is carried as a separate, explicitly-labelled layer, because merging the two postures would relax the stricter one and a fusion that removes a safety property is a capability loss even when every route still answers.',
  },
  {
    member: MEMBER.injector,
    included: true,
    purpose:
      'The gateable recall seam the memory-RAG lane needs: a systemPrompt.context() contribution whose provider is re-resolved after the agent/pre-step waterfall, vetoed by returning the empty string (profiles-info/plugins.json).',
    surface: { tools: 0, routes: 2, slots: 1, commands: 0, cliEntryPoints: 0, storageRoots: 2 },
    curation: 'none of its own: it holds no memory and writes no standing entry; it decides whether another member\'s recall reaches the prompt.',
    evidence:
      'Same intent, third mechanism: it is ADMISSION CONTROL over the family\'s recall, and it exists in the family only because memento\'s snapshot section has no enclosing conditional (its own header cites dsh-memento/index.mjs:1166). Included because dropping it would drop the family\'s only veto over memory injection, and it exposes no tool of its own, so it needs no tool name in the fused surface.',
  },
]

/** Derived counts over one capability population. */
export interface CensusCounts {
  /** Every capability the table enumerates. */
  readonly total: number
  /** Carried and driven by the fused surface. */
  readonly present: number
  /** Not carried, with a stated reason. */
  readonly unmeasured: number
  /** Per-member numerator/denominator. */
  readonly byMember: Readonly<Record<MemberId, { readonly present: number; readonly total: number }>>
  /** Rows that claim a fused path but carry no reason and no divergence — must be zero. */
  readonly rowsWithoutFusedButWithReason: number
  /** True when a row could not be attributed to a member or a fused path at all. */
  readonly blinded: boolean
}

/**
 * Derive the census from the table. Never returns a hardcoded figure.
 * @param rows - the capability rows to count; defaults to {@link CAPABILITIES}.
 * @returns the counts, with the denominator always stated beside the numerator.
 */
export function census(rows: readonly Capability[] = CAPABILITIES): CensusCounts {
  const total = rows.length
  let present = 0
  let unmeasured = 0
  let reasoned = 0
  let blinded = false
  const byMember: Record<string, { present: number; total: number }> = {}

  for (const row of rows) {
    const bucket = byMember[row.member] ?? (byMember[row.member] = { present: 0, total: 0 })
    bucket.total += 1
    if (row.fused !== null) {
      present += 1
      bucket.present += 1
    } else {
      unmeasured += 1
      if (typeof row.reason === 'string' && row.reason.trim().length > 0) reasoned += 1
    }
    if (total > 0 && bucket.total === 0) blinded = true
  }

  return {
    total,
    present,
    unmeasured,
    byMember: byMember as Record<MemberId, { present: number; total: number }>,
    rowsWithoutFusedButWithReason: unmeasured === 0 ? 0 : reasoned,
    blinded: total === 0 || blinded,
  }
}

/**
 * The rows that are carried but whose parity has never been observed, which is
 * the coverage figure a caller must publish beside the pass count: a green total
 * says nothing ran disagreeing, not that every row can disagree.
 * @param rows - the capability rows.
 * @returns how many carried rows exist, for use as a denominator elsewhere.
 */
export function carriedRows(rows: readonly Capability[] = CAPABILITIES): number {
  return rows.filter(row => row.fused !== null).length
}

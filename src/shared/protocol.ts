/**
 * The fused surface's own vocabulary.
 *
 * Everything the fused plugin publishes is named HERE, once, so a route listing
 * cannot drift from the route table and a tool name cannot drift from the tool
 * declaration. The member plugins' strings are NOT repeated in this file: they
 * are read from the members themselves at run time (see `host/compose.ts`),
 * because a copied constant is a constant that can disagree with its source.
 *
 * @module dsh-meta-memory/shared/protocol
 */

/** The loader row name and bundle id. */
export const PLUGIN_NAME = 'dsh-meta-memory'

/** The ONE route prefix this plugin owns, and the whole subtree under it. */
export const PREFIX = '/meta-memory'

/** The plugin's own `systemPrompt.context` contribution. Distinct from every member's. */
export const RECALL_CONTEXT_NAME = 'dsh-meta-memory:recall'

/** The context position: just after the last centrally-allocated runtime-context slot. */
export const CONTEXT_ORDER_BASE = 'SUBAGENT_DELEGATION'

/** How far after that position this plugin's context sits. */
export const CONTEXT_ORDER_OFFSET = 20

/** The four fused tools. Each name is prefixed so it cannot collide with a member's own tool. */
export const TOOL = {
  /** memento's durable store, addressed as one tool with five actions. */
  memory: 'meta_memory',
  /** memento's retrieval-by-query surface. */
  recall: 'meta_memory_recall',
  /** delta's layered store, read side (all six layers plus journal/sessions/index). */
  search: 'meta_memory_search',
  /** delta's layered store, write side. Lands a CANDIDATE in inbox/, never a fact. */
  write: 'meta_memory_write',
} as const

/** The member ids this fused plugin presents. */
export const MEMBER = {
  /** The family's STORE: SQLite, tracks and layers, approval-policy writes, audit. */
  memento: 'dsh-memento',
  /** The family's CURATED STORE: markdown layers with a human-only promotion gate. */
  delta: 'dsh-memory-delta',
  /** The family's ADMISSION CONTROL: the veto over whether recall reaches the prompt. */
  injector: 'dsh-memory-injector',
} as const

/** A member id. */
export type MemberId = (typeof MEMBER)[keyof typeof MEMBER]

/**
 * What a capability's parity reading IS.
 *
 * `present` means the fused surface was DRIVEN and answered. `unmeasured` means
 * it was not driven and the reason is stated — never that it was driven and
 * failed, and never a zero. Decision D-0352 rule 4: the fused surface never
 * publishes a number it cannot derive, so an unreproducible capability is
 * UNMEASURED with its reason rather than silently absent.
 */
export type ParityState = 'present' | 'unmeasured'

/** One capability the fused surface claims to carry, with what it was absorbed from. */
export interface Capability {
  /** Stable id, e.g. `M1`. Grouped by member so a reader can see the family's shape. */
  readonly id: string
  /** Which member it belongs to. */
  readonly member: MemberId
  /** One line naming the user-visible capability, not the implementation. */
  readonly title: string
  /** The mechanism class, which is what makes two members same-intent or not. */
  readonly mechanism: 'route' | 'tool' | 'slot' | 'command' | 'cli' | 'storage' | 'skill'
  /** `path:line` in the MEMBER's source: where this capability is registered. Never copied from memory. */
  readonly citation: string
  /** The fused path that carries it, or `null` when the fusion does not carry it. */
  readonly fused: string | null
  /**
   * Why it is not carried, when `fused` is null. REQUIRED whenever `fused` is
   * null, and refused by the harness when empty — an unmeasured capability with
   * no reason is the silent absence rule 4 forbids.
   */
  readonly reason?: string
  /**
   * Where the fused surface's mechanism is NOT identical to the member's, stated
   * plainly. Present-and-diverged is an honest reading; present-and-silent-about-
   * a-difference is the same defect as an unreasoned unmeasured.
   */
  readonly divergence?: string
}

/** One member's absorb-or-exclude verdict, with the evidence that decided it. */
export interface MemberVerdict {
  /** Which member. */
  readonly member: MemberId
  /** Whether the fused surface presents it. */
  readonly included: boolean
  /** The declared purpose, quoted from the registry entry — not from the plugin's own README. */
  readonly purpose: string
  /** What the member actually exposes, counted by the census, not estimated. */
  readonly surface: {
    readonly tools: number
    readonly routes: number
    readonly slots: number
    readonly commands: number
    readonly cliEntryPoints: number
    readonly storageRoots: number
  }
  /** The curation posture: which of the two safety properties this member holds. */
  readonly curation: string
  /** The evidence that settled inclusion. One sentence, checkable. */
  readonly evidence: string
}

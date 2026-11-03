/**
 * The four fused tools.
 *
 * WHY FOUR AND NOT SIX: the members expose four distinct tool names between
 * them — memento's `memory` and `memory_recall`, delta's `memory_search` and
 * `memory_write` — and the fused surface re-publishes the same four capabilities
 * under a `meta_` prefix so that a call is unambiguous about which surface it
 * reached. The prefix is not decoration: without it the fused plugin and a still
 * mounted member would register the same tool name twice.
 *
 * WHAT IS DELIBERATELY ABSENT: there is NO promoted-from-inbox tool. Delta's
 * structural property is that the model cannot move a candidate into the fact
 * layer (`dsh-memory-delta/bin/mem.mjs:952` is reachable only from the human
 * surfaces), and a fused tool that promoted would turn a two-step promotion into
 * a one-step write — the exact regression this fusion must not introduce. The
 * promotion exists on the route surface only, and it demands an attribution.
 *
 * @module dsh-meta-memory/host/tools
 */

import { TOOL } from '../shared/protocol.ts'
import type { FusedOperations } from './stores.ts'
import type { ToolDefinition } from './types.ts'

/** Read a string argument. */
function arg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Read a string-list argument, accepting a comma-joined string too. */
function listArg(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key]
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    return items.length > 0 ? items : undefined
  }
  if (typeof value === 'string' && value.length > 0) {
    return value.split(',').map(part => part.trim()).filter(part => part.length > 0)
  }
  return undefined
}

/** Render one text part, the shape the tool DSL expects from `output.render`. */
function text(value: string): Array<{ type: 'text'; text: string }> {
  return [{ type: 'text', text: value }]
}

/**
 * Compile the authoring spec into the JSON Schema `ctx.tools.register` requires.
 *
 * WHY THIS EXISTS, and it is the defect this file shipped with: `ctx.tools.register`
 * forwards `parameters` to the model UNCHANGED and asserts `output.schema` as a
 * supported JSON Schema. The four tools below used to pass a name-keyed authoring
 * spec as `parameters` and omit `output.schema` entirely, so the real host refused
 * the first registration in `apply()` with `JsonSchemaError: unsupported JSON
 * schema: schema must be a schema object`. That throw rolled back the fiber, which
 * took the already-registered `/meta-memory` prefix with it, and the host then
 * answered every path under the prefix with its own zero-byte 404. The harness did
 * not see it because its fake `tools.register` only pushed the definition onto an
 * array. `required` is lifted from each property to the object root, as JSON Schema
 * requires it there.
 * @param specs - the name-keyed authoring spec.
 * @returns the JSON Schema subset the host accepts (no `$schema`, no `$ref`).
 */
function parametersSchema(specs: Record<string, Record<string, unknown> & { required?: boolean }>): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [key, spec] of Object.entries(specs)) {
    const { required: isRequired, ...rest } = spec
    properties[key] = rest
    if (isRequired === true) required.push(key)
  }
  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}), additionalProperties: false }
}

/**
 * Build the four fused tools over the composed operations.
 * @param ops - the fused operations.
 * @returns the tool definitions, in registration order.
 */
export function buildTools(ops: FusedOperations): ToolDefinition[] {
  return [
    {
      name: TOOL.memory,
      description:
        'Read or change the standing memory store (dsh-memento, composed). Actions: query (free), add, replace, remove, ' +
        'consolidate. Every WRITE must pass approved: true, because a write here is an approved, audited act — a write ' +
        'without it is refused and nothing is stored. replace/remove target an entry by a UNIQUE case-insensitive ' +
        'substring, so a short match fails with the candidate list rather than guessing.',
      parameters: parametersSchema({
        action: { type: 'string', required: true, enum: ['add', 'replace', 'remove', 'consolidate', 'query'], description: 'What to do.' },
        track: { type: 'string', enum: ['user', 'agent'], description: 'Which track the entry belongs to.' },
        scope: { type: 'string', enum: ['user-global', 'workspace'], description: 'Which layer the entry belongs to.' },
        text: { type: 'string', description: 'The entry text, or the substring to query for.' },
        match: { type: 'string', description: 'for replace/remove: a UNIQUE substring identifying the target entry.' },
        matches: { type: 'array', items: { type: 'string' }, description: 'for consolidate: the unique substrings to merge.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags.' },
        approved: { type: 'boolean', description: 'REQUIRED for every write. States that this write is approved; the write is refused without it.' },
      }),
      output: {
        schema: { type: 'object' },
        render: (_args, value) => text(JSON.stringify(value)),
      },
      async execute(args) {
        const action = arg(args, 'action') ?? 'query'
        if (action === 'query') {
          const result = ops.mementoQuery({
            ...(arg(args, 'text') === undefined ? {} : { text: arg(args, 'text') }),
            ...(arg(args, 'track') === undefined ? {} : { track: arg(args, 'track') }),
            ...(arg(args, 'scope') === undefined ? {} : { scope: arg(args, 'scope') }),
          })
          return { action, ...result }
        }
        const approved = args['approved'] === true
        const base = {
          track: arg(args, 'track') ?? 'user',
          scope: arg(args, 'scope') ?? 'workspace',
          text: arg(args, 'text') ?? '',
        }
        const input =
          action === 'add'
            ? { ...base, workspaceKey: '', source: 'dsh-meta-memory', sessionId: null, ...(listArg(args, 'tags') === undefined ? {} : { tags: listArg(args, 'tags') }) }
            : action === 'consolidate'
              ? { ...base, matches: listArg(args, 'matches') ?? [] }
              : { ...base, match: arg(args, 'match') ?? '' }
        const written = ops.mementoWrite(action, input, approved)
        return { action, ...written }
      },
      presentCall: args => ({ card: 'generic', title: `Memory ${String(args['action'] ?? 'query')}`, kind: 'other', rawInput: args }),
    },
    {
      name: TOOL.recall,
      description:
        'Search the standing memory store (dsh-memento, composed) by free text and return the matching entries with the ' +
        'store total, so a truncated answer says so. Read-only.',
      parameters: parametersSchema({
        text: { type: 'string', required: true, description: 'The text to look for.' },
        limit: { type: 'number', description: 'Maximum entries to return.' },
      }),
      output: { schema: { type: 'object' }, render: (_args, value) => text(JSON.stringify(value)) },
      async execute(args) {
        const limit = typeof args['limit'] === 'number' ? args['limit'] : undefined
        const result = ops.mementoQuery({ text: arg(args, 'text') ?? '', ...(limit === undefined ? {} : { limit }) })
        return { ...result, query: arg(args, 'text') ?? '' }
      },
    },
    {
      name: TOOL.search,
      description:
        'Search the layered project memory (dsh-memory-delta, composed): the inbox of pending candidates, the standing ' +
        'facts and decisions, the archive, the journal, the session index, and the document index. Read-only.',
      parameters: parametersSchema({
        query: { type: 'string', required: true, description: 'Keywords; Chinese is matched by bigram without needing spaces.' },
        where: { type: 'string', enum: ['all', 'facts', 'decisions', 'inbox', 'archive', 'journal', 'sessions', 'index'], description: 'Restrict to one layer.' },
        limit: { type: 'number', description: 'Maximum matches.' },
      }),
      output: { schema: { type: 'object' }, render: (_args, value) => text(JSON.stringify(value)) },
      async execute(args) {
        const limit = typeof args['limit'] === 'number' ? args['limit'] : 10
        return { ...ops.deltaSearch(arg(args, 'query') ?? '', arg(args, 'where') ?? 'all', limit), query: arg(args, 'query') ?? '' }
      },
    },
    {
      name: TOOL.write,
      description:
        'Record a durable CANDIDATE into the project memory INBOX (dsh-memory-delta, composed). It lands in inbox/ and is ' +
        'NOT injected to anyone until a HUMAN promotes it into the fact layer — so this tool cannot make a standing fact, ' +
        'by design. Write conclusions, not process.',
      parameters: parametersSchema({
        type: { type: 'string', required: true, enum: ['fact', 'decision'], description: 'fact = a truth about the project; decision = a choice plus its reason.' },
        conclusion: { type: 'string', required: true, description: 'One-line conclusion, not a narrative.' },
        reason: { type: 'string', description: 'Why it holds or why it was chosen.' },
        key: { type: 'string', description: 'Semantic key; only one active fact may exist per key.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Topic tags.' },
      }),
      output: { schema: { type: 'object' }, render: (_args, value) => text(JSON.stringify(value)) },
      async execute(args) {
        const written = ops.deltaWrite({
          type: arg(args, 'type') ?? 'fact',
          conclusion: arg(args, 'conclusion') ?? '',
          reason: arg(args, 'reason'),
          key: arg(args, 'key'),
          ...(listArg(args, 'tags') === undefined ? {} : { tags: listArg(args, 'tags') }),
          scope: 'workspace',
          source: 'dsh-meta-memory',
        })
        return {
          ...written,
          isStandingFact: false,
          note: 'CANDIDATE only: it is in inbox/ and is not injected until a human promotes it. This tool has no promote action, and that is deliberate.',
        }
      },
    },
  ]
}

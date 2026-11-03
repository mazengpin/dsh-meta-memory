/**
 * The `/meta-memory` surface: ONE prefix owning its whole subtree.
 *
 * WHY A PREFIX AND NOT EIGHT EXACT ROUTES: the acceptance condition for this
 * fusion is that an unknown path under the fused prefix answers with THIS
 * plugin's 404 body. An exact-route table cannot do that — an unmatched path
 * falls through to whatever else is listening and the caller gets a foreign
 * status that says nothing about which surface it reached. A prefix registration
 * takes ownership of everything below `/meta-memory`, so `404` here is a
 * statement by the fused surface about the fused surface.
 *
 * THE 404 BODY ADVERTISES THE REGISTERED PATHS, AND THE LIST IS DERIVED FROM THE
 * ROUTE TABLE rather than hand-written beside it. This program has already paid
 * for the opposite: a route listing that advertised a doubled `/api/api/` path
 * was unreachable while the 404 body claimed it was registered. `ADVERTISED` is
 * computed from `ROUTES`, so it cannot drift from what is dispatched.
 *
 * @module dsh-meta-memory/host/routes
 */

import { PREFIX } from '../shared/protocol.ts'
import { CAPABILITIES, MEMBER_VERDICTS, carriedRows, census } from './census.ts'
import { RefusalError, type FusedOperations } from './stores.ts'
import type { Composed } from './compose.ts'
import type { FusedConfig, HttpRequest, HttpResponse } from './types.ts'

/** Everything the route table reads. */
export interface RouteDeps {
  /** The composed operations. */
  readonly ops: FusedOperations
  /** The composition, for provenance and injected recall access. */
  readonly composed: Composed
  /** The plugin config in force. */
  readonly config: FusedConfig
  /** The context position this plugin took. */
  readonly order: number
  /** The name of this plugin's own context contribution. */
  readonly contextName: string
  /** Whether this plugin registered its own recall provider and listener. */
  readonly injectRecall: boolean
  /** Stage the text the recall provider will render for a session (null clears it). */
  readonly setRecall: (sessionId: string, text: string | null) => void
  /** Read the text the recall provider would render for a session right now. */
  readonly getRecall: (sessionId: string) => string
}

/** One dispatched route. */
interface Route {
  /** HTTP method. */
  readonly method: 'GET' | 'POST'
  /** Path RELATIVE to {@link PREFIX}, e.g. `/api/status`. */
  readonly path: string
  /** What it answers. */
  readonly run: (params: URLSearchParams, deps: RouteDeps) => Promise<unknown> | unknown
}

/** Write one JSON response. */
function sendJson(res: HttpResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(Buffer.byteLength(payload)),
    ...headers,
  })
  res.end(payload)
}

/**
 * Merge the query string with a JSON body, when the request carries one.
 * @param req - the request.
 * @returns the merged parameter set.
 */
async function readParams(req: HttpRequest): Promise<URLSearchParams> {
  const url = new URL(req.url ?? '/', 'http://dsh.invalid')
  const params = new URLSearchParams(url.searchParams)
  if (typeof req.on !== 'function') return params
  const body = await new Promise<string>(resolveBody => {
    let raw = ''
    req.on?.('data', (chunk?: unknown) => {
      raw += typeof chunk === 'string' ? chunk : String(chunk ?? '')
    })
    req.on?.('end', () => resolveBody(raw))
    req.on?.('error', () => resolveBody(''))
  })
  if (body.trim().length === 0) return params
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    for (const [key, value] of Object.entries(parsed)) {
      if (value === undefined || value === null) continue
      params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
    }
  } catch {
    /* A body that is not JSON is ignored rather than fatal: the query string still governs. */
  }
  return params
}

/** Read a parameter as a string, or undefined. */
function str(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)
  return value === null || value.length === 0 ? undefined : value
}

/** Read a parameter as a positive integer with a default. */
function int(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key)
  if (raw === null) return fallback
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/** Read a parameter as a boolean; absent is false, and only `true` is true. */
function bool(params: URLSearchParams, key: string): boolean {
  return params.get(key) === 'true'
}

/** The gate's live reachability and last answer, read from the composed member. */
async function injectStatus(deps: RouteDeps): Promise<unknown> {
  const { composed, config, ops } = deps
  const baseUrl = config.gateBaseUrl ?? 'http://127.0.0.1:8011'
  const threshold = config.gateThreshold ?? 0.5
  const ledger = composed.injectorLedger
  const ledgerReading =
    ledger === null
      ? { available: false, reason: 'dsh-memory-injector/lib/host/ledger.js is not composed' }
      : (() => {
          try {
            const instance = new ledger.VerdictLedger(ops.paths.injectLedger, 200, () => {})
            return {
              available: true,
              sink: ops.paths.injectLedger,
              totals: instance.totals(),
              durability: instance.durability(),
              sessions: instance.sessions().length,
            }
          } catch (error) {
            return { available: false, reason: error instanceof Error ? error.message : String(error) }
          }
        })()

  return {
    ok: true,
    plugin: 'dsh-meta-memory',
    admission: {
      providerRegistered: deps.injectRecall,
      contextName: deps.contextName,
      order: deps.order,
      baseUrl,
      threshold,
      note: deps.injectRecall
        ? 'this plugin owns a recall context provider and a pre-step listener'
        : 'this plugin registered NO recall provider: the member\'s own seam is mounted, and a second contribution would inject the same memory twice per turn',
    },
    ledger: ledgerReading,
    members: {
      gate: composed.injectorGate === null ? null : 'dsh-memory-injector/lib/host/gate.js',
      recall: composed.injectorRecall === null ? null : 'dsh-memory-injector/lib/host/recall.js',
    },
  }
}

/** Every dispatched route, in one table. {@link ADVERTISED} is derived from it. */
const ROUTES: readonly Route[] = [
  /* ------------------------------------------------------- fused meta routes */
  {
    method: 'GET',
    path: '/api/status',
    run: (_params, deps) => ({
      ok: true,
      plugin: 'dsh-meta-memory',
      prefix: PREFIX,
      censusAt: new Date().toISOString(),
      members: {
        memento: deps.composed.memento,
        delta: deps.composed.delta,
        injector: deps.composed.injector,
      },
      gaps: deps.ops.gaps(),
      stores: {
        mementoDb: deps.ops.paths.mementoDb,
        mementoRule: deps.ops.paths.mementoRule,
        deltaRoot: deps.ops.paths.deltaRoot,
        deltaRule: deps.ops.paths.deltaRule,
        injectLedger: deps.ops.paths.injectLedger,
      },
      context: { name: deps.contextName, order: deps.order, registered: deps.injectRecall },
      counts: census(),
    }),
  },
  {
    method: 'GET',
    path: '/api/census',
    run: () => {
      const counts = census()
      return {
        ok: true,
        plugin: 'dsh-meta-memory',
        censusAt: new Date().toISOString(),
        numerator: counts.present,
        denominator: counts.total,
        unmeasured: counts.unmeasured,
        carriedRows: carriedRows(),
        blinded: counts.blinded,
        byMember: counts.byMember,
        rows: CAPABILITIES.map(row => ({
          id: row.id,
          member: row.member,
          title: row.title,
          mechanism: row.mechanism,
          citation: row.citation,
          fused: row.fused,
          state: row.fused === null ? 'unmeasured' : 'present',
          reason: row.reason ?? null,
          divergence: row.divergence ?? null,
        })),
      }
    },
  },
  { method: 'GET', path: '/api/members', run: () => ({ ok: true, members: MEMBER_VERDICTS }) },

  /* ----------------------------------------------------------- memento reads */
  {
    method: 'GET',
    path: '/api/memento/entries',
    run: (params, deps) =>
      deps.ops.mementoQuery({
        ...(str(params, 'text') === undefined ? {} : { text: str(params, 'text') }),
        ...(str(params, 'track') === undefined ? {} : { track: str(params, 'track') }),
        ...(str(params, 'scope') === undefined ? {} : { scope: str(params, 'scope') }),
        limit: int(params, 'limit', 50),
      }),
  },
  {
    method: 'GET',
    path: '/api/memento/query',
    run: (params, deps) => deps.ops.mementoQuery({ text: str(params, 'text'), limit: int(params, 'limit', 50) }),
  },
  { method: 'GET', path: '/api/memento/audit', run: (params, deps) => ({ rows: deps.ops.mementoAudit(int(params, 'limit', 50)) }) },
  { method: 'GET', path: '/api/memento/proposals', run: (_params, deps) => ({ proposals: deps.ops.mementoProposals() }) },
  { method: 'GET', path: '/api/memento/store', run: (_params, deps) => ({ ...deps.ops.mementoStoreInfo(), rule: deps.ops.paths.mementoRule }) },
  {
    method: 'GET',
    path: '/api/memento/snapshot',
    run: (params, deps) => deps.ops.mementoSnapshot(str(params, 'cwd'), str(params, 'agentPreset')),
  },

  /* ---------------------------------------------------------- memento writes */
  {
    method: 'POST',
    path: '/api/memento/add',
    run: (params, deps) => {
      const input: Record<string, unknown> = {
        track: str(params, 'track') ?? 'user',
        scope: str(params, 'scope') ?? 'workspace',
        workspaceKey: str(params, 'workspaceKey') ?? '',
        text: str(params, 'text') ?? '',
        source: 'dsh-meta-memory',
        sessionId: str(params, 'sessionId') ?? null,
      }
      if (Array.isArray(params.getAll('tags')) && params.getAll('tags').length > 0) input['tags'] = params.getAll('tags')
      return deps.ops.mementoWrite('add', input, bool(params, 'approved'))
    },
  },
  {
    method: 'POST',
    path: '/api/memento/replace',
    run: (params, deps) =>
      deps.ops.mementoWrite(
        'replace',
        {
          track: str(params, 'track') ?? 'user',
          scope: str(params, 'scope') ?? 'workspace',
          match: str(params, 'match') ?? '',
          text: str(params, 'text') ?? '',
        },
        bool(params, 'approved'),
      ),
  },
  {
    method: 'POST',
    path: '/api/memento/remove',
    run: (params, deps) =>
      deps.ops.mementoWrite(
        'remove',
        { track: str(params, 'track') ?? 'user', scope: str(params, 'scope') ?? 'workspace', match: str(params, 'match') ?? '' },
        bool(params, 'approved'),
      ),
  },
  {
    method: 'POST',
    path: '/api/memento/consolidate',
    run: (params, deps) =>
      deps.ops.mementoWrite(
        'consolidate',
        {
          track: str(params, 'track') ?? 'user',
          scope: str(params, 'scope') ?? 'workspace',
          matches: (str(params, 'matches') ?? '').split(',').map(part => part.trim()).filter(part => part.length > 0),
          text: str(params, 'text') ?? '',
        },
        bool(params, 'approved'),
      ),
  },

  /* ------------------------------------------------------------- delta reads */
  { method: 'GET', path: '/api/delta/state', run: (_params, deps) => deps.ops.deltaState() },
  {
    method: 'GET',
    path: '/api/delta/search',
    run: (params, deps) => deps.ops.deltaSearch(str(params, 'q') ?? '', str(params, 'where') ?? 'all', int(params, 'limit', 10)),
  },
  { method: 'GET', path: '/api/delta/inject-payload', run: (_params, deps) => deps.ops.deltaInjectPayload() },

  /* ------------------------------------------------------ delta writes + gate */
  {
    method: 'POST',
    path: '/api/delta/write',
    run: (params, deps) => {
      const input: Record<string, unknown> = {
        type: str(params, 'type') ?? 'fact',
        conclusion: str(params, 'conclusion') ?? '',
        reason: str(params, 'reason'),
        key: str(params, 'key'),
        id: str(params, 'id'),
        scope: 'workspace',
        source: 'dsh-meta-memory',
      }
      const tags = str(params, 'tags')
      if (tags !== undefined) input['tags'] = tags.split(',').map(part => part.trim()).filter(part => part.length > 0)
      const result = deps.ops.deltaWrite(input)
      return { ...result, isStandingFact: false, note: 'candidate only: it is in inbox/ and is NOT injected until a human promotes it' }
    },
  },
  {
    method: 'POST',
    path: '/api/delta/promote',
    run: (params, deps) => deps.ops.deltaPromote(str(params, 'id') ?? '', str(params, 'by') ?? ''),
  },

  /* ----------------------------------------------------------------- injector */
  { method: 'GET', path: '/api/inject/status', run: (_params, deps) => injectStatus(deps) },
  {
    method: 'GET',
    path: '/api/inject/verdicts',
    run: (params, deps) => {
      const ledger = deps.composed.injectorLedger
      if (ledger === null) return { ok: false, error: 'injector ledger module is not composed' }
      const instance = new ledger.VerdictLedger(deps.ops.paths.injectLedger, 200, () => {})
      return { ok: true, sink: deps.ops.paths.injectLedger, totals: instance.totals(), verdicts: instance.snapshot(int(params, 'limit', 20)) }
    },
  },
  {
    method: 'POST',
    path: '/api/inject/decide',
    run: async (params, deps) => {
      const gate = deps.composed.injectorGate
      const recall = deps.composed.injectorRecall
      if (gate === null || recall === null) return { ok: false, error: 'injector gate or recall module is not composed' }
      const task = str(params, 'task') ?? ''
      const sessionId = str(params, 'sessionId') ?? 'meta-memory-probe'
      const candidateText = str(params, 'text') ?? ''
      const block = candidateText.length > 0 ? recall.renderRecallBlock([{ text: candidateText }]) : ''
      const baseUrl = deps.config.gateBaseUrl ?? 'http://127.0.0.1:8011'
      const answer = await gate.askGate({
        baseUrl,
        state: block,
        timeoutMs: int(params, 'timeoutMs', 5000),
        threshold: deps.config.gateThreshold ?? 0.5,
      })
      const admit = answer['admit'] === true
      deps.setRecall(sessionId, admit ? block : null)
      const ledger = deps.composed.injectorLedger
      let recorded: unknown = null
      if (ledger !== null) {
        try {
          const instance = new ledger.VerdictLedger(deps.ops.paths.injectLedger, 200, () => {})
          const committed = instance.commit({
            at: new Date().toISOString(),
            sessionId,
            turn: int(params, 'turn', 0),
            step: int(params, 'step', 0),
            outcome: String(answer['outcome'] ?? 'unavailable'),
            admit,
            reason: String(answer['reason'] ?? ''),
            baseUrl,
            lane: String(answer['lane'] ?? ''),
            httpStatus: typeof answer['status'] === 'number' ? answer['status'] : null,
            probabilities: (answer['probabilities'] as Record<string, number> | undefined) ?? null,
            top: typeof answer['top'] === 'string' ? answer['top'] : null,
            task,
            blockHash: recall.hashText(block),
          })
          recorded = { written: committed.written }
        } catch (error) {
          recorded = { written: false, error: error instanceof Error ? error.message : String(error) }
        }
      }
      return {
        ok: true,
        outcome: answer['outcome'] ?? 'unavailable',
        admit,
        reason: answer['reason'] ?? '',
        lane: answer['lane'] ?? '',
        baseUrl,
        blockChars: block.length,
        stagedForSession: admit ? sessionId : null,
        wouldRender: deps.getRecall(sessionId),
        ledger: recorded,
      }
    },
  },
]

/** Every registered path, derived from {@link ROUTES}. */
export const ADVERTISED: readonly string[] = ROUTES.map(route => `${route.method} ${PREFIX}${route.path}`)

/**
 * Build the prefix handler for {@link PREFIX}.
 * @param deps - the operations, the composition and the config in force.
 * @returns a node request handler owning the full response lifecycle.
 */
export function createRouteHandler(deps: RouteDeps): (req: HttpRequest, res: HttpResponse) => Promise<void> {
  return async (req, res): Promise<void> => {
    try {
      const url = new URL(req.url ?? '/', 'http://dsh.invalid')
      const relative = url.pathname.slice(PREFIX.length) || '/'
      const method = (req.method ?? 'GET').toUpperCase()

      const pathMatches = ROUTES.filter(route => route.path === relative)
      if (pathMatches.length === 0) {
        sendJson(res, 404, {
          ok: false,
          error: `no such route under ${PREFIX}`,
          path: url.pathname,
          advertised: ADVERTISED,
        })
        return
      }
      const route = pathMatches.find(candidate => candidate.method === method)
      if (route === undefined) {
        const allowed = pathMatches.map(candidate => candidate.method)
        sendJson(res, 405, { ok: false, error: `${allowed.join(' or ')} required for ${relative}`, advertised: ADVERTISED }, { allow: allowed.join(', ') })
        return
      }
      const params = await readParams(req)
      const body = await route.run(params, deps)
      sendJson(res, 200, body)
    } catch (error) {
      const refusal = error instanceof RefusalError
      const status = refusal ? 409 : 500
      sendJson(res, status, {
        ok: false,
        refused: refusal,
        code: error instanceof RefusalError ? error.code : 'internal-error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

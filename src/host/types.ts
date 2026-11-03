/**
 * The host shapes this plugin codes against, declared structurally.
 *
 * WHY NOT IMPORT THEM: the fused plugin must activate on a deployment that has
 * the members but not necessarily their peer type packages, and a runtime
 * `@deepseek-ai/*` value import from a Host half is how a plugin ends up with a
 * pending loader row instead of a mounted one. Only the members' own internal
 * modules are imported (by file URL, see `compose.ts`); everything in this file
 * is a declaration of a shape this plugin reads, not a dependency.
 *
 * @module dsh-meta-memory/host/types
 */

/** The logger surface (a subset of cordis's). */
export interface HostLogger {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  debug?(...args: unknown[]): void
}

/** A minimal incoming request. Structural, so a harness can supply a fake. */
export interface HttpRequest {
  readonly url?: string
  readonly method?: string
  on?(event: 'data' | 'end' | 'error', listener: (chunk?: unknown) => void): void
  setEncoding?(encoding: string): void
}

/** A minimal outgoing response. */
export interface HttpResponse {
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string): void
}

/** A route handler owning its full response lifecycle. */
export type RouteHandler = (req: HttpRequest, res: HttpResponse) => void | Promise<void>

/** What `webServer.register` accepts. `prefix` owns the whole subtree. */
export interface RouteRegistration {
  readonly kind: 'prefix' | 'exact'
  readonly path: string
  readonly handler: RouteHandler
}

/** The web server seam. */
export interface WebServerSeam {
  register(route: RouteRegistration): () => void | undefined
}

/** A `systemPrompt.context()` contribution: text the host re-resolves at request time. */
export interface ContextEntry {
  readonly name: string
  readonly order: number
  readonly text: (assemble?: unknown) => string
}

/** The system-prompt seam. */
export interface SystemPromptSeam {
  context(entry: ContextEntry): () => void
  getContextOrder(base: string): number
}

/**
 * A tool definition, in the shape `ctx.tools.register` accepts.
 *
 * BOTH members are REQUIRED, and both are JSON Schema, because the real host
 * refuses a definition without them: `packages/core/tools/src/index.ts:1074-1079`
 * rejects a missing `output`/`output.render`, then `assertSupportedJsonSchema`
 * rejects a missing `output.schema` with `JsonSchemaError`. `parameters` is sent
 * to the model verbatim, so an authoring spec here is a malformed schema there.
 */
export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly output: {
    readonly schema: Record<string, unknown>
    readonly render: (args: Record<string, unknown>, value: Record<string, unknown>) => unknown
  }
  execute(args: Record<string, unknown>, exec?: ToolExecution): Promise<Record<string, unknown>>
  presentCall?: (args: Record<string, unknown>) => Record<string, unknown>
}

/** What a tool call carries about its caller. */
export interface ToolExecution {
  readonly agent?: {
    readonly session?: {
      readonly id?: string
      readonly header?: { readonly cwd?: string; readonly id?: string; readonly agentPreset?: string }
    }
  } | null
}

/** The host context this plugin's `apply` receives. */
export interface HostContext {
  readonly tools: { register(tool: ToolDefinition): unknown }
  readonly webServer: WebServerSeam
  readonly systemPrompt: SystemPromptSeam
  on(event: string, listener: (...args: never[]) => unknown, options?: { prepend?: boolean }): () => void
  effect(description: () => void | (() => void), label?: string): void
  get?(name: string): unknown
  readonly logger: HostLogger
}

/** The plugin config. Every field optional: the defaults are the safe deployment. */
export interface FusedConfig {
  /** Absolute path of memento's SQLite store; '' means the member's own default. */
  readonly mementoDbPath?: string
  /** Explicit root of delta's markdown store; '' means the member's documented rule. */
  readonly deltaRoot?: string
  /** Our own explicit approval requirement for memento writes. Cannot be turned off. */
  readonly requireApproval?: boolean
  /**
   * Whether to register this plugin's own recall context provider and pre-step
   * listener. DEFAULT FALSE, and the reason is a property of the deployment
   * rather than of this code: while the member's own seam is mounted (D-0352
   * rule 3), a second contribution would inject the same memory twice per turn.
   */
  readonly injectRecall?: boolean
  /** The decision backend base URL for the admission gate. */
  readonly gateBaseUrl?: string
  /** The abstention threshold. */
  readonly gateThreshold?: number
}

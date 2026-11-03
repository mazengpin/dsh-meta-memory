/**
 * The harness that DRIVES the built fused surface.
 *
 * It mounts `lib/index.js` with a fake host context and a throwaway sandbox, so
 * every reading is produced by the artifact that would ship rather than by the
 * source it was built from. The route handler is called directly and the tools
 * are called through their own `execute`, which is the same entry a live host
 * uses — a harness that called the internal helpers instead would prove that the
 * helpers work and say nothing about the surface.
 *
 * THE SANDBOX IS MANDATORY AND IS NOT OPTIONAL TIDINESS. The plugin resolves
 * `DSH_HOME` and `DSH_MEMORY_ROOT` at apply time, so a harness that forgot to
 * redirect them would write into the real memory stores of a running profile
 * while measuring them. Both are pointed at a fresh temp tree here, before the
 * mount, and the resolved paths are echoed back into every report so a reader can
 * see which store answered.
 *
 * @module dsh-meta-memory/verify/harness
 */

import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** The route prefix the fused surface owns. */
export const PREFIX = '/meta-memory'

/**
 * The keywords the real host's JSON-Schema subset accepts.
 * Source of truth: `deepseek-harness/packages/core/tools/src/json-schema.ts`
 * (`CONSTRAINT_KEYWORDS` + `ANNOTATION_KEYWORDS`). This copy exists because a
 * harness that imported the host package would stop being runnable outside it.
 */
const SCHEMA_KEYWORDS = new Set([
  'type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const',
  'description', 'title', 'default', 'examples', 'deprecated', 'readOnly', 'writeOnly',
])
/** The types the host subset accepts. */
const SCHEMA_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'])

/**
 * Assert one value is a schema OBJECT in the host's accepted subset.
 *
 * WHY THE HARNESS MUST DO THIS AT ALL. The fake host used to accept any value,
 * so a definition the real registry refuses could be "carried and driven" here
 * while the live profile answered zero-byte 404s: `output.schema` was missing,
 * `packages/core/tools/src/index.ts:1079` threw `JsonSchemaError` inside
 * `apply()`, the fiber rolled back, and the already-registered `/meta-memory`
 * prefix went with it. A harness that fakes a service must enforce that
 * service's refusal conditions, or it measures its own leniency.
 * @param schema - the candidate schema.
 * @param label - which field it came from, for the message.
 */
function assertSchemaObject(schema, label) {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    throw new Error(`${label} must be a schema object, got ${schema === null ? 'null' : Array.isArray(schema) ? 'array' : typeof schema}`)
  }
  for (const key of Object.keys(schema)) {
    if (!SCHEMA_KEYWORDS.has(key)) {
      throw new Error(`${label}.${key} is not a supported keyword in the host's JSON-Schema subset`)
    }
  }
  if (schema.type !== undefined && !SCHEMA_TYPES.has(schema.type)) {
    throw new Error(`${label}.type ${JSON.stringify(schema.type)} is not an accepted schema type`)
  }
  if (schema.properties !== undefined) {
    if (typeof schema.properties !== 'object' || schema.properties === null || Array.isArray(schema.properties)) {
      throw new Error(`${label}.properties must be an object`)
    }
    for (const [name, child] of Object.entries(schema.properties)) assertSchemaObject(child, `${label}.properties.${name}`)
  }
  if (schema.items !== undefined) assertSchemaObject(schema.items, `${label}.items`)
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some(item => typeof item !== 'string'))) {
    throw new Error(`${label}.required must be an array of property names`)
  }
}

/**
 * Assert one tool definition against the real registry's admission rules.
 * Mirrors `register()` at `packages/core/tools/src/index.ts:1071-1079`, which
 * rejects a missing `output`/`output.render` with a TypeError and then runs
 * `assertSupportedJsonSchema(output.schema)`.
 * @param tool - the definition a tool author handed to `ctx.tools.register`.
 */
function assertToolDefinition(tool) {
  const name = tool?.name
  if (typeof name !== 'string' || name.length === 0) throw new Error('tool definition has no name')
  const output = tool.output
  if (output === undefined || typeof output !== 'object' || typeof output.render !== 'function') {
    throw new Error(`tool "${name}" must declare output { schema, render } (host contract: packages/core/tools/src/index.ts:1074-1079)`)
  }
  assertSchemaObject(output.schema, `tool "${name}".output.schema`)
  assertSchemaObject(tool.parameters, `tool "${name}".parameters`)
}

/** One mounted instance: its registrations, its sandbox and its call helpers. */
export class MountedSurface {
  /**
   * @param {object} parts - the pieces `mount` collected.
   */
  constructor(parts) {
    this.sandbox = parts.sandbox
    this.registrations = parts.registrations
    this.paths = parts.paths
    this.logs = parts.logs
    /** @type {Array<{event: string, options: unknown, listener: Function}>} */
    this.listeners = parts.registrations.listeners
  }

  /**
   * Call the prefix handler the way the web server would.
   * @param {string} pathname - full path including the prefix.
   * @param {string} method - HTTP method.
   * @returns {Promise<{status: number, json: any, raw: string}>} the response.
   */
  async call(pathname, method = 'GET') {
    const route = this.registrations.routes.find(candidate => candidate.kind === 'prefix')
    if (route === undefined) throw new Error('the fused surface registered no prefix route, so nothing can be called')
    let status = 0
    let raw = ''
    const res = {
      writeHead(code) {
        status = code
      },
      end(body) {
        raw = typeof body === 'string' ? body : ''
      },
    }
    await route.handler({ url: pathname, method }, res)
    let json = null
    try {
      json = JSON.parse(raw)
    } catch {
      json = null
    }
    return { status, json, raw }
  }

  /**
   * Find one registered tool by name.
   * @param {string} name - the tool name.
   * @returns {object} the tool definition.
   */
  tool(name) {
    const found = this.registrations.tools.find(candidate => candidate.name === name)
    if (found === undefined) {
      const available = this.registrations.tools.map(candidate => candidate.name).join(', ')
      throw new Error(`tool ${JSON.stringify(name)} is not registered; registered tools: ${available}`)
    }
    return found
  }

  /** @returns {string[]} the registered tool names. */
  toolNames() {
    return this.registrations.tools.map(candidate => candidate.name)
  }

  /** @returns {Array<object>} the context contributions. */
  contexts() {
    return this.registrations.contexts
  }

  /** Remove the sandbox tree. */
  dispose() {
    rmSync(this.sandbox, { recursive: true, force: true })
  }
}

/**
 * Mount the built plugin into a throwaway sandbox.
 * @param {object} [options] - mount options.
 * @param {object} [options.config] - the loader-row config to apply.
 * @param {string} [options.label] - a label for the sandbox directory.
 * @returns {Promise<MountedSurface>} the mounted surface.
 */
export async function mount(options = {}) {
  const sandbox = mkdtempSync(join(tmpdir(), `meta-memory-${options.label ?? 'verify'}-`))
  const dshHome = join(sandbox, 'dsh-home')
  const memoryRoot = join(sandbox, 'memory-root')

  const previous = { DSH_HOME: process.env.DSH_HOME, DSH_MEMORY_ROOT: process.env.DSH_MEMORY_ROOT }
  process.env.DSH_HOME = dshHome
  process.env.DSH_MEMORY_ROOT = memoryRoot

  /** @type {any} */
  const registrations = { routes: [], tools: [], contexts: [], listeners: [], effects: [] }
  const logs = []

  const disposers = []
  const ctx = {
    tools: {
      register(tool) {
        assertToolDefinition(tool)
        registrations.tools.push(tool)
        return () => {}
      },
    },
    webServer: {
      register(route) {
        registrations.routes.push(route)
        const dispose = () => {}
        disposers.push(dispose)
        return dispose
      },
    },
    systemPrompt: {
      context(entry) {
        registrations.contexts.push(entry)
        return () => {}
      },
      getContextOrder() {
        return 0
      },
    },
    on(event, listener, opts) {
      registrations.listeners.push({ event, listener, options: opts })
      return () => {}
    },
    effect(description) {
      const dispose = description()
      if (typeof dispose === 'function') disposers.push(dispose)
      return () => {}
    },
    get() {
      return undefined
    },
    logger: {
      info(...args) {
        logs.push(args.map(String).join(' '))
      },
      warn(...args) {
        logs.push(args.map(String).join(' '))
      },
    },
  }

  const module = await import(new URL('../lib/index.js', import.meta.url).href)
  if (typeof module.apply !== 'function') {
    throw new Error('lib/index.js does not export apply; the built artifact is not a host half')
  }
  await module.apply(ctx, options.config ?? {})

  // Restore the process environment: the paths were captured at apply time, and a
  // later mount must be able to redirect them again.
  if (previous.DSH_HOME === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previous.DSH_HOME
  if (previous.DSH_MEMORY_ROOT === undefined) delete process.env.DSH_MEMORY_ROOT
  else process.env.DSH_MEMORY_ROOT = previous.DSH_MEMORY_ROOT

  const status = await new MountedSurface({
    sandbox,
    registrations,
    paths: { sandbox, dshHome, memoryRoot },
    logs,
  }).call(`${PREFIX}/api/status`)
  const resolved = status.json?.stores ?? {}

  return new MountedSurface({
    sandbox,
    registrations,
    paths: { sandbox, dshHome, memoryRoot, ...resolved },
    logs,
  })
}

/** Read a directory's entry names, or an empty list when it is absent. */
export function entriesIn(directory) {
  return existsSync(directory) ? readdirSync(directory).filter(name => !statSync(join(directory, name)).isDirectory()) : []
}

/** Read a file's text, or null. */
export function readText(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

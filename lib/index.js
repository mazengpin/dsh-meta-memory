import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";
// src/shared/protocol.ts
/** The ONE route prefix this plugin owns, and the whole subtree under it. */
const PREFIX = "/meta-memory";
/** The plugin's own `systemPrompt.context` contribution. Distinct from every member's. */
const RECALL_CONTEXT_NAME = "dsh-meta-memory:recall";
/** The context position: just after the last centrally-allocated runtime-context slot. */
const CONTEXT_ORDER_BASE = "SUBAGENT_DELEGATION";
/** The four fused tools. Each name is prefixed so it cannot collide with a member's own tool. */
const TOOL = {
	/** memento's durable store, addressed as one tool with five actions. */
	memory: "meta_memory",
	/** memento's retrieval-by-query surface. */
	recall: "meta_memory_recall",
	/** delta's layered store, read side (all six layers plus journal/sessions/index). */
	search: "meta_memory_search",
	/** delta's layered store, write side. Lands a CANDIDATE in inbox/, never a fact. */
	write: "meta_memory_write"
};
/** The member ids this fused plugin presents. */
const MEMBER = {
	/** The family's STORE: SQLite, tracks and layers, approval-policy writes, audit. */
	memento: "dsh-memento",
	/** The family's CURATED STORE: markdown layers with a human-only promotion gate. */
	delta: "dsh-memory-delta",
	/** The family's ADMISSION CONTROL: the veto over whether recall reaches the prompt. */
	injector: "dsh-memory-injector"
};
// src/host/compose.ts
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
/** This file's own directory; used only to DERIVE siblings, never published. */
const HERE = dirname(fileURLToPath(import.meta.url));
/**
* Read a package's own name and version.
* @param root - the package directory.
* @returns the parsed identity, or nulls when the manifest is unreadable.
*/
function identityOf(root) {
	try {
		const raw = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
		return {
			name: typeof raw.name === "string" ? raw.name : null,
			version: typeof raw.version === "string" ? raw.version : null
		};
	} catch {
		return {
			name: null,
			version: null
		};
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
function locateMember(name) {
	const strategies = [];
	try {
		const entry = createRequire(import.meta.url).resolve(name);
		strategies.push({
			kind: "node-resolution",
			root: dirname(entry)
		});
	} catch {}
	strategies.push({
		kind: "sibling-clone",
		root: resolve(HERE, "..", "..", name)
	});
	for (const candidate of strategies) {
		const identity = identityOf(candidate.root);
		if (identity.name === name && typeof identity.version === "string") return {
			root: candidate.root,
			version: identity.version,
			locator: candidate.kind
		};
	}
	return null;
}
/**
* Import a module from inside a located member, as a file URL.
* @param member - the located package.
* @param relative - the module's path inside the package, e.g. `lib/store.mjs`.
* @returns the imported module namespace, or null when the file is absent.
*/
async function importMemberModule(member, relative) {
	const file = join(member.root, relative);
	if (!existsSync(file)) return null;
	return await import(pathToFileURL(file).href);
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
async function compose() {
	const gaps = [];
	const memento = locateMember("dsh-memento");
	const delta = locateMember("dsh-memory-delta");
	const injector = locateMember("dsh-memory-injector");
	if (memento === null) gaps.push("dsh-memento: package not located by node-resolution or sibling-clone");
	if (delta === null) gaps.push("dsh-memory-delta: package not located by node-resolution or sibling-clone");
	if (injector === null) gaps.push("dsh-memory-injector: package not located by node-resolution or sibling-clone");
	const mementoStore = memento === null ? null : await importMemberModule(memento, "lib/store.mjs");
	const mementoSnapshot = memento === null ? null : await importMemberModule(memento, "lib/snapshot.mjs");
	const mementoWorkspace = memento === null ? null : await importMemberModule(memento, "lib/workspace.mjs");
	const deltaStore = delta === null ? null : await importMemberModule(delta, "bin/mem.mjs");
	const injectorGate = injector === null ? null : await importMemberModule(injector, "lib/host/gate.js");
	const injectorRecall = injector === null ? null : await importMemberModule(injector, "lib/host/recall.js");
	const injectorLedger = injector === null ? null : await importMemberModule(injector, "lib/host/ledger.js");
	const named = [
		["dsh-memento/lib/store.mjs", mementoStore],
		["dsh-memento/lib/snapshot.mjs", mementoSnapshot],
		["dsh-memento/lib/workspace.mjs", mementoWorkspace],
		["dsh-memory-delta/bin/mem.mjs", deltaStore],
		["dsh-memory-injector/lib/host/gate.js", injectorGate],
		["dsh-memory-injector/lib/host/recall.js", injectorRecall],
		["dsh-memory-injector/lib/host/ledger.js", injectorLedger]
	];
	for (const [label, value] of named) if (value === null) gaps.push(`${label}: module missing or not importable`);
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
		gaps
	};
}
// src/host/census.ts
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
/**
* Every capability the fused surface accounts for.
*
* Citations are into the MEMBER's source, not this package's, and they are the
* registration site — the line a reader opens to confirm the capability exists.
*/
const CAPABILITIES = [
	{
		id: "M1",
		member: MEMBER.memento,
		title: "The five-action memory tool: add, replace, remove, consolidate, query",
		mechanism: "tool",
		citation: "dsh-memento/index.mjs:484 (makeMemoryTool), action enum at index.mjs:493",
		fused: "tool meta_memory -> /meta-memory/api/memento/query|add|replace|remove|consolidate",
		divergence: "Memento gates a write behind the host approval waterfall (index.mjs:1342). The fused surface has no approval prompt of its own, so it carries the approval as an EXPLICIT required argument (`approved: true`) and appends a memento audit row for every write, refusing the write outright when the argument is absent. The property \"a write is an approved, audited act\" survives; the prompt does not."
	},
	{
		id: "M2",
		member: MEMBER.memento,
		title: "Retrieval by query, as its own tool (memory_recall)",
		mechanism: "tool",
		citation: "dsh-memento/index.mjs:2089 (makeMemoryRecallTool)",
		fused: "tool meta_memory_recall -> /meta-memory/api/memento/query"
	},
	{
		id: "M3",
		member: MEMBER.memento,
		title: "The /memory slash command",
		mechanism: "command",
		citation: "dsh-memento/index.mjs:1723 (registerCommands)",
		fused: null,
		reason: "The fused surface registers no slash command: a command is a second entry point into the same service, and adding one here would create a surface whose behaviour is not driven by this package. The member keeps its command, and it remains reachable while the member stays loaded (D-0352 rule 3)."
	},
	{
		id: "M4.entries",
		member: MEMBER.memento,
		title: "GET /api/memento/entries — the entry listing with budgets and panel state",
		mechanism: "route",
		citation: "dsh-memento/index.mjs:2375-2394",
		fused: "/meta-memory/api/memento/entries"
	},
	{
		id: "M4.audit",
		member: MEMBER.memento,
		title: "GET /api/memento/audit — the audit rows",
		mechanism: "route",
		citation: "dsh-memento/index.mjs:2399-2410",
		fused: "/meta-memory/api/memento/audit"
	},
	{
		id: "M4.proposals",
		member: MEMBER.memento,
		title: "GET /api/memento/proposals — the pending proposals",
		mechanism: "route",
		citation: "dsh-memento/index.mjs:2413-2424",
		fused: "/meta-memory/api/memento/proposals"
	},
	{
		id: "M4.store",
		member: MEMBER.memento,
		title: "GET /api/memento/store — the store path, existence and entry count",
		mechanism: "route",
		citation: "dsh-memento/index.mjs:2437-2464 ({ path, exists, count })",
		fused: "/meta-memory/api/memento/store"
	},
	{
		id: "M4.rag",
		member: MEMBER.memento,
		title: "GET /api/memento/rag — the embedding/RAG backend state",
		mechanism: "route",
		citation: "dsh-memento/index.mjs:2468-2510",
		fused: null,
		reason: "The RAG route reports the member's embedding backend and vector-retrieval state. This fusion composes the store, not the embedding provider: it never opens an embedding backend, so it cannot derive this payload and will not publish a stand-in for it. The member keeps the route."
	},
	{
		id: "M4.models",
		member: MEMBER.memento,
		title: "GET /api/memento/models — the local model/embedding probe",
		mechanism: "route",
		citation: "dsh-memento/index.mjs:2520-2580",
		fused: null,
		reason: "A probe of the local embedding/model processes. The fused plugin opens no device and calls no model of its own, so it cannot drive this probe and reports it UNMEASURED rather than reporting an empty model list as if it had measured one."
	},
	{
		id: "M4.recall",
		member: MEMBER.memento,
		title: "GET /api/memento/recall — vector retrieval over the store",
		mechanism: "route",
		citation: "dsh-memento/index.mjs:2585-2650",
		fused: null,
		reason: "Vector retrieval needs the embedding backend this fusion does not compose (see M4.rag). The fused recall tool answers from the member's own lexical store query, which is a different mechanism and is not claimed as this one."
	},
	{
		id: "M4.control",
		member: MEMBER.memento,
		title: "POST /api/memento/control — flip vector retrieval on/off",
		mechanism: "route",
		citation: "dsh-memento/index.mjs:2661-2705",
		fused: null,
		reason: "A live mutation of the member's own retrieval configuration. Reproducing it here would be a second writer of a setting the member owns, so the fusion leaves it on the member."
	},
	{
		id: "M5",
		member: MEMBER.memento,
		title: "The frozen per-session snapshot injected through systemPrompt.section",
		mechanism: "slot",
		citation: "dsh-memento/index.mjs:1363 (ctx.systemPrompt.section, name \"dsh-memento:memory\")",
		fused: "GET /meta-memory/api/memento/snapshot (rendered by the member's own renderSnapshot)",
		divergence: "The fused surface RENDERS the snapshot on request; it does not register a second systemPrompt.section. Two sections over one store would inject the same memory twice per turn, which is a regression, so the injection itself stays the member's and the fused route answers what would be injected."
	},
	{
		id: "M6",
		member: MEMBER.memento,
		title: "The write-approval gate (approval/request waterfall + write policy)",
		mechanism: "tool",
		citation: "dsh-memento/index.mjs:1342-1356 (approval/request, { prepend: true })",
		fused: "meta_memory write actions require `approved: true`; every write appends an audit row",
		divergence: "Carried as an explicit argument on the fused tool rather than as a host approval prompt — see M1. The refusing branch is driven by verify/parity.mjs: a write with no `approved` argument must be refused."
	},
	{
		id: "M7",
		member: MEMBER.memento,
		title: "Pending proposals rendered into the snapshot and listed for a human",
		mechanism: "route",
		citation: "dsh-memento/index.mjs:847 (proposals.enabled/maxPending), index.mjs:1382 (proposalList)",
		fused: "/meta-memory/api/memento/proposals + the pending block in /meta-memory/api/memento/snapshot"
	},
	{
		id: "M8",
		member: MEMBER.memento,
		title: "The append-only audit log",
		mechanism: "storage",
		citation: "dsh-memento/lib/store.mjs (auditAppend / auditList), read at index.mjs:2407",
		fused: "/meta-memory/api/memento/audit"
	},
	{
		id: "M9",
		member: MEMBER.memento,
		title: "The SQLite store itself (entries, proposals, audit tables)",
		mechanism: "storage",
		citation: "dsh-memento/lib/store.mjs:232 (openMemoryStore), :154 (resolveDbPath)",
		fused: "opened through the member's own openMemoryStore/resolveDbPath — no second store format",
		divergence: "One SQLite file, two connections (the member's own process and this plugin). Writes are durable and visible to a fresh read; the member's per-session frozen snapshot is frozen BY DESIGN, so a mid-session write appearing only in the next session is the member's documented behaviour and not a fusion defect."
	},
	{
		id: "D1",
		member: MEMBER.delta,
		title: "memory_write — a durable CANDIDATE landed in inbox/, never a fact",
		mechanism: "tool",
		citation: "dsh-memory-delta/src/plugin.mjs:414-476, writing through bin/mem.mjs:720 (path.join(L.inbox, `${id}.md`))",
		fused: "tool meta_memory_write -> POST /meta-memory/api/delta/write"
	},
	{
		id: "D2",
		member: MEMBER.delta,
		title: "memory_search over all six layers plus journal, sessions and index",
		mechanism: "tool",
		citation: "dsh-memory-delta/src/plugin.mjs:285-410 (where enum at :301), bin/mem.mjs:1790 (searchLibrary)",
		fused: "tool meta_memory_search -> GET /meta-memory/api/delta/search"
	},
	{
		id: "D3",
		member: MEMBER.delta,
		title: "The HUMAN-ONLY promotion inbox -> facts|decisions",
		mechanism: "route",
		citation: "dsh-memory-delta/bin/mem.mjs:952 (promoteEntry); the model-side tool cannot reach it",
		fused: "POST /meta-memory/api/delta/promote (requires `by`, an explicit human attribution)",
		divergence: "The fused surface keeps the gate two-step and keeps it OFF the model's tool list: there is no meta_* tool that promotes. A promotion must name who performed it, and the write tool's own description states that its result is not yet a standing fact."
	},
	{
		id: "D4.state",
		member: MEMBER.delta,
		title: "GET /dsh-memory-delta/state — the panel state route",
		mechanism: "route",
		citation: "dsh-memory-delta/src/panel.mjs:36 (MEMORY_ROUTE_PATH)",
		fused: "/meta-memory/api/delta/state"
	},
	{
		id: "D4.action",
		member: MEMBER.delta,
		title: "POST /dsh-memory-delta/action — the panel's write actions (promote, rename)",
		mechanism: "route",
		citation: "dsh-memory-delta/src/panel.mjs:39 (MEMORY_ACTION_PATH)",
		fused: "/meta-memory/api/delta/promote (the promote action only)",
		divergence: "The fused surface carries `promote` as its own named route rather than a generic action dispatcher, so the human gate is a route a reader can see and refuse rather than one verb among many. `rename` stays on the member."
	},
	{
		id: "D4.search",
		member: MEMBER.delta,
		title: "GET /dsh-memory-delta/search — the search route",
		mechanism: "route",
		citation: "dsh-memory-delta/src/panel.mjs:58 (MEMORY_SEARCH_PATH), registered at panel.mjs:615",
		fused: "/meta-memory/api/delta/search"
	},
	{
		id: "D4.pressure",
		member: MEMBER.delta,
		title: "The pressure route and its /memory-delta/api/pressure alias",
		mechanism: "route",
		citation: "dsh-memory-delta/src/panel.mjs:68 (MEMORY_PRESSURE_PATH), :71 (alias)",
		fused: null,
		reason: "The pressure route is a scheduled re-embedding trigger whose settlement marker is written by a consumer polling it. The fused plugin composes no embedding backend and schedules no publish, so carrying the route would advertise a trigger it cannot honour — an advertised path that cannot answer. The member keeps both the route and its alias."
	},
	{
		id: "D5",
		member: MEMBER.delta,
		title: "The differential agent/pre-step injection of standing entries",
		mechanism: "slot",
		citation: "dsh-memory-delta/src/hook.mjs (createMemoryHook) + src/planner.mjs (planInjection), payload from bin/mem.mjs:1668 (injectPayload)",
		fused: "GET /meta-memory/api/delta/inject-payload (the member's own injectPayload, budget-checked)",
		divergence: "The fused surface renders and budget-checks the payload; it does not register a second pre-step splice. Two splices over one store would push the same entries twice per turn."
	},
	{
		id: "D6",
		member: MEMBER.delta,
		title: "The runtime-registered skill (dsh-memory-delta)",
		mechanism: "skill",
		citation: "dsh-memory-delta/src/skill.mjs:18 (SKILL_NAME), registered at src/plugin.mjs:589",
		fused: null,
		reason: "A skill is discovered by the skills service from the registry owner's own row. Registering the same skill name from a second plugin would be a duplicate registration, and registering it under a different name would be a second copy of one document. The member keeps it."
	},
	{
		id: "D7",
		member: MEMBER.delta,
		title: "The zero-dependency `mem` CLI",
		mechanism: "cli",
		citation: "dsh-memory-delta/bin/mem.mjs (bin: mem), import-guarded at bin/mem.mjs:2138-2151",
		fused: null,
		reason: "A CLI is a process entry point, not a route or a tool, so it cannot be \"driven through the fused surface\" in the sense D-0352 rule 2 asks for. This fusion reuses the SAME library module the CLI reuses (bin/mem.mjs is import-guarded and exports the store functions), which is why the store behaviour matches exactly while the CLI itself stays the member's."
	},
	{
		id: "D8",
		member: MEMBER.delta,
		title: "The markdown store tree: inbox/ facts/ decisions/ archive/ + journal, index",
		mechanism: "storage",
		citation: "dsh-memory-delta/bin/mem.mjs:236-255 (ensureLayout: root + four layer dirs + journal + index + config)",
		fused: "read and written through the member's own ensureLayout/readAll/createEntry",
		divergence: "Same tree, one writer path (the member's functions). The fused plugin resolves the same root rule — explicit root, then $DSH_MEMORY_ROOT, then <cwd>/memory — and states which it used in /meta-memory/api/status so a reader can see which store answered."
	},
	{
		id: "I1",
		member: MEMBER.injector,
		title: "A systemPrompt.context recall block that a pre-step verdict can veto to empty",
		mechanism: "slot",
		citation: "dsh-memory-injector/src/index.ts:181-193 (ctx.systemPrompt.context, name \"memory-injector:recall\")",
		fused: "systemPrompt.context \"dsh-meta-memory:recall\" + POST /meta-memory/api/inject/decide",
		divergence: "Registered under the fused surface's OWN name and order so it cannot collide with the member's contribution. The veto mechanics are the member's — the provider returns the empty string, which the host drops before joining — and the block is rendered by the member's own renderRecallBlock."
	},
	{
		id: "I2",
		member: MEMBER.injector,
		title: "The per-(turn,step) admit/refuse verdict listener",
		mechanism: "slot",
		citation: "dsh-memory-injector/src/index.ts:276-317 (ctx.on agent/pre-step, { prepend: true })",
		fused: "agent/pre-step listener registered by this plugin, writing to the member's verdict ledger"
	},
	{
		id: "I3",
		member: MEMBER.injector,
		title: "GET /memory-inject/api/status and /verdicts — the gate's observable",
		mechanism: "route",
		citation: "dsh-memory-injector/src/host/routes.ts:60-95",
		fused: "/meta-memory/api/inject/status and /meta-memory/api/inject/verdicts"
	},
	{
		id: "I4",
		member: MEMBER.injector,
		title: "The durable verdict ledger (one JSONL record per decision)",
		mechanism: "storage",
		citation: "dsh-memory-injector/src/host/ledger.ts:52-90 (appendFileSync, dirname mkdir, durability)",
		fused: "the member's own VerdictLedger class pointed at the member's own sink path"
	},
	{
		id: "I5",
		member: MEMBER.injector,
		title: "The System-1 admission decision itself (askGate against the local backend)",
		mechanism: "tool",
		citation: "dsh-memory-injector/src/host/gate.ts:116 (askGate)",
		fused: "POST /meta-memory/api/inject/decide, calling the member's askGate",
		divergence: "Reachability is a runtime fact, not a property of this plugin: when no decision backend answers, the fused surface reports the gate UNMEASURED with the backend URL and the error, and the recall block is withheld (fail closed), which is the member's own rule."
	}
];
/**
* The inclusion/exclusion verdict per member, and the evidence that settled it.
*
* The `purpose` strings are QUOTATIONS from `profiles-info/plugins.json`, because
* a member's own README states its ambition and the registry states what this
* program recorded it as. The second is the one the decision rests on.
*/
const MEMBER_VERDICTS = [
	{
		member: MEMBER.memento,
		included: true,
		purpose: "The memory-RAG lane's store: cross-agent local-first persistent memory with a typed query seam (profiles-info/plugins.json).",
		surface: {
			tools: 2,
			routes: 8,
			slots: 2,
			commands: 1,
			cliEntryPoints: 1,
			storageRoots: 1
		},
		curation: "approval-policy writes: a write passes through an approval/request waterfall and is audited; the model may add with approval.",
		evidence: "It is the family's STORE and the only member with a durable typed query store, and its frozen snapshot is what the family injects; every one of its four absorbable routes plus its tools were driven through /meta-memory and answered."
	},
	{
		member: MEMBER.delta,
		included: true,
		purpose: "Layered cross-session memory: 2 tools, one agent/pre-step injection, 3 web routes, 1 runtime-registered skill and 8 config keys, ... it is a SECOND memory store beside dsh-memento (profiles-info/plugins.json).",
		curation: "human-only promotion: the model can write ONLY inbox/, and only a named human promotes a candidate into facts/ or decisions/.",
		surface: {
			tools: 2,
			routes: 5,
			slots: 0,
			commands: 0,
			cliEntryPoints: 1,
			storageRoots: 1
		},
		evidence: "SAME PURPOSE, DIFFERENT CURATION POSTURE — the registry itself records it as a second memory store beside memento, and its store is markdown layers with a structural human gate rather than SQLite with an approval policy. Included, and deliberately NOT merged: its inbox->fact gate is carried as a separate, explicitly-labelled layer, because merging the two postures would relax the stricter one and a fusion that removes a safety property is a capability loss even when every route still answers."
	},
	{
		member: MEMBER.injector,
		included: true,
		purpose: "The gateable recall seam the memory-RAG lane needs: a systemPrompt.context() contribution whose provider is re-resolved after the agent/pre-step waterfall, vetoed by returning the empty string (profiles-info/plugins.json).",
		surface: {
			tools: 0,
			routes: 2,
			slots: 1,
			commands: 0,
			cliEntryPoints: 0,
			storageRoots: 2
		},
		curation: "none of its own: it holds no memory and writes no standing entry; it decides whether another member's recall reaches the prompt.",
		evidence: "Same intent, third mechanism: it is ADMISSION CONTROL over the family's recall, and it exists in the family only because memento's snapshot section has no enclosing conditional (its own header cites dsh-memento/index.mjs:1166). Included because dropping it would drop the family's only veto over memory injection, and it exposes no tool of its own, so it needs no tool name in the fused surface."
	}
];
/**
* Derive the census from the table. Never returns a hardcoded figure.
* @param rows - the capability rows to count; defaults to {@link CAPABILITIES}.
* @returns the counts, with the denominator always stated beside the numerator.
*/
function census(rows = CAPABILITIES) {
	const total = rows.length;
	let present = 0;
	let unmeasured = 0;
	let reasoned = 0;
	let blinded = false;
	const byMember = {};
	for (const row of rows) {
		const bucket = byMember[row.member] ?? (byMember[row.member] = {
			present: 0,
			total: 0
		});
		bucket.total += 1;
		if (row.fused !== null) {
			present += 1;
			bucket.present += 1;
		} else {
			unmeasured += 1;
			if (typeof row.reason === "string" && row.reason.trim().length > 0) reasoned += 1;
		}
		if (total > 0 && bucket.total === 0) blinded = true;
	}
	return {
		total,
		present,
		unmeasured,
		byMember,
		rowsWithoutFusedButWithReason: unmeasured === 0 ? 0 : reasoned,
		blinded: total === 0 || blinded
	};
}
/**
* The rows that are carried but whose parity has never been observed, which is
* the coverage figure a caller must publish beside the pass count: a green total
* says nothing ran disagreeing, not that every row can disagree.
* @param rows - the capability rows.
* @returns how many carried rows exist, for use as a denominator elsewhere.
*/
function carriedRows(rows = CAPABILITIES) {
	return rows.filter((row) => row.fused !== null).length;
}
// src/host/stores.ts
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
/** A refusal the fused surface makes on purpose. Distinct from a failure. */
var RefusalError = class extends Error {
	/** Stable reason code, for a harness to assert on rather than on wording. */
	code;
	constructor(code, message) {
		super(message);
		this.name = "RefusalError";
		this.code = code;
	}
};
/**
* Resolve every path once, recording the rule for each.
* @param config - the plugin config.
* @param env - the environment to read `DSH_HOME` / `DSH_MEMORY_ROOT` from.
* @param cwd - the working directory used by the last-resort rules.
* @returns the resolved paths and their rules.
*/
function resolvePaths(config, env, cwd) {
	const dshHome = typeof env["DSH_HOME"] === "string" && env["DSH_HOME"].length > 0 ? env["DSH_HOME"] : join(homedir(), ".dsh");
	const mementoConfig = typeof config.mementoDbPath === "string" ? config.mementoDbPath : "";
	const mementoDb = mementoConfig.length > 0 ? resolve(mementoConfig) : join(dshHome, "dsh-memento", "memory.db");
	const mementoRule = mementoConfig.length > 0 ? "explicit-config" : "member-default";
	let deltaRoot;
	let deltaRule;
	if (typeof config.deltaRoot === "string" && config.deltaRoot.length > 0) {
		deltaRoot = resolve(config.deltaRoot);
		deltaRule = "explicit-config";
	} else if (typeof env["DSH_MEMORY_ROOT"] === "string" && env["DSH_MEMORY_ROOT"].length > 0) {
		deltaRoot = resolve(env["DSH_MEMORY_ROOT"]);
		deltaRule = "DSH_MEMORY_ROOT";
	} else {
		deltaRoot = join(cwd, "memory");
		deltaRule = "cwd/memory";
	}
	return {
		dshHome,
		mementoDb,
		mementoRule,
		deltaRoot,
		deltaRule,
		injectLedger: join(dshHome, "memory-injector", "verdicts.jsonl"),
		injectMemories: join(dshHome, "memory-injector", "memories.json")
	};
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
function createOperations(deps) {
	const { composed, paths } = deps;
	/**
	* Open memento's store through the member's own opener.
	* @returns the member store object.
	* @throws RefusalError when memento's modules are not composed.
	*/
	const memento = () => {
		if (composed.mementoStore === null) throw new RefusalError("member-unavailable", "dsh-memento/lib/store.mjs is not composed, so the store cannot answer");
		return composed.mementoStore.openMemoryStore(paths.mementoDb);
	};
	/**
	* Open delta's library through the member's own layout function.
	* @param create - whether the call may build the directories.
	* @returns the member's library handle.
	* @throws RefusalError when delta's store module is not composed.
	*/
	const delta = (create) => {
		if (composed.deltaStore === null) throw new RefusalError("member-unavailable", "dsh-memory-delta store library is not composed, so the store cannot answer");
		return composed.deltaStore.ensureLayout(paths.deltaRoot, { create });
	};
	/**
	* Append one audit row through the member's own audit method.
	* @param store - the member store.
	* @param row - the row to append.
	*/
	const audit = (store, row) => {
		store.auditAppend({
			action: "write",
			outcome: "ok",
			source: "dsh-meta-memory",
			...row
		});
	};
	return {
		paths,
		gaps: () => composed.gaps,
		mementoQuery(filter) {
			const store = memento();
			try {
				return store.queryEntries(filter);
			} finally {
				store.close?.();
			}
		},
		mementoWrite(action, input, approved) {
			if (!approved) throw new RefusalError("approval-required", "this write is refused: the fused surface requires `approved: true` because a memento write is an approved, audited act (dsh-memento/index.mjs:1342 gates the same property through approval/request)");
			const store = memento();
			try {
				let id = "";
				let landed = action;
				switch (action) {
					case "add":
						id = store.insertEntry(input).id;
						break;
					case "replace":
						id = store.replaceEntry(input).entry.id;
						break;
					case "remove":
						id = store.removeEntry(input).id;
						landed = "removed";
						break;
					case "consolidate":
						id = store.consolidateEntries(input).entry.id;
						break;
					default: throw new RefusalError("unknown-action", `unknown memento action ${JSON.stringify(action)}`);
				}
				audit(store, {
					track: input["track"] ?? null,
					scope: input["scope"] ?? null,
					entryId: id,
					text: typeof input["text"] === "string" ? input["text"] : null
				});
				return {
					id,
					landed,
					audited: true
				};
			} finally {
				store.close?.();
			}
		},
		mementoAudit(limit) {
			const store = memento();
			try {
				return store.auditList(limit ?? 50);
			} finally {
				store.close?.();
			}
		},
		mementoProposals() {
			const store = memento();
			try {
				return store.proposalList("pending", 50);
			} finally {
				store.close?.();
			}
		},
		mementoSnapshot(cwd, agentPreset) {
			const store = memento();
			try {
				const snapshot = composed.mementoSnapshot;
				const workspace = composed.mementoWorkspace;
				if (snapshot === null || workspace === null) throw new RefusalError("member-unavailable", "dsh-memento snapshot modules are not composed");
				const workspaceKey = workspace.workspaceKeyOf(cwd);
				const agentKey = workspace.agentKeyOf(agentPreset);
				const entries = snapshot.visibleEntries(store.listEntries(), workspaceKey, agentKey);
				const proposals = snapshot.visibleProposals(store.proposalList("pending", 8), workspaceKey, agentKey);
				return {
					text: snapshot.renderSnapshot(entries, {
						user: {
							userGlobal: 1200,
							workspace: 900
						},
						agent: {
							userGlobal: 800,
							workspace: 600
						}
					}, proposals, "en"),
					entries: entries.length,
					proposals: proposals.length
				};
			} finally {
				store.close?.();
			}
		},
		mementoStoreInfo() {
			const store = memento();
			try {
				const count = store.listEntries().length;
				return {
					path: store.path,
					exists: true,
					count
				};
			} finally {
				store.close?.();
			}
		},
		deltaSearch(query, where, limit) {
			const library = delta(false);
			const store = composed.deltaStore;
			if (store === null) throw new RefusalError("member-unavailable", "delta store library is not composed");
			return store.searchLibrary(library, {
				query,
				where,
				limit
			});
		},
		deltaWrite(input) {
			const library = delta(true);
			const store = composed.deltaStore;
			if (store === null) throw new RefusalError("member-unavailable", "delta store library is not composed");
			return {
				id: store.createEntry(library, input).id,
				landed: "inbox",
				audited: false
			};
		},
		deltaPromote(id, by) {
			if (typeof by !== "string" || by.trim().length === 0) throw new RefusalError("promotion-requires-a-human", "this promotion is refused: delta's inbox -> facts gate is a HUMAN step, so the fused surface requires the `by` attribution of the person performing it (dsh-memory-delta/bin/mem.mjs:952 promotes, and the model-side tool cannot reach it)");
			const library = delta(true);
			const store = composed.deltaStore;
			if (store === null) throw new RefusalError("member-unavailable", "delta store library is not composed");
			return {
				...store.promoteEntry(library, id, {}),
				promotedBy: by
			};
		},
		deltaState() {
			const library = delta(false);
			const store = composed.deltaStore;
			if (store === null) throw new RefusalError("member-unavailable", "delta store library is not composed");
			const all = store.readAll(library);
			const byLayer = {
				facts: 0,
				decisions: 0,
				inbox: 0,
				archive: 0
			};
			for (const entry of all) {
				const where = typeof entry["where"] === "string" ? entry["where"] : "";
				if (where in byLayer) byLayer[where] = (byLayer[where] ?? 0) + 1;
			}
			return {
				root: library.root,
				rule: paths.deltaRule,
				layers: byLayer,
				total: all.length
			};
		},
		deltaInjectPayload() {
			const library = delta(false);
			const store = composed.deltaStore;
			if (store === null) throw new RefusalError("member-unavailable", "delta store library is not composed");
			return store.injectPayload(library, 3072);
		},
		deltaCandidates(limit) {
			const library = delta(false);
			const store = composed.deltaStore;
			if (store === null) throw new RefusalError("member-unavailable", "delta store library is not composed");
			const standing = store.activeEntries(library);
			const out = [];
			for (const entry of standing) {
				if (out.length >= limit) break;
				const data = entry["data"];
				const body = entry["body"];
				const conclusion = typeof data?.conclusion === "string" ? data.conclusion : typeof body === "string" ? String(body).split("\n")[0] : "";
				if (conclusion.length > 0) out.push({ text: conclusion });
			}
			return out;
		},
		close() {}
	};
}
// src/host/routes.ts
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
/** Write one JSON response. */
function sendJson(res, status, body, headers = {}) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"content-length": String(Buffer.byteLength(payload)),
		...headers
	});
	res.end(payload);
}
/**
* Merge the query string with a JSON body, when the request carries one.
* @param req - the request.
* @returns the merged parameter set.
*/
async function readParams(req) {
	const url = new URL(req.url ?? "/", "http://dsh.invalid");
	const params = new URLSearchParams(url.searchParams);
	if (typeof req.on !== "function") return params;
	const body = await new Promise((resolveBody) => {
		let raw = "";
		req.on?.("data", (chunk) => {
			raw += typeof chunk === "string" ? chunk : String(chunk ?? "");
		});
		req.on?.("end", () => resolveBody(raw));
		req.on?.("error", () => resolveBody(""));
	});
	if (body.trim().length === 0) return params;
	try {
		const parsed = JSON.parse(body);
		for (const [key, value] of Object.entries(parsed)) {
			if (value === void 0 || value === null) continue;
			params.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
		}
	} catch {}
	return params;
}
/** Read a parameter as a string, or undefined. */
function str(params, key) {
	const value = params.get(key);
	return value === null || value.length === 0 ? void 0 : value;
}
/** Read a parameter as a positive integer with a default. */
function int(params, key, fallback) {
	const raw = params.get(key);
	if (raw === null) return fallback;
	const value = Number.parseInt(raw, 10);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}
/** Read a parameter as a boolean; absent is false, and only `true` is true. */
function bool(params, key) {
	return params.get(key) === "true";
}
/** The gate's live reachability and last answer, read from the composed member. */
async function injectStatus(deps) {
	const { composed, config, ops } = deps;
	const baseUrl = config.gateBaseUrl ?? "http://127.0.0.1:8011";
	const threshold = config.gateThreshold ?? .5;
	const ledger = composed.injectorLedger;
	const ledgerReading = ledger === null ? {
		available: false,
		reason: "dsh-memory-injector/lib/host/ledger.js is not composed"
	} : (() => {
		try {
			const instance = new ledger.VerdictLedger(ops.paths.injectLedger, 200, () => {});
			return {
				available: true,
				sink: ops.paths.injectLedger,
				totals: instance.totals(),
				durability: instance.durability(),
				sessions: instance.sessions().length
			};
		} catch (error) {
			return {
				available: false,
				reason: error instanceof Error ? error.message : String(error)
			};
		}
	})();
	return {
		ok: true,
		plugin: "dsh-meta-memory",
		admission: {
			providerRegistered: deps.injectRecall,
			contextName: deps.contextName,
			order: deps.order,
			baseUrl,
			threshold,
			note: deps.injectRecall ? "this plugin owns a recall context provider and a pre-step listener" : "this plugin registered NO recall provider: the member's own seam is mounted, and a second contribution would inject the same memory twice per turn"
		},
		ledger: ledgerReading,
		members: {
			gate: composed.injectorGate === null ? null : "dsh-memory-injector/lib/host/gate.js",
			recall: composed.injectorRecall === null ? null : "dsh-memory-injector/lib/host/recall.js"
		}
	};
}
/** Every dispatched route, in one table. {@link ADVERTISED} is derived from it. */
const ROUTES = [
	{
		method: "GET",
		path: "/api/status",
		run: (_params, deps) => ({
			ok: true,
			plugin: "dsh-meta-memory",
			prefix: PREFIX,
			censusAt: (/* @__PURE__ */ new Date()).toISOString(),
			members: {
				memento: deps.composed.memento,
				delta: deps.composed.delta,
				injector: deps.composed.injector
			},
			gaps: deps.ops.gaps(),
			stores: {
				mementoDb: deps.ops.paths.mementoDb,
				mementoRule: deps.ops.paths.mementoRule,
				deltaRoot: deps.ops.paths.deltaRoot,
				deltaRule: deps.ops.paths.deltaRule,
				injectLedger: deps.ops.paths.injectLedger
			},
			context: {
				name: deps.contextName,
				order: deps.order,
				registered: deps.injectRecall
			},
			counts: census()
		})
	},
	{
		method: "GET",
		path: "/api/census",
		run: () => {
			const counts = census();
			return {
				ok: true,
				plugin: "dsh-meta-memory",
				censusAt: (/* @__PURE__ */ new Date()).toISOString(),
				numerator: counts.present,
				denominator: counts.total,
				unmeasured: counts.unmeasured,
				carriedRows: carriedRows(),
				blinded: counts.blinded,
				byMember: counts.byMember,
				rows: CAPABILITIES.map((row) => ({
					id: row.id,
					member: row.member,
					title: row.title,
					mechanism: row.mechanism,
					citation: row.citation,
					fused: row.fused,
					state: row.fused === null ? "unmeasured" : "present",
					reason: row.reason ?? null,
					divergence: row.divergence ?? null
				}))
			};
		}
	},
	{
		method: "GET",
		path: "/api/members",
		run: () => ({
			ok: true,
			members: MEMBER_VERDICTS
		})
	},
	{
		method: "GET",
		path: "/api/memento/entries",
		run: (params, deps) => deps.ops.mementoQuery({
			...str(params, "text") === void 0 ? {} : { text: str(params, "text") },
			...str(params, "track") === void 0 ? {} : { track: str(params, "track") },
			...str(params, "scope") === void 0 ? {} : { scope: str(params, "scope") },
			limit: int(params, "limit", 50)
		})
	},
	{
		method: "GET",
		path: "/api/memento/query",
		run: (params, deps) => deps.ops.mementoQuery({
			text: str(params, "text"),
			limit: int(params, "limit", 50)
		})
	},
	{
		method: "GET",
		path: "/api/memento/audit",
		run: (params, deps) => ({ rows: deps.ops.mementoAudit(int(params, "limit", 50)) })
	},
	{
		method: "GET",
		path: "/api/memento/proposals",
		run: (_params, deps) => ({ proposals: deps.ops.mementoProposals() })
	},
	{
		method: "GET",
		path: "/api/memento/store",
		run: (_params, deps) => ({
			...deps.ops.mementoStoreInfo(),
			rule: deps.ops.paths.mementoRule
		})
	},
	{
		method: "GET",
		path: "/api/memento/snapshot",
		run: (params, deps) => deps.ops.mementoSnapshot(str(params, "cwd"), str(params, "agentPreset"))
	},
	{
		method: "POST",
		path: "/api/memento/add",
		run: (params, deps) => {
			const input = {
				track: str(params, "track") ?? "user",
				scope: str(params, "scope") ?? "workspace",
				workspaceKey: str(params, "workspaceKey") ?? "",
				text: str(params, "text") ?? "",
				source: "dsh-meta-memory",
				sessionId: str(params, "sessionId") ?? null
			};
			if (Array.isArray(params.getAll("tags")) && params.getAll("tags").length > 0) input["tags"] = params.getAll("tags");
			return deps.ops.mementoWrite("add", input, bool(params, "approved"));
		}
	},
	{
		method: "POST",
		path: "/api/memento/replace",
		run: (params, deps) => deps.ops.mementoWrite("replace", {
			track: str(params, "track") ?? "user",
			scope: str(params, "scope") ?? "workspace",
			match: str(params, "match") ?? "",
			text: str(params, "text") ?? ""
		}, bool(params, "approved"))
	},
	{
		method: "POST",
		path: "/api/memento/remove",
		run: (params, deps) => deps.ops.mementoWrite("remove", {
			track: str(params, "track") ?? "user",
			scope: str(params, "scope") ?? "workspace",
			match: str(params, "match") ?? ""
		}, bool(params, "approved"))
	},
	{
		method: "POST",
		path: "/api/memento/consolidate",
		run: (params, deps) => deps.ops.mementoWrite("consolidate", {
			track: str(params, "track") ?? "user",
			scope: str(params, "scope") ?? "workspace",
			matches: (str(params, "matches") ?? "").split(",").map((part) => part.trim()).filter((part) => part.length > 0),
			text: str(params, "text") ?? ""
		}, bool(params, "approved"))
	},
	{
		method: "GET",
		path: "/api/delta/state",
		run: (_params, deps) => deps.ops.deltaState()
	},
	{
		method: "GET",
		path: "/api/delta/search",
		run: (params, deps) => deps.ops.deltaSearch(str(params, "q") ?? "", str(params, "where") ?? "all", int(params, "limit", 10))
	},
	{
		method: "GET",
		path: "/api/delta/inject-payload",
		run: (_params, deps) => deps.ops.deltaInjectPayload()
	},
	{
		method: "POST",
		path: "/api/delta/write",
		run: (params, deps) => {
			const input = {
				type: str(params, "type") ?? "fact",
				conclusion: str(params, "conclusion") ?? "",
				reason: str(params, "reason"),
				key: str(params, "key"),
				id: str(params, "id"),
				scope: "workspace",
				source: "dsh-meta-memory"
			};
			const tags = str(params, "tags");
			if (tags !== void 0) input["tags"] = tags.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
			return {
				...deps.ops.deltaWrite(input),
				isStandingFact: false,
				note: "candidate only: it is in inbox/ and is NOT injected until a human promotes it"
			};
		}
	},
	{
		method: "POST",
		path: "/api/delta/promote",
		run: (params, deps) => deps.ops.deltaPromote(str(params, "id") ?? "", str(params, "by") ?? "")
	},
	{
		method: "GET",
		path: "/api/inject/status",
		run: (_params, deps) => injectStatus(deps)
	},
	{
		method: "GET",
		path: "/api/inject/verdicts",
		run: (params, deps) => {
			const ledger = deps.composed.injectorLedger;
			if (ledger === null) return {
				ok: false,
				error: "injector ledger module is not composed"
			};
			const instance = new ledger.VerdictLedger(deps.ops.paths.injectLedger, 200, () => {});
			return {
				ok: true,
				sink: deps.ops.paths.injectLedger,
				totals: instance.totals(),
				verdicts: instance.snapshot(int(params, "limit", 20))
			};
		}
	},
	{
		method: "POST",
		path: "/api/inject/decide",
		run: async (params, deps) => {
			const gate = deps.composed.injectorGate;
			const recall = deps.composed.injectorRecall;
			if (gate === null || recall === null) return {
				ok: false,
				error: "injector gate or recall module is not composed"
			};
			const task = str(params, "task") ?? "";
			const sessionId = str(params, "sessionId") ?? "meta-memory-probe";
			const candidateText = str(params, "text") ?? "";
			const block = candidateText.length > 0 ? recall.renderRecallBlock([{ text: candidateText }]) : "";
			const baseUrl = deps.config.gateBaseUrl ?? "http://127.0.0.1:8011";
			const answer = await gate.askGate({
				baseUrl,
				state: block,
				timeoutMs: int(params, "timeoutMs", 5e3),
				threshold: deps.config.gateThreshold ?? .5
			});
			const admit = answer["admit"] === true;
			deps.setRecall(sessionId, admit ? block : null);
			const ledger = deps.composed.injectorLedger;
			let recorded = null;
			if (ledger !== null) try {
				recorded = { written: new ledger.VerdictLedger(deps.ops.paths.injectLedger, 200, () => {}).commit({
					at: (/* @__PURE__ */ new Date()).toISOString(),
					sessionId,
					turn: int(params, "turn", 0),
					step: int(params, "step", 0),
					outcome: String(answer["outcome"] ?? "unavailable"),
					admit,
					reason: String(answer["reason"] ?? ""),
					baseUrl,
					lane: String(answer["lane"] ?? ""),
					httpStatus: typeof answer["status"] === "number" ? answer["status"] : null,
					probabilities: answer["probabilities"] ?? null,
					top: typeof answer["top"] === "string" ? answer["top"] : null,
					task,
					blockHash: recall.hashText(block)
				}).written };
			} catch (error) {
				recorded = {
					written: false,
					error: error instanceof Error ? error.message : String(error)
				};
			}
			return {
				ok: true,
				outcome: answer["outcome"] ?? "unavailable",
				admit,
				reason: answer["reason"] ?? "",
				lane: answer["lane"] ?? "",
				baseUrl,
				blockChars: block.length,
				stagedForSession: admit ? sessionId : null,
				wouldRender: deps.getRecall(sessionId),
				ledger: recorded
			};
		}
	}
];
/** Every registered path, derived from {@link ROUTES}. */
const ADVERTISED = ROUTES.map((route) => `${route.method} ${PREFIX}${route.path}`);
/**
* Build the prefix handler for {@link PREFIX}.
* @param deps - the operations, the composition and the config in force.
* @returns a node request handler owning the full response lifecycle.
*/
function createRouteHandler(deps) {
	return async (req, res) => {
		try {
			const url = new URL(req.url ?? "/", "http://dsh.invalid");
			const relative = url.pathname.slice(12) || "/";
			const method = (req.method ?? "GET").toUpperCase();
			const pathMatches = ROUTES.filter((route) => route.path === relative);
			if (pathMatches.length === 0) {
				sendJson(res, 404, {
					ok: false,
					error: `no such route under ${PREFIX}`,
					path: url.pathname,
					advertised: ADVERTISED
				});
				return;
			}
			const route = pathMatches.find((candidate) => candidate.method === method);
			if (route === void 0) {
				const allowed = pathMatches.map((candidate) => candidate.method);
				sendJson(res, 405, {
					ok: false,
					error: `${allowed.join(" or ")} required for ${relative}`,
					advertised: ADVERTISED
				}, { allow: allowed.join(", ") });
				return;
			}
			const params = await readParams(req);
			sendJson(res, 200, await route.run(params, deps));
		} catch (error) {
			const refusal = error instanceof RefusalError;
			sendJson(res, refusal ? 409 : 500, {
				ok: false,
				refused: refusal,
				code: error instanceof RefusalError ? error.code : "internal-error",
				error: error instanceof Error ? error.message : String(error)
			});
		}
	};
}
// src/host/tools.ts
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
/** Read a string argument. */
function arg(args, key) {
	const value = args[key];
	return typeof value === "string" && value.length > 0 ? value : void 0;
}
/** Read a string-list argument, accepting a comma-joined string too. */
function listArg(args, key) {
	const value = args[key];
	if (Array.isArray(value)) {
		const items = value.filter((item) => typeof item === "string" && item.length > 0);
		return items.length > 0 ? items : void 0;
	}
	if (typeof value === "string" && value.length > 0) return value.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
}
/** Render one text part, the shape the tool DSL expects from `output.render`. */
function text(value) {
	return [{
		type: "text",
		text: value
	}];
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
function parametersSchema(specs) {
	const properties = {};
	const required = [];
	for (const [key, spec] of Object.entries(specs)) {
		const { required: isRequired, ...rest } = spec;
		properties[key] = rest;
		if (isRequired === true) required.push(key);
	}
	return {
		type: "object",
		properties,
		...required.length > 0 ? { required } : {},
		additionalProperties: false
	};
}
/**
* Build the four fused tools over the composed operations.
* @param ops - the fused operations.
* @returns the tool definitions, in registration order.
*/
function buildTools(ops) {
	return [
		{
			name: TOOL.memory,
			description: "Read or change the standing memory store (dsh-memento, composed). Actions: query (free), add, replace, remove, consolidate. Every WRITE must pass approved: true, because a write here is an approved, audited act — a write without it is refused and nothing is stored. replace/remove target an entry by a UNIQUE case-insensitive substring, so a short match fails with the candidate list rather than guessing.",
			parameters: parametersSchema({
				action: {
					type: "string",
					required: true,
					enum: [
						"add",
						"replace",
						"remove",
						"consolidate",
						"query"
					],
					description: "What to do."
				},
				track: {
					type: "string",
					enum: ["user", "agent"],
					description: "Which track the entry belongs to."
				},
				scope: {
					type: "string",
					enum: ["user-global", "workspace"],
					description: "Which layer the entry belongs to."
				},
				text: {
					type: "string",
					description: "The entry text, or the substring to query for."
				},
				match: {
					type: "string",
					description: "for replace/remove: a UNIQUE substring identifying the target entry."
				},
				matches: {
					type: "array",
					items: { type: "string" },
					description: "for consolidate: the unique substrings to merge."
				},
				tags: {
					type: "array",
					items: { type: "string" },
					description: "Optional tags."
				},
				approved: {
					type: "boolean",
					description: "REQUIRED for every write. States that this write is approved; the write is refused without it."
				}
			}),
			output: {
				schema: { type: "object" },
				render: (_args, value) => text(JSON.stringify(value))
			},
			async execute(args) {
				const action = arg(args, "action") ?? "query";
				if (action === "query") return {
					action,
					...ops.mementoQuery({
						...arg(args, "text") === void 0 ? {} : { text: arg(args, "text") },
						...arg(args, "track") === void 0 ? {} : { track: arg(args, "track") },
						...arg(args, "scope") === void 0 ? {} : { scope: arg(args, "scope") }
					})
				};
				const approved = args["approved"] === true;
				const base = {
					track: arg(args, "track") ?? "user",
					scope: arg(args, "scope") ?? "workspace",
					text: arg(args, "text") ?? ""
				};
				const input = action === "add" ? {
					...base,
					workspaceKey: "",
					source: "dsh-meta-memory",
					sessionId: null,
					...listArg(args, "tags") === void 0 ? {} : { tags: listArg(args, "tags") }
				} : action === "consolidate" ? {
					...base,
					matches: listArg(args, "matches") ?? []
				} : {
					...base,
					match: arg(args, "match") ?? ""
				};
				return {
					action,
					...ops.mementoWrite(action, input, approved)
				};
			},
			presentCall: (args) => ({
				card: "generic",
				title: `Memory ${String(args["action"] ?? "query")}`,
				kind: "other",
				rawInput: args
			})
		},
		{
			name: TOOL.recall,
			description: "Search the standing memory store (dsh-memento, composed) by free text and return the matching entries with the store total, so a truncated answer says so. Read-only.",
			parameters: parametersSchema({
				text: {
					type: "string",
					required: true,
					description: "The text to look for."
				},
				limit: {
					type: "number",
					description: "Maximum entries to return."
				}
			}),
			output: {
				schema: { type: "object" },
				render: (_args, value) => text(JSON.stringify(value))
			},
			async execute(args) {
				const limit = typeof args["limit"] === "number" ? args["limit"] : void 0;
				return {
					...ops.mementoQuery({
						text: arg(args, "text") ?? "",
						...limit === void 0 ? {} : { limit }
					}),
					query: arg(args, "text") ?? ""
				};
			}
		},
		{
			name: TOOL.search,
			description: "Search the layered project memory (dsh-memory-delta, composed): the inbox of pending candidates, the standing facts and decisions, the archive, the journal, the session index, and the document index. Read-only.",
			parameters: parametersSchema({
				query: {
					type: "string",
					required: true,
					description: "Keywords; Chinese is matched by bigram without needing spaces."
				},
				where: {
					type: "string",
					enum: [
						"all",
						"facts",
						"decisions",
						"inbox",
						"archive",
						"journal",
						"sessions",
						"index"
					],
					description: "Restrict to one layer."
				},
				limit: {
					type: "number",
					description: "Maximum matches."
				}
			}),
			output: {
				schema: { type: "object" },
				render: (_args, value) => text(JSON.stringify(value))
			},
			async execute(args) {
				const limit = typeof args["limit"] === "number" ? args["limit"] : 10;
				return {
					...ops.deltaSearch(arg(args, "query") ?? "", arg(args, "where") ?? "all", limit),
					query: arg(args, "query") ?? ""
				};
			}
		},
		{
			name: TOOL.write,
			description: "Record a durable CANDIDATE into the project memory INBOX (dsh-memory-delta, composed). It lands in inbox/ and is NOT injected to anyone until a HUMAN promotes it into the fact layer — so this tool cannot make a standing fact, by design. Write conclusions, not process.",
			parameters: parametersSchema({
				type: {
					type: "string",
					required: true,
					enum: ["fact", "decision"],
					description: "fact = a truth about the project; decision = a choice plus its reason."
				},
				conclusion: {
					type: "string",
					required: true,
					description: "One-line conclusion, not a narrative."
				},
				reason: {
					type: "string",
					description: "Why it holds or why it was chosen."
				},
				key: {
					type: "string",
					description: "Semantic key; only one active fact may exist per key."
				},
				tags: {
					type: "array",
					items: { type: "string" },
					description: "Topic tags."
				}
			}),
			output: {
				schema: { type: "object" },
				render: (_args, value) => text(JSON.stringify(value))
			},
			async execute(args) {
				return {
					...ops.deltaWrite({
						type: arg(args, "type") ?? "fact",
						conclusion: arg(args, "conclusion") ?? "",
						reason: arg(args, "reason"),
						key: arg(args, "key"),
						...listArg(args, "tags") === void 0 ? {} : { tags: listArg(args, "tags") },
						scope: "workspace",
						source: "dsh-meta-memory"
					}),
					isStandingFact: false,
					note: "CANDIDATE only: it is in inbox/ and is not injected until a human promotes it. This tool has no promote action, and that is deliberate."
				};
			}
		}
	];
}
// src/index.ts
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
/** The loader row and bundle id. */
const name = "dsh-meta-memory";
/**
* All three services are required, because all three are the seams this plugin
* exists to occupy: `tools` publishes the fused tool list, `webServer` owns the
* prefix, and `systemPrompt` is where the admission seam lives.
*/
const inject = [
	"tools",
	"webServer",
	"systemPrompt"
];
/**
* Normalise the loader-row config.
* @param raw - the config object from the loader row, if any.
* @returns the config, with only recognised fields carried.
*/
function resolveConfig(raw) {
	const input = typeof raw === "object" && raw !== null ? raw : {};
	const text = (key) => {
		const value = input[key];
		return typeof value === "string" ? value : void 0;
	};
	const number = (key) => {
		const value = input[key];
		return typeof value === "number" && Number.isFinite(value) ? value : void 0;
	};
	return {
		mementoDbPath: text("mementoDbPath"),
		deltaRoot: text("deltaRoot"),
		requireApproval: input["requireApproval"] !== false,
		injectRecall: input["injectRecall"] === true,
		gateBaseUrl: text("gateBaseUrl"),
		gateThreshold: number("gateThreshold")
	};
}
/** Read a session id off a pre-step payload, defensively. */
function sessionIdOf(payload) {
	const id = (payload?.agent)?.session?.id;
	return typeof id === "string" && id.length > 0 ? id : null;
}
/**
* Mount the fused surface.
* @param ctx - the host context.
* @param rawConfig - the loader row's config.
*/
async function apply(ctx, rawConfig) {
	const config = resolveConfig(rawConfig);
	const paths = resolvePaths(config, process.env, process.cwd());
	const composed = await compose();
	const ops = createOperations({
		composed,
		config,
		paths
	});
	/** The staged recall text per session: absent means "withheld", which is the veto. */
	const recalls = /* @__PURE__ */ new Map();
	const order = ctx.systemPrompt.getContextOrder(CONTEXT_ORDER_BASE) + 20;
	const routeDeps = {
		ops,
		composed,
		config,
		order,
		contextName: RECALL_CONTEXT_NAME,
		injectRecall: config.injectRecall === true,
		setRecall: (sessionId, text) => {
			if (text === null) recalls.delete(sessionId);
			else recalls.set(sessionId, text);
		},
		getRecall: (sessionId) => recalls.get(sessionId) ?? ""
	};
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: PREFIX,
		handler: createRouteHandler(routeDeps)
	}), "dsh-meta-memory: /meta-memory prefix");
	for (const tool of buildTools(ops)) ctx.tools.register(tool);
	if (config.injectRecall === true) {
		ctx.effect(() => ctx.systemPrompt.context({
			name: RECALL_CONTEXT_NAME,
			order,
			text: (assemble) => {
				const sessionId = sessionIdOf(assemble);
				return sessionId === null ? "" : recalls.get(sessionId) ?? "";
			}
		}), "dsh-meta-memory: recall context");
		ctx.on("agent/pre-step", async (payload, next) => {
			const sessionId = sessionIdOf(payload);
			if (sessionId !== null) recalls.delete(sessionId);
			const gate = composed.injectorGate;
			const recall = composed.injectorRecall;
			const ledger = composed.injectorLedger;
			if (sessionId !== null && gate !== null && recall !== null) try {
				const candidates = ops.deltaCandidates(8);
				if (candidates.length > 0) {
					const block = recall.renderRecallBlock(candidates);
					const baseUrl = config.gateBaseUrl ?? "http://127.0.0.1:8011";
					const answer = await gate.askGate({
						baseUrl,
						state: block,
						timeoutMs: 5e3,
						threshold: config.gateThreshold ?? .5
					});
					if (answer["admit"] === true) recalls.set(sessionId, block);
					if (ledger !== null) new ledger.VerdictLedger(paths.injectLedger, 200, () => {}).commit({
						at: (/* @__PURE__ */ new Date()).toISOString(),
						sessionId,
						turn: 0,
						step: 0,
						outcome: String(answer["outcome"] ?? "unavailable"),
						admit: answer["admit"] === true,
						reason: String(answer["reason"] ?? ""),
						baseUrl,
						lane: String(answer["lane"] ?? ""),
						httpStatus: typeof answer["status"] === "number" ? answer["status"] : null,
						probabilities: answer["probabilities"] ?? null,
						top: typeof answer["top"] === "string" ? answer["top"] : null,
						task: "pre-step recall",
						blockHash: recall.hashText(block)
					});
				}
			} catch (error) {
				ctx.logger.warn("dsh-meta-memory: recall withheld, gate path failed: %s", error instanceof Error ? error.message : String(error));
				recalls.delete(sessionId);
			}
			return next();
		}, { prepend: true });
	}
	ctx.logger.info("dsh-meta-memory: fused surface at %s (memento %s, delta %s, injector %s; recall seam %s; gaps %d)", PREFIX, composed.memento === null ? "absent" : composed.memento.version, composed.delta === null ? "absent" : composed.delta.version, composed.injector === null ? "absent" : composed.injector.version, config.injectRecall === true ? "registered" : "not registered", composed.gaps.length);
}
export { apply, inject, name, resolveConfig };

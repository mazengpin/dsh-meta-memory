# DISCLOSURE - dsh-meta-memory 0.9.0

This file is what a consumer needs before installing or trusting this package. It states what the package does, what it does not do, every store it touches, and where a protection does not exist.

## 1. What this package is

One fused Cordis plugin: the memory half of the meta layer. It presents the cross-session memory family as ONE surface - one route prefix `/meta-memory`, four tools (`meta_memory`, `meta_memory_recall`, `meta_memory_search`, `meta_memory_write`), and one sidebar tab that is RETIRED - over three member plugins that stay mounted, unmodified and undeleted.
It composes members by importing their own library modules; it copies no member and owns no store format of its own.
Version `0.9.0`, licence MIT.

## 2. What it does today

`pnpm run verify` is green. Every figure below is a fraction with its denominator:
| Harness | Result |
|---|---|
| parity | **24 of 32** |
| gate-control | **17 of 17** |
| route-probe | **9 of 9** |
| client-bundle | **11 of 11** |
| mutation | **6 of 6** detected and restored |
The old Memory tab is RETIRED: `MEMORY_TAB_RETIRED = true` in `src/client/index.ts`. The harness ASSERTS the retirement instead of failing on it - the owner saw two sidebar entries named "Memory" and one surface is the fix, so a red check would be asserting the wrong thing.
MEASURED, AND ONE EARLIER FIGURE DID NOT REPRODUCE: an earlier note stated gate-control 9 of 9 and route-probe 11 of 11. The same run that produced this file printed checks: 17 / 17 and checks: 9 / 9. The numbers above are the ones the harness printed; the older pair did not reproduce and is superseded here rather than repeated.

`npm pack --dry-run` reports **17 files / 60.3 kB** - what a tarball would carry, not what a checkout carries.

## 3. What it does NOT do

- It does NOT replace any member. `dsh-memento`, `dsh-memory-delta` and `dsh-memory-injector` stay mounted and keep their own routes, and the fused routes are additional rather than a rename.
- It does NOT merge the two curation postures. Memento lets the model write under an approval policy; delta forbids the model from writing a fact at all. Merging them would relax the stricter one, so the inbox-to-fact gate is carried as a separate, labelled layer.
- It does NOT promote. No tool can move an entry from delta `inbox/` to `facts/`; `meta_memory_write` lands a CANDIDATE only, and promotion stays a human act through the route that requires a `by` attribution.
- It does NOT authenticate an approval. `approved: true` is an argument the caller supplies, not a verified human decision.
- It does NOT refuse a divergent write across the neighbouring stores. See section 4.
- It does NOT embed, index or schedule anything: no embedding backend is opened, no publish runs in the background, and no model is called.
- It does NOT reach the GPU. There is no Cordis-to-GPU connection anywhere; the card is reached only through `llama.cpp` and its controlling scripts, and this package calls neither.
- It does NOT add authentication to its routes. See section 6.

## 4. Data it reads and writes

Every path this package touches, and the rule that produces it (`src/host/stores.ts`, `resolvePaths`):
| Path | What lives there | Rule that produces it |
|---|---|---|
| `$DSH_HOME/dsh-memento/memory.db` | memento SQLite store: entries, proposals, audit rows | `mementoDbPath`, else the member default |
| `<deltaRoot>/` | delta markdown layers `inbox/`, `facts/`, `decisions/`, `archive/`, plus journal, index and session index | `deltaRoot`, else `DSH_MEMORY_ROOT`, else `<cwd>/memory` |
| `$DSH_HOME/memory-injector/verdicts.jsonl` | injector verdict ledger, one JSON object per line | fixed, no override |
| `$DSH_HOME/memory-injector/memories.json` | injector fallback candidate file | fixed, no override |
`$DSH_HOME` is `DSH_HOME` when it is set, else `~/.dsh`.
Nothing else is opened. No cache, no temp file, no index, no log of its own.

**TWO NEIGHBOURING MEMORY STORES EXIST IN THE SAME PROFILE, plus a third beside them.** `dsh-memento` (this package reads and writes it), `dsh-memory-delta` (this package reads and writes it), and the rolebox `.rolebox/memory.db` sqlite+FTS5 layer (this package never opens it).
The two it does touch are separate stores with separate formats and separate curation postures, and a write through one is invisible to the other.
**THIS PACKAGE DOES NOT YET REFUSE A DIVERGENT WRITE.** If the same fact is written to memento and to delta, and one copy is later removed, both writes succeed and the divergence is visible only as a census on `/meta-memory/api/census` and `/api/delta/state`. It surfaces the divergence; it does not reject the write. Recording which store is the RECORD is `1.0.0` item 3 in `ROADMAP.md`.

## 5. Network

Inbound: routes only, under the prefix `/meta-memory`, registered with `ctx.webServer.register` on the harness web listener.
Outbound: exactly one destination, the System-1 gate at `gateBaseUrl`, default `http://127.0.0.1:8011`, used by `/api/inject/decide` and by the optional pre-step gate.
`gateBaseUrl` is CONFIGURATION, so an operator can point it at a non-loopback URL. The default is loopback and the package dials nothing else; no other host is reachable from this code, including by a route parameter.
No model call. No embedding call. No GPU. No telemetry. No registry lookup. No update check.

## 6. Security posture and privacy

WHAT IS STORED: free text that a user or a model wrote - memory entries, proposals, audit rows, inbox candidates, verdict records. It can contain anything, including names, paths, personal notes and credentials pasted into a prompt. Treat every entry as sensitive.
WHERE: plaintext files and a plaintext SQLite database under `$DSH_HOME` and `deltaRoot`, readable by any process running as the same OS user.
FORMAT: markdown files for delta, SQLite tables for memento, JSON and JSON Lines for the injector ledger.
ENCRYPTED: **NONE**. At rest and in transit on the loopback listener alike, nothing in this package encrypts anything.
SIGNED: **NONE**. No signature, no per-entry checksum, no MAC, no tamper evidence. A hand edit to `memory.db` or to a markdown layer is undetectable from here.
ACCESS CONTROL ON THE STORES: **NONE** from this package - it inherits OS file permissions and calls no chmod.
DURABILITY: whatever the members provide. This package adds no fsync, no file lock and no journal of its own.
PROVENANCE: a memento write appends a memento audit row, and a write without `approved: true` is refused. That records that the CALLER said it was approved; it does not record who approved it.
ROUTES: the plugin registers them and adds NO authentication. The host webserver has no auth gate of its own, so any local process that can reach the harness web port can call these routes, including the write routes.
WHAT A USER MUST ASSUME: memory another process could edit is memory that could be wrong at read time, and this package cannot tell you it happened, because nothing here is signed or encrypted.

## 7. Licence and engines

MIT - see `LICENSE`.
`engines`: `node` `^22.19.0 || >=24.0.0`; `dsh` `>=0.2.0-0 <0.3.0`.
`repository` is NOT set in `package.json`. The release owner sets that URL at publish time; until then this file and the package name are the only locators, and no repository URL is asserted here or anywhere else in this package.

## 8. State: SOURCE PREVIEW - information-providing only

This package is a **SOURCE PREVIEW**. It provides information about what the memory layer is, does and does not do.
It is readable. It is **NOT installable from source**: a clone has no `lib/`, and the build and relative-`link:` steps in `README.md` exist to DEVELOP it, not to install it.
Installation arrives with the **published pre-release tarball on the `next` dist-tag** (`0.9.0`). `publishConfig.tag` is `next`; `latest` is not this package.
Nothing here is a support commitment or a stability promise. `ROADMAP.md` names what `1.0.0` still requires, and an item is done only when a command proves it.

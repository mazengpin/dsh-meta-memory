# CONTEXT - dsh-meta-memory

## The problem
A DSH user ends up with several memory surfaces and several memory stores inside one profile: one sidebar tab called Memory from one plugin, another Memory panel from a second, an sqlite store, a markdown store, and a gate in front of recall.
Each is defensible alone. Together they leave one question unanswered: which one is my memory?
The cost is not confusion. The same fact can be written twice, read once and deleted nowhere, and no surface says which copy is the record.

## The context, which is also the constraint
This package is SEATED BESIDE two existing memory stores, not on top of them: `dsh-memento` (SQLite, an approval policy over model writes) and `dsh-memory-delta` (markdown layers, a human-only promotion gate), with the rolebox `.rolebox/memory.db` layer beside both.
That seating IS the constraint. The two members disagree about who may write: memento lets the model write with approval, delta forbids the model from writing a fact at all. A fusion that merged those postures would silently relax the stricter one.
So the fusion composes and does not merge: it imports the members own library modules, keeps both postures intact and labelled, and adds one route prefix and one tool set over them.

## The intent, and what was deliberately NOT attempted
Intent: one place to see the memory family and drive it, with the curation difference preserved rather than flattened, and with the divergence between the stores visible rather than hidden.
NOT attempted, each for a stated reason:
- deleting or replacing a member: all three stay mounted, unmodified and undeleted.
- a tool that promotes inbox to facts: the model must not be able to promote, so the promote route requires a `by` attribution and no tool reaches it.
- merging the two approval postures into one knob: that is a capability loss wearing the name of a simplification.
- one store: naming which store is the record is `1.0.0` item 3 in `ROADMAP.md`, not a 0.9.0 claim.
- embedding, indexing or scheduling: the package opens no embedding backend, no background publish, no model call and no GPU.
- authentication on the routes: a host concern, absent today, and `DISCLOSURE.md` section 6 says so plainly.

## Alternatives rejected
- Build a fourth store and migrate both members into it: rejected, because it would either lose one posture or duplicate every write, and because those stores are other plugins records.
- Make the fused panel a third Memory entry in the sidebar: rejected on the owners report that two Memory entries were already too many. The tab is RETIRED (`MEMORY_TAB_RETIRED = true`) and `dsh-memento` keeps the single surface; the harness asserts the retirement instead of failing on it.
- Expose a promote tool that takes a `by` argument: rejected, because a one-step write wearing a two-step contract is a capability regression, not a convenience.
- Refuse a divergent write across the two stores: NOT DONE and not rejected - it is unbuilt, and `ROADMAP.md` names it.
- Any claim about a repository URL: NOT RECORDED, because no `repository` field exists in `package.json` and the release owner sets it at publish time.

## Steps to recreate a working environment (node, pnpm, git only)
1. `git clone` this package into `plugins-src/dsh-meta-memory` inside the plugin source tree. The repository URL is set by the release owner at publish time and is not asserted here.
2. `cd plugins-src/dsh-meta-memory`
3. `pnpm install`
4. `pnpm run build` - writes `lib/index.js` (host) and `lib/client.js` (browser). A fresh clone has neither.
5. `pnpm run verify` - five harnesses, all must exit 0.
6. For a DEVELOPMENT mount only: add the dependency `dsh-meta-memory` with the value `link:../../plugins-src/dsh-meta-memory` to the profile dependencies, and add `dsh-meta-memory` to the profile `dsh.profile.bundles`. The link must be RELATIVE; an absolute path is forbidden.
7. `cd profiles-tree/personal-dev && pnpm install`
8. Restart the harness. A bundles change hot-reloads; everything else needs a restart.
9. A consumer does NOT do steps 1 to 8. It installs the published pre-release: `pnpm add dsh-meta-memory@next`.

## What to read next
- `DISCLOSURE.md` - every store path, the network surface, and where a protection does not exist.
- `ROADMAP.md` - what `1.0.0` still requires, graded by a command rather than described.
- `README.md` - the published surface, the config keys, and which install path is for which reader.
- `src/host/stores.ts` - the two refusals that are the point of the file.

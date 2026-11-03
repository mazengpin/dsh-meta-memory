# dsh-meta-memory

> **Status: PRE-RELEASE `0.9.0` — under active development.** This package is published on the `next` dist-tag, not `latest`.
> Its API, wire records and panel contracts may change between `0.9.x` releases, and each package carries its own `ROADMAP.md` naming what `1.0.0` still requires.
> A published tarball is a snapshot of a moving surface: read `ROADMAP.md` before depending on a shape.

Stable pre-release `0.9.0`: ONE fused plugin that presents the cross-session memory family as one surface — one route prefix `/meta-memory`, four tools, and a sidebar tab that is RETIRED (see below) — over three member plugins that stay mounted and unmodified.
It builds on the existing seam rather than duplicating it: `dsh-memento` stays the bounded layered store, `dsh-memory-delta` stays the inbox/facts/decisions store, and rolebox's `.rolebox/memory.db` sqlite+FTS5 layer is untouched.
The two curation postures are kept SEPARATE on purpose: memento lets the model write under an approval policy, delta forbids the model from writing a fact at all. A fusion that merged them would be a capability loss.

## Developing it from source (clone, build, relative link) - this is the DEVELOPER path, not the consumer install

```bash
# 1. build the clone in place (lib/ is gitignored, so a fresh clone has no artifacts)
cd plugins-src/dsh-meta-memory
pnpm install
pnpm run build          # writes lib/index.js (host half) and lib/client.js (browser half)

# 2. add the clone to a profile with a RELATIVE link: (absolute link: is forbidden)
#    in <profile>/package.json dependencies:
#      "dsh-meta-memory": "link:../../plugins-src/dsh-meta-memory"
#    in <profile> dsh.profile.bundles:
#      "dsh-meta-memory"

# 3. install the profile, then restart the harness
cd profiles-tree/personal-dev && pnpm install
```

A `dsh.profile.bundles` change hot-reloads; everything else needs a restart.
`cordis.patch.yml` carries the single `insert` row (`id: meta-memory`, `name: dsh-meta-memory`) the bundle merges at boot.
Members are reached at run time by file URL, so they do NOT have to be present to boot: an absent member is reported as `absent` on `/meta-memory/api/members`, never as a zero.

## Adopting it inside DSH - the published release only

A consumer adopts the PUBLISHED RELEASE and does not clone, build or link this repository; the developer path above is kept and produces an UNRELEASED build with no support commitment.
What it provides: one surface over the cross-session memory family - one route prefix `/meta-memory`, four tools, and the retired sidebar tab described below - while `dsh-memento`, `dsh-memory-delta` and rolebox's own store stay mounted and unmodified.
It sits beside the existing stores rather than replacing them: the layered store, the inbox/facts/decisions store and rolebox's own layer each keep their own writes and their own curation posture.
What a deployment needs: the members it reaches, each with its own bundle row; the store paths it is given or inherits; and the approval posture of the member it writes through.
How a profile enables a package: add the package name to that profile's `dsh.profile.bundles` list, then install the profile, because `cordis.patch.yml` carries the single `insert` row (`id: meta-memory`, `name: dsh-meta-memory`) that the bundle merges at boot.
A source preview is READABLE but NOT installable: this tree can be read, built and linked for development, and no command in it installs the package.
Adoption is by the published release: `package.json` sets `publishConfig.tag` to `next`, so `0.9.0` ships on the `next` dist-tag and a consumer takes the published tarball; `latest` is not this package.
Read `DISCLOSURE.md` before adopting and `ROADMAP.md` before depending on a shape.

## What it publishes

| Surface | Detail |
|---|---|
| Route prefix | `/meta-memory` — `/api/status`, `/api/census`, `/api/members`, `/api/memento/{store,entries,query,add,replace,remove,consolidate,audit,snapshot,proposals}`, `/api/delta/{state,search,write,promote,inject-payload}`, `/api/inject/{status,decide,verdicts}` |
| Sidebar tab | RETIRED in 0.9.0: id `dsh-meta-memory:memory`, kind `meta-memory`, pane reads `/meta-memory/api/census`. `MEMORY_TAB_RETIRED` at `src/client/index.ts` is `true` because the owner saw TWO sidebar entries named "Memory" — this census panel and `dsh-memento` real GUI — and one surface is the fix. The retirement is announced on a warn line naming `dsh-memento`; the route surface is unaffected. Flip the flag to `false` to bring the tab back. |
| Tools | `meta_memory`, `meta_memory_recall`, `meta_memory_search`, `meta_memory_write` |

`meta_memory_write` lands a CANDIDATE in delta's `inbox/` only; promotion to `facts/` or `decisions/` stays a human act.

## Config (loader row)

| Key | Default | Meaning |
|---|---|---|
| `mementoDbPath` | member default | override memento's sqlite path |
| `deltaRoot` | member default | override delta's markdown root |
| `requireApproval` | `true` | memento's approval-policy write gate |
| `injectRecall` | `false` | register the recall context + pre-step gate; OFF by default so the injector member's own provider is not duplicated in one prompt |
| `gateBaseUrl` | `http://127.0.0.1:8011` | System-1 gate endpoint |
| `gateThreshold` | `0.5` | gate admit threshold |

With `injectRecall: false` the recall capability is PRESENT but quiet, and `/meta-memory/api/inject/status` says which state it is in rather than leaving a reader to infer it. Every gate failure path withholds recall and never breaks a turn.

## Roadmap at a glance

A glance, not a second record: the authoritative list — with the evidence for every done row, the reason for every deferred one and the rows marked `NOT MEASURED` — is [`ROADMAP.md`](ROADMAP.md). Where this list and that file differ, that file is right and this list is the defect.

- **What this package is**
- **What is measured today**
- **What 1.0.0 still requires**
- **Limits, stated rather than implied**
- **Compatibility seam**
- **How this roadmap is graded**

The roadmap currently carries **0** row(s) marked `NOT MEASURED`; a row moves to done only when its own command prints a green result.

## Checks

```bash
pnpm run typecheck   # tsc --noEmit
pnpm run build       # tsdown
pnpm run verify      # parity, gate-control, route-probe, client-bundle, mutation (all five must exit 0)
pnpm run check       # all three, in order
```

`verify/` is the plugin's own harness. It mounts the built host half against a stub host context and drives the real routes and tools; a check that cannot go RED is not a check.

## Licence

MIT — see `LICENSE`.

# ROADMAP — dsh-meta-memory

**Version `0.9.0` is a PRE-RELEASE.** It is published on the `next` dist-tag and it is under active development: the surface below is what `1.0.0` still requires, not a wish list appended after the fact.

## What this package is

The memory half of the meta layer: what is remembered between turns and how it is surfaced, seated beside `dsh-memento` rather than instead of it.

## What is measured today

`pnpm run verify` green: parity 24 of 32, gate-control 17 of 17, route-probe 9 of 9, client-bundle 11 of 11, mutation 6 of 6 detected and restored; the old Memory tab is RETIRED (`MEMORY_TAB_RETIRED = true`) and the harness asserts the retirement explicitly instead of failing on it; `npm pack --dry-run` 15 files / 56.3 kB.

## What 1.0.0 still requires

1. Retirement completion: delete the retired tab code path once no profile boots on the old contract, and let the harness assert its absence.
2. A budget that is measured, not declared: the memory layer must refuse a write that would exceed its stated cap.
3. One read path only — today `dsh-memento`, `dsh-memory-delta` and rolebox each hold a store; this package must name which one is the record.
4. Freshness at read time for every recalled entry, with `unmeasured` never folded into `stale`.

## Limits, stated rather than implied

Two neighbouring memory stores exist in the same profile; this package does not yet refuse a divergent write, it only surfaces the census.

## Compatibility seam

Seated beside `dsh-memento` and `dsh-memory-delta`; the retirement flag couples to their panel contract.

## How this roadmap is graded

An item is DONE only when a command proves it and the command is named here. An item that is only described is not done, and a roadmap whose items all read as prose is a plan, not a state.

# ROADMAP — dsh-meta-memory

**Version `0.9.0` is a PRE-RELEASE.** It is published on the `next` dist-tag and it is under active development: the surface below is what `1.0.0` still requires, not a wish list appended after the fact.

## What this package is

The memory half of the meta layer: what is remembered between turns and how it is surfaced, seated beside `dsh-memento` rather than instead of it.

## What is measured today

`pnpm run verify` green: parity 24 of 32, gate-control 17 of 17, route-probe 9 of 9, client-bundle 11 of 11, mutation 6 of 6 detected and restored; the old Memory tab is RETIRED (`MEMORY_TAB_RETIRED = true`) and the harness asserts the retirement explicitly instead of failing on it; `npm pack --dry-run` 17 files / 60.3 kB.

## What 1.0.0 still requires

Every row is checkable: it names the command that decides it, what that command shows when the row is DONE, and what it shows today.
A row whose proof command does not exist yet says so in the "proof today" column, and writing that command is the row's first step - an item is not started until its check can go RED.

| # | Item | Proof command | DONE when | Proof today |
|---|---|---|---|---|
| 1 | Retirement completion: delete the retired tab code path once no profile boots on the old contract | `node verify/client-bundle.mjs` | the harness refuses a declared `MEMORY_TAB_RETIRED` and passes with the code path gone | NOT DONE - the harness asserts the retirement is declared instead, and passes |
| 2 | A budget that is measured, not declared: the memory layer must refuse a write that would exceed its stated cap | `node verify/budget.mjs` | one write inside the cap answers 200, one past it answers a refusal naming the cap, and the store is unchanged after the refusal | NOT MEASURED - `verify/budget.mjs` does not exist; writing it is the row's first step |
| 3 | One read path only - today a store, a curated store and a third neighbouring store each hold one; the package must name which store is the record | `node verify/parity.mjs` | the census carries a `recordStore` field naming exactly one store, and a second store claiming it fails the harness | NOT DONE - no `recordStore` field exists, so the check has nothing to read |
| 4 | Freshness at read time for every recalled entry, with `unmeasured` never folded into `stale` | `node verify/parity.mjs` | every recalled entry row carries a freshness computed at read time, and a row with no reading reports `unmeasured` rather than `stale` | NOT DONE - the payload carries no per-entry freshness field |

The item numbers above are the ones `DISCLOSURE.md` cites: its section 4 calls item 3 "which store is the RECORD", and that mapping holds only while the numbering holds.

## Limits, stated rather than implied

Two neighbouring memory stores exist in the same profile; this package does not yet refuse a divergent write, it only surfaces the census.

## Compatibility seam

Seated beside `dsh-memento` and `dsh-memory-delta`; the retirement flag couples to their panel contract.

## How this roadmap is graded

An item is DONE only when a command proves it and the command is named here. An item that is only described is not done, and a roadmap whose items all read as prose is a plan, not a state.
**This roadmap is what `research.md` tests.** Each row above is the standing claim, and `research.md` holds the measurement that bears on it: the research question, the fractions from the harness run, the rows nothing has measured yet, and the next measurement with its falsifier stated before the run. A row here with no line in `research.md` is an untested claim, and a figure in `research.md` that names no row is an orphan measurement.
The two files divide the work rather than repeat it: this one says what must become true, `research.md` says what was measured and what was not, and neither is allowed to stand in for the other.

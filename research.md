# research.md — dsh-meta-memory

The research record for this package: the question, the measurements that bear on it, what is NOT measured, and the next measurement.
`ROADMAP.md` names what `1.0.0` still requires; this file is what tests that roadmap, and every number below names the roadmap row it bears on.

## 1. The research question

**Can one surface report two neighbouring stores without merging them?**

The question is not whether one plugin can read two stores — that is a wiring job — but whether it can present them as ONE surface while keeping them two stores, so that a reader can see which store answered and see the divergence instead of a smoothed-over average.
The failure this question exists to exclude is the fusion that reads better than it measures: one route, one snapshot, one number, with the seam hidden, where a divergence between the stores becomes invisible precisely because the surface is tidy.

Three conjuncts, each of which can fail:

1. **Carried**: the surface carries the capabilities it claims, and says so as a fraction with a denominator.
2. **Not merged**: the stores, their formats and their curation postures stay distinct, and the stricter posture is not relaxed by the union.
3. **Reported, not guessed**: a reader can see which store answered, from a census the surface publishes, rather than inferring it from install order.

## 2. Measured evidence

Measured by running `pnpm run verify` in this package on 2026-11-03; it chains `verify/parity.mjs`, `verify/gate-control.mjs`, `verify/route-probe.mjs`, `verify/client-bundle.mjs` and `verify/mutation.mjs`, and exits 0.

| Harness | Result | Conjunct | Roadmap row |
|---|---|---|---|
| parity | **24 of 32** capabilities carried and driven; **8 of 32** unmeasured, each with a stated reason | 1 | 1.0.0 row 3 |
| gate-control | **17 of 17** checks | 2 | 1.0.0 row 3 |
| route-probe | **9 of 9** checks | 1 | 1.0.0 row 2 |
| client-bundle | **11 of 11** checks | 1 | 1.0.0 row 1 |
| mutation | **6 of 6** detected, every restore byte-identical | 1, 3 | 1.0.0 rows 1-4 |

VERIFIED (ran) — conjunct 1. The parity harness does not report a single roll-up: it publishes one row per capability with a present-or-unmeasured state and a reason on every unmeasured row, and the published numerator is DERIVED from those rows rather than from a constant.
That derivation is itself tested: the mutation `inflate-the-numerator` raises the published numerator above the row recount and the harness exits 1 with `published numerator 25 != recount 24`.
The other five mutations are the same shape — `drop-a-route`, `rename-the-approval-refusal`, `rename-the-promotion-refusal`, `drop-the-tool-output-schema` and `answer-200-for-an-unknown-path` — each taken RED with exit 1 and each restored to its original bytes.
So the numbers above are falsifiable rather than decorative, and the harness is load-bearing.

VERIFIED (ran) — conjunct 2, as far as a harness reaches it. The gate-control harness drives the promotion boundary: a candidate is not readable as a fact before promotion, the promotion is refusable, and the candidate becomes a fact only when a human is named.
That is the stricter posture surviving the fusion, and `rename-the-promotion-refusal` proves the harness notices if the refusal stops identifying itself as human-only.
The two curation postures stay separate in the code as well: the memento write path refuses an unapproved write, and the delta write path lands a candidate only.

VERIFIED (ran) — conjunct 3, for the route that carries it. `/meta-memory/api/census` publishes `numerator`, `denominator`, `unmeasured`, `carriedRows`, `blinded` and a `rows` array in which every row carries its state and, when fused, its reason or its `divergence`.
The census route is exercised for prefix ownership by route-probe: a known path answers 200, an unknown path under the prefix answers this plugin's own 404 rather than a foreign 405, and a path outside the prefix is not answered here at all.

VERIFIED (read), NOT (ran) — conjunct 3's second half. The census code path can carry a per-row `divergence` string; nothing in this package has been run against a store that actually diverged, so this is a reading of the code rather than a measurement of the report.

## 3. What is NOT measured

- **The 8 of 32 unmeasured capabilities.** Four are the member's embedding and vector-retrieval rows — the RAG state route, the model probe, vector recall, and the control that flips vector retrieval — and this fusion composes no embedding backend, so it cannot derive those payloads and will not publish a stand-in. One is the slash command, which is not a route or a tool. One is the delta pressure route, whose settlement marker is written by a consumer polling it, so carrying it would advertise a trigger this package cannot honour. The remainder are the CLI entry point and one further row. **A fraction of 24 of 32 is not parity; it is parity on the part this fusion claims.**
- **Any divergence actually observed.** No harness writes the same fact into both stores and then removes one copy, so the divergence census has never been read from a store that diverged. This package surfaces divergence; it does not refuse a divergent write, and neither behaviour has an outcome measurement.
- **Which store answered, against a ground truth.** No harness pairs a recall with the store that served it and checks the answer. The census makes the stores countable; it does not verify the attribution.
- **The third neighbouring store.** It is never opened by this package, so its entry count is unmeasured here. A `0` from this package for that store would be instrument failure, not a reading.
- **Anything rendered.** The client-bundle harness reads bundle text: it asserts that the retirement line says the route surface is unaffected, and that the tab is retired. **No pane was rendered and no GUI state is claimed**; a rendering claim would need a rendered surface, which is not part of this record.
- **Failure of the whole chain.** `pnpm run verify` is five harnesses chained with `&&`, so it stops at the first red harness. A green run of the later harnesses therefore says nothing about whether the earlier ones would still pass on a later day; only a rerun of the chain does.

## 4. Next measurement

**A two-store divergence round, in one run, and it is the measurement conjunct 3 is missing.**

1. Write one fact into the memento store and into the delta store, through this package's own write routes, so the write path is the subject rather than a hand edit.
2. Read `/meta-memory/api/census` and the delta state route, and record both readings.
3. Remove the memento copy only.
4. Read both again, in the same run, and require the census to name the divergence on the affected row rather than to report a stable total.

Falsifier, stated before the run: **if removing one copy changes neither reading, the census does not report divergence and conjunct 3 fails as a report** — the surface is then counting entries, not showing which store answered.
The check must also print the pair of counts with both denominators, because a divergence that changes a total from 1 to 1 is not visible in a total and would be missed by a reader who was shown only the sum.
Until that round runs, conjunct 3 stands at VERIFIED (read) for the code path and NOT MEASURED for the outcome, and this file says so rather than letting the 24 of 32 stand in for it.

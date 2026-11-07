# Firestore Standard read model v1

Reviewed against official Firebase documentation on 2026-11-02. This tool estimates document read demand under declared assumptions. It does not observe billing or offer a billing upper/lower bound. Enterprise edition is unsupported.

## Evidence and assumptions

Observed: application subscriptions, callbacks, sizes, change counts, cache/pending-write metadata, screen and lifecycle markers. Estimated: reads under fresh-query and workload assumptions. Unknown: backend target sharing, reconnect replay, index and rules reads, local acknowledgments and uninstrumented operations.

For each subscription, the **first server-origin snapshot without pending writes** models a fresh execution with `max(1, size)` reads. This applies even when an earlier callback was cache-origin, pending, or the eligible snapshot only changes metadata. It is one modeled execution, not proof of one independent backend query. Initial document changes are not added again. Recreated/overlapping subscriptions get separate fresh-execution assumptions; the SDK can reuse targets, so their aggregate is scenario-dependent.

Later eligible query callbacks contribute added + modified counts. Cache callbacks, pending-write callbacks and metadata-only updates contribute no incremental baseline reads. A removal can mean deletion (no read charge for deletion removal) or filter mismatch (potential read); all such removals remain unresolved and excluded. No snapshot-size multiplication is used. Pending write acknowledgments may be indistinguishable from remote updates. Counts are neither measured billing nor guaranteed bounds.

Document snapshots record existence and previous existence, but dataChanged remains null: payloads are not read or retained for comparison. Initial eligible document snapshots use the same minimum-one assumption, including missing documents; subsequent document updates remain unknown. This deliberately understates observable document update attribution rather than inventing payload comparisons.

## Reconnection scenarios

Reconnect controls declare hypothetical **genuine backend disconnections**. Browser online/offline and explicit SDK enable/disable actions are context only; they never automatically add reads. Memory mode models fresh-query replay for each declared reconnect. Persistent mode models fresh-query replay only for disconnections **greater than 30 minutes**. At exactly 30 or below, replay contribution is zero, while changed documents and overhead remain unresolved. Unknown persistence leaves replay unresolved. Replay uses each listener's final observed size (minimum one) averaged across recorded sessions. It assumes those listeners would be active at reconnect; users must select representative sessions. Reconnect projections are separate from the captured baseline and can overlap with already observed activity; avoid adding a scenario for a replay already represented in the trace.

## Workloads, quotas and attribution

Each trace session has equal weight. Baseline = summed modeled reads / session count. Light = 0.5× baseline; heavy = 2×. These are illustrative traffic assumptions, not measured distributions. Daily reads = (baseline × workload multiplier + declared replay/session + additional reads/session) × DAU × sessions/user. Additional reads are explicit assumptions, not a resolution of unknown overhead. No extrapolation from a few seconds to 24 hours is automatic.

The default budget is 50,000 reads/day. Configurable quota metadata also includes 20,000 writes/day, 20,000 deletes/day, 1 GiB storage and 10 GiB outbound/month; writes, deletes, storage and transfer are not estimated. A budget assertion fails only when the modeled daily count is strictly greater than the selected budget. It is not a Firebase quota breach. Free quota applies to one database per project; not every operation qualifies for free usage.

Quota dates use `America/Los_Angeles` and DST. `nextQuotaReset` computes the next Pacific calendar boundary, an approximation to Firebase's documented reset **around** midnight, not a guarantee of an exact reset instant.

Screen attribution stays with the screen supplied at subscription (or current screen), so totals do not double-count shared activity. Background subscriptions are exempt from survival warnings. Exit warnings describe active-at-exit evidence, not confirmed leaks. Stop ends the observation window without unsubscribing application listeners. Resume creates new recording identities for active listeners; partial-session estimates need care.

## Official references

- [Pricing](https://firebase.google.com/docs/firestore/pricing): minimum queries, changes, reconnect behavior, index-entry reads and dependent rules reads.
- [Quotas](https://firebase.google.com/docs/firestore/quotas): allowances and Pacific resets.
- [Listen](https://firebase.google.com/docs/firestore/query-data/listen): callback and metadata semantics.
- [Offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline): cache metadata and persistence.
- [Usage](https://firebase.google.com/docs/firestore/monitor-usage): usage dashboards differ from billing reports.
- [Query Explain](https://firebase.google.com/docs/firestore/query-explain): server-library diagnostic; deliberately outside this client-only tool.
- [Realtime queries at scale](https://firebase.google.com/docs/firestore/real-time_queries_at_scale): server transitions can be transparent to applications.

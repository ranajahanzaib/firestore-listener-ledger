# Limitations

No exact per-listener billing measurement. Instrumented listeners only: one-off reads, writes, deletes, aggregation reads, index-entry operations, rules dependencies and server work are outside coverage. No account-wide reconciliation, Enterprise model, pricing currency or production transport inspection.

SDK shared targets and caching make application subscription counts different from independent server queries. Browser network hints and SDK toggles cannot establish genuine reconnect billing. Local-write acknowledgments can resemble remote changes. Document data-change attribution remains unknown, and ambiguous query removals are excluded from baseline. No deduplication based on undocumented Firebase internals.

Screen survival warnings use active-at-exit evidence; normal cleanup immediately after a navigation marker may be flagged. Large-query (100 initial documents), churn (3 subscriptions/key), and high-update (50 modifications/key) rules are deterministic investigation thresholds, not universal performance verdicts. Background subscriptions are exempt. Churn uses the entire trace rather than an inferred user interaction boundary.

Stopped/partial sessions, dropped events, missing server metadata callbacks and unrepresentative interaction samples reduce usefulness. No estimate is a billing lower or upper bound. Reconnect scenarios assume all sampled listeners are active during each declared replay. Light/heavy multipliers are user-selected synthetic workload profiles.

Emulator tests validate SDK instrumentation and interpretation only. They cannot validate production billed operations. Firebase usage dashboards also differ from final billing reports. Always inspect selected workload assumptions and compare with the owning Firebase account when making spending decisions.

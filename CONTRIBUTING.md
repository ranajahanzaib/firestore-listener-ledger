# Contributing

Use Node 22, pnpm 10.20 and Java 21. Install dependencies and run pnpm build before tests that consume workspace package exports. Run pnpm format, pnpm typecheck, pnpm test, pnpm test:integration, pnpm test:e2e and pnpm build before submitting. Browser tests need pnpm exec playwright install chromium. pnpm lint checks formatting; TypeScript strict checking supplies static correctness checks.

Keep the engine pure and deterministic. Every model change needs a fixture/test and a billing-model documentation update with official Firebase sources. Separate observed evidence, explicit assumptions and unknown operations. Do not call estimated counts measured bills. Avoid payload capture, undocumented SDK internals, telemetry or real credentials. Emulator-only rules must never replace default deny-all rules.

Report bugs with a sanitized trace and reproducible commands, not document data or personal query keys. Keep changes focused; include validation results and uncertainty in pull requests. See CODE_OF_CONDUCT.md.

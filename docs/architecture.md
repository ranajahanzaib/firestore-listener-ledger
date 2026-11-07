# Architecture

`@listenerledger/firestore-web` wraps public modular `onSnapshot` overloads. Metadata enters a bounded local buffer, exported as schema-v1 JSON. `@listenerledger/core` validates with Zod, walks ordered events, models eligible observations, groups listeners/queries/screens, emits deterministic findings and projects workloads. No Firebase connection is needed for analysis. `@listenerledger/cli` and React/Vite dashboard reuse this engine; HTML reports are standalone escaped text with embedded styles, no CDN.

Monorepo packages build in dependency order. Public package exports point at dist with declarations. Build before consuming workspace packages. SDK takes Firebase as a peer dependency; core needs only Zod. The emulator demo is an application consumer, not an alternate analyzer.

## Trace v1

Discriminated events share epoch-millisecond `at` and sessionId. Listener events carry recording-scoped identity; queryKey is a developer-defined grouping key, never extracted from SDK internals. Trace envelope declares tool/schema version, capture, persistence, environment, sessions, bounds, dropped-event count and synthetic status. Schema validation strips unknown properties. Event order, bounds, session references and subscription references are validated (subscription gaps allowed when retention dropped events). Reports retain their sanitized trace and assumptions; imported report metrics are always recomputed, never trusted.

Future incompatible versions must receive explicit migrations before validation. Unsupported versions are rejected. There is no silent interpretation of new billing models. Findings have stable deterministic IDs and qualitative limitations; no fabricated confidence scores. Retention drops oldest events, warns once, and marks incomplete coverage; missing baselines cannot be reconstructed. Imported files have a dashboard 20 MB limit and schema event-count cap of 100,000.

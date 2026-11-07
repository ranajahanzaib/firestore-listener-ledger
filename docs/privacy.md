# Privacy

Everything stays in browser memory or explicitly exported local files. There is no telemetry, trace upload, Firebase trace backend, tracking pixel, external font or analytics SDK. Dashboard import does not make network requests with trace content.

Stored fields: timestamps, random recording/session IDs, developer query keys/labels/screens/background setting, query/document kind, snapshot sizes and change counts, cache/pending-write flags, existence metadata, error codes, browser lifecycle hints, explicit string markers, capture configuration and event-loss count. Document bodies, paths and IDs are never captured; document-ID capture is not offered in v1. The demo UI reads synthetic emulator document contents to render its application, separate from trace capture.

Metadata may contain secrets if developers place them in labels or markers. Review exported files before sharing. Service-account credentials, Admin SDK and elevated API keys are not needed. The dashboard parses schemas and renders escaped React text. Static HTML reports escape all interpolated text and contain no scripts or external dependencies. Importing an analysis report recomputes metrics from validated trace and assumptions.

# Instrumentation

```tsx
import { useEffect } from "react";
import { collection, query, limit } from "firebase/firestore";
import { createListenerLedger } from "@listenerledger/firestore-web";
const ledger = createListenerLedger({
  enabled: import.meta.env.DEV,
  persistence: "memory",
  capture: "metadata-only",
  environment: "unknown",
});
// In a component that owns db:
useEffect(() => {
  ledger.setScreen("Inbox");
  return ledger.listen(
    query(collection(db, "messages"), limit(50)),
    {
      queryKey: "messages.recent",
      label: "Recent messages",
      screen: "Inbox",
    },
    (snapshot) => {
      /* update UI with snapshot.docs */
    },
    console.error,
  );
}, [db]);
// Download JSON.stringify(ledger.exportTrace()) with a local Blob URL.
```

DocumentReference listeners infer DocumentSnapshot; Query listeners infer QuerySnapshot, including converter types. Callback or `{ next, error }` observers are supported. Pass native listen settings through context.options. Metadata-only callbacks are **not** enabled implicitly; `{ options: { includeMetadataChanges: true } }` explicitly changes the application's normal callback stream. No extra subscription is created for diagnostics. Unsubscribe is idempotent. SDK errors record only the error code and forward the original error. Consumer exceptions are not swallowed.

`enabled` defaults to false. When enabled, recording starts immediately. `start()` resumes profiling and creates a new session, recording already active wrapped listeners with new recording identities. `stop()` ends recording and browser hooks without ending application subscriptions. A recording boundary is not an observed unsubscribe. `clear()` discards trace history; if recording, it starts a fresh session. `exportTrace()` returns a copy of the trace envelope/events array. `getSummary()` uses the shared analyzer. Application listeners still need their normal cleanup.

`setScreen(name)` emits exit/entry events. `mark(name, Record<string,string>)` adds explicit application context. `connectivity('app-disabled' | 'app-enabled')` records app actions after calling Firestore disableNetwork/enableNetwork yourself; it does not assert a backend reconnect. Browser online, offline, visibility and pagehide are hints only. Session end requires stop; abrupt tab termination can be missing. There is no router dependency. Global subscriptions should use background:true.

Default maxEvents is 10,000; configurable 2–100,000. Overhead scales with document-change lists, callbacks and retained events. No payload hashing, document IDs or document data are recorded. Document data changes remain unknown. Labels/keys/screens/custom markers can themselves contain sensitive information: use stable non-personal names. Export before leaving the page; no persistence or upload is automatic.

import { deleteApp, initializeApp } from "firebase/app";
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getFirestore,
  limit,
  query,
  setDoc,
  terminate,
} from "firebase/firestore";
import { expect, it } from "vitest";
import { createListenerLedger } from "../../packages/firestore-web/src/index";
const until = async (fn: () => boolean) => {
  const end = Date.now() + 10000;
  while (!fn()) {
    if (Date.now() > end) throw Error("Callback timeout");
    await new Promise((r) => setTimeout(r, 30));
  }
};
it("preserves real query/document callbacks, changes, errors and unsubscribe", async () => {
  const app = initializeApp(
    { projectId: "demo-listenerledger", apiKey: "demo-only" },
    "test-" + Date.now(),
  );
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const ledger = createListenerLedger({
    enabled: true,
    environment: "emulator",
  });
  let queries = 0,
    documents = 0,
    error = "";
  try {
    const ref = doc(db, "demo", "integration", "items", "one");
    await setDoc(ref, { v: 1 });
    const q = ledger.listen(
      query(collection(db, "demo", "integration", "items"), limit(10)),
      { queryKey: "integration", options: { includeMetadataChanges: true } },
      () => queries++,
    );
    const d = ledger.listen(
      ref,
      { queryKey: "document" },
      { next: () => documents++ },
    );
    await until(() => queries > 0 && documents > 0);
    await setDoc(ref, { v: 2 });
    await until(() => documents >= 2);
    await deleteDoc(ref);
    await until(() =>
      ledger
        .exportTrace()
        .events.some((e) => e.type === "snapshot_observed" && e.removed > 0),
    );
    const denied = ledger.listen(
      doc(db, "private", "denied"),
      { queryKey: "denied" },
      () => {},
      (e) => {
        error = e.code;
      },
    );
    await until(() => error === "permission-denied");
    denied();
    q();
    d();
    const before = queries;
    await setDoc(ref, { v: 3 });
    await new Promise((r) => setTimeout(r, 100));
    expect(queries).toBe(before);
    const trace = ledger.exportTrace();
    expect(trace.events.some((e) => e.type === "listener_unsubscribed")).toBe(
      true,
    );
    expect(
      trace.events.some(
        (e) => e.type === "snapshot_observed" && e.exists !== undefined,
      ),
    ).toBe(true);
    expect(trace.events.some((e) => e.type === "listener_error")).toBe(true);
    expect(JSON.stringify(trace)).not.toContain('"v"');
  } finally {
    ledger.stop();
    await terminate(db);
    await deleteApp(app);
  }
}, 30000);

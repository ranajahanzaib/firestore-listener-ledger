import { createListenerLedger } from "@listenerledger/firestore-web";
import {
  collection,
  deleteDoc,
  disableNetwork,
  doc,
  enableNetwork,
  limit,
  query,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../dashboard/src/style.css";
import { db } from "./firebase";
const ledger = createListenerLedger({
  enabled: true,
  persistence: "memory",
  environment: "emulator",
});
function App() {
  const [screen, setScreen] = useState("Inbox"),
    [inefficient, setInefficient] = useState(false),
    [items, setItems] = useState<string[]>([]),
    [status, setStatus] = useState("Profiling started"),
    [cycle, setCycle] = useState(0);
  const all = useRef<Unsubscribe[]>([]);
  useEffect(() => {
    ledger.setScreen(screen);
    const ref = query(
      collection(db, "demo", screen.toLowerCase(), "items"),
      limit(screen === "Activity" ? 100 : 20),
    );
    const unsubscribe = ledger.listen(
      ref,
      {
        queryKey: screen.toLowerCase() + ".recent",
        label: screen + " items",
        screen,
      },
      (snapshot) => setItems(snapshot.docs.map((d) => String(d.data().title))),
      (e) => setStatus(e.code),
    );
    all.current.push(unsubscribe);
    return () => {
      if (!inefficient) unsubscribe();
    };
  }, [screen, cycle, inefficient]);
  const act = async (fn: () => Promise<void>) => {
    try {
      await fn();
      setStatus("Action completed");
    } catch (e) {
      setStatus(String(e));
    }
  };
  return (
    <div className="shell">
      <header>
        <a className="brand" href="http://127.0.0.1:5173/?demo">
          ▤ ListenerLedger
        </a>
        <span className="badge">EMULATOR DEMO</span>
      </header>
      <main>
        <div className="eyebrow">REAL SDK CALLBACKS · LOCAL DATABASE</div>
        <h1>Exercise your listener lifecycle.</h1>
        <p>
          This app always connects to the local emulator. No Firebase account or
          real credentials are used.
        </p>
        <section>
          <div className="controls">
            <button
              onClick={() => {
                ledger.start();
                setStatus("Profiling started");
              }}
            >
              Start profiling
            </button>
            <button
              onClick={() => {
                ledger.stop();
                setStatus("Profiling stopped");
              }}
            >
              Stop profiling
            </button>
            <button
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(ledger.exportTrace(), null, 2)], {
                    type: "application/json",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "session.json";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Export trace
            </button>
            <button
              onClick={() => {
                all.current.forEach((fn) => fn());
                all.current = [];
                setStatus("Listeners closed");
              }}
            >
              Close all listeners
            </button>
          </div>
          <p role="status">{status}</p>
          <label>
            <input
              style={{ width: "auto", display: "inline" }}
              type="checkbox"
              checked={inefficient}
              onChange={(e) => setInefficient(e.target.checked)}
            />{" "}
            Intentionally inefficient demonstration: retain listeners after
            navigation
          </label>
        </section>
        <section>
          <nav className="controls">
            {["Inbox", "Conversation", "Activity"].map((name) => (
              <button
                aria-pressed={screen === name}
                key={name}
                onClick={() => setScreen(name)}
              >
                {name}
              </button>
            ))}
          </nav>
          <h2>{screen}</h2>
          <div className="controls">
            <button onClick={() => setCycle((x) => x + 1)}>
              Recreate listener
            </button>
            <button
              onClick={() =>
                void act(async () => {
                  const batch = writeBatch(db);
                  for (const s of ["Inbox", "Conversation", "Activity"])
                    for (let i = 0; i < 10; i++)
                      batch.set(
                        doc(db, "demo", s.toLowerCase(), "items", String(i)),
                        { title: s + " item " + i, revision: 0 },
                      );
                  await batch.commit();
                })
              }
            >
              Reset demo data
            </button>
            <button
              onClick={() =>
                void act(() =>
                  setDoc(
                    doc(db, "demo", screen.toLowerCase(), "items", "new"),
                    { title: "New local demo item", revision: 1 },
                  ),
                )
              }
            >
              Add document
            </button>
            <button
              onClick={() =>
                void act(() =>
                  setDoc(doc(db, "demo", screen.toLowerCase(), "items", "0"), {
                    title: "Updated demo item",
                    revision: Date.now(),
                  }),
                )
              }
            >
              Modify document
            </button>
            <button
              onClick={() =>
                void act(() =>
                  deleteDoc(
                    doc(db, "demo", screen.toLowerCase(), "items", "0"),
                  ),
                )
              }
            >
              Delete document
            </button>
            <button
              onClick={() =>
                void act(async () => {
                  await disableNetwork(db);
                  ledger.connectivity("app-disabled");
                })
              }
            >
              Disable SDK network
            </button>
            <button
              onClick={() =>
                void act(async () => {
                  await enableNetwork(db);
                  ledger.connectivity("app-enabled");
                })
              }
            >
              Enable SDK network
            </button>
          </div>
          <ul>
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
        <p>
          Network controls record application actions, not verified backend
          disconnect timestamps. Emulator callbacks validate instrumentation,
          not production billing.
        </p>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

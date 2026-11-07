import {
  analyze,
  htmlReport,
  importReport,
  type Trace,
  type Workload,
} from "@listenerledger/core";
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import sample from "../../../fixtures/traces/churn.json";
import "./style.css";
function download(name: string, body: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function App() {
  const [trace, setTrace] = useState<Trace | null>(
      new URLSearchParams(location.search).has("demo")
        ? (sample as Trace)
        : null,
    ),
    [workload, setWorkload] = useState<Partial<Workload>>({
      dau: 500,
      sessionsPerUser: 2,
      budget: 50000,
      scenario: "baseline",
      persistence: "unknown",
      reconnectCount: 0,
      reconnectMinutes: null,
    }),
    [error, setError] = useState(""),
    [filter, setFilter] = useState(""),
    [screen, setScreen] = useState("");
  const report = useMemo(
    () => (trace ? analyze(trace, workload) : null),
    [trace, workload],
  );
  async function load(file?: File) {
    if (!file) return;
    try {
      if (file.size > 20_000_000) throw new Error("File exceeds 20 MB");
      const value: unknown = JSON.parse(await file.text());
      const r =
        typeof value === "object" && value !== null && "reportVersion" in value
          ? importReport(value)
          : analyze(value, workload);
      setTrace(r.trace);
      setWorkload(r.workload);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  const n = (value: number) =>
    new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);
  return (
    <div
      className="shell"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void load(e.dataTransfer.files[0]);
      }}
    >
      <header>
        <a className="brand" href="/">
          ▤ <span>ListenerLedger</span>
        </a>
        <span className="badge">FIRESTORE / STANDARD</span>
        <label className="button">
          Import trace
          <input
            aria-label="Import trace"
            type="file"
            accept=".json"
            onChange={(e) => void load(e.target.files?.[0])}
          />
        </label>
      </header>
      <main>
        <div className="eyebrow">LOCAL OBSERVABILITY · NO UPLOADS</div>
        <div className="intro">
          <div>
            <h1>Every listener tells a story.</h1>
            <p>Follow the evidence. Understand your realtime read demand.</p>
          </div>
          <button
            onClick={() => {
              setTrace(sample as Trace);
              setError("");
            }}
          >
            Load synthetic demo ↗
          </button>
        </div>
        {error && (
          <pre role="alert" className="error">
            {error}
          </pre>
        )}
        {!report ? (
          <section className="empty">
            <span className="glyph">▤</span>
            <h2>Your traces stay on your machine.</h2>
            <p>
              Drop a ListenerLedger JSON trace or report here, or use Import
              trace.
            </p>
            <button
              onClick={() => {
                setTrace(sample as Trace);
                setError("");
              }}
            >
              Explore synthetic sample
            </button>
            <p>No authentication. No database connection. No telemetry.</p>
          </section>
        ) : (
          <>
            <div className="reportbar">
              <span className="dot" />
              <strong>
                {trace?.synthetic
                  ? "Synthetic demonstration"
                  : "Imported profiling trace"}
              </strong>
              <span>
                {report.trace.sessions.length} session(s) ·{" "}
                {n(report.summary.duration / 1000)} seconds · instrumented
                listeners only
              </span>
              <button
                onClick={() =>
                  download(
                    "listenerledger-report.json",
                    JSON.stringify(report, null, 2),
                  )
                }
              >
                Export JSON
              </button>
              <button
                onClick={() =>
                  download(
                    "listenerledger-report.html",
                    htmlReport(report),
                    "text/html",
                  )
                }
              >
                Export HTML
              </button>
            </div>
            <div className="metrics">
              {[
                [
                  "Observed subscriptions",
                  report.summary.subscriptions,
                  "Application listener instances",
                ],
                [
                  "Peak active listeners",
                  report.summary.peakActive,
                  "Observed concurrency",
                ],
                [
                  "Observed document changes",
                  report.summary.changes,
                  "Includes initial additions",
                ],
                [
                  "Modeled reads / session",
                  report.summary.perSession,
                  "Fresh-query assumption",
                ],
              ].map(([label, value, note]) => (
                <article key={label}>
                  <span>{label}</span>
                  <strong>{n(Number(value))}</strong>
                  <small>{note}</small>
                </article>
              ))}
            </div>
            <div className="columns">
              <section>
                <div className="sectionhead">
                  <div className="eyebrow">01 / WORKLOAD EXPLORER</div>
                  <span className="badge">ESTIMATE</span>
                </div>
                <h2>Put your session in perspective.</h2>
                <div className="controls">
                  {[
                    ["Daily active users", "dau"],
                    ["Sessions / user", "sessionsPerUser"],
                    ["Daily read budget", "budget"],
                    ["Additional reads / session", "additionalReads"],
                    ["Reconnect cycles / session", "reconnectCount"],
                    ["Disconnect minutes", "reconnectMinutes"],
                  ].map(([label, key]) => (
                    <label key={key}>
                      {label}
                      <input
                        type="number"
                        min={
                          key === "budget" || key === "sessionsPerUser" ? 1 : 0
                        }
                        value={Number(workload[key as keyof Workload] ?? 0)}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          if (
                            Number.isFinite(value) &&
                            value >=
                              (key === "budget" || key === "sessionsPerUser"
                                ? 1
                                : 0)
                          )
                            setWorkload({ ...workload, [key!]: value });
                        }}
                      />
                    </label>
                  ))}
                  <label>
                    Workload scenario
                    <select
                      value={workload.scenario}
                      onChange={(e) =>
                        setWorkload({
                          ...workload,
                          scenario: e.target.value as Workload["scenario"],
                        })
                      }
                    >
                      <option value="light">Light · 0.5× baseline</option>
                      <option value="baseline">
                        Baseline · captured activity
                      </option>
                      <option value="heavy">Heavy · 2× baseline</option>
                    </select>
                  </label>
                  <label>
                    Reconnect persistence assumption
                    <select
                      value={workload.persistence}
                      onChange={(e) =>
                        setWorkload({
                          ...workload,
                          persistence: e.target
                            .value as Workload["persistence"],
                        })
                      }
                    >
                      {["unknown", "memory", "persistent"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="projection">
                  <span>PROJECTED DAILY DOCUMENT READS</span>
                  <strong>
                    {n(report.summary.dailyReads)}{" "}
                    <small>/ {n(report.workload.budget)}</small>
                  </strong>
                  <meter
                    min="0"
                    max={report.workload.budget}
                    value={Math.min(
                      report.summary.dailyReads,
                      report.workload.budget,
                    )}
                    aria-label="Modeled read budget utilization"
                  />
                  <p>
                    {n(report.summary.utilization * 100)}% of selected daily
                    budget. This is a modeled projection, not an actual quota
                    breach.
                  </p>
                </div>
                <p className="fine">
                  Each captured session is weighted equally. Scenario
                  multipliers scale observed baseline demand; declared
                  reconnects and extra reads are additive per session. Pacific
                  quota day; resets occur around midnight, including DST.
                </p>
              </section>
              <section>
                <div className="sectionhead">
                  <div className="eyebrow">02 / READ HOTSPOTS</div>
                  <span className="badge">MODELED</span>
                </div>
                <h2>Where the activity concentrates.</h2>
                {report.queries.map((q) => (
                  <div className="hotspot" key={q.key}>
                    <div>
                      <code>{q.key}</code>
                      <strong>{n(q.reads)}</strong>
                    </div>
                    <div className="bar">
                      <i
                        style={{
                          width: `${(q.reads / Math.max(1, report.summary.modeledReads)) * 100}%`,
                        }}
                      />
                    </div>
                    <small>
                      {q.subscriptions} subscription(s) · {q.initialReads}{" "}
                      initial + {q.updateReads} update reads
                    </small>
                  </div>
                ))}
                <h3>Attribution by screen</h3>
                {report.screens.map((s) => (
                  <div className="row" key={s.screen}>
                    <span>{s.screen}</span>
                    <span>
                      {s.reads} modeled reads · {s.changes} changes
                    </span>
                  </div>
                ))}
                <aside>
                  <strong>Unknown additional overhead</strong>
                  <p>{report.unknownOverhead.join(" · ")}</p>
                  <p>
                    Repeated application subscriptions may share backend
                    targets. Local-write acknowledgments can remain ambiguous.
                  </p>
                </aside>
              </section>
            </div>
            <section>
              <div className="sectionhead">
                <div>
                  <div className="eyebrow">03 / LISTENER LIFECYCLE</div>
                  <h2>From subscription to cleanup.</h2>
                </div>
                <div className="filters">
                  <label>
                    Query key
                    <input
                      placeholder="Filter query key"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    />
                  </label>
                  <label>
                    Screen
                    <select
                      value={screen}
                      onChange={(e) => setScreen(e.target.value)}
                    >
                      <option value="">All screens</option>
                      {report.screens.map((s) => (
                        <option key={s.screen}>{s.screen}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="timeline">
                {report.listeners
                  .filter(
                    (l) =>
                      l.queryKey.includes(filter) &&
                      (!screen || l.screen === screen),
                  )
                  .map((l) => (
                    <div className="track" key={l.id}>
                      <div>
                        <strong>{l.label}</strong>
                        <small>
                          {l.screen} · {l.callbacks} callbacks · {l.reads}{" "}
                          modeled reads
                        </small>
                      </div>
                      <div
                        className="rail"
                        tabIndex={0}
                        aria-label={`${l.label}: ${l.duration} milliseconds; ${l.notes.join(" ")}`}
                        title={`${l.id}: ${l.duration} ms. ${l.notes.join(" ")}`}
                      >
                        <div
                          className="life"
                          style={{
                            left: `${((l.start - report.trace.start) / Math.max(1, report.summary.duration)) * 100}%`,
                            width: `${Math.max(1, (l.duration / Math.max(1, report.summary.duration)) * 100)}%`,
                          }}
                        />
                        {l.snapshots.map((s, i) => (
                          <span
                            key={i}
                            className={"tick " + (s.fromCache ? "cache" : "")}
                            style={{
                              left: `${((s.at - report.trace.start) / Math.max(1, report.summary.duration)) * 100}%`,
                            }}
                            title={`${s.fromCache ? "Cache" : "Server-origin"} · size ${s.size} · +${s.added} ~${s.modified} −${s.removed}`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
              <div className="markers">
                {report.trace.events
                  .filter(
                    (e) =>
                      e.type === "screen_entered" ||
                      e.type === "screen_exited" ||
                      e.type === "network_hint",
                  )
                  .map((e, i) => (
                    <span key={i}>
                      {n((e.at - report.trace.start) / 1000)}s ·{" "}
                      {"screen" in e
                        ? e.screen + " " + e.type.replace("screen_", "")
                        : "state" in e
                          ? e.state
                          : ""}
                    </span>
                  ))}
              </div>
              <p className="fine">
                Bars: observed recording duration · ticks: snapshots (gray =
                cache). Screen attribution follows subscription ownership;
                shared activity is counted once. Stop ends recording, not
                application listeners.
              </p>
            </section>
            <section>
              <div className="eyebrow">04 / FINDINGS & EVIDENCE</div>
              <h2>Investigate the behavior behind the number.</h2>
              {report.findings.map((f) => (
                <details key={f.id}>
                  <summary>
                    <span className={"severity " + f.severity}>
                      {f.severity}
                    </span>
                    {f.title}
                  </summary>
                  <p>{f.evidence}</p>
                  <p>{f.why}</p>
                  <p>
                    <strong>Next step:</strong> {f.recommendation}
                  </p>
                  <p className="fine">
                    Affected: {f.affected.join(", ") || "Entire trace"}.{" "}
                    {f.limitation}
                  </p>
                </details>
              ))}
            </section>
            <p className="fine">
              {report.explanation} Capture: metadata only. No document bodies or
              identifiers.
            </p>
          </>
        )}
      </main>
      <footer>
        ListenerLedger{" "}
        <span>Understand what your Firestore listeners are costing you.</span>
        <a href="https://firebase.google.com/docs/firestore/pricing">
          Billing reference ↗
        </a>
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

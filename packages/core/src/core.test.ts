import { describe, expect, it } from "vitest";
import { fixture } from "../../../scripts/fixtures";
import {
  analyze,
  htmlReport,
  importReport,
  nextQuotaReset,
  quotaDay,
  traceSchema,
  workloadSchema,
  type LedgerEvent,
  type Trace,
} from "./index";
function snapshots(
  ...partial: Partial<Extract<LedgerEvent, { type: "snapshot_observed" }>>[]
): Trace {
  const t = fixture();
  const sub = t.events.find((e) => e.type === "listener_subscribed")!;
  const events: LedgerEvent[] = [t.events[0]!, sub];
  let at = sub.at;
  partial.forEach((p, i) =>
    events.push({
      type: "snapshot_observed",
      at: (at += 100),
      sessionId: "synthetic-session",
      listenerId: "listener-0",
      size: 10,
      added: 0,
      modified: 0,
      removed: 0,
      first: i === 0,
      metadataOnly: false,
      fromCache: false,
      hasPendingWrites: false,
      ...p,
    }),
  );
  return { ...t, events, end: at };
}
describe("Documented billing rules under fresh-query assumptions", () => {
  it("models initial result and minimum empty query", () => {
    expect(
      analyze(snapshots({ size: 10, added: 10 })).summary.modeledReads,
    ).toBe(10);
    expect(analyze(snapshots({ size: 0 })).summary.modeledReads).toBe(1);
  });
  it("counts first eligible server snapshot once after cache", () =>
    expect(
      analyze(
        snapshots({ fromCache: true }, { added: 10 }, { metadataOnly: true }),
      ).summary.modeledReads,
    ).toBe(10));
  it("does not count metadata only or pending local writes as new reads", () =>
    expect(
      analyze(
        snapshots(
          {},
          { modified: 8, hasPendingWrites: true },
          { metadataOnly: true },
        ),
      ).summary.modeledReads,
    ).toBe(10));
  it("models added and modified, separates ambiguous removals", () => {
    const r = analyze(snapshots({}, { added: 2, modified: 3, removed: 4 }));
    expect(r.summary.modeledReads).toBe(15);
    expect(r.listeners[0]?.uncertainRemovals).toBe(4);
  });
  it("ignores cache-only observations", () =>
    expect(analyze(snapshots({ fromCache: true })).summary.modeledReads).toBe(
      0,
    ));
  it.each([
    ["memory", 1, 10],
    ["persistent", 30, 0],
    ["persistent", 30.01, 10],
    ["unknown", 40, 0],
  ])("declared reconnect %s %s minutes", (persistence, minutes, reads) =>
    expect(
      analyze(snapshots({}), {
        persistence,
        reconnectMinutes: minutes,
        reconnectCount: 1,
      }).summary.reconnectReads,
    ).toBe(reads),
  );
});
describe("Tool assumptions and analysis", () => {
  it("tracks unsubscribe and recreation", () => {
    const r = analyze(fixture("churn"));
    expect(r.summary.subscriptions).toBe(6);
    expect(r.summary.peakActive).toBe(1);
    expect(r.listeners[0]!.duration).toBeGreaterThan(0);
    expect(r.findings.some((f) => f.id.startsWith("churn"))).toBe(true);
    expect(r.findings.some((f) => f.id.startsWith("screen"))).toBe(true);
  });
  it("flags overlap but exempts background screen survival", () => {
    const t = fixture();
    const sub = t.events.find((e) => e.type === "listener_subscribed")!;
    if (sub.type !== "listener_subscribed") throw Error();
    t.events.splice(3, 0, {
      ...sub,
      listenerId: "other",
      at: sub.at,
      background: true,
    });
    const r = analyze(t);
    expect(r.summary.peakActive).toBe(2);
    expect(r.findings.some((f) => f.id.startsWith("overlap"))).toBe(true);
  });
  it("validates trace and workload", () => {
    expect(() => traceSchema.parse({ schemaVersion: 2 })).toThrow();
    expect(() => workloadSchema.parse({ dau: -1 })).toThrow();
    expect(() => workloadSchema.parse({ sessionsPerUser: NaN })).toThrow();
    expect(() => analyze({ ...fixture(), end: 0 })).toThrow();
  });
  it("uses Pacific dates and DST midnight, not local day", () => {
    expect(quotaDay(Date.parse("2026-07-02T06:59:00Z"))).toBe("2026-07-01");
    expect(
      nextQuotaReset(Date.parse("2026-03-08T08:00:00Z")) -
        Date.parse("2026-03-08T08:00:00Z"),
    ).toBe(23 * 3600000);
    expect(
      nextQuotaReset(Date.parse("2026-11-01T07:00:00Z")) -
        Date.parse("2026-11-01T07:00:00Z"),
    ).toBe(25 * 3600000);
  });
  it("budget checks are strict greater-than and deterministic", () => {
    const t = snapshots({});
    expect(analyze(t, { budget: 10 }).summary.budgetExceeded).toBe(false);
    expect(analyze(t, { dau: 2, budget: 10 }).summary.budgetExceeded).toBe(
      true,
    );
    expect(analyze(t)).toEqual(analyze(t));
    expect(importReport(analyze(t))).toEqual(analyze(t));
  });
  it("escapes report strings", () => {
    const t = fixture();
    const e = t.events.find((e) => e.type === "listener_subscribed");
    if (e?.type === "listener_subscribed")
      e.queryKey = "<script>alert(1)</script>";
    expect(htmlReport(analyze(t))).not.toContain("<script>");
    expect(htmlReport(analyze(t))).toContain("&lt;script&gt;");
  });
  it.each([
    "large-query",
    "high-updates",
    "cache-heavy",
    "reconnect",
    "incomplete",
  ])("analyzes fixture %s", (name) =>
    expect(analyze(fixture(name)).findings.length).toBeGreaterThan(0),
  );
});

import { z } from "zod";
const count = z.number().int().nonnegative().finite();
const text = z.string().max(500);
const base = { at: count, sessionId: text };
const listener = { ...base, listenerId: text };
export const eventSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("session_started") }),
  z.object({ ...base, type: z.literal("session_ended") }),
  z.object({
    ...listener,
    type: z.literal("listener_subscribed"),
    queryKey: text.min(1),
    label: text,
    screen: text,
    kind: z.enum(["query", "document"]),
    background: z.boolean().default(false),
  }),
  z.object({ ...listener, type: z.literal("listener_unsubscribed") }),
  z.object({ ...listener, type: z.literal("listener_error"), code: text }),
  z.object({
    ...listener,
    type: z.literal("snapshot_observed"),
    size: count,
    added: count,
    modified: count,
    removed: count,
    fromCache: z.boolean(),
    hasPendingWrites: z.boolean(),
    first: z.boolean(),
    metadataOnly: z.boolean().nullable(),
    exists: z.boolean().optional(),
    previousExists: z.boolean().optional(),
    dataChanged: z.boolean().nullable().optional(),
  }),
  z.object({ ...base, type: z.literal("screen_entered"), screen: text }),
  z.object({ ...base, type: z.literal("screen_exited"), screen: text }),
  z.object({
    ...base,
    type: z.literal("network_hint"),
    state: z.enum([
      "online",
      "offline",
      "visible",
      "hidden",
      "pagehide",
      "app-disabled",
      "app-enabled",
    ]),
  }),
  z.object({
    ...base,
    type: z.literal("custom_marker"),
    name: text,
    details: z.record(z.string(), text).optional(),
  }),
]);
export type LedgerEvent = z.infer<typeof eventSchema>;
export const traceSchema = z
  .object({
    schemaVersion: z.literal(1),
    toolVersion: text,
    generatedAt: count,
    sessions: z.array(text),
    persistence: z.enum(["memory", "persistent", "unknown"]),
    environment: z.enum(["emulator", "production", "unknown"]),
    capture: z.literal("metadata-only"),
    start: count,
    end: count,
    droppedEvents: count,
    synthetic: z.boolean().default(false),
    events: z.array(eventSchema).max(100000),
  })
  .superRefine((t, c) => {
    if (t.end < t.start)
      c.addIssue({
        code: "custom",
        input: t.end,
        message: "Trace end precedes start",
      });
    const active = new Set<string>();
    let prev = t.start;
    for (const [i, e] of t.events.entries()) {
      if (e.at < prev || e.at > t.end || !t.sessions.includes(e.sessionId))
        c.addIssue({
          code: "custom",
          input: e,
          path: ["events", i],
          message:
            "Events must be ordered, within range, and reference a declared session",
        });
      prev = e.at;
      if (e.type === "listener_subscribed") {
        if (active.has(e.listenerId))
          c.addIssue({
            code: "custom",
            input: e,
            path: ["events", i],
            message: "Duplicate listener ID",
          });
        active.add(e.listenerId);
      } else if (
        "listenerId" in e &&
        !active.has(e.listenerId) &&
        !t.droppedEvents
      )
        c.addIssue({
          code: "custom",
          input: e,
          path: ["events", i],
          message: "Listener event without subscription",
        });
    }
  });
export type Trace = z.infer<typeof traceSchema>;
export const workloadSchema = z.object({
  dau: count.default(1),
  sessionsPerUser: z.number().finite().positive().default(1),
  budget: z.number().finite().positive().default(50000),
  scenario: z.enum(["baseline", "light", "heavy"]).default("baseline"),
  additionalReads: count.default(0),
  reconnectMinutes: z.number().finite().nonnegative().nullable().default(null),
  reconnectCount: count.default(0),
  persistence: z.enum(["memory", "persistent", "unknown"]).default("unknown"),
  quotas: z
    .object({
      reads: count,
      writes: count,
      deletes: count,
      storageBytes: count,
      monthlyOutboundBytes: count,
    })
    .default({
      reads: 50000,
      writes: 20000,
      deletes: 20000,
      storageBytes: 1073741824,
      monthlyOutboundBytes: 10737418240,
    }),
});
export type Workload = z.infer<typeof workloadSchema>;
export interface Finding {
  id: string;
  severity: "warning" | "info";
  title: string;
  evidence: string;
  affected: string[];
  why: string;
  recommendation: string;
  limitation: string;
}
export interface ListenerResult {
  id: string;
  queryKey: string;
  label: string;
  screen: string;
  background: boolean;
  start: number;
  end: number;
  duration: number;
  firstLatency: number | null;
  callbacks: number;
  initialSize: number | null;
  peakSize: number;
  averageSize: number;
  added: number;
  modified: number;
  removed: number;
  cache: number;
  pending: number;
  initialReads: number;
  updateReads: number;
  uncertainRemovals: number;
  reads: number;
  notes: string[];
  snapshots: Extract<LedgerEvent, { type: "snapshot_observed" }>[];
}
export function analyze(input: unknown, assumptions: unknown = {}) {
  const trace = traceSchema.parse(input),
    workload = workloadSchema.parse(assumptions);
  const listeners: ListenerResult[] = [];
  const byId = new Map<string, ListenerResult>();
  const findings: Finding[] = [];
  const add = (
    id: string,
    title: string,
    evidence: string,
    affected: string[],
    recommendation: string,
    severity: "warning" | "info" = "warning",
  ) =>
    findings.push({
      id,
      severity,
      title,
      evidence,
      affected,
      why: "This application behavior can affect read demand or measurement coverage.",
      recommendation,
      limitation:
        "Client callbacks do not measure billing; SDK targets may be shared.",
    });
  let active = 0,
    peak = 0;
  const closed = new Set<string>();
  for (const e of trace.events) {
    if (e.type === "listener_subscribed") {
      const l: ListenerResult = {
        id: e.listenerId,
        queryKey: e.queryKey,
        label: e.label,
        screen: e.screen,
        background: e.background,
        start: e.at,
        end: trace.end,
        duration: 0,
        firstLatency: null,
        callbacks: 0,
        initialSize: null,
        peakSize: 0,
        averageSize: 0,
        added: 0,
        modified: 0,
        removed: 0,
        cache: 0,
        pending: 0,
        initialReads: 0,
        updateReads: 0,
        uncertainRemovals: 0,
        reads: 0,
        notes: [],
        snapshots: [],
      };
      if (
        listeners.some(
          (x) =>
            x.queryKey === l.queryKey && !closed.has(x.id) && x.end >= e.at,
        )
      )
        add(
          "overlap:" + l.id,
          "Possible overlapping listeners",
          `Concurrent application subscriptions for ${l.queryKey}`,
          [l.id],
          "Investigate shared subscriptions; duplicated backend billing is not established.",
        );
      listeners.push(l);
      byId.set(l.id, l);
      active++;
      peak = Math.max(peak, active);
    } else if ("listenerId" in e) {
      const l = byId.get(e.listenerId);
      if (!l) continue;
      if (e.type === "listener_unsubscribed" || e.type === "listener_error") {
        if (!closed.has(l.id)) active = Math.max(0, active - 1);
        closed.add(l.id);
        l.end = e.at;
      }
      if (e.type === "snapshot_observed") {
        l.snapshots.push(e);
        l.callbacks++;
        l.firstLatency ??= e.at - l.start;
        l.initialSize ??= e.size;
        l.peakSize = Math.max(l.peakSize, e.size);
        l.added += e.added;
        l.modified += e.modified;
        l.removed += e.removed;
        l.cache += +e.fromCache;
        l.pending += +e.hasPendingWrites;
        if (e.fromCache || e.hasPendingWrites) continue;
        // The first eligible server observation models a fresh query once, even after cache callbacks.
        if (
          !l.notes.includes(
            "Fresh-query assumption applied to first eligible server observation.",
          )
        ) {
          l.initialReads = Math.max(1, e.size);
          l.notes.push(
            "Fresh-query assumption applied to first eligible server observation.",
          );
        } else if (!e.metadataOnly) {
          l.updateReads +=
            e.exists !== undefined
              ? e.dataChanged === true
                ? 1
                : 0
              : e.added + e.modified;
          l.uncertainRemovals += e.removed;
        }
      }
    } else if (e.type === "session_ended") {
      for (const l of listeners) {
        if (!closed.has(l.id)) {
          l.end = e.at;
          closed.add(l.id);
        }
      }
      active = 0;
    } else if (e.type === "screen_exited") {
      const survivors = listeners.filter(
        (l) =>
          l.screen === e.screen &&
          !l.background &&
          !closed.has(l.id) &&
          l.end >= e.at,
      );
      if (survivors.length)
        add(
          "screen:" + e.sessionId + ":" + e.at,
          "Listener survives screen exit",
          `${survivors.length} screen-specific subscriptions active at exit`,
          survivors.map((l) => l.id),
          "Check cleanup or declare intentional background subscriptions.",
        );
    }
  }
  for (const l of listeners) {
    l.duration = l.end - l.start;
    l.averageSize =
      l.snapshots.reduce((a, s) => a + s.size, 0) / (l.callbacks || 1);
    l.reads = l.initialReads + l.updateReads;
    l.notes.push(
      "Index entries, rules reads, target reuse, local-write acknowledgments and reconnects remain unresolved.",
    );
    if (l.uncertainRemovals)
      l.notes.push(
        `${l.uncertainRemovals} removals have unknown cause and are excluded from baseline.`,
      );
    if (l.snapshots.some((s) => s.exists !== undefined))
      l.notes.push(
        "Document data changes are unknown without retaining payloads; subsequent document reads are unresolved.",
      );
  }
  const queries = [...new Set(listeners.map((l) => l.queryKey))]
    .map((key) => {
      const ls = listeners.filter((l) => l.queryKey === key);
      const reads = ls.reduce((a, l) => a + l.reads, 0);
      if (ls.length >= 3)
        add(
          "churn:" + key,
          "Subscription churn",
          `${ls.length} subscriptions for ${key}`,
          ls.map((l) => l.id),
          "Review effect dependencies and route lifecycle.",
        );
      if (ls.some((l) => (l.initialSize ?? 0) >= 100))
        add(
          "large:" + key,
          "Large initial snapshot",
          `Peak result size ${Math.max(...ls.map((l) => l.peakSize))}`,
          ls.map((l) => l.id),
          "Consider limits, pagination and narrower queries.",
        );
      if (ls.reduce((a, l) => a + l.modified, 0) >= 50)
        add(
          "updates:" + key,
          "High-update workload",
          `${ls.reduce((a, l) => a + l.modified, 0)} observed modifications`,
          ls.map((l) => l.id),
          "Investigate which data needs realtime updates.",
        );
      return {
        key,
        subscriptions: ls.length,
        reads,
        initialReads: ls.reduce((a, l) => a + l.initialReads, 0),
        updateReads: ls.reduce((a, l) => a + l.updateReads, 0),
      };
    })
    .sort((a, b) => b.reads - a.reads || a.key.localeCompare(b.key));
  const sessions = Math.max(1, trace.sessions.length),
    modeledReads = listeners.reduce((a, l) => a + l.reads, 0),
    perSession = modeledReads / sessions;
  const reconnectEligible =
    workload.reconnectMinutes !== null &&
    (workload.persistence === "memory" ||
      (workload.persistence === "persistent" &&
        workload.reconnectMinutes > 30));
  const reconnectReads = reconnectEligible
    ? (listeners.reduce(
        (a, l) => a + Math.max(1, l.snapshots.at(-1)?.size ?? 0),
        0,
      ) /
        sessions) *
      workload.reconnectCount
    : 0;
  const factor = { light: 0.5, baseline: 1, heavy: 2 }[workload.scenario];
  const dailyReads =
    (perSession * factor + reconnectReads + workload.additionalReads) *
    workload.dau *
    workload.sessionsPerUser;
  if (
    workload.reconnectCount ||
    trace.events.some((e) => e.type === "network_hint")
  )
    add(
      "reconnect",
      "Uncertain reconnect overhead",
      `Declared ${workload.reconnectCount} reconnects; persistence ${workload.persistence}`,
      [],
      "Verify backend disconnects; browser hints alone cannot establish reconnection billing.",
      "info",
    );
  if (dailyReads >= workload.budget * 0.8)
    add(
      "budget",
      "Approaching daily read budget",
      `${dailyReads} modeled daily reads against ${workload.budget}`,
      [],
      "Review traffic assumptions and dominant query groups.",
    );
  add(
    "coverage",
    "Incomplete measurement coverage",
    `Instrumented listeners only; ${trace.droppedEvents} dropped events`,
    [],
    "Compare with Firebase usage and billing reports; include missing operations.",
    "info",
  );
  const screens = [...new Set(listeners.map((l) => l.screen))].map(
    (screen) => ({
      screen,
      subscriptions: listeners.filter((l) => l.screen === screen).length,
      reads: listeners
        .filter((l) => l.screen === screen)
        .reduce((a, l) => a + l.reads, 0),
      changes: listeners
        .filter((l) => l.screen === screen)
        .reduce((a, l) => a + l.added + l.modified + l.removed, 0),
    }),
  );
  return {
    reportVersion: 1 as const,
    trace,
    workload,
    listeners,
    queries,
    screens,
    findings: findings.sort(
      (a, b) =>
        b.severity.localeCompare(a.severity) || a.id.localeCompare(b.id),
    ),
    summary: {
      subscriptions: listeners.length,
      uniqueQueries: queries.length,
      peakActive: peak,
      callbacks: listeners.reduce((a, l) => a + l.callbacks, 0),
      changes: listeners.reduce(
        (a, l) => a + l.added + l.modified + l.removed,
        0,
      ),
      duration: trace.end - trace.start,
      modeledReads,
      perSession,
      dailyReads,
      reconnectReads,
      utilization: dailyReads / workload.budget,
      budgetExceeded: dailyReads > workload.budget,
    },
    unknownOverhead: [
      "Index-entry reads",
      "Security Rules dependent reads",
      "Uninstrumented operations",
      "SDK target sharing and server reconnects",
      "Local-write acknowledgment attribution",
    ],
    explanation:
      "Fresh-query assumption per subscription; eligible post-initial server additions and modifications. Removals excluded. No exact billed reads are measured.",
  };
}
export type Report = ReturnType<typeof analyze>;
export function importReport(value: unknown): Report {
  const envelope = z
    .object({
      reportVersion: z.literal(1),
      trace: traceSchema,
      workload: workloadSchema,
    })
    .parse(value);
  return analyze(envelope.trace, envelope.workload);
}
export function quotaDay(at: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
export function nextQuotaReset(at: number) {
  const day = quotaDay(at);
  let lo = at,
    hi = at + 27 * 3600000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (quotaDay(mid) === day) lo = mid;
    else hi = mid;
  }
  return hi;
}
export const escapeHtml = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function terminalReport(r: Report) {
  return `ListenerLedger — instrumented coverage only\nObserved: ${r.summary.subscriptions} subscriptions · ${r.summary.callbacks} callbacks · ${r.summary.changes} changes\nModeled document reads: ${r.summary.modeledReads}\nProjected daily reads: ${r.summary.dailyReads} / ${r.workload.budget}\n${r.explanation}\n\nHotspots\n${r.queries.map((q) => `${q.key}: ${q.reads} modeled reads (${q.subscriptions} subscriptions)`).join("\n")}\n\n${r.findings.map((f) => `${f.title}: ${f.evidence}\n  ${f.recommendation}`).join("\n")}\nUnknown overhead: ${r.unknownOverhead.join(", ")}`;
}
export function htmlReport(r: Report) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ListenerLedger report</title><style>body{font:16px system-ui;background:#f5f3ed;color:#242820;max-width:960px;margin:40px auto;padding:24px}pre{white-space:pre-wrap;line-height:1.7}h1{font-size:42px}</style><h1>ListenerLedger</h1><p>Observed evidence. Explicit estimates.</p><pre>${escapeHtml(terminalReport(r))}</pre></html>`;
}

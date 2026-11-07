import { writeFileSync } from "node:fs";
import type { LedgerEvent, Trace } from "../packages/core/src/index.js";
export function fixture(name = "efficient"): Trace {
  type EventInput<T = LedgerEvent> = T extends LedgerEvent
    ? Omit<T, "at" | "sessionId">
    : never;
  const events: LedgerEvent[] = [];
  let at = 1780000000000;
  const sessionId = "synthetic-session";
  const push = (e: EventInput) =>
    events.push({ ...e, at: (at += 100), sessionId } as LedgerEvent);
  push({ type: "session_started" });
  push({ type: "screen_entered", screen: "Inbox" });
  const cycles = name === "churn" ? 6 : 1,
    size = name === "large-query" ? 300 : 24;
  for (let i = 0; i < cycles; i++) {
    const listenerId = "listener-" + i;
    push({
      type: "listener_subscribed",
      listenerId,
      queryKey: "inbox.recent",
      label: "Recent conversations",
      screen: "Inbox",
      kind: "query",
      background: false,
    });
    push({
      type: "snapshot_observed",
      listenerId,
      size,
      added: size,
      modified: 0,
      removed: 0,
      fromCache: name === "cache-heavy",
      hasPendingWrites: false,
      first: true,
      metadataOnly: false,
    });
    if (name !== "cache-heavy")
      for (
        let update = 0;
        update < (name === "high-updates" ? 10 : 1);
        update++
      )
        push({
          type: "snapshot_observed",
          listenerId,
          size: size - (name !== "high-updates" || update === 9 ? 1 : 0),
          added: 0,
          modified: name === "high-updates" ? 8 : 3,
          removed: name !== "high-updates" || update === 9 ? 1 : 0,
          fromCache: false,
          hasPendingWrites: false,
          first: false,
          metadataOnly: false,
        });
    if (name === "churn") push({ type: "screen_exited", screen: "Inbox" });
    push({ type: "listener_unsubscribed", listenerId });
    if (name === "churn" && i < cycles - 1)
      push({ type: "screen_entered", screen: "Inbox" });
  }
  if (name === "reconnect") push({ type: "network_hint", state: "offline" });
  push({ type: "session_ended" });
  return {
    schemaVersion: 1,
    toolVersion: "0.1.0",
    generatedAt: at,
    sessions: [sessionId],
    persistence: "memory",
    environment: "emulator",
    capture: "metadata-only",
    start: events[0]!.at,
    end: at,
    droppedEvents: name === "incomplete" ? 2 : 0,
    synthetic: true,
    events,
  };
}
if (process.argv[1]?.endsWith("fixtures.ts"))
  for (const name of [
    "efficient",
    "churn",
    "large-query",
    "high-updates",
    "cache-heavy",
    "reconnect",
    "incomplete",
  ])
    writeFileSync(
      `fixtures/traces/${name}.json`,
      JSON.stringify(fixture(name), null, 2),
    );

import { analyze, type LedgerEvent, type Trace } from "@listenerledger/core";
import {
  onSnapshot,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type FirestoreError,
  type Query,
  type QuerySnapshot,
  type SnapshotListenOptions,
} from "firebase/firestore";
export interface LedgerOptions {
  enabled?: boolean;
  persistence?: Trace["persistence"];
  environment?: Trace["environment"];
  capture?: "metadata-only";
  maxEvents?: number;
}
export interface ListenContext {
  queryKey: string;
  label?: string;
  screen?: string;
  background?: boolean;
  options?: SnapshotListenOptions;
}
export interface Observer<T> {
  next?: (snapshot: T) => void;
  error?: (error: FirestoreError) => void;
  complete?: () => void;
}
export function createListenerLedger(options: LedgerOptions = {}) {
  const enabled = options.enabled === true;
  const capacity = options.maxEvents ?? 10000;
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 100000)
    throw new Error("maxEvents must be an integer between 2 and 100000");
  let running = false,
    events: LedgerEvent[] = [],
    sessions: string[] = [],
    sessionId = "",
    screen = "Unassigned",
    droppedEvents = 0,
    start = Date.now(),
    end = start;
  const active = new Map<
    string,
    {
      context: ListenContext;
      kind: "query" | "document";
      first: boolean;
      previousExists?: boolean;
    }
  >();
  let disposeBrowser = () => {};
  const record = (e: LedgerEvent) => {
    if (!enabled || !running) return;
    if (events.length === capacity) {
      events.shift();
      droppedEvents++;
      if (droppedEvents === 1)
        console.warn(
          "ListenerLedger retention exceeded; trace coverage is incomplete.",
        );
    }
    events.push(e);
    end = e.at;
  };
  const stamp = () => ({ at: Date.now(), sessionId });
  const subscribe = (
    id: string,
    x: { context: ListenContext; kind: "query" | "document"; first: boolean },
  ) =>
    record({
      ...stamp(),
      type: "listener_subscribed",
      listenerId: id + ":" + sessionId,
      queryKey: x.context.queryKey,
      label: x.context.label ?? x.context.queryKey,
      screen: x.context.screen ?? screen,
      kind: x.kind,
      background: x.context.background ?? false,
    });
  const getTrace = (): Trace => ({
    schemaVersion: 1,
    toolVersion: "0.1.0",
    generatedAt: Date.now(),
    sessions: [...sessions],
    persistence: options.persistence ?? "unknown",
    environment: options.environment ?? "unknown",
    capture: "metadata-only",
    start: events[0]?.at ?? start,
    end: running ? Date.now() : end,
    droppedEvents,
    synthetic: false,
    events: structuredClone(events),
  });
  function listen<A = DocumentData, D extends DocumentData = DocumentData>(
    ref: Query<A, D>,
    context: ListenContext,
    callback:
      ((snapshot: QuerySnapshot<A, D>) => void) | Observer<QuerySnapshot<A, D>>,
    error?: (error: FirestoreError) => void,
  ): () => void;
  function listen<A = DocumentData, D extends DocumentData = DocumentData>(
    ref: DocumentReference<A, D>,
    context: ListenContext,
    callback:
      | ((snapshot: DocumentSnapshot<A, D>) => void)
      | Observer<DocumentSnapshot<A, D>>,
    error?: (error: FirestoreError) => void,
  ): () => void;
  function listen<A, D extends DocumentData>(
    ref: Query<A, D> | DocumentReference<A, D>,
    context: ListenContext,
    callback:
      | ((snapshot: QuerySnapshot<A, D>) => void)
      | ((snapshot: DocumentSnapshot<A, D>) => void)
      | Observer<QuerySnapshot<A, D>>
      | Observer<DocumentSnapshot<A, D>>,
    error?: (error: FirestoreError) => void,
  ) {
    if (!context.queryKey) throw new Error("A stable queryKey is required");
    const id = enabled ? crypto.randomUUID() : "",
      kind = ref.type === "document" ? "document" : "query";
    const state = { context, kind, first: true } as {
      context: ListenContext;
      kind: "query" | "document";
      first: boolean;
      previousExists?: boolean;
    };
    if (enabled) {
      active.set(id, state);
      subscribe(id, state);
    }
    const next = (snapshot: QuerySnapshot<A, D> | DocumentSnapshot<A, D>) => {
      if (running && enabled) {
        const query = "docChanges" in snapshot;
        const changes = "docChanges" in snapshot ? snapshot.docChanges() : [];
        const exists = "exists" in snapshot ? snapshot.exists() : undefined;
        record({
          ...stamp(),
          type: "snapshot_observed",
          listenerId: id + ":" + sessionId,
          size: "size" in snapshot ? snapshot.size : +!!exists,
          added: changes.filter((c) => c.type === "added").length,
          modified: changes.filter((c) => c.type === "modified").length,
          removed: changes.filter((c) => c.type === "removed").length,
          fromCache: snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          first: state.first,
          metadataOnly: query ? !state.first && changes.length === 0 : null,
          ...(!query
            ? {
                exists,
                previousExists: state.previousExists,
                dataChanged: null,
              }
            : {}),
        });
        state.first = false;
        state.previousExists = exists;
      }
      const receiver = callback as
        | ((snapshot: QuerySnapshot<A, D> | DocumentSnapshot<A, D>) => void)
        | Observer<QuerySnapshot<A, D> | DocumentSnapshot<A, D>>;
      if (typeof receiver === "function") receiver(snapshot);
      else receiver.next?.(snapshot);
    };
    const onError = (err: FirestoreError) => {
      record({
        ...stamp(),
        type: "listener_error",
        listenerId: id + ":" + sessionId,
        code: err.code,
      });
      active.delete(id);
      if (typeof callback === "function") error?.(err);
      else callback.error?.(err);
    };
    // Overload selection follows the public reference type; no SDK internals or payload reads.
    const unsubscribe =
      ref.type === "document"
        ? onSnapshot(ref, context.options ?? {}, next, onError)
        : onSnapshot(ref, context.options ?? {}, next, onError);
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      unsubscribe();
      if (active.delete(id))
        record({
          ...stamp(),
          type: "listener_unsubscribed",
          listenerId: id + ":" + sessionId,
        });
    };
  }
  const api = {
    listen,
    start() {
      if (!enabled || running) return;
      running = true;
      sessionId = crypto.randomUUID();
      sessions.push(sessionId);
      record({ ...stamp(), type: "session_started" });
      record({ ...stamp(), type: "screen_entered", screen });
      for (const [id, x] of active) {
        x.first = true;
        subscribe(id, x);
      }
      if (typeof window !== "undefined") {
        const hint = (
          state: Extract<LedgerEvent, { type: "network_hint" }>["state"],
        ) => record({ ...stamp(), type: "network_hint", state });
        const online = () => hint("online"),
          offline = () => hint("offline"),
          visibility = () => hint(document.hidden ? "hidden" : "visible"),
          pagehide = () => hint("pagehide");
        window.addEventListener("online", online);
        window.addEventListener("offline", offline);
        document.addEventListener("visibilitychange", visibility);
        window.addEventListener("pagehide", pagehide);
        disposeBrowser = () => {
          window.removeEventListener("online", online);
          window.removeEventListener("offline", offline);
          document.removeEventListener("visibilitychange", visibility);
          window.removeEventListener("pagehide", pagehide);
        };
      }
    },
    stop() {
      if (!running) return;
      record({ ...stamp(), type: "session_ended" });
      running = false;
      disposeBrowser();
    },
    clear() {
      const resume = running;
      api.stop();
      events = [];
      sessions = [];
      droppedEvents = 0;
      start = end = Date.now();
      if (resume) api.start();
    },
    setScreen(next: string) {
      if (next === screen) return;
      record({ ...stamp(), type: "screen_exited", screen });
      screen = next;
      record({ ...stamp(), type: "screen_entered", screen });
    },
    mark(name: string, details?: Record<string, string>) {
      record({ ...stamp(), type: "custom_marker", name, details });
    },
    connectivity(state: "app-disabled" | "app-enabled") {
      record({ ...stamp(), type: "network_hint", state });
    },
    exportTrace: getTrace,
    getSummary() {
      return analyze(getTrace()).summary;
    },
  };
  if (enabled) api.start();
  return api;
}

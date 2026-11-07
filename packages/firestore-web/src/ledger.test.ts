import { analyze } from "@listenerledger/core";
import {
  type DocumentData,
  type Query,
  type QuerySnapshot,
} from "firebase/firestore";
import { beforeEach, expect, it, vi } from "vitest";
import { createListenerLedger } from "./index";
const mock = vi.hoisted(() => ({
  next: undefined as undefined | ((s: unknown) => void),
  unsubscribe: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  onSnapshot: vi.fn((_ref, _options, next) => {
    mock.next = next;
    return mock.unsubscribe;
  }),
}));
const ref = { type: "query" } as Query<DocumentData>;
const snapshot = {
  size: 2,
  metadata: { fromCache: false, hasPendingWrites: false },
  docChanges: () => [{ type: "added" }, { type: "added" }],
} as unknown as QuerySnapshot;
beforeEach(() => {
  mock.unsubscribe.mockClear();
});
it("disabled wrapper passes callbacks and retains nothing", () => {
  const ledger = createListenerLedger();
  const next = vi.fn();
  const unsub = ledger.listen(ref, { queryKey: "q" }, next);
  mock.next?.(snapshot);
  unsub();
  unsub();
  expect(next).toHaveBeenCalledWith(snapshot);
  expect(mock.unsubscribe).toHaveBeenCalledTimes(1);
  expect(ledger.exportTrace().events).toHaveLength(0);
});
it("stopping profiling does not unsubscribe application; restarting namespaces recording identity", () => {
  const ledger = createListenerLedger({ enabled: true });
  const callback = vi.fn();
  const unsub = ledger.listen(ref, { queryKey: "q" }, callback);
  mock.next?.(snapshot);
  ledger.stop();
  expect(mock.unsubscribe).not.toHaveBeenCalled();
  mock.next?.(snapshot);
  ledger.start();
  mock.next?.(snapshot);
  unsub();
  const report = analyze(ledger.exportTrace());
  expect(callback).toHaveBeenCalledTimes(3);
  expect(report.trace.sessions).toHaveLength(2);
  expect(report.summary.subscriptions).toBe(2);
  expect(report.summary.peakActive).toBe(1);
  expect(report.summary.modeledReads).toBe(4);
  ledger.stop();
});
it("bounded retention warns and records drops, clear starts a fresh recording", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const ledger = createListenerLedger({ enabled: true, maxEvents: 3 });
  ledger.listen(ref, { queryKey: "q" }, () => {});
  for (let i = 0; i < 10; i++) mock.next?.(snapshot);
  expect(ledger.exportTrace().events.length).toBe(3);
  expect(ledger.exportTrace().droppedEvents).toBeGreaterThan(0);
  expect(warn).toHaveBeenCalledTimes(1);
  ledger.clear();
  expect(ledger.exportTrace().droppedEvents).toBe(0);
  ledger.stop();
  warn.mockRestore();
});

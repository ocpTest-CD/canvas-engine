import { expect, it } from "vitest";
import { Document } from "../src/core";
import { createSceneBridge } from "../src/core/bridge";
const request = (method: string, payload?: unknown) => ({
  version: 1,
  sessionId: "session",
  requestId: "1",
  method,
  payload,
});
it("supports a transport-independent scene round trip and idempotent replay", () => {
  const doc = new Document(),
    bridge = createSceneBridge(
      {
        loadScene: (s) => {
          doc.load(s);
        },
        exportScene: () => doc.snapshot(),
        applyChanges: (c) => doc.apply(c),
      },
      "session",
    );
  const message = request("loadScene", { version: 1, nodes: [], edges: [] });
  expect(bridge.handle(message).ok).toBe(true);
  const revision = doc.revision;
  expect(bridge.handle(message).ok).toBe(true);
  expect(doc.revision).toBe(revision);
  expect(bridge.handle(request("exportScene")).error?.code).toBe(
    "REQUEST_REUSED",
  );
  expect(
    bridge.handle({ ...request("exportScene"), requestId: "2" }).data,
  ).toEqual(doc.snapshot());
});
it("rejects untrusted commands, old sessions, oversized payloads and disposed bridges", () => {
  const doc = new Document(),
    bridge = createSceneBridge(
      {
        loadScene: (s) => {
          doc.load(s);
        },
        exportScene: () => doc.snapshot(),
        applyChanges: (c) => doc.apply(c),
      },
      "session",
      { maxBytes: 200 },
    );
  expect(bridge.handle(request("eval", "danger")).error?.code).toBe(
    "INVALID_REQUEST",
  );
  expect(
    bridge.handle({ ...request("exportScene"), sessionId: "old" }).error?.code,
  ).toBe("STALE_SESSION");
  expect(bridge.handle(request("loadScene", "x".repeat(300))).error?.code).toBe(
    "INVALID_REQUEST",
  );
  expect(doc.revision).toBe(0);
  bridge.dispose();
  expect(bridge.handle(request("exportScene")).error?.code).toBe("DISPOSED");
});
it("reports failed mutations without replacing the current document", () => {
  const doc = new Document(),
    bridge = createSceneBridge(
      {
        loadScene: (s) => {
          doc.load(s);
        },
        exportScene: () => doc.snapshot(),
        applyChanges: (c) => doc.apply(c),
      },
      "session",
    );
  expect(
    bridge.handle(request("loadScene", { version: 999 })).error?.code,
  ).toBe("OPERATION_FAILED");
  expect(doc.revision).toBe(0);
});

it("bounds response sizes and the replay window", () => {
  const doc = new Document();
  const bridge = createSceneBridge(
    {
      loadScene: (s) => {
        doc.load(s);
      },
      exportScene: () => doc.snapshot(),
      applyChanges: (c) => doc.apply(c),
    },
    "session",
    { maxBytes: 600, replayEntries: 1 },
  );
  const first = request("loadScene", { version: 1, nodes: [], edges: [] });
  bridge.handle(first);
  bridge.handle({ ...first, requestId: "2" });
  const revision = doc.revision;
  bridge.handle(first);
  expect(doc.revision).toBe(revision + 1); // evicted IDs are deliberately not permanent deduplication
  doc.apply([
    {
      kind: "put",
      node: {
        id: "big",
        type: "text",
        title: "big",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        text: "x".repeat(1000),
      },
    },
  ]);
  expect(
    bridge.handle({ ...request("exportScene"), requestId: "3" }).error?.code,
  ).toBe("RESPONSE_TOO_LARGE");
});

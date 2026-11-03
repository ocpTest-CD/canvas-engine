import type {
  Change,
  Snapshot,
  ApplyOptions,
  SelectionSnapshot,
  ExecutionPreview,
} from "./types.js";
export interface SceneBridgeHost {
  getSelection?(): SelectionSnapshot;
  setSelection?(ids: Iterable<string>): void;
  setExecutionPreview?(value?: Partial<ExecutionPreview>): void;
  getExecutionPreview?(): ExecutionPreview;
  loadScene(scene: unknown): void;
  exportScene(): Snapshot;
  applyChanges(changes: Change[], options?: boolean | ApplyOptions): void;
}
export type BridgeMethod =
  | "loadScene"
  | "exportScene"
  | "applyChanges"
  | "getSelection"
  | "setSelection"
  | "setExecutionPreview"
  | "getExecutionPreview";
export interface BridgeRequest {
  version: 1;
  sessionId: string;
  requestId: string;
  method: BridgeMethod;
  payload?: unknown;
}
export interface BridgeResponse {
  version: 1;
  sessionId: string;
  requestId: string;
  ok: boolean;
  data?: Snapshot | SelectionSnapshot | ExecutionPreview | null;
  error?: {
    code:
      | "INVALID_REQUEST"
      | "STALE_SESSION"
      | "REQUEST_REUSED"
      | "OPERATION_FAILED"
      | "RESPONSE_TOO_LARGE"
      | "DISPOSED";
    message: string;
  };
}
export interface SceneBridge {
  handle(message: unknown): BridgeResponse;
  dispose(): void;
}
/** Transport-neutral JSON bridge. The host must authenticate the transport/origin. */
export function createSceneBridge(
  host: SceneBridgeHost,
  sessionId: string,
  options: { maxBytes?: number; replayEntries?: number } = {},
): SceneBridge {
  if (!sessionId) throw Error("sessionId is required");
  const maxBytes = options.maxBytes ?? 8 * 1024 * 1024,
    limit = options.replayEntries ?? 128;
  if (
    !Number.isInteger(maxBytes) ||
    maxBytes <= 0 ||
    !Number.isInteger(limit) ||
    limit <= 0
  )
    throw Error("Invalid bridge limits");
  const cache = new Map<
    string,
    { signature: string; response: BridgeResponse; bytes: number }
  >();
  let disposed = false,
    cachedBytes = 0;
  return {
    dispose() {
      disposed = true;
      cache.clear();
      cachedBytes = 0;
    },
    handle(message) {
      const raw = message as Partial<BridgeRequest> | null;
      const requestId =
        typeof raw?.requestId === "string" ? raw.requestId.slice(0, 128) : "";
      const failure = (
        code: NonNullable<BridgeResponse["error"]>["code"],
        message: string,
      ): BridgeResponse => ({
        version: 1,
        sessionId,
        requestId,
        ok: false,
        error: { code, message: message.slice(0, 1024) },
      });
      if (disposed) return failure("DISPOSED", "Bridge is disposed");
      if (
        !raw ||
        raw.version !== 1 ||
        typeof raw.sessionId !== "string" ||
        !requestId ||
        raw.requestId !== requestId ||
        ![
          "loadScene",
          "exportScene",
          "applyChanges",
          "getSelection",
          "setSelection",
          "setExecutionPreview",
          "getExecutionPreview",
        ].includes(raw.method ?? "")
      )
        return failure("INVALID_REQUEST", "Invalid bridge message");
      if (raw.sessionId !== sessionId)
        return failure("STALE_SESSION", "Session no longer matches");
      let signature: string;
      try {
        signature = JSON.stringify(raw);
        if (new TextEncoder().encode(signature).byteLength > maxBytes)
          return failure("INVALID_REQUEST", "Message exceeds size limit");
      } catch {
        return failure("INVALID_REQUEST", "Message must be JSON serializable");
      }
      const previous = cache.get(requestId);
      if (previous)
        return previous.signature === signature
          ? structuredClone(previous.response)
          : failure(
              "REQUEST_REUSED",
              "Request ID reused with different content",
            );
      let response: BridgeResponse;
      try {
        let data: BridgeResponse["data"] = null;
        if (raw.method === "getSelection") {
          if (!host.getSelection) throw Error("Selection API unavailable");
          data = host.getSelection();
        } else if (raw.method === "getExecutionPreview") {
          if (!host.getExecutionPreview)
            throw Error("Execution preview API unavailable");
          data = host.getExecutionPreview();
        } else if (raw.method === "setSelection") {
          if (!host.setSelection) throw Error("Selection API unavailable");
          if (
            !Array.isArray(raw.payload) ||
            raw.payload.some((v) => typeof v !== "string")
          )
            return failure("INVALID_REQUEST", "Selection must be node IDs");
          host.setSelection(raw.payload);
        } else if (raw.method === "setExecutionPreview") {
          if (!host.setExecutionPreview)
            throw Error("Execution preview API unavailable");
          const p = raw.payload;
          if (
            p !== undefined &&
            (p === null ||
              typeof p !== "object" ||
              Array.isArray(p) ||
              Object.entries(p).some(
                ([k, v]) =>
                  !["execute", "blocked", "cancel"].includes(k) ||
                  !Array.isArray(v) ||
                  v.some((id) => typeof id !== "string"),
              ))
          )
            return failure("INVALID_REQUEST", "Invalid execution preview");
          host.setExecutionPreview(p as Partial<ExecutionPreview> | undefined);
        } else if (raw.method === "loadScene") host.loadScene(raw.payload);
        else if (raw.method === "applyChanges") {
          const payload = raw.payload as
            | { operations?: Change[]; options?: ApplyOptions }
            | undefined;
          if (Array.isArray(payload)) host.applyChanges(payload as Change[]);
          else if (payload && Array.isArray(payload.operations)) {
            const options = payload.options;
            if (
              options &&
              (typeof options !== "object" ||
                (options.origin !== undefined &&
                  !["local", "remote", "system", "history"].includes(
                    options.origin,
                  )) ||
                (options.history !== undefined &&
                  typeof options.history !== "boolean") ||
                (options.transactionId !== undefined &&
                  typeof options.transactionId !== "string"))
            )
              return failure("INVALID_REQUEST", "Invalid transaction options");
            host.applyChanges(payload.operations, options);
          } else
            return failure(
              "INVALID_REQUEST",
              "Changes must be an array or transaction envelope",
            );
        }
        response = {
          version: 1,
          sessionId,
          requestId,
          ok: true,
          data: raw.method === "exportScene" ? host.exportScene() : data,
        };
      } catch (error) {
        response = failure(
          "OPERATION_FAILED",
          error instanceof Error ? error.message : String(error),
        );
      }
      const encoder = new TextEncoder();
      let responseBytes = encoder.encode(JSON.stringify(response)).byteLength;
      if (responseBytes > maxBytes) {
        response = failure(
          "RESPONSE_TOO_LARGE",
          "Response exceeds size limit; use a host transfer outside this bridge",
        );
        responseBytes = encoder.encode(JSON.stringify(response)).byteLength;
      }
      const bytes = encoder.encode(signature).byteLength + responseBytes;
      cache.set(requestId, {
        signature,
        response: structuredClone(response),
        bytes,
      });
      cachedBytes += bytes;
      // Bound retained JSON bytes as well as request count. Evicted IDs may execute again.
      while (cache.size > limit || cachedBytes > maxBytes * 2) {
        const oldest = cache.keys().next().value!;
        cachedBytes -= cache.get(oldest)!.bytes;
        cache.delete(oldest);
      }
      return response;
    },
  };
}

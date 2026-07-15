/**
 * CaptureGate — serial queue around the one native widget-frame capture host.
 *
 * `run` reserves work synchronously, starts at most one request, and applies a
 * timeout only after that request reaches the head of the queue. This lets a
 * foreground reconciliation overlap a user selection without surfacing a
 * spurious busy error. `cancel` rejects both the active lease and queued work;
 * late native completions are ignored by identity and cannot release a newer
 * request.
 *
 * Map:
 * - `CaptureRequest` stores type-erased queued work and its caller callbacks.
 * - `pump` promotes one request and owns its timeout/identity guard.
 * - `cancel` is the unmount boundary for every accepted request.
 */
export const CAPTURE_TIMEOUT = "WIDGET_CAPTURE_TIMEOUT";
export const CAPTURE_CANCELLED = "WIDGET_CAPTURE_CANCELLED";

type CaptureRequest = {
  /** Monotonic lease identity used to ignore late work completion. */
  id: number;
  /** Deferred so queued requests do not mount a second native capture tree. */
  work: () => Promise<unknown>;
  /** Starts when this request becomes active, not while it waits in the queue. */
  timeoutMs: number;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type ActiveCapture = {
  request: CaptureRequest;
  timeout: ReturnType<typeof setTimeout>;
};

export class CaptureGate {
  /** The only request currently allowed to use the native capture host. */
  private active: ActiveCapture | null = null;
  /** FIFO ordering keeps reconciliation deterministic and avoids starvation. */
  private readonly queue: CaptureRequest[] = [];
  private nextId = 1;

  get busy(): boolean {
    return this.active != null || this.queue.length > 0;
  }

  run<T>(work: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request: CaptureRequest = {
        id: this.nextId,
        work,
        timeoutMs,
        resolve: (value) => resolve(value as T),
        reject,
      };
      this.nextId += 1;
      this.queue.push(request);
      this.pump();
    });
  }

  /** Start the next queued capture after the current lease has fully settled. */
  private pump(): void {
    if (this.active) {
      return;
    }
    const request = this.queue.shift();
    if (!request) {
      return;
    }

    const settle =
      (outcome: "resolve" | "reject") =>
      (value: unknown): void => {
        if (this.active?.request.id !== request.id) {
          return;
        }
        clearTimeout(this.active.timeout);
        this.active = null;
        if (outcome === "resolve") {
          request.resolve(value);
        } else {
          request.reject(value instanceof Error ? value : new Error(String(value)));
        }
        this.pump();
      };

    const timeout = setTimeout(
      () => settle("reject")(new Error(CAPTURE_TIMEOUT)),
      request.timeoutMs,
    );
    this.active = { request, timeout };

    // Defer invocation to normalize synchronous throws into the same guarded
    // settlement path as promise rejections.
    void Promise.resolve().then(request.work).then(settle("resolve"), settle("reject"));
  }

  cancel(): void {
    const cancellation = () => new Error(CAPTURE_CANCELLED);
    const queued = this.queue.splice(0);
    for (const request of queued) {
      request.reject(cancellation());
    }

    const active = this.active;
    if (!active) {
      return;
    }
    clearTimeout(active.timeout);
    this.active = null;
    active.request.reject(cancellation());
  }
}

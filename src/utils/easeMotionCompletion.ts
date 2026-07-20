/**
 * Associates an Ease native completion event with the logical state change
 * that produced it. Native callbacks do not carry application request IDs, so
 * callers supply an opaque token when an animated target changes.
 */
export class EaseMotionCompletionQueue<TCompletion> {
  private target: string;
  private readonly pending: (TCompletion | null)[] = [];

  constructor(initialTarget: string) {
    this.target = initialTarget;
  }

  transition(target: string, completion: TCompletion | null): void {
    if (target === this.target) {
      return;
    }
    this.target = target;
    this.pending.push(completion);
  }

  finish(finished: boolean): TCompletion | null {
    const completion = this.pending.shift() ?? null;
    if (finished || this.pending.length === 0) {
      return completion;
    }
    return null;
  }
}

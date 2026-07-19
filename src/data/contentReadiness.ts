/**
 * Bridges an edge-triggered native readiness event to a later request-scoped
 * consumer. Readiness is retained only for the current durable content key and
 * is replayed at most once per request.
 */
export class ContentReadinessLatch {
  private readyContentKey: string | null = null;
  private reportedRequestId: number | null = null;

  /** Record native readiness and satisfy a waiting request, if one exists. */
  contentReady(contentKey: string, requestId: number | null): boolean {
    if (this.readyContentKey !== contentKey) {
      this.readyContentKey = contentKey;
      this.reportedRequestId = null;
    }

    return requestId === null ? false : this.consume(contentKey, requestId);
  }

  /** Replay previously recorded readiness to a later handoff request. */
  request(contentKey: string, requestId: number): boolean {
    if (this.readyContentKey !== contentKey) {
      this.readyContentKey = null;
      this.reportedRequestId = null;
      return false;
    }

    return this.consume(contentKey, requestId);
  }

  private consume(contentKey: string, requestId: number): boolean {
    if (this.readyContentKey !== contentKey || this.reportedRequestId === requestId) {
      return false;
    }

    this.reportedRequestId = requestId;
    return true;
  }
}

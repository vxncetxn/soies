/**
 * Bridges Paper's edge-triggered native layout event to Calendar's later,
 * request-scoped handoff. A mounted Paper can become ready before Calendar
 * targets it, so readiness must remain queryable until its document changes.
 */
export class PaperContentReadinessLatch {
  private readyDocumentKey: string | null = null;
  private reportedRequestId: number | null = null;

  /** Record native readiness and satisfy a waiting request, if one exists. */
  contentReady(documentKey: string, requestId: number | null): boolean {
    if (this.readyDocumentKey !== documentKey) {
      this.readyDocumentKey = documentKey;
      this.reportedRequestId = null;
    }

    return requestId === null ? false : this.consume(documentKey, requestId);
  }

  /** Replay previously recorded readiness to a later Calendar request. */
  request(documentKey: string, requestId: number): boolean {
    if (this.readyDocumentKey !== documentKey) {
      this.readyDocumentKey = null;
      this.reportedRequestId = null;
      return false;
    }

    return this.consume(documentKey, requestId);
  }

  private consume(documentKey: string, requestId: number): boolean {
    if (this.readyDocumentKey !== documentKey || this.reportedRequestId === requestId) {
      return false;
    }

    this.reportedRequestId = requestId;
    return true;
  }
}

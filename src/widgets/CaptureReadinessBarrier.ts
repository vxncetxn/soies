/**
 * CaptureReadinessBarrier — one-shot pixel-readiness state machine.
 *
 * Native layout is always required; Print photos and Ink overlays are required
 * only when the current Artefact has them. Signals may arrive in any order.
 * The first source failure wins, and neither readiness nor later failures can
 * report after the barrier has settled.
 */
export type CaptureReadinessSource = "photo" | "ink";

export class CaptureReadinessBarrier {
  private layoutReady = false;
  private photoReady: boolean;
  private inkReady: boolean;
  private settled = false;
  private readonly onReady: () => void;
  private readonly onError: (error: Error) => void;

  constructor(
    photoRequired: boolean,
    inkRequired: boolean,
    onReady: () => void,
    onError: (error: Error) => void,
  ) {
    this.photoReady = !photoRequired;
    this.inkReady = !inkRequired;
    this.onReady = onReady;
    this.onError = onError;
  }

  markLayoutReady(): void {
    this.layoutReady = true;
    this.reportReadyIfComplete();
  }

  markPhotoReady(): void {
    this.photoReady = true;
    this.reportReadyIfComplete();
  }

  markInkReady(): void {
    this.inkReady = true;
    this.reportReadyIfComplete();
  }

  fail(source: CaptureReadinessSource): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.onError(new Error(`Widget frame ${source} failed to display`));
  }

  private reportReadyIfComplete(): void {
    if (this.settled || !this.layoutReady || !this.photoReady || !this.inkReady) {
      return;
    }
    this.settled = true;
    this.onReady();
  }
}

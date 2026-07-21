export const STACK_COLLAPSE_REVERSAL_TAP_MAX_TRAVEL = 10;

export type StackCollapseReversalTouchPoint = {
  pageX: number;
  pageY: number;
};

/** Distinguishes a deliberate collapse-reversal tap from a swipe over the Stack. */
export class StackCollapseReversalTapGesture {
  private origin: StackCollapseReversalTouchPoint | null = null;
  private tapEligible = false;

  begin(point: StackCollapseReversalTouchPoint): void {
    this.origin = point;
    this.tapEligible = true;
  }

  move(point: StackCollapseReversalTouchPoint): void {
    if (!this.origin || !this.tapEligible) {
      return;
    }

    const travel = Math.hypot(point.pageX - this.origin.pageX, point.pageY - this.origin.pageY);
    if (travel > STACK_COLLAPSE_REVERSAL_TAP_MAX_TRAVEL) {
      this.tapEligible = false;
    }
  }

  consumeTap(): boolean {
    const accepted = this.origin !== null && this.tapEligible;
    this.origin = null;
    this.tapEligible = false;
    return accepted;
  }
}

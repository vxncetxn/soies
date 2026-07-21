export type StackPageFrame = {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
};

export type StackViewport = {
  width: number;
  height: number;
};

export type StackPresentationSize = {
  width: number;
  height: number;
};

export type StackHitFrame = StackPresentationSize & {
  left: number;
  top: number;
};

/** Translate the viewport-centred portal frame onto the canonical Home deck. */
export function getCollapsedPortalOffset(
  trigger: StackPageFrame,
  viewport: StackViewport,
): { x: number; y: number } {
  "worklet";
  return {
    x: trigger.pageX + trigger.width / 2 - viewport.width / 2,
    y: trigger.pageY + trigger.height / 2 - viewport.height / 2,
  };
}

/**
 * Static responder bounds containing the complete critically damped collapse
 * path. Ease renders from Core Animation's presentation layer on iOS, while
 * UIKit hit testing jumps to the destination model layer; an untransformed
 * envelope therefore keeps every visible in-flight frame tappable.
 */
export function getCollapseReversalHitFrame({
  viewport,
  expanded,
  collapsed,
  collapsedOffset,
}: {
  viewport: StackViewport;
  expanded: StackPresentationSize;
  collapsed: StackPresentationSize;
  collapsedOffset: { x: number; y: number };
}): StackHitFrame {
  const expandedLeft = (viewport.width - expanded.width) / 2;
  const expandedTop = (viewport.height - expanded.height) / 2;
  const collapsedLeft = (viewport.width - collapsed.width) / 2 + collapsedOffset.x;
  const collapsedTop = (viewport.height - collapsed.height) / 2 + collapsedOffset.y;
  const left = Math.min(expandedLeft, collapsedLeft);
  const top = Math.min(expandedTop, collapsedTop);
  const right = Math.max(expandedLeft + expanded.width, collapsedLeft + collapsed.width);
  const bottom = Math.max(expandedTop + expanded.height, collapsedTop + collapsed.height);

  return { left, top, width: right - left, height: bottom - top };
}

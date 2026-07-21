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

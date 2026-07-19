export type CreateDismissalReason = "cancel" | "save";

/** Maps a completed authoring dismissal to its retained Entry target. */
export function targetForCreateDismissal(reason: CreateDismissalReason) {
  return reason === "save" ? ("prepared-home" as const) : ("home" as const);
}

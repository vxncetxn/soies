/**
 * ArtefactTextInput — smallest responder contract shared by create flows.
 *
 * `useCreateArtefactAuthoring` must move focus between Print's React Native
 * TextInput and Paper's Expo native TextKit view without knowing which concrete
 * implementation it holds. Keeping this seam to synchronous focus/blur avoids
 * leaking Paper-only paragraph commands into the shared pager controller.
 */
export type ArtefactTextInputHandle = {
  /** Request first responder for the target artefact during Prev/Next transfer. */
  focus: () => void;
  /** End Type mode or hand first responder to another artefact. */
  blur: () => void;
};

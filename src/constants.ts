/** Maximum number of cards kept on screen at once. */
export const MAX_CARDS = 6;

/** Distance in physical pixels between the cards and the bottom-right screen corner. */
export const SCREEN_MARGIN = 200;

/** How often the newest card's pressed state is refreshed (ms). */
export const REFRESH_INTERVAL_MS = 200;

/** How often expired cards are removed (ms). */
export const REMOVE_INTERVAL_MS = 1000;

/** How long a card stays on screen after its last update (ms). */
export const CARD_LIFETIME_MS = 3000;

/** Font size used for every key label (px). */
export const FONT_SIZE_PX = 24;

/** Padding around a single key label (px). */
export const KEY_PADDING_PX = 12;

/** Prefix of the repeat counter shown after a repeatedly pressed combination. */
export const REPEAT_PREFIX = "×";

/**
 * Text colour of the repeat counter, escalating with the number of repeated
 * presses so the count is distinguishable at a glance.
 *
 * The first entry is used for `×2`, the last one for that count and anything
 * above it. The colours read clearly on the black chip and none of them collide
 * with the white key labels or the yellow pressed state.
 */
export const REPEAT_COLORS: readonly string[] = [
  "#8be9fd", // ×2
  "#50fa7b", // ×3
  "#bd93f9", // ×4
  "#ff79c6", // ×5
  "#ff5555", // ×6 and above
];

/** Id of the hidden element in the controller window used to measure a card. */
export const MEASURE_ELEMENT_ID = "measure";

/** Id of the card rendered inside an overlay window. */
export const CARD_ELEMENT_ID = "key-card";

/** Event telling the controller that dev mode was toggled in the tray. */
export const DEV_MODE_EVENT = "dev-mode";

/** Event that reveals the whole UI again after {@link HIDE_UI_EVENT}. */
export const SHOW_UI_EVENT = "show-ui";

/** Event that hides the whole UI, keeping the overlay windows alive. */
export const HIDE_UI_EVENT = "hide-ui";

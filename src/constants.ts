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

import { type Accessor, For } from "solid-js";
import { FONT_SIZE_PX, KEY_PADDING_PX } from "../constants";
import type { KeyState } from "../types";

type EventItemProps = {
  id: string;
  keys: Accessor<KeyState[]>;
  /** When true, pressed keys are not highlighted. */
  noColor?: Accessor<boolean>;
};

/**
 * Renders a single card as a row of key labels. Used both by the overlay
 * windows and (hidden) by the controller window for measuring.
 */
export function EventItem(props: EventItemProps) {
  return (
    <div class="event-item" id={props.id} style={{ "font-size": `${FONT_SIZE_PX}px` }}>
      <For each={props.keys()}>
        {(key) => (
          <div
            class="event-text"
            classList={{
              "event-text-press": key.press && !props.noColor?.(),
            }}
            style={{ padding: `${KEY_PADDING_PX}px` }}
          >
            {key.key}
          </div>
        )}
      </For>
    </div>
  );
}

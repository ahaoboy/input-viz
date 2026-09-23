import { type Accessor, For, Show } from "solid-js";
import { FONT_SIZE_PX, KEY_PADDING_PX, REPEAT_PREFIX } from "../constants";
import type { KeyState } from "../types";

type EventItemProps = {
  id: string;
  keys: Accessor<KeyState[]>;
  /** How many times the combination was pressed in a row. Omitted for `1`. */
  repeat?: Accessor<number>;
  /** When true, pressed keys are not highlighted. */
  noColor?: Accessor<boolean>;
};

/**
 * Renders a single card as a row of key labels, followed by a repeat counter
 * when the combination was pressed more than once. Used both by the overlay
 * windows and (hidden) by the controller window for measuring.
 */
export function EventItem(props: EventItemProps) {
  const repeat = () => props.repeat?.() ?? 1;

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
      <Show when={repeat() > 1}>
        <div class="event-count" style={{ padding: `${KEY_PADDING_PX}px` }}>
          {REPEAT_PREFIX}
          {repeat()}
        </div>
      </Show>
    </div>
  );
}

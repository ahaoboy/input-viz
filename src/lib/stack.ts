import { CARD_LIFETIME_MS, KEY_PADDING_PX, MAX_CARDS, SCREEN_MARGIN } from "../constants";
import type { KeyMap, KeyState, StackItem } from "../types";
import { HOLD_KEYS, MOMENTARY_KEYS } from "./keymap";
import type { Point, Size } from "./geometry";

/** Stable identity of a card, used to reuse its overlay window across updates. */
export function itemId(item: StackItem): string {
  return `${item.keys.map((k) => k.key).join("_")}-${item.ts}-${item.id}`;
}

/** Compact, log-friendly description of one card. */
export type CardLayout = {
  id: number;
  /** Keys with their pressed state, e.g. `Ctrl:down+C:up`. */
  keys: string;
  /** Repeat count, omitted when the combination was pressed only once. */
  repeat?: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * Describes the geometry of every card, oldest first. The stack is laid out
 * bottom-up, so the last entry is the card closest to the screen corner.
 */
export function describeLayout(items: StackItem[]): CardLayout[] {
  return items.map((item) => ({
    id: item.id,
    keys: item.keys.map((k) => `${k.key}:${k.press ? "down" : "up"}`).join("+"),
    ...(item.repeat > 1 ? { repeat: item.repeat } : {}),
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
  }));
}

/** Whether the newest card already contains every key of the incoming set. */
function containsAll(top: StackItem, keys: KeyState[]): boolean {
  return keys.every(({ key }) => top.keys.some((k) => k.key === key));
}

/**
 * Whether `keys` is exactly the same combination as the card's, ignoring the
 * pressed state. Used to recognise a repeated press of the same combination.
 */
function isSameCombination(item: StackItem, keys: KeyState[]): boolean {
  return item.keys.length === keys.length && containsAll(item, keys);
}

/**
 * Repeat count the incoming `keys` should display.
 *
 * Pressing exactly the same combination again bumps the counter. A new
 * combination starts back at one, and so does a card refreshed because one of
 * its keys was released — that keeps the count of a combination that is still on
 * screen.
 *
 * `isNewPress` distinguishes a fresh press from an operating system
 * auto-repeat, which must not increment the counter.
 *
 * The result is `1` exactly when {@link pushItem} will add a new card, because
 * both use the same merge condition.
 */
export function nextRepeat(stack: StackItem[], keys: KeyState[], isNewPress: boolean): number {
  const top = stack.at(-1);
  if (!top || !containsAll(top, keys)) return 1;
  if (isNewPress && isSameCombination(top, keys)) return top.repeat + 1;
  return top.repeat;
}

/**
 * Keys the newest card will display once `keys` is applied.
 *
 * A card that already contains them keeps its own full combination (releasing
 * one key of `Ctrl+C` still shows `Ctrl+C`), so this can differ from `keys`.
 * Measuring this set rather than the incoming one keeps the window in sync with
 * its content.
 */
export function displayedKeys(stack: StackItem[], keys: KeyState[]): KeyState[] {
  const top = stack.at(-1);
  return top && containsAll(top, keys) ? top.keys : keys;
}

/** Recomputes `y` so that cards stack upwards from the bottom edge. */
function layout(items: StackItem[], screenHeight: number): StackItem[] {
  let offset = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    const { h } = items[i];
    items[i] = { ...items[i], y: screenHeight - h - SCREEN_MARGIN - offset };
    offset += h + KEY_PADDING_PX * 2;
  }
  return items;
}

/**
 * Adds `keys` to the stack.
 *
 * When the newest card already contains them, that card is refreshed in place
 * (keeping its window, which avoids a re-render flicker) and its repeat counter
 * is set to `repeat`. Its geometry is refreshed from `size` because the counter
 * badge changes the width. Otherwise a new card is created and the oldest one is
 * dropped once the limit is exceeded.
 */
export function pushItem(
  stack: StackItem[],
  keys: KeyState[],
  repeat: number,
  keyMap: KeyMap,
  size: Size,
  point: Point,
  screenHeight: number,
  now: number,
  createId: () => number,
): StackItem[] {
  const items = stack.slice();
  const top = items.at(-1);

  if (top && containsAll(top, keys)) {
    items[items.length - 1] = {
      ...top,
      ...size,
      ts: now,
      repeat,
      keys: top.keys.map((k) => ({ ...k, press: Boolean(keyMap[k.key]) })),
    };
  } else {
    items.push({
      ...size,
      ...point,
      ts: now,
      repeat,
      id: createId(),
      keys: keys.map((k) => ({ ...k })),
    });
  }

  while (items.length > MAX_CARDS) items.shift();
  return layout(items, screenHeight);
}

/**
 * Refreshes the pressed state of the newest card and keeps it alive while a
 * mouse button is held down. Returns the input array when nothing changed so
 * that reactive consumers are not woken up needlessly.
 */
export function refreshNewest(stack: StackItem[], keyMap: KeyMap, now: number): StackItem[] {
  const top = stack.at(-1);
  if (!top) return stack;

  let changed = false;
  const keys = top.keys.map((k) => {
    const press = MOMENTARY_KEYS.has(k.key) ? false : Boolean(keyMap[k.key]);
    if (press === k.press) return k;
    changed = true;
    return { ...k, press };
  });

  const held = keys.some((k) => HOLD_KEYS.has(k.key) && k.press);
  if (!changed && !held) return stack;

  const items = stack.slice();
  items[items.length - 1] = { ...top, keys, ts: held ? now : top.ts };
  return items;
}

/**
 * Drops the oldest card once it has outlived {@link CARD_LIFETIME_MS}. Returns
 * the input array when nothing expired.
 */
export function expireOldest(stack: StackItem[], now: number): StackItem[] {
  const index = stack.findIndex((item) => item.ts + CARD_LIFETIME_MS < now);
  if (index === -1) return stack;

  const items = stack.slice();
  items.splice(index, 1);
  return items;
}

/** A card to show together with the overlay window that should display it. */
export type WindowAssignment = {
  label: string;
  item: StackItem;
  noColor: boolean;
}; /** How the current cards map onto the available overlay windows. */
export type WindowPlan = {
  /** Cards to show or update, oldest first. */
  show: WindowAssignment[];
  /** Labels of overlay windows that are no longer needed. */
  hide: string[];
  /** Item id -> window label, to be fed back into the next call. */
  assigned: Record<string, string>;
};

export type PlanOptions = {
  /**
   * Dev mode shows every overlay window in stack order, so a window that
   * misbehaves can still be inspected.
   */
  dev?: boolean;
};

/**
 * Matches cards to overlay windows. A card keeps its previous window whenever
 * possible so the webview is not asked to re-render, which flickers.
 */
export function planWindows(
  items: StackItem[],
  labels: readonly string[],
  previous: Record<string, string>,
  options: PlanOptions = {},
): WindowPlan {
  if (options.dev) return planDevWindows(items, labels);

  const ids = items.map(itemId);
  const used = new Set<string>();
  const free: string[] = [];

  for (const label of labels) {
    if (ids.some((id) => previous[id] === label)) used.add(label);
    else free.push(label);
  }

  const show: WindowAssignment[] = [];
  const assigned: Record<string, string> = {};

  for (let i = 0; i < items.length; i++) {
    const id = ids[i];
    const prev = previous[id];
    const label = prev !== undefined && used.has(prev) ? prev : free.shift();
    if (label === undefined) continue;

    assigned[id] = label;
    show.push({ label, item: items[i], noColor: i < items.length - 1 });
  }

  return { show, hide: free, assigned };
}

/**
 * Pairs cards with windows by index, which keeps the layout predictable. Cards
 * beyond the window count are dropped, and windows without a card are still
 * reported in `hide` so the caller can clear but keep them visible.
 */
function planDevWindows(items: StackItem[], labels: readonly string[]): WindowPlan {
  const count = Math.min(items.length, labels.length);
  const show: WindowAssignment[] = [];
  const assigned: Record<string, string> = {};

  for (let i = 0; i < count; i++) {
    assigned[itemId(items[i])] = labels[i];
    show.push({ label: labels[i], item: items[i], noColor: i < items.length - 1 });
  }

  return { show, hide: labels.slice(count), assigned };
}

import type { InputEvent, KeyMap, KeyState } from "../types";

/** Exact `rdev` key name -> label shown on screen. */
const KEY_ALIASES: Readonly<Record<string, string>> = {
  Left: "LeftClick",
  Right: "RightClick",
  Middle: "WheelClick",
  BackQuote: "`",
  BackSlash: "/",
  Slash: "\\",
  Comma: ",",
  Dot: ".",
  KpDelete: ".",
  SemiColon: ";",
  Return: "Enter",
  Quote: "'",
  LeftBracket: "[",
  RightBracket: "]",
  Minus: "-",
  KpMinus: "-",
  Equal: "=",
  KpPlus: "+",
  KpMultiply: "*",
  KpDivide: "/",
  Lock: "NumLock",
  AltGr: "Alt",
};

/** Prefix -> replacement, applied in order when no exact alias matches. */
const PREFIX_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["Shift", "Shift"],
  ["Control", "Ctrl"],
  ["Key", ""], // KeyA -> A
  ["Num", ""], // Num5 -> 5
  ["Meta", "Win"],
  ["Kp", ""], // Kp1 -> 1
];

/** Keys that never stay highlighted, the wheel is momentary. */
export const MOMENTARY_KEYS: ReadonlySet<string> = new Set(["WheelUp", "WheelDown"]);

/** Keys that keep their card alive while held down. */
export const HOLD_KEYS: ReadonlySet<string> = new Set(["LeftClick", "RightClick", "WheelClick"]);

/** Converts a raw `rdev` key name into the label shown on screen. */
export function toDisplayKey(raw: string): string {
  const alias = KEY_ALIASES[raw];
  if (alias !== undefined) return alias;

  for (const [prefix, replacement] of PREFIX_ALIASES) {
    if (raw.startsWith(prefix)) return replacement + raw.slice(prefix.length);
  }
  if (raw.endsWith("Arrow")) return raw.slice(0, -5);
  return raw;
}

/** Sort weight: modifiers first, then mouse buttons, then the rest. */
export function keyWeight(key: string): number {
  if (key.startsWith("Ctrl")) return 100;
  if (key.startsWith("Shift")) return 90;
  if (key.endsWith("Alt")) return 60;
  if (key.endsWith("Win")) return 60;
  if (key.endsWith("Click")) return 50;
  if (key.endsWith("Wheel")) return 30;
  return 10;
}

/** Folds a new global input event into the pressed-key map. */
export function applyInputEvent(keyMap: KeyMap, event: InputEvent): KeyMap {
  const { ButtonPress, ButtonRelease, KeyPress, KeyRelease, Wheel } = event.event_type;
  // The wheel is momentary, so it is cleared on every event.
  const next: KeyMap = { ...keyMap, WheelUp: false, WheelDown: false };

  if (ButtonPress) next[toDisplayKey(ButtonPress)] = true;
  else if (ButtonRelease) next[toDisplayKey(ButtonRelease)] = false;
  else if (KeyPress) next[toDisplayKey(KeyPress)] = true;
  else if (KeyRelease) next[toDisplayKey(KeyRelease)] = false;
  else if (Wheel) {
    next.WheelUp = Wheel.delta_y >= 0;
    next.WheelDown = Wheel.delta_y < 0;
  }

  return next;
}

/** Pressed keys, ordered so modifiers appear first. */
export function pressedKeys(keyMap: KeyMap): KeyState[] {
  const keys: KeyState[] = [];
  for (const [key, press] of Object.entries(keyMap)) {
    if (press) keys.push({ key, press: true });
  }
  return keys.sort((a, b) => keyWeight(b.key) - keyWeight(a.key));
}

/**
 * Whether a `KeyPress` event is the operating system repeating a key that is
 * already down rather than a fresh press.
 *
 * Auto-repeat would otherwise be counted as a repeated press, so holding a key
 * would inflate the repeat count. Mouse buttons and the wheel are never
 * auto-repeated.
 */
export function isAutoRepeat(keyMap: KeyMap, event: InputEvent): boolean {
  const key = event.event_type.KeyPress;
  return key !== undefined && keyMap[toDisplayKey(key)] === true;
}

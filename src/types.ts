/** A single key together with its current pressed state. */
export type KeyState = { key: string; press: boolean };

/** Display key -> pressed. */
export type KeyMap = Record<string, boolean>;

/** One card on screen: geometry, content and lifetime bookkeeping. */
export type StackItem = {
  x: number;
  y: number;
  w: number;
  h: number;
  keys: KeyState[];
  /** Timestamp of the last update, used for expiration. */
  ts: number;
  /** Monotonic id, used to build a stable event identity for the card. */
  id: number;
};

/** Payload emitted by the Rust side for every global input event. */
export type InputEvent = {
  event_type: {
    ButtonPress?: string;
    ButtonRelease?: string;
    KeyPress?: string;
    KeyRelease?: string;
    Wheel?: { delta_x: number; delta_y: number };
  };
};

/** Payload sent from the controller to an overlay window. */
export type UpdateEvent = {
  label: string;
  item: StackItem;
  noColor: boolean;
};

/** Payload sent to an overlay window when it should clear itself. */
export type HideEvent = { label: string };

export type StackItem = {
  x: number;
  y: number;
  w: number;
  h: number;
  keys: { key: string; press: boolean; isGamepad?: boolean; isIconButton?: boolean }[];
  ts: number;
  id: number;
  leftStick?: StickState;
  rightStick?: StickState;
};

export type InputEvent = {
  event_type: {
    ButtonPress?: string;
    ButtonRelease?: string;
    KeyPress?: string;
    KeyRelease?: string;
    Wheel?: { delta_x: number; delta_y: number };
  };
};

export type UpdateEvent = {
  item: StackItem;
  label: string;
  noColor: boolean;
};

export type AxisMotion = {
  axis: string;
  value: number;
};

export type PadEvent = {
  event_type: {
    button_press?: string;
    button_release?: string;
    axis_motion?: AxisMotion;
  };
};

// Gamepad stick state for visualization
export type StickState = {
  x: number;
  y: number;
  pressed: boolean; // stick button pressed
};

export type GamepadState = {
  buttons: Record<string, boolean>;
  leftStick: StickState;
  rightStick: StickState;
};

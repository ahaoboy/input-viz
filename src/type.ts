export type StackItem = {
  x: number;
  y: number;
  w: number;
  h: number;
  keys: { key: string; press: boolean }[];
  ts: number;
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

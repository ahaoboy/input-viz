import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { listen } from "@tauri-apps/api/event";
import {
  getAllWindows,
  getCurrentWindow,
  Monitor,
  PhysicalPosition,
  PhysicalSize,
  primaryMonitor,
  Window,
} from "@tauri-apps/api/window";
import {
  Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
} from "solid-js";
import { InputEvent, StackItem, UpdateEvent, PadEvent, GamepadState, StickState } from "./type";

const BOTTOM_MARGIN = 200;
const STACK_MAX_SIZE = 6;
const CHECK_INV = 200;
const MAX_LIVE_TIME = 3000;
const REMOVE_INV = 1000;
const FONT_SIZE = 24;
const EVENT_ITEM_PADDING = 12;

function getKey(s: string): string {
  const map: Record<string, string> = {
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
  if (map[s]) return map[s];
  if (s.startsWith("Shift")) return "Shift";
  if (s.startsWith("Control")) return "Ctrl";
  if (s.startsWith("Key")) return s.slice(3);
  if (s.startsWith("Num")) return s.slice(3);
  if (s.endsWith("Arrow")) return s.slice(0, -5);
  if (s.startsWith("Meta")) return "Win";
  if (s.startsWith("Kp")) return s.slice(2);
  return s;
}

function sortBy(s: string) {
  if (s.startsWith("Ctrl")) return 100;
  if (s.startsWith("Shift")) return 90;
  if (s.endsWith("Alt")) return 60;
  if (s.endsWith("Win")) return 60;
  if (s.endsWith("Click")) return 50;
  if (s.endsWith("Wheel")) return 30;
  if (Number.isInteger(s)) return 20;
  return 10;
}

function EventItem(
  { id, keys, noColor }: {
    noColor?: Accessor<boolean>;
    id: string;
    keys: Accessor<StackItem["keys"]>;
  },
) {
  return (
    <div
      class={`event-item`}
      id={id}
      style={{
        "font-size": `${FONT_SIZE}px`,
      }}
    >
      <For each={keys()}>
        {({ key, press, isGamepad, isIconButton }) => (
          <div
            class={`event-text ${(press && !noColor?.()) ? "event-text-press" : ""} ${isGamepad ? "gamepad-button" : ""} ${isIconButton ? "gamepad-icon-button" : ""}`}
            style={{
              padding: `${EVENT_ITEM_PADDING}px`,
            }}
          >
            {key}
          </div>
        )}
      </For>
    </div>
  );
}
const MEASURE_TEXT_ID = "MEASURE_TEXT_ID";

// Stick indicator component for visualizing analog stick position
const STICK_SIZE = 48;
const STICK_DOT_SIZE = 12;

function StickIndicator(
  { stick, color, noColor }: {
    stick: Accessor<StickState>;
    color: string;
    noColor?: Accessor<boolean>;
  },
) {
  const dotX = () => (stick().x * (STICK_SIZE / 2 - STICK_DOT_SIZE / 2));
  const dotY = () => (stick().y * (STICK_SIZE / 2 - STICK_DOT_SIZE / 2));
  const isPressed = () => stick().pressed;
  const isActive = () => Math.abs(stick().x) > 0.01 || Math.abs(stick().y) > 0.01 || isPressed();

  return (
    <div
      class="stick-indicator"
      style={{
        width: `${STICK_SIZE}px`,
        height: `${STICK_SIZE}px`,
        "border-color": noColor?.() ? "white" : color,
        display: isActive() ? "flex" : "none",
      }}
    >
      <div
        class="stick-dot"
        style={{
          width: `${STICK_DOT_SIZE}px`,
          height: `${STICK_DOT_SIZE}px`,
          transform: `translate(${dotX()}px, ${dotY()}px)`,
          "background-color": (isPressed() && !noColor?.()) ? "red" : (noColor?.() ? "white" : color),
        }}
      />
    </div>
  );
}

function KeyCard() {
  const [keys, setKeys] = createSignal<StackItem["keys"]>([]);
  const [noColor, setNoColor] = createSignal(true);
  const [leftStick, setLeftStick] = createSignal<StickState>({ x: 0, y: 0, pressed: false });
  const [rightStick, setRightStick] = createSignal<StickState>({ x: 0, y: 0, pressed: false });
  const [hasStickData, setHasStickData] = createSignal(false);

  onMount(async () => {
    const win = getCurrentWindow();
    const hideHandle = await listen<UpdateEvent>("hide", (e) => {
      if (e.payload.label !== win.label) {
        return;
      }
      setKeys([]);
      setNoColor(true);
      setLeftStick({ x: 0, y: 0, pressed: false });
      setRightStick({ x: 0, y: 0, pressed: false });
      setHasStickData(false);
    });
    const updateHandle = await listen<UpdateEvent>("update", (e) => {
      if (e.payload.label !== win.label) {
        return;
      }
      const item = e.payload.item;
      setKeys(item.keys);
      setNoColor(e.payload.noColor);
      if (item.leftStick) {
        setLeftStick(item.leftStick);
        setHasStickData(true);
      }
      if (item.rightStick) {
        setRightStick(item.rightStick);
        setHasStickData(true);
      }
    });

    onCleanup(() => {
      hideHandle();
      updateHandle();
    });
  });
  return (
    <div class="key-card-container">
      {hasStickData() && <StickIndicator stick={leftStick} color="#4CAF50" noColor={noColor} />}
      <EventItem id="key-card" keys={keys} noColor={noColor} />
      {hasStickData() && <StickIndicator stick={rightStick} color="#2196F3" noColor={noColor} />}
    </div>
  );
}

function App() {
  if (window.location.hash.length > 0) {
    return <KeyCard />;
  }

  const [keyMap, setKeyMap] = createSignal<Record<string, boolean>>({});
  const [gamepadState, setGamepadState] = createSignal<GamepadState>({
    buttons: {},
    leftStick: { x: 0, y: 0, pressed: false },
    rightStick: { x: 0, y: 0, pressed: false },
  });
  const [stack, setStack] = createSignal<StackItem[]>([]);
  const [keys, setKeys] = createSignal<StackItem["keys"]>([]);
  const [hideUI, setHideUI] = createSignal(false);
  const allWindows: Window[] = [];

  let keyId = 0;

  const keyMapString = createMemo(() => {
    const v: StackItem["keys"] = [];
    for (const [key, press] of Object.entries(keyMap())) {
      if (press) v.push({ key, press });
    }
    return v.sort((a, b) => sortBy(b.key) - sortBy(a.key));
  });

  // Gamepad button display mapping (special symbols for certain buttons)
  const gamepadButtonDisplay: Record<string, string> = {
    Back: "󰹰",      // Xbox back/view button
    Start: "󰹯",     // Xbox start/menu button
    Guide: "󰖹",     // Xbox button
    DPadUp: "󰁝",    // D-Pad up arrow
    DPadDown: "󰁅",  // D-Pad down arrow
    DPadLeft: "󰁍",  // D-Pad left arrow
    DPadRight: "󰁔", // D-Pad right arrow
  };

  // Buttons that use special icon symbols (need larger font)
  const gamepadIconButtons = Object.values(gamepadButtonDisplay);

  // Buttons to ignore in text display (handled visually elsewhere)
  const ignoredGamepadButtons = ["LeftStick", "RightStick"];

  // Gamepad button map to display string (with circle indicator)
  const gamepadKeyMapString = createMemo(() => {
    const v: StackItem["keys"] = [];
    const state = gamepadState();
    for (const [key, press] of Object.entries(state.buttons)) {
      // Skip stick buttons (shown via stick indicator)
      if (ignoredGamepadButtons.includes(key)) continue;
      if (press) {
        const displayKey = gamepadButtonDisplay[key] || key;
        const isIconButton = gamepadIconButtons.includes(displayKey);
        v.push({ key: displayKey, press, isGamepad: true, isIconButton });
      }
    }
    return v;
  });

  // Update gamepad state from PadEvent
  const updateGamepadState = (e: PadEvent) => {
    console.log("updateGamepadState ", e);
    const state = { ...gamepadState() };
    const eventType = e.event_type;

    if (eventType.button_press) {
      state.buttons = { ...state.buttons, [eventType.button_press]: true };
    } else if (eventType.button_release) {
      state.buttons = { ...state.buttons, [eventType.button_release]: false };
    } else if (eventType.axis_motion) {
      const { axis, value } = eventType.axis_motion;

      // Handle triggers as buttons (non-zero = pressed)
      if (axis === "LT" || axis === "RT") {
        state.buttons = { ...state.buttons, [axis]: value > 0.1 };
      }
      // Handle stick axes
      else if (axis === "LeftX") {
        state.leftStick = { ...state.leftStick, x: value };
      } else if (axis === "LeftY") {
        state.leftStick = { ...state.leftStick, y: value };
      } else if (axis === "RightX") {
        state.rightStick = { ...state.rightStick, x: value };
      } else if (axis === "RightY") {
        state.rightStick = { ...state.rightStick, y: value };
      }
    }

    // Handle stick button press state
    if (eventType.button_press === "LeftStick") {
      state.leftStick = { ...state.leftStick, pressed: true };
    } else if (eventType.button_release === "LeftStick") {
      state.leftStick = { ...state.leftStick, pressed: false };
    } else if (eventType.button_press === "RightStick") {
      state.rightStick = { ...state.rightStick, pressed: true };
    } else if (eventType.button_release === "RightStick") {
      state.rightStick = { ...state.rightStick, pressed: false };
    }
    console.log("updateGamepadState state", state);

    setGamepadState(state);
  };

  const updateKeyMap = (e: InputEvent) => {
    const km = { ...keyMap() };
    km["WheelUp"] = false;
    km["WheelDown"] = false;
    if (e.event_type.ButtonPress) {
      km[getKey(e.event_type.ButtonPress)] = true;
    } else if (e.event_type.ButtonRelease) {
      km[getKey(e.event_type.ButtonRelease)] = false;
    } else if (e.event_type.KeyPress) {
      km[getKey(e.event_type.KeyPress)] = true;
    } else if (e.event_type.KeyRelease) {
      km[getKey(e.event_type.KeyRelease)] = false;
    } else if (e.event_type.Wheel) {
      km["WheelUp"] = e.event_type.Wheel.delta_y >= 0;
      km["WheelDown"] = e.event_type.Wheel.delta_y < 0;
    }
    setKeyMap(km);
  };

  const push = async (keys: StackItem["keys"], isGamepad = false) => {
    const v = stack();
    const km = keyMap();
    const gp = gamepadState();
    const now = Date.now();
    const top = v.at(-1);
    const monitor = await primaryMonitor();
    const size = getSize(monitor?.scaleFactor);
    const pos = getPosition(monitor, size);

    // Include stick data for gamepad events
    const stickData = isGamepad ? {
      leftStick: { ...gp.leftStick },
      rightStick: { ...gp.rightStick },
    } : {};

    if (!top) {
      v.push({ ...size, ...pos, ts: now, keys, id: keyId++, ...stickData });
    } else {
      const topStr = top.keys.map((i) => i.key).join(" ");
      // Compare both key name AND isGamepad flag to distinguish keyboard vs gamepad inputs
      const keysMatch = topStr === keys.map((i) => i.key).join(" ") &&
        top.keys.every((i) => keys.find((k) => k.key === i.key && !!k.isGamepad === !!i.isGamepad));
      const isSubset = keys.every(({ key, isGamepad: isGp }) =>
        top.keys.find((i) => i.key === key && !!i.isGamepad === !!isGp)
      );

      if (keysMatch || isSubset) {
        top.ts = Date.now();
        for (const i of top.keys) {
          i.press = i.isGamepad ? gp.buttons[i.key] : km[i.key];
        }
        // Update stick data
        if (isGamepad) {
          top.leftStick = { ...gp.leftStick };
          top.rightStick = { ...gp.rightStick };
        }
      } else {
        v.push({ ...size, ...pos, ts: now, keys, id: keyId++, ...stickData });
      }
    }

    while (v.length > STACK_MAX_SIZE) v.shift();

    let offsetY = 0;
    const winH = monitor?.size.height || 0;
    for (let i = v.length - 1; i >= 0; i--) {
      const item = v[i];
      item.y = winH - item.h - BOTTOM_MARGIN - offsetY;
      offsetY += item.h + EVENT_ITEM_PADDING * 2;
    }
    setStack([...v]);
  };

  const initWindows = async () => {
    const windows = await getAllWindows();
    const v = new Array(STACK_MAX_SIZE).fill(0).map((_, k) => k).filter((
      i,
    ) => !windows.find((w) => w.label === i.toString()));
    await Promise.all(
      v.map((i) => invoke("create_window", { label: i.toString() })),
    );

    for (const i of await getAllWindows()) {
      allWindows.push(i);
    }
  };

  function remove(v: StackItem[]): StackItem[] {
    const now = Date.now();
    const list = [...v];
    const index = list.findIndex((i) => (i.ts + MAX_LIVE_TIME) < now);
    if (index !== -1) {
      list.splice(index, 1);
    }
    return list;
  }

  function check(v: StackItem[]): StackItem[] {
    const list = [...v];
    const top = list.at(-1);
    if (top) {
      const km = keyMap();
      const gp = gamepadState();
      for (const i of top.keys) {
        if (i.isGamepad) {
          i.press = gp.buttons[i.key];
        } else {
          i.press = ["WheelDown", "WheelUp"].includes(i.key) ? false : km[i.key];
        }
        if (
          ["LeftClick", "RightClick", "WheelClick"].includes(i.key) && km[i.key]
        ) {
          top.ts = Date.now();
        }
      }
      // Update stick data if present
      if (top.leftStick || top.rightStick) {
        top.leftStick = { ...gp.leftStick };
        top.rightStick = { ...gp.rightStick };
      }
    }
    return list;
  }

  onMount(async () => {
    await initWindows();
    const inputHandle = await listen<InputEvent>("input-event", (event) => {
      console.log("input event", event.payload);
      updateKeyMap(event.payload);
      const keys = keyMapString();
      if (keys.length) {
        setKeys(keys);
        push(keys);
      }
    });

    const gamepadHandle = await listen<PadEvent>("gamepad-event", (event) => {
      console.log("gamepad event", event.payload);
      updateGamepadState(event.payload);
      const keys = gamepadKeyMapString();
      const gp = gamepadState();
      // Check if there's any active input (buttons or stick movement)
      const hasStickMovement =
        Math.abs(gp.leftStick.x) > 0.1 ||
        Math.abs(gp.leftStick.y) > 0.1 ||
        Math.abs(gp.rightStick.x) > 0.1 ||
        Math.abs(gp.rightStick.y) > 0.1;

      if (keys.length || hasStickMovement) {
        setKeys(keys);
        push(keys, true);
      }
    });

    const hideHandle = await listen<UpdateEvent>("hide-ui", () => {
      setHideUI(true);
    });

    const showHanlde = await listen<UpdateEvent>("show-ui", () => {
      setHideUI(false);
    });

    const handleCheck = setInterval(() => {
      setStack(check(stack()));
    }, CHECK_INV);
    const handleRemove = setInterval(() => {
      setStack(remove(stack()));
    }, REMOVE_INV);
    onCleanup(() => {
      clearInterval(handleCheck);
      clearInterval(handleRemove);
      inputHandle();
      gamepadHandle();
      hideHandle();
      showHanlde();
    });
  });

  const getSize = (scale = 1): { w: number; h: number } => {
    const rect = document.getElementById(MEASURE_TEXT_ID)
      ?.getBoundingClientRect();
    if (!rect) {
      return { w: 0, h: 0 };
    }
    return {
      w: ((rect.width) * scale) | 0,
      h: ((rect.height) * scale) | 0,
    };
  };

  const getPosition = (
    monitor: Monitor | null,
    { w, h }: { w: number; h: number },
  ): { x: number; y: number } => {
    if (!monitor) {
      return { x: 0, y: 0 };
    }
    const x = monitor.size.width - w - BOTTOM_MARGIN;
    const y = monitor.size.height - h - BOTTOM_MARGIN;
    return { x, y };
  };

  const getItemId = (item: StackItem) => {
    return [item.keys.map((i) => i.key).join("_"), item.ts, item.id].join("-");
  };

  let windowForItem: Record<string, string> = {};
  createEffect(() => {
    const v = stack();
    if (hideUI()) {
      return;
    }
    if (allWindows.length < STACK_MAX_SIZE + 1) {
      return;
    }
    const windowLables = new Array(STACK_MAX_SIZE).fill(0).map((_, k) =>
      k.toString()
    );
    const newWindowForItem: Record<string, string> = {};
    const itemIdList = v.map((i) => getItemId(i));
    const freeWindowList: string[] = [];
    const reuseWindowList: string[] = [];
    const isReuse = (label: string): boolean => {
      for (const itemId of itemIdList) {
        if (windowForItem[itemId] === label) {
          return true;
        }
      }
      return false;
    };

    for (const label of windowLables) {
      if (isReuse(label)) {
        reuseWindowList.push(label);
      } else {
        freeWindowList.push(label);
      }
    }

    const getLabelById = (itemId: string) => {
      const label = windowForItem[itemId];
      if (label !== undefined && reuseWindowList.includes(label)) {
        return label;
      }
      return freeWindowList.shift();
    };

    for (let i = 0; i < v.length; i++) {
      const item = v[i];
      const itemId = getItemId(item);
      const label = getLabelById(itemId);
      const win = allWindows.find((win) => win.label === label);
      if (!win || !label) {
        continue;
      }
      const noColor = i < v.length - 1;
      win.emitTo(i.toString(), "update", { label, item, noColor });
      win.setSize(new PhysicalSize(item.w, item.h));
      win.setPosition(new PhysicalPosition(item.x, item.y));
      win.show();
      newWindowForItem[itemId] = label!;
    }

    for (const label of freeWindowList) {
      const win = allWindows.find((win) => win.label === label);
      if (!win) {
        continue;
      }
      win.hide();
      win.emitTo(label, "hide", { label });
    }

    windowForItem = newWindowForItem;

    //Ideally, the simplest way would be used, but unfortunately, this implementation will flicker
    // so we can only reuse the same text as much as possible to reduce re-rendering.
    // for (let i = 0; i < STACK_MAX_SIZE; i++) {
    //   const label = i.toString()
    //   const item = v[i]
    //   const win = allWindows.find((win) => win.label === label)!;
    //   if (item) {
    //     const noColor = i < v.length - 1;
    //     win.emitTo(i.toString(), "update", { label, item, noColor });
    //     win.setSize(new PhysicalSize(item.w, item.h));
    //     win.setPosition(new PhysicalPosition(item.x, item.y));
    //     win.show();
    //   } else {
    //     win.hide();
    //     win.emitTo(label, "hide", { label });
    //   }
    // }
  });

  return <EventItem id={MEASURE_TEXT_ID} keys={keys} />;
}

export default App;

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
} from "@tauri-apps/api/window";
import {
  Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  onMount,
} from "solid-js";
import { InputEvent, StackItem, UpdateEvent } from "./type";

const BOTTOM_MARGIN = 200;
const STACK_MAX_SIZE = 6;
const CHECK_INV = 2000;
const MAX_LIVE_TIME = 3000;
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
  { id, keys }: { id: string; keys: Accessor<StackItem["keys"]> },
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
        {({ key, press }) => (
          <div
            class={`event-text ${press ? "event-text-press" : ""}`}
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

function KeyCard() {
  const [keys, setKeys] = createSignal<StackItem["keys"]>([]);
  const [hide, setHide] = createSignal(false);
  onMount(async () => {
    const win = getCurrentWindow();
    listen<UpdateEvent>("hide", () => {
      setHide(true);
    });
    listen<UpdateEvent>("update", (e) => {
      setHide(false);
      if (e.payload.id !== win.label) {
        return;
      }
      const item = e.payload.item;
      setKeys(item.keys);
    });
  });
  return !hide() && <EventItem id="key-card" keys={keys} />;
}

function App() {
  if (window.location.hash.length > 0) {
    return <KeyCard />;
  }

  const [keyMap, setKeyMap] = createSignal<Record<string, boolean>>({});
  const [stack, setStack] = createSignal<StackItem[]>([]);
  const [keys, setKeys] = createSignal<StackItem["keys"]>([]);

  const keyMapString = createMemo(() => {
    const v: StackItem["keys"] = [];
    for (const [key, press] of Object.entries(keyMap())) {
      if (press) v.push({ key, press });
    }
    return v.sort((a, b) => sortBy(b.key) - sortBy(a.key));
  });

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

  const push = async (keys: StackItem["keys"]) => {
    let v = stack();
    const km = keyMap();
    const now = Date.now();
    v = v.filter((item) => item.ts + MAX_LIVE_TIME > now);
    for (let i = 0; i < v.length; i++) {
      for (const k of v[i].keys) {
        k.press = false;
      }
    }
    const top = v.at(-1);
    const monitor = await primaryMonitor();
    const size = getSize(monitor?.scaleFactor);
    const pos = getPosition(monitor, size);
    if (!top) {
      v.push({ ...size, ...pos, ts: now, keys });
    } else {
      const topStr = top.keys.map((i) => i.key).join(" ");
      if (
        topStr === keys.map((i) => i.key).join(" ") ||
        keys.every(({ key }) => top.keys.find((i) => i.key === key))
      ) {
        top.ts = Date.now();
        for (const i of top.keys) {
          i.press = km[i.key];
        }
      } else {
        v.push({ ...size, ...pos, ts: now, keys });
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
    const v = new Array(STACK_MAX_SIZE).fill(0).map((_, k) => k).filter((i) =>
      !windows.find((w) => w.label === i.toString())
    );
    return Promise.all(
      v.map((i) => invoke("create_window", { label: i.toString() })),
    );
  };

  onMount(async () => {
    await initWindows();
    listen<InputEvent>("input-event", async (event) => {
      updateKeyMap(event.payload);
      const keys = keyMapString();
      if (keys.length) {
        setKeys(keys);
        push(keys);
      }
    });
    const handle = setInterval(async () => {
      let v = stack();
      const now = Date.now();
      v = v.filter((i) => (i.ts + MAX_LIVE_TIME) > now);
      setStack([...v]);
    }, CHECK_INV);
    return () => clearInterval(handle);
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

  createEffect(async () => {
    const v = stack();
    const windows = await getAllWindows();
    for (let i = 0; i < STACK_MAX_SIZE; i++) {
      const item = v[i];
      const id = i.toString();
      const win = windows.find((win) => win.label === id);
      if (!win) {
        continue;
      }
      if (item) {
        // update text first
        await win.emitTo(i.toString(), "update", { id, item });
        // change size and position at same time
        win.setPosition(new PhysicalPosition(item.x, item.y));
        win.setSize(new PhysicalSize(item.w, item.h));
        win.show();
      } else {
        win.emitTo(i.toString(), "hide", { id });
        win.setPosition(new PhysicalPosition(1000_000, 1000_000));
        win.hide();
      }
    }
  });

  return <EventItem id={MEASURE_TEXT_ID} keys={keys} />;
}

export default App;

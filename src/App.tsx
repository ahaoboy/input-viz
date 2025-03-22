import "./App.css";
import { listen } from "@tauri-apps/api/event";
import {
  getCurrentWindow,
  PhysicalPosition,
  PhysicalSize,
  primaryMonitor,
} from "@tauri-apps/api/window";
import { createMemo, createSignal, For, onMount } from "solid-js";

type InputEvent = {
  event_type: {
    ButtonPress?: string;
    ButtonRelease?: string;
    KeyPress?: string;
    KeyRelease?: string;
    Wheel?: { delta_x: number; delta_y: number };
  };
};

const BOTTOM_MARGIN = 200;
const STACK_MAX_SIZE = 6;
const CHECK_INV = 100;
const MAX_LIVE_TIME = 3000;
const FONT_SIZE = 24;
const EVENT_ITEM_PADDING = 12;
const EVENT_ITEM_MARGIN = 12;
const BORDER_SIZE = 2;
// const BORDER_COLOR = "";
// const TRANSPARENT_COLOR = "";

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

type StackItem = { key: string; ts: number };

function App() {
  let stackDomRef!: HTMLDivElement;
  const [keyMap, setKeyMap] = createSignal<Record<string, boolean>>({});
  const [stack, setStack] = createSignal<StackItem[]>([]);

  const keyMapString = createMemo(() => {
    const v: string[] = [];
    for (const [a, b] of Object.entries(keyMap())) {
      if (b) v.push(a);
    }
    return v.sort((a, b) => sortBy(b) - sortBy(a)).join(" ");
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

  const push = (key: string) => {
    let v = stack();
    const now = Date.now();
    v = v.filter((item) => item.ts + MAX_LIVE_TIME >= now);
    while (v.length >= STACK_MAX_SIZE) v.shift();
    const top = v.at(-1);
    if (!top) {
      v.push({ ts: Date.now(), key });
    } else if (
      top.key !== key &&
      key.split(" ").some((k) => !top.key.split(" ").includes(k))
    ) {
      // remove duplicate keys
      v = v.filter((i) => i.key !== key);
      v.push({ ts: Date.now(), key });
    } else {
      top.ts = Date.now();
    }
    setStack([...v]);
    updateWindow();
  };

  onMount(() => {
    hide();
    listen<InputEvent>("input-event", (event) => {
      updateKeyMap(event.payload);
      const key = keyMapString();
      if (key.length) push(key);
    });

    const handle = setInterval(async () => {
      let v = stack();
      const now = Date.now();
      const len = v.length;
      v = v.filter((i) => (i.ts + MAX_LIVE_TIME) >= now);
      if (!len) {
        hide();
      }
      setStack([...v]);
      await updateWindow();
    }, CHECK_INV);
    return () => clearInterval(handle);
  });

  const getSize = async (scale = 1): Promise<{ w: number; h: number }> => {
    const rect = stackDomRef?.getBoundingClientRect();
    if (!rect) {
      return { w: 0, h: 0 };
    }
    return {
      w: ((rect.width + BORDER_SIZE * 2) * scale) | 0,
      h: ((rect.height + BORDER_SIZE * 2) * scale) | 0,
    };
  };

  const updateWindow = async () => {
    const win = getCurrentWindow();
    const mon = await primaryMonitor();
    if (mon) {
      const { w, h } = await getSize(mon.scaleFactor);
      const size = new PhysicalSize(w, h);
      await win.setSize(size);
      const pos = new PhysicalPosition({
        x: mon.size.width - BOTTOM_MARGIN - w,
        y: mon.size.height - BOTTOM_MARGIN - h,
      });
      await win.setPosition(pos);
    }
  };

  const hide = async () => {
    const win = getCurrentWindow();
    const mon = await primaryMonitor();
    if (mon) {
      const pos = new PhysicalPosition({
        x: mon.size.width * 2,
        y: mon.size.height * 2,
      });
      await win.setPosition(pos);
    }
  };

  return (
    <main
      class="container"
      style={{
        opacity: (stack().length) ? "100%" : "0%",
        "border-width": `${BORDER_SIZE}px`,
      }}
    >
      <div
        ref={stackDomRef}
        class="event-stack"
        style={{ "font-size": `${FONT_SIZE}px` }}
      >
        <For each={stack()}>
          {(item, index) => (
            <div
              class={`event-item animate`}
              style={{
                padding: `${EVENT_ITEM_PADDING}px`,
                margin: `${EVENT_ITEM_MARGIN}px 0`,
              }}
            >
              <For each={item.key.split(" ")}>
                {(key) => (
                  <div
                    class={`event-text ${
                      keyMap()[key] && index() === stack().length - 1
                        ? "event-text-press"
                        : ""
                    }`}
                    style={{
                      padding: `0 ${EVENT_ITEM_PADDING}px`,
                      margin: `${EVENT_ITEM_MARGIN}px 0`,
                    }}
                  >
                    {key}
                  </div>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </main>
  );
}

export default App;

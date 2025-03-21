import "./App.css";
import { useLayoutEffect, useReducer, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  getCurrentWindow,
  PhysicalPosition,
  PhysicalSize,
  primaryMonitor,
} from "@tauri-apps/api/window";

type InputEvent = {
  event_type: {
    ButtonPress?: string;
    ButtonRelease?: string;
    KeyPress?: string;
    KeyRelease?: string;
    Wheel?: {
      delta_x: number;
      delta_y: number;
    };
  };
};

function eventToString(e: InputEvent): string {
  return JSON.stringify(e.event_type);
}

const BAR_HEIGHT = 100;
const PADDING = BAR_HEIGHT / 2;
const STACK_MAX_SIZE = 7;
const CHECK_INV = 500;
const MAX_LIVE_TIME = 3000;

function getKey(s: string): string {
  const map: Record<string, string> = {
    "Left": "LeftClick",
    "Right": "RightClick",
    "Middle": "WheelClick",
    "BackQuote": "`",
    "BackSlash": "/",
    "Slash": "\\",
    "Comma": ",",
    "Dot": ".",
    "KpDelete": ".",
    "SemiColon": ";",
    "Return": "Enter",
    "Quote": "'",
    "LeftBracket": "[",
    "RightBracket": "]",
    "Minus": "-",
    "KpMinus": "-",
    "Equal": "=",
    "KpPlus": "+",
    "KpMultiply": "*",
    "KpDivide": "/",
    "Lock": "NumLock",
  };
  if (map[s]) {
    return map[s];
  }
  if (s.startsWith("Key")) {
    return s.slice(3);
  }
  if (s.startsWith("Num")) {
    return s.slice(3);
  }

  if (s.endsWith("Arrow")) {
    return s.slice(0, -5);
  }
  if (s.startsWith("Meta")) {
    return "Win";
  }

  if (s.startsWith("Kp")) {
    return s.slice(2);
  }

  return s;
}

// ;;;;''[[]\==--098787654432121` ]

function sortBy(s: string) {
  if (s.startsWith("Control")) {
    return 100;
  }
  if (s.endsWith("Click")) {
    return 50;
  }
  if (s.endsWith("Wheel")) {
    return 30;
  }
  if (Number.isInteger(s)) {
    return 20;
  }
  return 10;
}

type StackItem = {
  key: string;
  ts: number;
};
function App() {
  const ref = useRef<HTMLDivElement | null>(null);
  const keyMapRef = useRef<Record<string, boolean>>({});
  const stackRef = useRef<StackItem[]>([]);
  const rerender = useReducer((c) => ++c, 0)[1];

  const updateKeyMap = (e: InputEvent): string | undefined => {
    keyMapRef.current["WheelUp"] = false;
    keyMapRef.current["WheelDown"] = false;
    if (e.event_type.ButtonPress) {
      const key = getKey(e.event_type.ButtonPress);
      keyMapRef.current[key] = true;
      return key;
    } else if (e.event_type.ButtonRelease) {
      const key = getKey(e.event_type.ButtonRelease);
      keyMapRef.current[key] = false;
      return key;
    } else if (e.event_type.KeyPress) {
      const key = getKey(e.event_type.KeyPress);
      keyMapRef.current[key] = true;
      return key;
    } else if (e.event_type.KeyRelease) {
      const key = getKey(e.event_type.KeyRelease);
      keyMapRef.current[key] = false;
      return key;
    } else if (e.event_type.Wheel) {
      if (e.event_type.Wheel.delta_y >= 0) {
        keyMapRef.current["WheelUp"] = true;
        keyMapRef.current["WheelDown"] = false;
        return "WheelUp";
      } else {
        keyMapRef.current["WheelUp"] = false;
        keyMapRef.current["WheelDown"] = true;
        return "WheelDown";
      }
    }
    return;
  };

  const getKeyMapString = () => {
    const v: string[] = [];
    for (const [a, b] of Object.entries(keyMapRef.current)) {
      if (b) {
        v.push(a);
      }
    }
    return v.sort((a, b) => sortBy(b) - sortBy(a)).join(" ");
  };

  const push = (key: string) => {
    while (stackRef.current.length > STACK_MAX_SIZE) {
      stackRef.current.shift();
    }
    const top = stackRef.current.at(-1);
    if (!top) {
      stackRef.current.push({ ts: Date.now(), key });
      return;
    }
    if (top.key !== key) {
      stackRef.current.push({ ts: Date.now(), key });
    }
  };

  useLayoutEffect(() => {
    hide();
    listen<InputEvent>("input-event", async (event) => {
      const s = eventToString(event.payload);
      console.log(event, s);
      updateKeyMap(event.payload);
      const key = getKeyMapString();
      if (key.length) {
        push(key);
        update();
      }
    });
    const handle = setInterval(() => {
      const now = Date.now();
      stackRef.current = stackRef.current.filter((i) =>
        (i.ts + MAX_LIVE_TIME) >= now
      );
      if (!stackRef.current.length) {
        hide();
      }
    }, CHECK_INV);
    return () => clearInterval(handle);
  }, []);

  const update = async () => {
    const win = getCurrentWindow();
    const mon = await primaryMonitor();
    console.log(win, mon, ref.current);
    if (mon && ref.current) {
      const scale = mon.scaleFactor;
      const rect = ref.current.getBoundingClientRect();
      const domW = (rect.width * scale) | 0;
      const domH = (rect.height * scale) | 0;
      console.log(domW, domH);
      const w = mon.size.width;
      const h = mon.size.height;
      const winX = w - PADDING * 4 - domW;
      const winY = h - PADDING * 2 - BAR_HEIGHT - domH;
      const pos = new PhysicalPosition({ x: winX, y: winY });
      win.setPosition(pos);
      const size = new PhysicalSize(domW + PADDING * 2, domH + PADDING * 2);
      win.setSize(size);
      rerender();
    }
  };

  const hide = async () => {
    const win = getCurrentWindow();
    const mon = await primaryMonitor();
    console.log(win, mon, ref.current);
    if (mon && ref.current) {
      const w = mon.size.width;
      const h = mon.size.height;
      const pos = new PhysicalPosition({ x: w * 2, y: h * 2 });
      win.setPosition(pos);
      const size = new PhysicalSize(0, 0);
      win.setSize(size);
      rerender();
    }
  };
  const opacity = stackRef.current.length ? "100%" : "0%";
  return (
    <main className="container" style={{ opacity }}>
      <div ref={ref} className="event-stack">
        {stackRef.current.map((i, k) => (
          <div className="event-text" key={[k, i.key, i.ts].join("-")}>
            {i.key}
          </div>
        ))}
      </div>
    </main>
  );
}

export default App;

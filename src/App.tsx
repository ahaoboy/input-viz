import "./App.css";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  };
};

function eventToString(e: InputEvent): string {
  return JSON.stringify(e.event_type);
}

const BAR_HEIGHT = 100;
const PADDING = BAR_HEIGHT / 2;

function App() {
  const [event, setEvent] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    listen<InputEvent>("input-event", async (event) => {
      const s = eventToString(event.payload);
      console.log(event, s);
      setEvent(s);
    });
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
      console.log("pos", pos);
      win.setPosition(pos);
      const size = new PhysicalSize(domW + PADDING * 2, domH + PADDING * 2);
      win.setSize(size);

      win.setVisibleOnAllWorkspaces(true)
      win.isVisible()
    }
  };
  useEffect(() => {
    update();
  }, [event]);
  return (
    <main className="container">
      <div ref={ref} className="event-text">
        {event}
      </div>
    </main>
  );
}

export default App;

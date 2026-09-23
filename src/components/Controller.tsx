import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  getAllWindows,
  PhysicalPosition,
  PhysicalSize,
  primaryMonitor,
  type Window,
} from "@tauri-apps/api/window";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import {
  DEV_MODE_EVENT,
  HIDE_UI_EVENT,
  MAX_CARDS,
  MEASURE_ELEMENT_ID,
  REFRESH_INTERVAL_MS,
  REMOVE_INTERVAL_MS,
  SHOW_UI_EVENT,
} from "../constants";
import { bottomRightPoint, measureElement } from "../lib/geometry";
import { applyInputEvent, pressedKeys } from "../lib/keymap";
import { createLogger } from "../lib/logger";
import { describeLayout, expireOldest, planWindows, pushItem, refreshNewest } from "../lib/stack";
import type { HideEvent, InputEvent, KeyMap, KeyState, StackItem, UpdateEvent } from "../types";
import { EventItem } from "./EventItem";

/** Labels of the overlay windows the controller may drive. */
const CARD_LABELS = Array.from({ length: MAX_CARDS }, (_, i) => i.toString());

const log = createLogger("controller");

/**
 * Runs in the hidden `main` window. It turns global input events into a stack
 * of cards and drives one transparent overlay window per visible card.
 */
export function Controller() {
  const [keyMap, setKeyMap] = createSignal<KeyMap>({});
  const [stack, setStack] = createSignal<StackItem[]>([]);
  const [measureKeys, setMeasureKeys] = createSignal<KeyState[]>([]);
  const [hidden, setHidden] = createSignal(false);
  const [devMode, setDevMode] = createSignal(false);
  const [ready, setReady] = createSignal(false);

  const windows = new Map<string, Window>();
  /** label -> whether the window is currently visible. */
  const shown = new Map<string, boolean>();
  /** label -> last geometry applied, so unchanged windows are not re-placed. */
  const placed = new Map<string, string>();
  /** Item id -> window label, carried over between renders to reuse windows. */
  let itemWindow: Record<string, string> = {};
  let nextId = 0;

  /** Points one overlay window at the card it should render. */
  const showWindow = (label: string, item: StackItem, noColor: boolean) => {
    const win = windows.get(label);
    if (!win) {
      log.warn("overlay window is not registered", { label });
      return;
    }

    log.debug("show", { label, id: item.id, keys: item.keys.map((k) => k.key), noColor });
    void win.emitTo<UpdateEvent>(label, "update", { label, item, noColor });

    const geometry = `${item.w},${item.h},${item.x},${item.y}`;
    if (placed.get(label) !== geometry) {
      log.debug("move window", { label, x: item.x, y: item.y, w: item.w, h: item.h });
      void win.setSize(new PhysicalSize(item.w, item.h));
      void win.setPosition(new PhysicalPosition(item.x, item.y));
      placed.set(label, geometry);
    }
    if (!shown.get(label)) {
      log.debug("show window", { label });
      void win.show();
      shown.set(label, true);
    }
  };

  /**
   * Clears an overlay window. In dev mode it stays visible with empty content so
   * that every window can be inspected; otherwise it is hidden.
   */
  const clearWindow = (label: string) => {
    const win = windows.get(label);
    if (!win) return;

    log.debug("clear", { label, keepVisible: devMode() });
    void win.emitTo<HideEvent>(label, "hide", { label });
    placed.delete(label);

    if (!devMode() && shown.get(label) !== false) {
      log.debug("hide window", { label });
      void win.hide();
      shown.set(label, false);
    }
  };

  const applyStack = (items: StackItem[]) => {
    const dev = devMode();
    const plan = planWindows(items, CARD_LABELS, itemWindow, { dev });
    log.debug("apply stack", {
      size: items.length,
      dev,
      show: plan.show.map((a) => a.label),
      hide: plan.hide,
      mapping: plan.assigned,
    });
    // Geometry of every card, oldest first, for checking the stack layout.
    log.debug("layout", describeLayout(items));

    for (const { label, item, noColor } of plan.show) showWindow(label, item, noColor);
    for (const label of plan.hide) clearWindow(label);

    itemWindow = plan.assigned;
  };

  const handleInput = async (event: InputEvent) => {
    log.debug("input event", event.event_type);

    const map = applyInputEvent(keyMap(), event);
    setKeyMap(map);

    const keys = pressedKeys(map);
    if (keys.length === 0) return;

    // Render the keys first so the hidden element can be measured below.
    setMeasureKeys(keys);

    const monitor = await primaryMonitor();
    const size = measureElement(MEASURE_ELEMENT_ID, monitor?.scaleFactor);
    const point = monitor ? bottomRightPoint(monitor.size, size) : { x: 0, y: 0 };
    log.debug("measured", {
      keys: keys.map((k) => k.key),
      size,
      anchor: point,
      screen: monitor ? { w: monitor.size.width, h: monitor.size.height } : null,
      scaleFactor: monitor?.scaleFactor,
    });

    setStack((prev) =>
      pushItem(prev, keys, map, size, point, monitor?.size.height ?? 0, Date.now(), () => nextId++),
    );
  };

  onMount(() => {
    let disposed = false;
    const unlisten: Array<() => void> = [];
    const track = (handle: Promise<() => void>) => {
      void handle.then((fn) => (disposed ? fn() : unlisten.push(fn)));
    };

    const initWindows = async () => {
      const existing = await getAllWindows();
      const missing = CARD_LABELS.filter((label) => !existing.some((win) => win.label === label));
      log.info("initializing overlay windows", { existing: existing.length, missing });

      await Promise.all(missing.map((label) => invoke("create_window", { label })));

      for (const win of await getAllWindows()) windows.set(win.label, win);
      log.info("overlay windows ready", { count: windows.size });
      if (!disposed) setReady(true);
    };

    track(listen<InputEvent>("input-event", (event) => void handleInput(event.payload)));
    track(listen(HIDE_UI_EVENT, () => setHidden(true)));
    track(listen(SHOW_UI_EVENT, () => setHidden(false)));
    track(
      listen<boolean>(DEV_MODE_EVENT, (event) => {
        log.info("dev mode changed", { enabled: event.payload });
        setDevMode(event.payload);
      }),
    );

    const refreshHandle = setInterval(
      () => setStack((prev) => refreshNewest(prev, keyMap(), Date.now())),
      REFRESH_INTERVAL_MS,
    );
    const expireHandle = setInterval(
      () => setStack((prev) => expireOldest(prev, Date.now())),
      REMOVE_INTERVAL_MS,
    );

    void initWindows().catch((error) => log.error("failed to initialize windows", error));
    log.info("controller started");

    onCleanup(() => {
      disposed = true;
      clearInterval(refreshHandle);
      clearInterval(expireHandle);
      unlisten.forEach((fn) => fn());
      log.info("controller stopped");
    });
  });

  createEffect(() => {
    const items = stack();
    // Reading the dev flag here re-applies the current stack when it is toggled.
    const dev = devMode();
    if (hidden() || !ready()) return;
    log.debug("stack effect", { size: items.length, dev });
    applyStack(items);
  });

  return <EventItem id={MEASURE_ELEMENT_ID} keys={measureKeys} />;
}

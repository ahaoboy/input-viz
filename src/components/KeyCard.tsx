import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createSignal, onCleanup, onMount } from "solid-js";
import { CARD_ELEMENT_ID } from "../constants";
import { createLogger } from "../lib/logger";
import type { HideEvent, KeyState, UpdateEvent } from "../types";
import { EventItem } from "./EventItem";

/**
 * Card rendered inside an overlay window. Each overlay is loaded with its label
 * in the URL hash and only reacts to events addressed to that label.
 */
export function KeyCard() {
  const [keys, setKeys] = createSignal<KeyState[]>([]);
  const [noColor, setNoColor] = createSignal(true);

  onMount(() => {
    const { label } = getCurrentWindow();
    const log = createLogger(`card:${label}`);
    let disposed = false;
    const unlisten: UnlistenFn[] = [];
    // Subscribing is async, so a handle may resolve after unmount.
    const track = (handle: Promise<UnlistenFn>) => {
      void handle.then((fn) => (disposed ? fn() : unlisten.push(fn)));
    };

    track(
      listen<HideEvent>("hide", (event) => {
        if (event.payload.label !== label) return;
        log.debug("cleared");
        setKeys([]);
        setNoColor(true);
      }),
    );

    track(
      listen<UpdateEvent>("update", (event) => {
        if (event.payload.label !== label) return;
        log.debug("update", {
          keys: event.payload.item.keys.map((k) => k.key),
          noColor: event.payload.noColor,
        });
        setKeys(event.payload.item.keys);
        setNoColor(event.payload.noColor);
      }),
    );

    log.info("card started");
    onCleanup(() => {
      disposed = true;
      unlisten.forEach((fn) => fn());
      log.info("card stopped");
    });
  });

  return <EventItem id={CARD_ELEMENT_ID} keys={keys} noColor={noColor} />;
}

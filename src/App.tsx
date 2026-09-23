import "./App.css";
import { Controller } from "./components/Controller";
import { KeyCard } from "./components/KeyCard";
import { createLogger, LOG_LEVEL } from "./lib/logger";

const log = createLogger("app");

/**
 * The frontend is loaded by every window of the app:
 * - the `main` window (no URL hash) runs the controller,
 * - each overlay window (URL hash = window label) renders one card.
 */
export default function App() {
  const isCard = window.location.hash.length > 0;
  log.info("window ready", {
    role: isCard ? "card" : "controller",
    logLevel: LOG_LEVEL ?? "off",
    href: window.location.href,
  });
  return isCard ? <KeyCard /> : <Controller />;
}

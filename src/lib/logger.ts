/**
 * Frontend logging.
 *
 * Disabled unless a log level is provided at build time through
 * `VITE_INPUT_VIZ_LOG`, `LOG_LEVEL` or `RUST_LOG`, so the release build stays
 * silent:
 *
 * ```sh
 * LOG_LEVEL=debug bun run tauri dev
 * ```
 *
 * The value is a level name: `debug`, `info`, `warn` or `error`. `off`, `0` and
 * `false` disable logging, and any other value falls back to `debug`.
 *
 * Lines are written to the webview console *and* forwarded to the Rust logger
 * through the `log_message` command. The overlay windows are transparent, tiny
 * and have no devtools, so without the bridge their output would be invisible.
 */

import { invoke } from "@tauri-apps/api/core";

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Severity ordering, used to drop messages below the configured level. */
const WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Level injected by `vite.config.ts`, normalised to lower case. */
const RAW = typeof __INPUT_VIZ_LOG__ === "string" ? __INPUT_VIZ_LOG__.trim().toLowerCase() : "";

/** Configured level, or `null` when logging is off. */
export const LOG_LEVEL: LogLevel | null = (() => {
  if (RAW === "" || RAW === "0" || RAW === "off" || RAW === "false") return null;
  if (RAW === "trace" || RAW === "verbose" || RAW === "log") return "debug";
  return RAW in WEIGHT ? (RAW as LogLevel) : "debug";
})();

export type Logger = Record<LogLevel, (...args: unknown[]) => void>;

/** Returned when logging is off, so call sites need no guard. */
const NOOP: Logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

/** Renders one log argument as a single line. */
function format(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    // Circular structures cannot be serialized.
    return String(value);
  }
}

/** Mirrors a line into the terminal through the Rust log interface. */
function forward(level: LogLevel, scope: string, args: unknown[]) {
  void invoke("log_message", {
    level,
    scope,
    message: args.map(format).join(" "),
  }).catch(() => undefined);
}

/**
 * Creates a logger whose lines are prefixed with `[input-viz:<scope>]`, matching
 * the format of the Rust side.
 */
export function createLogger(scope: string): Logger {
  const configured = LOG_LEVEL;
  if (configured === null) return NOOP;

  const prefix = `[input-viz:${scope}]`;
  const at =
    (level: LogLevel) =>
    (...args: unknown[]) => {
      if (WEIGHT[level] < WEIGHT[configured]) return;
      // `debug` goes through `log` so it is not hidden behind the verbose filter.
      console[level === "debug" ? "log" : level](prefix, ...args);
      forward(level, scope, args);
    };

  return { debug: at("debug"), info: at("info"), warn: at("warn"), error: at("error") };
}

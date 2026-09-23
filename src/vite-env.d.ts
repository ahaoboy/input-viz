/// <reference types="vite/client" />

/**
 * Log level injected at build time by `vite.config.ts` from
 * `VITE_INPUT_VIZ_LOG`, `LOG_LEVEL` or `RUST_LOG`. Empty when logging is off.
 */
declare const __INPUT_VIZ_LOG__: string;

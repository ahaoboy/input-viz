import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// @ts-expect-error process is a nodejs global
const env: Record<string, string | undefined> = process.env;

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

/**
 * Log level handed to the frontend at build time.
 *
 * `VITE_INPUT_VIZ_LOG` wins, but the variables the Rust side already reads are
 * accepted as a fallback so a single `LOG_LEVEL=debug` enables logging on both
 * sides.
 */
const logLevel = env.VITE_INPUT_VIZ_LOG || env.LOG_LEVEL || env.RUST_LOG || "";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  plugins: [solid()],

  define: {
    __INPUT_VIZ_LOG__: JSON.stringify(logLevel),
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore the Rust build output. The workspace keeps a
      // single `target` directory at the repository root, and watching the
      // artifacts there makes the dev server crash with an EBUSY error on the
      // DLLs cargo is writing.
      ignored: ["**/src-tauri/**", "**/target/**"],
    },
  },
}));

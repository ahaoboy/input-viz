# input-viz

![input-viz](./public/icon.png)

input-viz displays keystrokes and mouse actions directly on your desktop.

![input-viz](./public/input-viz.gif)

## Repeat counter

Pressing the same combination again without switching to another one shows a
counter after it, e.g. `A ×3`. The counter follows the card, so a combination
that is refreshed because one of its keys was released keeps its count, while a
new combination starts back at one.

The counter is rendered smaller than the key labels but stretched to the same
height, and its colour escalates with the count (cyan at `×2`, through green,
purple and pink, to red from `×6` on) so the number of repeats is readable at a
glance. Edit `REPEAT_COLORS` in `constants.ts` to change the palette.

Operating system auto-repeat (holding a key down) does not increase the counter,
only a fresh press does.

## Installation

You can download the latest version of `input-viz` from the
[Github Releases](https://github.com/ahaoboy/input-viz/releases/latest)

## Logging

Logging is off unless a level is provided through the environment. Both sides
read the same variables, so one value enables everything:

```sh
# Rust, using the standard env_logger syntax
RUST_LOG=debug bun run tauri dev
RUST_LOG=input_viz_lib=trace bun run tauri dev

# Simple fallback honoured by both the Rust and the frontend logger
LOG_LEVEL=DEBUG bun run tauri dev
```

Accepted levels are `debug`, `info`, `warn` and `error`; `off`, `0` and `false`
disable logging. The frontend accepts `VITE_INPUT_VIZ_LOG` as a more explicit
override.

Frontend log lines are forwarded to the Rust logger through the `log_message`
command, because the overlay windows are transparent, one pixel tall until they
are positioned, and have no devtools. Everything therefore appears in the
terminal that runs `tauri dev`:

```
[INFO  web:app] window ready {"role":"controller","logLevel":"debug"}
[DEBUG web:controller] measured {"keys":["ShiftLeft"],"size":{"w":190,"h":88},"scaleFactor":1.5}
[DEBUG web:controller] layout [{"id":0,"keys":"ShiftLeft:down","x":3391,"y":1648,"w":249,"h":88}]
```

The frontend sends a _scope_ (`app`, `controller`, `card:<label>`) that becomes a
`web:<scope>` target, so the usual filtering applies: `RUST_LOG=web=debug`
enables only the frontend lines. Frontend `debug` lines cover the key nodes:
received input events, measured card size and anchor, the full stack layout,
window moves and visibility changes.

## Debugging overlays

Debug builds add a **Show all overlays** entry to the tray menu. While it is
enabled, every overlay window stays visible and cards are assigned by stack
order instead of being routed to a reused window, so a window that misbehaves
can still be inspected.

## Development

```sh
bun install
bun run tauri dev   # run the desktop app
bun run build       # build the frontend only
bun run tauri build # build the installers
bun run pre-check   # format and lint the frontend
cargo test          # run the backend tests
cargo fmt           # format the backend
cargo clippy        # lint the backend
```

### Workspace layout

`Cargo.toml` at the repository root is a virtual workspace with `src-tauri` as
its only member. Dependency versions live in `[workspace.dependencies]` and are
referenced with `workspace = true`, so they cannot drift apart.

Two consequences are worth knowing:

- **Profiles must be declared at the root.** Cargo silently ignores `[profile.*]`
  sections in a member manifest, which previously meant the release
  optimizations (`lto`, `strip`, `opt-level = "s"`) were not applied.
- **The build output moved to `./target`.** It is shared by the whole workspace
  and ignored by Vite's file watcher, which otherwise crashes with `EBUSY` on
  the DLLs cargo is writing.

The Tauri CLI prints an info message about the `tauri` and `tauri-build`
dependency features not being rewritten when workspace inheritance is used. That
is expected: since Tauri v2 the `custom-protocol` feature is ignored, so nothing
needs rewriting.

## Inspired

https://github.com/mulaRahul/keyviz

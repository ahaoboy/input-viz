use crate::error::{Error, Result};
use log::{debug, error, info, warn};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Wry};

const SHOW: &str = "show";
const HIDE: &str = "hide";
const DEV: &str = "dev-toggle";
const QUIT: &str = "quit";

/// Event telling the controller whether dev mode is enabled.
const DEV_EVENT: &str = "dev-mode";

/// Builds the tray icon and its Show / Hide / [Dev] / Quit menu.
pub fn build(app: &AppHandle) -> Result<()> {
    let show = MenuItem::with_id(app, SHOW, "Show", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, HIDE, "Hide", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT, "Quit", true, None::<&str>)?;

    // Debug builds get an extra toggle that keeps every overlay window visible
    // so that a misbehaving window can still be inspected.
    let dev = cfg!(debug_assertions)
        .then(|| CheckMenuItem::with_id(app, DEV, "Show all overlays", true, false, None::<&str>))
        .transpose()?;

    let mut items: Vec<&dyn IsMenuItem<Wry>> = vec![&show, &hide];
    items.extend(dev.as_ref().map(|item| item as &dyn IsMenuItem<Wry>));
    items.push(&quit);
    let menu = Menu::with_items(app, &items)?;

    let enabled = Arc::new(AtomicBool::new(false));
    let state = Arc::clone(&enabled);
    let item = dev.clone();

    let mut tray = TrayIconBuilder::new()
        .tooltip("input-viz")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            QUIT => {
                info!("tray: quit");
                app.exit(0);
            }
            SHOW => set_visible(app, true),
            HIDE => set_visible(app, false),
            DEV => {
                // `fetch_xor` returns the previous value, the new one is its
                // negation.
                let next = !state.fetch_xor(true, Ordering::Relaxed);
                info!("tray: dev mode -> {next}");
                if let Some(item) = item.as_ref() {
                    let _ = item.set_checked(next);
                }
                emit_dev_mode(app, next);
            }
            other => debug!("tray: unhandled menu item {other}"),
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;

    info!("tray built (dev toggle: {})", dev.is_some());
    Ok(())
}

/// Shows or hides the overlay windows, keeping the tray menu in sync with the
/// controller window through the `show-ui` / `hide-ui` events.
fn set_visible(app: &AppHandle, visible: bool) {
    debug!("tray: overlay visibility -> {visible}");
    if let Some(main) = app.get_webview_window("main") {
        let event = if visible { "show-ui" } else { "hide-ui" };
        if let Err(source) = main.emit(event, ()) {
            let err = Error::Emit { event, source };
            error!("{err}");
        }
    }

    for (label, window) in app.webview_windows() {
        if visible && label == "main" {
            continue;
        }
        let result = if visible {
            window.show()
        } else {
            window.hide()
        };
        if let Err(source) = result {
            let err = Error::Window {
                action: if visible { "show" } else { "hide" },
                label,
                source,
            };
            error!("{err}");
        }
    }
}

/// Tells the controller window that dev mode was toggled.
fn emit_dev_mode(app: &AppHandle, enabled: bool) {
    let Some(main) = app.get_webview_window("main") else {
        warn!("cannot emit {DEV_EVENT}: the main window is missing");
        return;
    };
    if let Err(source) = main.emit(DEV_EVENT, enabled) {
        let err = Error::Emit {
            event: DEV_EVENT,
            source,
        };
        error!("{err}");
    }
}

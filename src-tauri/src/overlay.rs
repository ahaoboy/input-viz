use crate::error::{Error, Result};
use log::debug;
use tauri::window::Color;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// Creates one transparent, always-on-top overlay window used to render a card.
///
/// The label is passed in the URL hash so the frontend knows which card it has
/// to render. Creating an existing window is a no-op.
///
/// This command must stay `async`: Tauri runs synchronous commands on the main
/// thread, and building a window there deadlocks, which freezes the whole app.
#[tauri::command]
pub async fn create_window(app: tauri::AppHandle, label: String) -> Result<()> {
    if app.get_webview_window(&label).is_some() {
        debug!("overlay window {label} already exists");
        return Ok(());
    }
    debug!("creating overlay window {label}");

    let url = format!("index.html#{label}");
    let builder = WebviewWindowBuilder::new(&app, label.as_str(), WebviewUrl::App(url.into()))
        .title("input-viz-key")
        .decorations(false)
        .background_color(Color(0, 0, 0, 0))
        .position(0.0, 0.0)
        .inner_size(1.0, 1.0)
        .always_on_top(true)
        .skip_taskbar(true)
        .fullscreen(false)
        .visible(false)
        .closable(false)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .focused(false)
        .shadow(false);

    // Transparency is not supported on macOS, where the window is already
    // transparent by default.
    #[cfg(not(target_os = "macos"))]
    let builder = builder.transparent(true);

    builder.build().map_err(|source| Error::CreateWindow {
        label: label.clone(),
        source,
    })?;

    debug!("overlay window {label} created");
    Ok(())
}

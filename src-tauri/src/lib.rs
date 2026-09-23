mod bridge;
mod error;
mod monitor;
mod overlay;
mod tray;

use log::info;

/// Environment variables consulted for the log filter, in priority order.
const LOG_FILTER_VARS: [&str; 2] = ["RUST_LOG", "LOG_LEVEL"];

/// Reads the log filter from the environment and normalises it for
/// `env_logger`.
///
/// `RUST_LOG` keeps its usual syntax (`debug`, `info,input_viz_lib=trace`).
/// `LOG_LEVEL` is accepted as a convenience fallback holding a bare level, so a
/// value like `DEBUG` is lower-cased before being handed to `env_logger`.
fn log_filter() -> String {
    let value = LOG_FILTER_VARS
        .iter()
        .filter_map(|key| std::env::var(key).ok())
        .map(|value| value.trim().to_owned())
        .find(|value| !matches!(value.as_str(), "" | "0" | "off" | "false"))
        .unwrap_or_else(|| "off".to_owned());

    // A bare level is case-insensitive; a directive list with module paths is
    // left untouched because paths are case-sensitive.
    if value.contains('=') || value.contains(',') {
        value
    } else {
        value.to_ascii_lowercase()
    }
}

/// Initializes the `log` facade with an `env_logger` backend.
///
/// Logging is off unless `RUST_LOG` or `LOG_LEVEL` is set, for example
/// `RUST_LOG=debug`, `LOG_LEVEL=DEBUG` or `RUST_LOG=input_viz_lib=trace`.
fn init_logging() {
    env_logger::Builder::new()
        .parse_filters(&log_filter())
        .format_timestamp_millis()
        .init();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .setup(|app| {
            info!(
                "input-viz {} starting (dev build: {})",
                app.package_info().version,
                cfg!(debug_assertions)
            );

            tray::build(app.handle())?;
            monitor::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bridge::log_message,
            overlay::create_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

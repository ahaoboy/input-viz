//! Application error type.
//!
//! Every fallible operation returns [`Result`]. Variants carry enough context to
//! be useful in a log line, and because Tauri requires command errors to be
//! serializable the type is rendered as its `Display` message.

use serde::{Serialize, Serializer};
use thiserror::Error;

/// Convenience alias used across the crate.
pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(Debug, Error)]
pub enum Error {
    /// An overlay window could not be created.
    #[error("failed to create the `{label}` overlay window")]
    CreateWindow {
        label: String,
        #[source]
        source: tauri::Error,
    },

    /// A window could not be shown or hidden.
    #[error("failed to {action} the `{label}` window")]
    Window {
        action: &'static str,
        label: String,
        #[source]
        source: tauri::Error,
    },

    /// An event could not be delivered to a webview.
    #[error("failed to emit the `{event}` event")]
    Emit {
        event: &'static str,
        #[source]
        source: tauri::Error,
    },

    /// The tray icon or one of its menu items could not be built.
    #[error("failed to build the tray icon")]
    Tray(#[from] tauri::Error),
}

/// Tauri serializes command errors to hand them to the frontend.
impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

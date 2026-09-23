use crate::error::Error;
use log::{debug, error, info};
use rdev::{Event, EventType, listen};
use tauri::{AppHandle, Emitter};

/// Event name forwarded to the frontend for every global input event.
const INPUT_EVENT: &str = "input-event";

/// Starts the global input listener on a dedicated thread and forwards every
/// event but mouse movement to the frontend as `input-event`.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        info!("input listener starting");
        let result = listen(move |event: Event| {
            if matches!(event.event_type, EventType::MouseMove { .. }) {
                return;
            }
            debug!("input event received: {:?}", event.event_type);

            if let Err(source) = app.emit(INPUT_EVENT, event) {
                let err = Error::Emit {
                    event: INPUT_EVENT,
                    source,
                };
                error!("{err}");
            }
        });

        match result {
            Ok(()) => info!("input listener stopped"),
            Err(error) => error!("input listener failed: {error:?}"),
        }
    });
}

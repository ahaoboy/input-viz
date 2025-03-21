use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};

fn start_monitoring(app_handle: tauri::AppHandle) {
    use rdev::{listen, EventType};
    std::thread::spawn(move || {
        if let Err(error) = listen(move |event| {
            println!("My callback {:?}", event);
            match event.event_type {
                EventType::MouseMove { x: _, y: _ } => {}
                _ => {
                    app_handle.emit("input-event", event).unwrap();
                }
            }
        }) {
            println!("Error: {:?}", error)
        }
    });
}

use tauri::menu::{Menu, MenuItem};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .setup(|app| {
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_i])?;
            let _ = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(
                    |app: &AppHandle<tauri::Wry>, event| match event.id.as_ref() {
                        "quit" => {
                            println!("quit menu item was clicked");
                            app.exit(0);
                        }
                        _ => {
                            println!("menu item {:?} not handled", event.id);
                        }
                    },
                )
                .build(app);

            start_monitoring(app.app_handle().clone());

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use tauri::tray::TrayIconBuilder;
use tauri::window::Color;
use tauri::{AppHandle, Emitter, Manager};

fn start_monitoring(app_handle: tauri::AppHandle) {
    use rdev::{EventType, listen};
    std::thread::spawn(move || {
        if let Err(error) = listen(move |event| {
            // println!("My callback {:?}", event);
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

#[tauri::command]
async fn create_window(app: tauri::AppHandle, label: String) {
    if app.get_webview_window(&label).is_some() {
        return;
    }

    let url = format!("index.html#{}", label);
    let builder = tauri::WebviewWindowBuilder::new(
        &app,
        label.as_str(),
        tauri::WebviewUrl::App(url.as_str().into()),
    )
    .title("input-viz-key")
    .decorations(false)
    .background_color(Color(0, 0, 0, 0))
    .position(0., 0.)
    .inner_size(1., 1.)
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

    #[cfg(not(target_os = "macos"))]
    let builder = builder.transparent(true);

    builder.build().unwrap();
}

use tauri::menu::{Menu, MenuItem};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;
            let _ = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(
                    |app: &AppHandle<tauri::Wry>, event| match event.id.as_ref() {
                        "quit" => {
                            // println!("quit menu item was clicked");
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(app) = app.get_webview_window("main") {
                                app.emit("show-ui", ()).expect("failed to emit show-ui");
                            }

                            for (label, win) in app.webview_windows() {
                                if label == "main" {
                                    continue;
                                }
                                win.show().expect("failed to show webview_window");
                            }
                        }
                        "hide" => {
                            if let Some(app) = app.get_webview_window("main") {
                                app.emit("hide-ui", ()).expect("failed to emit hide-ui");
                            }
                            for i in app.webview_windows() {
                                i.1.hide().expect("failed to hide webview_window");
                            }
                        }
                        _ => {
                            // println!("menu item {:?} not handled", event.id);
                        }
                    },
                )
                .build(app);

            start_monitoring(app.app_handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![create_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

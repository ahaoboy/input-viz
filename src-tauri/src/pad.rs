use sdl2::{
    Sdl,
    controller::{Axis, Button, GameController},
    event::Event,
};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

/// Axis motion data for sticks and triggers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AxisMotion {
    pub axis: String,
    pub value: f32,
}

/// Event type enum matching the InputEvent structure on the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PadEventType {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub button_press: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub button_release: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub axis_motion: Option<AxisMotion>,
}

/// Gamepad event sent to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PadEvent {
    pub event_type: PadEventType,
}

impl PadEvent {
    fn button_press(button: &str) -> Self {
        Self {
            event_type: PadEventType {
                button_press: Some(button.to_string()),
                button_release: None,
                axis_motion: None,
            },
        }
    }

    fn button_release(button: &str) -> Self {
        Self {
            event_type: PadEventType {
                button_press: None,
                button_release: Some(button.to_string()),
                axis_motion: None,
            },
        }
    }

    fn axis_motion(axis: &str, value: f32) -> Self {
        Self {
            event_type: PadEventType {
                button_press: None,
                button_release: None,
                axis_motion: Some(AxisMotion {
                    axis: axis.to_string(),
                    value,
                }),
            },
        }
    }
}

/// Convert SDL2 Button to string representation
fn button_to_string(button: Button) -> &'static str {
    match button {
        Button::A => "A",
        Button::B => "B",
        Button::X => "X",
        Button::Y => "Y",
        Button::Back => "Back",
        Button::Guide => "Guide",
        Button::Start => "Start",
        Button::LeftStick => "LeftStick",
        Button::RightStick => "RightStick",
        Button::LeftShoulder => "LB",
        Button::RightShoulder => "RB",
        Button::DPadUp => "DPadUp",
        Button::DPadDown => "DPadDown",
        Button::DPadLeft => "DPadLeft",
        Button::DPadRight => "DPadRight",
        _ => "Unknown",
    }
}

/// Convert SDL2 Axis to string representation
fn axis_to_string(axis: Axis) -> &'static str {
    match axis {
        Axis::LeftX => "LeftX",
        Axis::LeftY => "LeftY",
        Axis::RightX => "RightX",
        Axis::RightY => "RightY",
        Axis::TriggerLeft => "LT",
        Axis::TriggerRight => "RT",
    }
}

/// Normalize axis value to appropriate range
/// Triggers: 0.0 to 1.0
/// Sticks: -1.0 to 1.0
fn normalize_axis(axis: Axis, value: i16) -> f32 {
    match axis {
        Axis::TriggerLeft | Axis::TriggerRight => value as f32 / 32767.0,
        _ => value as f32 / 32768.0,
    }
}

/// Apply deadzone to axis value
const DEADZONE: f32 = 0.1;

fn apply_deadzone(value: f32, is_trigger: bool) -> f32 {
    if is_trigger {
        if value < DEADZONE { 0.0 } else { value }
    } else if value.abs() < DEADZONE {
        0.0
    } else {
        value
    }
}

/// Start the gamepad monitoring loop in a separate thread
pub fn start_gamepad(app_handle: tauri::AppHandle) -> Result<(), String> {
    std::thread::spawn(move || {
        if let Err(e) = run_gamepad_loop(app_handle) {
            eprintln!("Gamepad error: {}", e);
        }
        // test();
    });
    Ok(())
}

/// Main gamepad event loop
fn run_gamepad_loop(app_handle: tauri::AppHandle) -> Result<(), String> {
    // Initialize SDL
    let sdl_context: Sdl = sdl2::init()?;
    let _video = sdl_context.video()?; // 必须有 video 子系统
    let game_controller_subsystem = sdl_context.game_controller()?;

    // Keep track of connected controller
    let mut controller: Option<GameController> = find_controller(&game_controller_subsystem);

    if let Some(ref ctrl) = controller {
        println!("Gamepad connected: {}", ctrl.name());
    } else {
        println!("No gamepad found, waiting for connection...");
    }

    // Event loop
    let mut event_pump = sdl_context.event_pump()?;
    println!("Listening for gamepad events...");

    loop {
        for event in event_pump.poll_iter() {
            let pad_event = match event {
                // Controller connected
                Event::ControllerDeviceAdded { which, .. } => {
                    if controller.is_none() {
                        match game_controller_subsystem.open(which) {
                            Ok(ctrl) => {
                                println!("Gamepad connected: {}", ctrl.name());
                                controller = Some(ctrl);
                            }
                            Err(e) => eprintln!("Failed to open controller: {}", e),
                        }
                    }
                    None
                }

                // Controller disconnected
                Event::ControllerDeviceRemoved { which, .. } => {
                    if let Some(ref ctrl) = controller
                        && ctrl.instance_id() == which
                    {
                        println!("Gamepad disconnected");
                        controller = None;
                    }
                    None
                }

                // Button pressed
                Event::ControllerButtonDown { button, .. } => {
                    let btn_str = button_to_string(button);
                    Some(PadEvent::button_press(btn_str))
                }
                // Button pressed
                // Event::JoyButtonDown { button_idx, .. } => {
                //     let btn_str = button_idx.to_string();
                //     Some(PadEvent::button_press(&btn_str))
                // }
                // Button released
                Event::ControllerButtonUp { button, .. } => {
                    let btn_str = button_to_string(button);
                    Some(PadEvent::button_release(btn_str))
                }

                // Axis motion (sticks and triggers)
                Event::ControllerAxisMotion { axis, value, .. } => {
                    let is_trigger = matches!(axis, Axis::TriggerLeft | Axis::TriggerRight);
                    let normalized = normalize_axis(axis, value);
                    let final_value = apply_deadzone(normalized, is_trigger);

                    let axis_str = axis_to_string(axis);
                    Some(PadEvent::axis_motion(axis_str, final_value))
                }

                // Quit event
                Event::Quit { .. } => break,

                _ => None,
            };

            // Emit event to frontend if we have one
            if let Some(evt) = pad_event
                && let Err(e) = app_handle.emit("gamepad-event", &evt)
            {
                eprintln!("Failed to emit gamepad event: {}", e);
            }
        }

        // Sleep to avoid busy-waiting (~120Hz polling)
        std::thread::sleep(std::time::Duration::from_millis(8));
    }
}

/// Find and open the first available game controller
fn find_controller(subsystem: &sdl2::GameControllerSubsystem) -> Option<GameController> {
    let num_joysticks = subsystem.num_joysticks().ok()?;

    for i in 0..num_joysticks {
        if subsystem.is_game_controller(i) {
            match subsystem.open(i) {
                Ok(ctrl) => return Some(ctrl),
                Err(e) => eprintln!("Failed to open controller {}: {}", i, e),
            }
        }
    }
    None
}

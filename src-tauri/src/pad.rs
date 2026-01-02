use sdl2::{
    controller::{Axis, Button, GameController},
    event::Event,
    Sdl,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{Duration, Instant};
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

/// Throttle state for axis events
struct AxisThrottle {
    last_sent_time: Instant,
    last_sent_value: f32,
    pending_value: Option<f32>,
}

impl AxisThrottle {
    fn new() -> Self {
        Self {
            last_sent_time: Instant::now() - Duration::from_secs(1), // Allow immediate first send
            last_sent_value: 0.0,
            pending_value: None,
        }
    }
}

/// Event throttler to limit message rate while preserving first/last events
struct EventThrottler {
    axis_states: HashMap<String, AxisThrottle>,
    throttle_interval: Duration,
    value_threshold: f32, // Minimum change to trigger send
}

impl EventThrottler {
    fn new(throttle_ms: u64, value_threshold: f32) -> Self {
        Self {
            axis_states: HashMap::new(),
            throttle_interval: Duration::from_millis(throttle_ms),
            value_threshold,
        }
    }

    /// Process axis event, returns Some(value) if should emit now
    fn process_axis(&mut self, axis: &str, value: f32) -> Option<f32> {
        let state = self
            .axis_states
            .entry(axis.to_string())
            .or_insert_with(AxisThrottle::new);

        let now = Instant::now();
        let time_since_last = now.duration_since(state.last_sent_time);
        let value_change = (value - state.last_sent_value).abs();

        // Always send if value crosses zero (direction change) or reaches extremes
        let is_significant = value_change >= self.value_threshold
            || (state.last_sent_value != 0.0 && value == 0.0) // Return to center
            || (value.abs() >= 0.99); // Full deflection

        if time_since_last >= self.throttle_interval {
            // Throttle window passed, send current value
            state.last_sent_time = now;
            state.last_sent_value = value;
            state.pending_value = None;
            Some(value)
        } else if is_significant && state.pending_value.is_none() {
            // Significant change, but within throttle window - queue it
            state.pending_value = Some(value);
            None
        } else {
            // Update pending value if exists
            if state.pending_value.is_some() {
                state.pending_value = Some(value);
            }
            None
        }
    }

    /// Flush pending events (call periodically to ensure last values are sent)
    fn flush_pending(&mut self) -> Vec<(String, f32)> {
        let now = Instant::now();
        let mut to_send = Vec::new();

        for (axis, state) in self.axis_states.iter_mut() {
            if let Some(value) = state.pending_value.take() {
                if now.duration_since(state.last_sent_time) >= self.throttle_interval {
                    state.last_sent_time = now;
                    state.last_sent_value = value;
                    to_send.push((axis.clone(), value));
                } else {
                    // Not ready yet, put it back
                    state.pending_value = Some(value);
                }
            }
        }

        to_send
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
        if value < DEADZONE {
            0.0
        } else {
            value
        }
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
    });
    Ok(())
}

/// Emit helper function
fn emit_event(app_handle: &tauri::AppHandle, evt: &PadEvent) {
    if let Err(e) = app_handle.emit("gamepad-event", evt) {
        eprintln!("Failed to emit gamepad event: {}", e);
    }
}

/// Main gamepad event loop
fn run_gamepad_loop(app_handle: tauri::AppHandle) -> Result<(), String> {
    // Initialize SDL
    let sdl_context: Sdl = sdl2::init()?;
    let _video = sdl_context.video()?;
    let game_controller_subsystem = sdl_context.game_controller()?;

    // Keep track of connected controller
    let mut controller: Option<GameController> = find_controller(&game_controller_subsystem);

    if let Some(ref ctrl) = controller {
        println!("Gamepad connected: {}", ctrl.name());
    } else {
        println!("No gamepad found, waiting for connection...");
    }

    // Event throttler: 16ms interval (~60Hz), 0.05 value threshold
    let mut throttler = EventThrottler::new(16, 0.05);

    // Event loop
    let mut event_pump = sdl_context.event_pump()?;
    println!("Listening for gamepad events...");

    loop {
        for event in event_pump.poll_iter() {
            match event {
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
                }

                // Controller disconnected
                Event::ControllerDeviceRemoved { which, .. } => {
                    if let Some(ref ctrl) = controller
                        && ctrl.instance_id() == which {
                            println!("Gamepad disconnected");
                            controller = None;
                        }
                }

                // Button pressed - always send immediately (no throttle)
                Event::ControllerButtonDown { button, .. } => {
                    let btn_str = button_to_string(button);
                    emit_event(&app_handle, &PadEvent::button_press(btn_str));
                }

                // Button released - always send immediately (no throttle)
                Event::ControllerButtonUp { button, .. } => {
                    let btn_str = button_to_string(button);
                    emit_event(&app_handle, &PadEvent::button_release(btn_str));
                }

                // Axis motion (sticks and triggers) - throttled
                Event::ControllerAxisMotion { axis, value, .. } => {
                    let is_trigger = matches!(axis, Axis::TriggerLeft | Axis::TriggerRight);
                    let normalized = normalize_axis(axis, value);
                    let final_value = apply_deadzone(normalized, is_trigger);
                    let axis_str = axis_to_string(axis);

                    if let Some(v) = throttler.process_axis(axis_str, final_value) {
                        emit_event(&app_handle, &PadEvent::axis_motion(axis_str, v));
                    }
                }

                // Quit event
                Event::Quit { .. } => break,

                _ => {}
            }
        }

        // Flush any pending throttled events
        for (axis, value) in throttler.flush_pending() {
            emit_event(&app_handle, &PadEvent::axis_motion(&axis, value));
        }

        // Sleep to avoid busy-waiting (~120Hz polling)
        std::thread::sleep(std::time::Duration::from_millis(16));
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

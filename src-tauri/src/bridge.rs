//! The `log_message` command: the interface the frontend logs through.
//!
//! Overlay windows are transparent, one pixel tall until they are positioned and
//! have no devtools, so a `console.log` inside them is effectively invisible.
//! Routing frontend log lines through the `log` facade puts Rust and frontend
//! output into the same stream.
//!
//! The frontend sends a *scope* which is turned into a `web:<scope>` target, so
//! the usual `env_logger` filtering applies: `RUST_LOG=web=debug` enables only
//! the frontend lines, while `RUST_LOG=debug` enables everything.

use log::Level;

/// Prefix applied to every forwarded frontend log line.
const WEB_PREFIX: &str = "web";

/// Builds the log target for a frontend scope, e.g. `controller` -> `web:controller`.
///
/// An empty scope collapses to the bare `web` target.
fn target_for(scope: &str) -> String {
    let scope = scope.trim();
    if scope.is_empty() {
        WEB_PREFIX.to_owned()
    } else {
        format!("{WEB_PREFIX}:{scope}")
    }
}

/// Forwards a frontend log line through the `log` facade.
///
/// Unknown levels are ignored, and lines the current filter rejects are dropped
/// without formatting so the frontend can forward freely.
#[tauri::command]
pub fn log_message(level: String, scope: String, message: String) {
    let Ok(level) = level.trim().to_ascii_lowercase().parse::<Level>() else {
        return;
    };

    let target = target_for(&scope);
    if log::log_enabled!(target: &target, level) {
        log::log!(target: &target, level, "{message}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_includes_the_scope() {
        assert_eq!(target_for("controller"), "web:controller");
        assert_eq!(target_for("card:0"), "web:card:0");
    }

    #[test]
    fn target_falls_back_to_the_bare_prefix() {
        assert_eq!(target_for(""), "web");
        assert_eq!(target_for("   "), "web");
    }

    #[test]
    fn levels_are_parsed_case_insensitively() {
        assert_eq!("debug".parse::<Level>(), Ok(Level::Debug));
        assert_eq!(
            "DEBUG".to_ascii_lowercase().parse::<Level>(),
            Ok(Level::Debug)
        );
        assert!("nope".parse::<Level>().is_err());
    }
}

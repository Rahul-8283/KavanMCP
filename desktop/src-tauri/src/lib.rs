use std::fs;
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

const BACKEND_ADDR: &str = "127.0.0.1:8000";
const BACKEND_CONFIG_FILE: &str = "backend.json";
const MINIMIZED_ARG: &str = "--minimized";
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// The backend this app started, if it started one. Only this child is ever stopped.
#[derive(Default)]
pub struct BackendProcess(Mutex<Option<Child>>);

/// Where the backend lives. The file holds paths only, and the app runs them without a shell.
#[derive(Serialize, Deserialize)]
struct BackendPaths {
    python: String,
    script: String,
}

fn backend_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(BACKEND_CONFIG_FILE))
        .map_err(|e| e.to_string())
}

fn read_backend_paths(app: &AppHandle) -> Option<BackendPaths> {
    let text = fs::read_to_string(backend_config_path(app).ok()?).ok()?;
    let paths: BackendPaths = serde_json::from_str(&text).ok()?;
    (Path::new(&paths.python).is_file() && Path::new(&paths.script).is_file()).then_some(paths)
}

fn folder_of(script: &str) -> Option<PathBuf> {
    Path::new(script).parent().map(Path::to_path_buf)
}

fn backend_answering() -> bool {
    BACKEND_ADDR
        .parse::<SocketAddr>()
        .ok()
        .and_then(|addr| TcpStream::connect_timeout(&addr, Duration::from_millis(500)).ok())
        .is_some()
}

/// The folder the user chose (the mcp-server folder), as the path of the backend it contains.
#[tauri::command]
fn get_backend_location(app: AppHandle) -> Option<String> {
    let paths = read_backend_paths(&app)?;
    folder_of(&paths.script).map(|folder| folder.to_string_lossy().into_owned())
}

#[tauri::command]
fn set_backend_location(app: AppHandle, folder: String) -> Result<String, String> {
    let folder = PathBuf::from(folder);
    let python = folder.join("venv").join("Scripts").join("python.exe");
    let script = folder.join("main.py");
    if !python.is_file() {
        return Err(format!("No Python found at {}. Create the venv in that folder first.", python.display()));
    }
    if !script.is_file() {
        return Err(format!("No main.py found in {}.", folder.display()));
    }

    let config = backend_config_path(&app)?;
    if let Some(dir) = config.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let paths = BackendPaths {
        python: python.to_string_lossy().into_owned(),
        script: script.to_string_lossy().into_owned(),
    };
    let text = serde_json::to_string_pretty(&paths).map_err(|e| e.to_string())?;
    fs::write(&config, text).map_err(|e| e.to_string())?;
    Ok(folder.to_string_lossy().into_owned())
}

/// Starts the dashboard backend when nothing answers on its port and a location is set.
/// A backend started by hand or by Claude Desktop is never touched.
fn ensure_backend(app: &AppHandle) {
    if backend_answering() {
        return;
    }
    let Some(paths) = read_backend_paths(app) else {
        return;
    };
    let Some(folder) = folder_of(&paths.script) else {
        return;
    };

    let mut command = Command::new(&paths.python);
    command
        .arg(&paths.script)
        .arg("--dashboard-only")
        .current_dir(folder)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    match command.spawn() {
        Ok(child) => {
            let state: State<BackendProcess> = app.state();
            if let Ok(mut slot) = state.0.lock() {
                *slot = Some(child);
            };
        }
        Err(e) => eprintln!("Could not start the Kavan backend: {e}"),
    }
}

/// Terminates the whole application from the tray menu. Stops the backend only if this app started it.
/// Closing the window only hides it (see useWindowLifecycle), so Quit needs to exit the process explicitly.
#[tauri::command]
fn quit_app(app: AppHandle, backend: State<BackendProcess>) {
    if let Ok(mut slot) = backend.0.lock() {
        if let Some(mut child) = slot.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    app.exit(0);
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![MINIMIZED_ARG]),
        ))
        .manage(BackendProcess::default())
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || ensure_backend(&handle));

            let started_quietly = std::env::args().any(|arg| arg == MINIMIZED_ARG);
            if !started_quietly {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            quit_app,
            get_backend_location,
            set_backend_location,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

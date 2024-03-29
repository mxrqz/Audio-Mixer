#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu};
use tauri_plugin_positioner::{Position, WindowExt};
use winapi::um::winuser::GetKeyState;
use winapi::um::winuser::VK_RIGHT;
use window_shadows::set_shadow;
use window_vibrancy::apply_acrylic;
use windows_volume_control::AudioController;

#[derive(Serialize)]
struct SessionInfo {
    name: String,
    volume: f32,
}

#[tauri::command]
fn get_apps() -> String {
    let (tx, rx) = std::sync::mpsc::channel();

    thread::spawn(move || {
        let mut session_infos = Vec::new();

        unsafe {
            let mut controller = AudioController::init(None);
            controller.GetSessions();
            controller.GetDefaultAudioEnpointVolumeControl();
            controller.GetAllProcessSessions();
            let test: Vec<String> = controller.get_all_session_names();
            // println!("{:?}", test);
            for session_name in test {
                if let Some(session) = controller.get_session_by_name(session_name.clone()) {
                    let volume = session.getVolume();
                    session_infos.push(SessionInfo {
                        name: session_name,
                        volume,
                    });
                } else {
                    println!("Sessão {} não encontrada.", session_name);
                }
            }
        }
        tx.send(session_infos).unwrap();
    });

    let session_infos = rx.recv().unwrap();
    serde_json::to_string(&session_infos).unwrap()
}

#[tauri::command]
fn set_app_volume(app_name: String, volume: f32) {
    thread::spawn(move || {
        let app_name_clone = app_name.clone();
        unsafe {
            let mut controller = AudioController::init(None);
            controller.GetSessions();
            controller.GetDefaultAudioEnpointVolumeControl();
            controller.GetAllProcessSessions();

            // println!("Aplicativo {} - volume {}.", app_name_clone, volume)
            if let Some(app) = controller.get_session_by_name(app_name) {
                app.setVolume(volume);
            } else {
                println!("Aplicativo {} não encontrado.", app_name_clone);
            }
        }
    });
}

#[tauri::command]
fn volume(app_name: String, volume: f32) {
    thread::spawn(move || {
        let app_name_clone = app_name.clone();
        unsafe {
            let mut controller = AudioController::init(None);
            controller.GetSessions();
            controller.GetDefaultAudioEnpointVolumeControl();
            controller.GetAllProcessSessions();

            // Obtem o volume atual do aplicativo
            if let Some(app) = controller.get_session_by_name(app_name.clone()) {
                let app_volume = app.getVolume();
                let new_volume = (app_volume + volume).min(1.0).max(0.0);
                app.setVolume(new_volume);
            } else {
                println!("Aplicativo {} não encontrado.", app_name_clone);
            }
        }
    });
}

#[tauri::command]
fn get_key_state(app_handle: AppHandle, app_name: String, app_volume: f32) -> bool {
    loop {
        unsafe {
            let key_state = GetKeyState(VK_RIGHT as i32);
            if key_state < 0 {
                println!("A tecla UP está pressionada.{} {} ", app_name, app_volume);
                // volume(app_name.clone(), app_volume);
                app_handle
                    .emit_all("key-pressed", app_name.clone())
                    .unwrap();
            } else {
                println!("A tecla UP não está pressionada.");
                app_handle
                    .emit_all("key-released", app_name.clone())
                    .unwrap();
                return false; // Retorna false quando a tecla é solta
            }
        }
        thread::sleep(Duration::from_millis(250));
    }
}

fn main() {
    let quit = CustomMenuItem::new("quit".to_string(), "Quit").accelerator("CommandOrControl+Q");
    let keybinds = CustomMenuItem::new("keybinds".to_string(), "Change Keybinds")
        .accelerator("CommandOrControl+K");
    let tray_menu = SystemTrayMenu::new().add_item(quit).add_item(keybinds);

    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .invoke_handler(tauri::generate_handler![
            get_apps,
            set_app_volume,
            volume,
            get_key_state
        ])
        .setup(|app| {
            let main_window = app.get_window("main").unwrap();
            let controls_window = app.get_window("controls").unwrap();

            #[cfg(any(windows, target_os = "macos"))]
            set_shadow(&main_window, true).unwrap();
            set_shadow(&controls_window, true).unwrap();

            #[cfg(target_os = "windows")]
            apply_acrylic(&main_window, Some((125, 125, 125, 125)))
                .expect("Unsupported platform! 'apply_blur' is only supported on Windows");
            apply_acrylic(&controls_window, Some((125, 125, 125, 125)))
                .expect("Unsupported platform! 'apply_blur' is only supported on Windows");

            Ok(())
        })
        .system_tray(
            SystemTray::new()
                .with_id("AudioControler")
                .with_menu(tray_menu)
                .with_tooltip("Audio Controller"),
        )
        .on_system_tray_event(|app, event| {
            tauri_plugin_positioner::on_tray_event(app, &event);

            match event {
                SystemTrayEvent::LeftClick {
                    position: _,
                    size: _,
                    ..
                } => {
                    let window = app.get_window("main").unwrap();
                    let _ = window.move_window(Position::BottomRight);
                    window.show().unwrap();
                    window.set_skip_taskbar(true).unwrap();
                    window.set_focus().unwrap();
                }
                SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                    "keybinds" => {
                        let window = app.get_window("controls").unwrap();
                        let _ = window.move_window(Position::BottomRight);
                        window.show().unwrap();
                        window.set_skip_taskbar(true).unwrap();
                        window.set_focus().unwrap();
                    }

                    "quit" => {
                        std::process::exit(0);
                    }
                    _ => {}
                },
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

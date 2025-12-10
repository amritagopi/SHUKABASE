use std::process::{Command, Child, Stdio};
use std::sync::Mutex;
use tauri::{Manager, Emitter};
use std::io::{BufRead, BufReader};
use std::thread;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

struct AppState {
    _python_process: Mutex<Option<Child>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let state = AppState {
      _python_process: Mutex::new(None),
  };

  tauri::Builder::default()
    .manage(state)
    .setup(|app| {
      // 1. Initialize Logger (Always active for diagnostics)
      // We ignore errors here because if logging fails, we can't do much, but we don't want to crash.
      let _ = app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
      );

      // 2. Initialize Opener (Safe init)
      if let Err(e) = app.handle().plugin(tauri_plugin_opener::init()) {
          log::error!("Failed to initialize opener plugin: {}", e);
      }

      // 3. Initialize Updater (Safe init - unexpected config shouldn't kill app)
      match tauri_plugin_updater::Builder::new().build() {
          Ok(updater_plugin) => {
              if let Err(e) = app.handle().plugin(updater_plugin) {
                  log::error!("Failed to register updater plugin: {}", e);
              }
          }
          Err(e) => {
              log::error!("Failed to build updater plugin: {}", e);
          }
      }

      let app_handle = app.handle().clone();
      
      // Запускаем Python сервер в отдельном потоке
      thread::spawn(move || {
          let (cmd, args, cwd) = if cfg!(debug_assertions) {
              // DEV MODE: python rag/rag_api_server.py
              let mut cwd = std::env::current_dir().unwrap();
              // If running from src-tauri, move up to project root
              if cwd.ends_with("src-tauri") {
                  cwd.pop();
              }
              let script = cwd.join("rag").join("rag_api_server.py");
              ("python".to_string(), vec![script.to_string_lossy().to_string()], cwd)
          } else {
              // PROD MODE: rag_api_server executable
              // Используем механизм ресурсов Tauri для поиска файла
              let bin_name = if cfg!(target_os = "windows") {
                  "rag_api_server.exe"
              } else {
                  "rag_api_server"
              };

              // Safely resolve resource to avoid panic
              match app_handle.path().resolve(bin_name, tauri::path::BaseDirectory::Resource) {
                  Ok(path) => {
                      let cwd = path.parent().unwrap().to_path_buf();
                      (path.to_string_lossy().to_string(), vec![], cwd)
                  },
                  Err(e) => {
                      log::error!("CRITICAL: Failed to resolve backend binary '{}': {}", bin_name, e);
                      return; // Exit thread, don't crash app
                  }
              }
          };

          println!("🚀 Starting Backend: {} in {:?}", cmd, cwd);
          log::info!("🚀 Starting Backend: {} in {:?}", cmd, cwd);

          let mut command = Command::new(&cmd);
          command.args(&args);
          command.current_dir(&cwd);
          command.stdout(Stdio::piped());
          command.stderr(Stdio::piped()); // Capture stderr too
          
          // Скрываем окно консоли в Windows
          #[cfg(target_os = "windows")]
          command.creation_flags(CREATE_NO_WINDOW);

          match command.spawn() {
              Ok(mut child) => {
                  println!("✅ Backend started (PID: {})", child.id());
                  log::info!("✅ Backend started (PID: {})", child.id());
                  
                  let stdout = child.stdout.take().expect("Failed to capture stdout");
                  let stderr = child.stderr.take().expect("Failed to capture stderr");

                  // Spawn a thread to read stderr and print it (for debugging)
                  thread::spawn(move || {
                      let reader = BufReader::new(stderr);
                      for line in reader.lines() {
                          if let Ok(line) = line {
                               eprintln!("[BACKEND_ERR]: {}", line);
                               log::error!("[BACKEND_ERR]: {}", line);
                          }
                      }
                  });

                  let reader = BufReader::new(stdout);
                  let mut server_ready = false;
                      
                  for line in reader.lines() {
                      if let Ok(line) = line {
                          println!("[BACKEND]: {}", line);
                          log::info!("[BACKEND]: {}", line);
                          
                          if line.contains("STATUS: SERVER_STARTED") {
                              println!("🎉 Backend started!");
                              server_ready = true;
                          }
                      }
                  }

                  // If we exit the loop, the stdout stream ended, meaning the process likely died.
                  if !server_ready {
                      println!("❌ Backend process exited unexpectedly!");
                      log::error!("❌ Backend process exited unexpectedly!");
                      let _ = app_handle.emit("splash-update", "Error: Backend process exited unexpectedly. Check logs.");
                  }
              }
              Err(e) => {
                  eprintln!("❌ Failed to start backend: {}", e);
                  log::error!("❌ Failed to start backend: {}", e);
                  let _ = app_handle.emit("splash-update", format!("Error: {}", e));
              }
          }
      });

      Ok(())
    })
    .on_window_event(|_window, event| {
        if let tauri::WindowEvent::Destroyed = event {
            // В идеале тут нужно убивать процесс, но так как мы отпустили child в thread,
            // ОС сама убьет его, если это дочерний процесс (обычно).
            // Для надежности можно использовать taskkill в Windows.
            #[cfg(target_os = "windows")]
            {
                 let _ = Command::new("taskkill")
                    .args(["/F", "/IM", "rag_api_server.exe"])
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn();
            }
        }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

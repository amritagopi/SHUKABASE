use std::process::{Command, Child, Stdio};
use std::sync::Mutex;
use tauri::{Manager, Emitter};
use std::io::{BufRead, BufReader};
use std::thread;
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

struct AppState {
    python_process: Mutex<Option<Child>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let state = AppState {
      python_process: Mutex::new(None),
  };

  tauri::Builder::default()
    .manage(state)
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let app_handle = app.handle().clone();
      
      // Запускаем Python сервер в отдельном потоке
      thread::spawn(move || {
          let (cmd, args, cwd) = if cfg!(debug_assertions) {
              // DEV MODE: python rag/rag_api_server.py
              let cwd = std::env::current_dir().unwrap();
              let script = cwd.join("rag").join("rag_api_server.py");
              ("python".to_string(), vec![script.to_string_lossy().to_string()], cwd)
          } else {
              // PROD MODE: rag_api_server.exe
              // Используем механизм ресурсов Tauri для поиска файла
              let server_exe = app_handle.path().resolve("rag_api_server.exe", tauri::path::BaseDirectory::Resource)
                  .expect("failed to resolve resource rag_api_server.exe");
              let cwd = server_exe.parent().unwrap().to_path_buf();
              (server_exe.to_string_lossy().to_string(), vec![], cwd)
          };

          println!("🚀 Starting Backend: {} in {:?}", cmd, cwd);

          let mut command = Command::new(&cmd);
          command.args(&args);
          command.current_dir(&cwd);
          command.stdout(Stdio::piped());
          
          // Скрываем окно консоли в Windows
          #[cfg(target_os = "windows")]
          command.creation_flags(CREATE_NO_WINDOW);

          match command.spawn() {
              Ok(mut child) => {
                  println!("✅ Backend started (PID: {})", child.id());
                  
                  // Читаем stdout в реальном времени
                  if let Some(stdout) = child.stdout.take() {
                      let reader = BufReader::new(stdout);
                      
                      for line in reader.lines() {
                          if let Ok(line) = line {
                              println!("[BACKEND]: {}", line);
                              
                              // Обработка статусов для Splash Screen
                              if line.contains("STATUS: DOWNLOADING_DATA") {
                                  let _ = app_handle.emit("splash-update", "Downloading knowledge base... (this may take a while)");
                              } else if line.contains("STATUS: EXTRACTING_DATA") {
                                  let _ = app_handle.emit("splash-update", "Extracting ancient wisdom...");
                              } else if line.contains("STATUS: INITIALIZING_ENGINE") {
                                  let _ = app_handle.emit("splash-update", "Initializing AI engine...");
                              } else if line.contains("STATUS: READY") {
                                  // Сервер готов!
                                  println!("🎉 Backend is READY! Switching windows...");
                                  
                                  // Закрываем splash
                                  if let Some(splash) = app_handle.get_webview_window("splash") {
                                      let _ = splash.close();
                                  }
                                  
                                  // Показываем main
                                  if let Some(main) = app_handle.get_webview_window("main") {
                                      let _ = main.show();
                                      let _ = main.set_focus();
                                  }
                              }
                          }
                      }
                  }
                  
                  // Сохраняем процесс в стейт (если нужно убить потом)
                  // Но так как мы забрали stdout, child уже частично "consumed", 
                  // поэтому просто оставим его работать. 
                  // В реальном приложении лучше использовать Arc/Mutex для child, но тут упростим.
              }
              Err(e) => {
                  eprintln!("❌ Failed to start backend: {}", e);
                  let _ = app_handle.emit("splash-update", format!("Error: {}", e));
              }
          }
      });

      Ok(())
    })
    .on_window_event(|window, event| {
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

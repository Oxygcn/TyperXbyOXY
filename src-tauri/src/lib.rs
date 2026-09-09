#![cfg(windows)]
mod job;
mod process;
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use serde_json::{json, Value};
use tauri::{Manager, State};
use tokio::sync::Mutex;
use process::Engine;

#[derive(Default)]
struct Desktop {
    engine: Mutex<Option<Arc<Engine>>>,
    connecting: Mutex<()>,
    closing: AtomicBool,
}

#[tauri::command]
async fn backend_connect(app: tauri::AppHandle, window: tauri::WebviewWindow,
                         state: State<'_, Desktop>) -> Result<Value, String> {
    if window.label() != "main" || state.closing.load(Ordering::SeqCst) { return Err("Окно закрывается".into()); }
    let _gate = state.connecting.lock().await;
    let existing = state.engine.lock().await.clone();
    if let Some(engine) = existing {
        if engine.is_alive() { return engine.request("snapshot", json!({})).await; }
    }
    let hwnd = window.hwnd().map_err(|_| "Не удалось получить целевое окно")?.0 as usize;
    let engine = Engine::spawn(app).await?;
    if let Err(e) = engine.request("hello", json!({"protocol":1,"window":hwnd})).await {
        engine.terminate(); return Err(e);
    }
    let snapshot = match engine.request("snapshot", json!({})).await {
        Ok(value) => value,
        Err(error) => {engine.terminate(); return Err(error);}
    };
    *state.engine.lock().await = Some(engine);
    Ok(snapshot)
}

#[tauri::command]
async fn backend_request(window: tauri::WebviewWindow, state: State<'_, Desktop>,
                         operation: String, data: Value) -> Result<Value, String> {
    const ALLOWED: &[&str] = &["snapshot","save","code","login","logout","chats",
                            "select","focus","test","prepare","stop","profile"];
    if window.label() != "main" || !ALLOWED.contains(&operation.as_str()) || !data.is_object() {
        return Err("Операция запрещена".into());
    }
    if state.closing.load(Ordering::SeqCst) && operation != "stop" { return Err("Окно закрывается".into()); }
    let engine = state.engine.lock().await.clone().ok_or("Python не подключён")?;
    engine.request(&operation, data).await
}

pub fn run() {
    tauri::Builder::default()
        .manage(Desktop::default())
        .invoke_handler(tauri::generate_handler![backend_connect, backend_request])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle().clone();
                let state = app.state::<Desktop>();
                if state.closing.swap(true, Ordering::SeqCst) { return; }
                tauri::async_runtime::spawn(async move {
                    let state = app.state::<Desktop>();
                    let _gate = state.connecting.lock().await;
                    let engine = state.engine.lock().await.take();
                    if let Some(engine) = engine { engine.shutdown().await; }
                    app.exit(0);
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("TyperX desktop could not start");
}

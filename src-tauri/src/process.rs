use crate::job::Job;
use serde_json::{json, Value};
use std::{collections::HashMap, sync::{Arc, atomic::{AtomicBool, AtomicU64, Ordering}}, time::Duration};
use tauri::Emitter;
use tokio::{io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWriteExt, BufReader},
            process::{ChildStdin, Command}, sync::{Mutex, oneshot, watch}, time::timeout};

const MAX_REQUEST: usize = 65_536;
const MAX_FRAME: usize = 4_000_000;
type Reply = Result<Value, String>;

pub struct Engine {
    stdin: Mutex<ChildStdin>,
    pending: Mutex<HashMap<String, oneshot::Sender<Reply>>>,
    sequence: AtomicU64,
    alive: AtomicBool,
    kill: watch::Sender<bool>,
    app: tauri::AppHandle,
}

// Read a newline frame with a hard bound, without unbounded read_line allocation.
async fn frame<R: AsyncRead + Unpin>(reader: &mut BufReader<R>) -> Result<Option<Vec<u8>>, ()> {
    let mut result = Vec::new();
    loop {
        let buffer = reader.fill_buf().await.map_err(|_| ())?;
        if buffer.is_empty() { return if result.is_empty() { Ok(None) } else { Err(()) }; }
        let size = buffer.iter().position(|b| *b == b'\n').map(|n| n+1).unwrap_or(buffer.len());
        if result.len() + size > MAX_FRAME { return Err(()); }
        let complete = buffer[size-1] == b'\n';
        result.extend_from_slice(&buffer[..size]); reader.consume(size);
        if complete { return Ok(Some(result)); }
    }
}

impl Engine {
    pub fn is_alive(&self) -> bool { self.alive.load(Ordering::SeqCst) }
    pub fn terminate(&self) { let _ = self.kill.send(true); }

    pub async fn spawn(app: tauri::AppHandle) -> Result<Arc<Self>, String> {
        // No frontend-controlled executable, arguments, working directory or environment.
        let exe = if cfg!(debug_assertions) {
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("binaries/typerx-engine-x86_64-pc-windows-msvc.exe")
        } else {
            std::env::current_exe().map_err(|_| "Не найден путь приложения")?
                .parent().ok_or("Не найден каталог приложения")?.join("typerx-engine.exe")
        };
        if !exe.is_file() { return Err("Python sidecar отсутствует. Сначала выполните scripts/build-engine.ps1.".into()); }
        let mut child = Command::new(exe)
            .stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped()).kill_on_drop(true)
            .env_remove("PYTHONPATH").env_remove("PYTHONHOME")
            .creation_flags(0x08000000) // CREATE_NO_WINDOW, never run elevated
            .spawn().map_err(|_| "Не удалось запустить Python sidecar")?;
        let raw = child.raw_handle().ok_or("Python не предоставил дескриптор процесса")?;
        let job = Job::attach(raw)?;
        let stdin = child.stdin.take().ok_or("Нет stdin Python")?;
        let stdout = child.stdout.take().ok_or("Нет stdout Python")?;
        let mut stderr = child.stderr.take().ok_or("Нет stderr Python")?;
        let (kill, mut killed) = watch::channel(false);
        let engine = Arc::new(Self {stdin:Mutex::new(stdin),pending:Mutex::new(HashMap::new()),
            sequence:AtomicU64::new(0),alive:AtomicBool::new(true),kill,app});
        let weak = Arc::downgrade(&engine);
        // Drain stderr, but never expose or persist it: third-party errors can contain secrets.
        tokio::spawn(async move {let mut b=[0u8;4096];while let Ok(n)=stderr.read(&mut b).await {if n==0{break;}}});
        tokio::spawn(async move {
            let _job = job; // drops after process termination; kills descendants too
            tokio::select! {
                _ = child.wait() => {},
                _ = killed.changed() => { let _=child.start_kill(); let _=child.wait().await; }
            }
            if let Some(engine)=weak.upgrade(){engine.fail("Python завершился. Проверьте черновик и подключите движок заново.").await;}
        });
        let reader_engine=Arc::clone(&engine);
        tokio::spawn(async move {
            let mut reader=BufReader::new(stdout);
            loop {
                match frame(&mut reader).await {
                    Ok(Some(bytes)) => {
                        let value: Value = match serde_json::from_slice(&bytes) {Ok(v)=>v, Err(_)=>break};
                        if let Some(id)=value.get("id").and_then(Value::as_str) {
                            if let Some(reply)=reader_engine.pending.lock().await.remove(id) {
                                let result=if value.get("ok")==Some(&Value::Bool(true)) {Ok(value.get("data").cloned().unwrap_or(Value::Null))}
                                    else {Err(value.get("error").and_then(Value::as_str).unwrap_or("Ошибка Python").to_owned())};
                                let _=reply.send(result);
                            }
                        } else if value.get("event").and_then(Value::as_str)==Some("state") {
                            // Only a notification is broadcast; no config, secrets or message content.
                            let _=reader_engine.app.emit("backend-state", ());
                        } else if value.get("event").and_then(Value::as_str)==Some("fatal") {break;}
                    },
                    _ => break,
                }
            }
            reader_engine.terminate();
            reader_engine.fail("Соединение с Python закрыто или нарушен протокол.").await;
        });
        Ok(engine)
    }

    async fn fail(&self, reason: &str) {
        if !self.alive.swap(false, Ordering::SeqCst) { return; }
        for (_, reply) in self.pending.lock().await.drain() {let _=reply.send(Err(reason.into()));}
        let _=self.app.emit("backend-exit", ());
    }

    pub async fn request(&self, operation: &str, data: Value) -> Reply {
        if !self.is_alive() {return Err("Python отключён".into());}
        let id=self.sequence.fetch_add(1,Ordering::SeqCst).to_string();
        let mut bytes=serde_json::to_vec(&json!({"id":id,"operation":operation,"data":data})).map_err(|_|"Неверные параметры")?;
        bytes.push(b'\n');
        if bytes.len()>MAX_REQUEST {return Err("Запрос больше 64 КБ. Сократите текст или пресеты.".into());}
        let urgent=matches!(operation,"stop"|"shutdown");
        let (sender, receiver)=oneshot::channel();
        {
            let mut pending=self.pending.lock().await;
            if pending.len()>=4 && !urgent {return Err("Дождитесь текущих операций".into());}
            if pending.len()>=8 {return Err("Слишком много запросов остановки".into());}
            pending.insert(id.clone(),sender);
        }
        let written=timeout(Duration::from_secs(2), async {
            let mut input=self.stdin.lock().await;
            input.write_all(&bytes).await?; input.flush().await
        }).await;
        if !matches!(written,Ok(Ok(()))) {
            self.pending.lock().await.remove(&id);
            self.terminate();
            return Err("Канал управления завис. Python принудительно остановлен; проверьте черновик.".into());
        }
        let seconds=if urgent{2}else{65};
        match timeout(Duration::from_secs(seconds),receiver).await {
            Ok(Ok(result))=>result,
            _=>{
                self.pending.lock().await.remove(&id);
                // Never retry a mutation: its result may be unknown. Stop the process instead.
                self.terminate();
                Err("Время ожидания истекло. Движок остановлен; результат операции может быть неизвестен.".into())
            }
        }
    }

    pub async fn shutdown(&self) {
        let _=self.request("shutdown",json!({})).await;
        for _ in 0..140 {if !self.is_alive(){return;}tokio::time::sleep(Duration::from_millis(100)).await;}
        self.terminate();
        for _ in 0..20 {if !self.is_alive(){return;}tokio::time::sleep(Duration::from_millis(100)).await;}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn bounded_frames() {
        let mut reader=BufReader::new(&b"{\"a\":1}\n"[..]);
        assert_eq!(frame(&mut reader).await.unwrap().unwrap(),b"{\"a\":1}\n");
        assert!(frame(&mut reader).await.unwrap().is_none());
        let huge=vec![b'x';MAX_FRAME+1];
        assert!(frame(&mut BufReader::new(huge.as_slice())).await.is_err());
    }
}

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const BOOTSTRAP: &str = r###"
(function () {
  if (window.__typerxMonkeytype) return;
  window.__typerxMonkeytype = true;
  let stop = false;
  let running = false;

  function remaining() {
    const words = Array.from(document.querySelectorAll("#words .word"));
    const start = words.findIndex((w) => w.classList.contains("active"));
    if (start < 0) return "";
    return words
      .slice(start)
      .map((w) => {
        const letters = Array.from(w.querySelectorAll("letter"));
        const done = letters.filter(
          (l) =>
            l.classList.contains("correct") ||
            l.classList.contains("incorrect"),
        ).length;
        return letters.map((l) => l.textContent || "").join("").slice(done);
      })
      .join(" ");
  }

  function fire(ch) {
    const isSpace = ch === " ";
    const opts = {
      key: ch,
      code: isSpace ? "Space" : "Key" + String(ch).toUpperCase(),
      keyCode: isSpace ? 32 : String(ch).toUpperCase().charCodeAt(0),
      which: isSpace ? 32 : String(ch).toUpperCase().charCodeAt(0),
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    document.dispatchEvent(new KeyboardEvent("keydown", opts));
    document.dispatchEvent(new KeyboardEvent("keypress", opts));
    document.dispatchEvent(new KeyboardEvent("keyup", opts));
  }

  async function run() {
    if (running) return;
    running = true;
    stop = false;
    const host = document.querySelector("#wordsWrapper, #words, .typingTest");
    if (host && typeof host.click === "function") host.click();
    const text = remaining();
    for (const ch of text) {
      if (stop) break;
      fire(ch);
      await new Promise((r) => setTimeout(r, 45 + Math.random() * 35));
    }
    running = false;
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "F6") {
        e.preventDefault();
        e.stopPropagation();
        void run();
      }
      if (e.key === "F9") stop = true;
    },
    true,
  );
})();
"###;

pub async fn open(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Операция запрещена".into());
    }
    if let Some(existing) = app.get_webview_window("monkeytype") {
        let _ = existing.set_focus();
        return Ok(());
    }
    let url = "https://monkeytype.com/"
        .parse()
        .map_err(|_| "Некорректный адрес Monkeytype".to_string())?;
    WebviewWindowBuilder::new(&app, "monkeytype", WebviewUrl::External(url))
        .title("Monkeytype — TyperX")
        .inner_size(1280.0, 860.0)
        .center()
        .initialization_script(BOOTSTRAP)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

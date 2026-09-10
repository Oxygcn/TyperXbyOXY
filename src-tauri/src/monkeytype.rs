use std::mem::size_of;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use windows_sys::Win32::UI::{
    Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
        KEYEVENTF_UNICODE,
    },
    WindowsAndMessaging::GetForegroundWindow,
};

const BOOTSTRAP: &str = r###"
(function () {
  if (window.__typerxMonkeytype) return;
  window.__typerxMonkeytype = true;

  let running = false;
  let stopRequested = false;
  let stopReason = "";
  let statusNode = null;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function mountStatus() {
    if (statusNode || !document.documentElement) return;
    statusNode = document.createElement("div");
    statusNode.id = "typerx-monkeytype-status";
    statusNode.setAttribute("role", "status");
    Object.assign(statusNode.style, {
      position: "fixed",
      right: "18px",
      bottom: "18px",
      zIndex: "2147483647",
      padding: "9px 13px",
      borderRadius: "9px",
      background: "rgba(35, 36, 32, 0.94)",
      border: "1px solid rgba(226, 183, 20, 0.42)",
      boxShadow: "0 8px 30px rgba(0, 0, 0, 0.22)",
      color: "#d7d7d1",
      font: "600 12px/1.4 Segoe UI, sans-serif",
      letterSpacing: "0.01em",
      pointerEvents: "none",
      transition: "opacity 120ms ease",
    });
    document.documentElement.appendChild(statusNode);
    setStatus("F6 — старт  ·  F9 — стоп", false);
  }

  function setStatus(text, active) {
    mountStatus();
    if (!statusNode) return;
    statusNode.textContent = `TyperX  ·  ${text}`;
    statusNode.style.color = active ? "#e2b714" : "#d7d7d1";
    statusNode.style.borderColor = active
      ? "rgba(226, 183, 20, 0.72)"
      : "rgba(226, 183, 20, 0.32)";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountStatus, { once: true });
  } else {
    mountStatus();
  }

  function currentTarget() {
    const word = document.querySelector("#words .word.active");
    if (!word) return null;

    const letters = Array.from(word.querySelectorAll("letter"));
    const next = letters.find((letter) => {
      const classes = letter.classList;
      return (
        !classes.contains("correct") &&
        !classes.contains("incorrect") &&
        !classes.contains("extra")
      );
    });

    if (next) {
      const value = Array.from(next.textContent || "")[0];
      return value ? { key: value, word } : null;
    }
    return { key: " ", word };
  }

  function requestStop(reason) {
    if (!running) return;
    stopReason = reason;
    stopRequested = true;
    setStatus("остановка…", false);
  }

  async function run() {
    if (running) return;
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (typeof invoke !== "function") {
      setStatus("нативный ввод недоступен", false);
      return;
    }

    running = true;
    stopRequested = false;
    stopReason = "";
    let typed = 0;
    let missingCycles = 0;
    let spacedWord = null;
    setStatus("печатает  ·  F9 — стоп", true);

    try {
      while (!stopRequested) {
        if (document.hidden || !document.hasFocus()) {
          stopReason = "окно потеряло фокус";
          break;
        }

        const target = currentTarget();
        if (!target) {
          missingCycles += 1;
          if (missingCycles >= 24) break;
          await sleep(50);
          continue;
        }
        missingCycles = 0;

        if (target.key === " " && target.word === spacedWord) {
          await sleep(30);
          continue;
        }

        await invoke("monkeytype_key", { text: target.key });
        typed += 1;
        if (target.key === " ") spacedWord = target.word;
        await sleep(42 + Math.random() * 46);
      }

      if (stopReason) {
        setStatus(`стоп  ·  ${stopReason}`, false);
      } else if (typed === 0) {
        setStatus("тест не найден — кликните по словам", false);
      } else {
        setStatus(`готово  ·  ${typed} знаков`, false);
      }
    } catch (error) {
      const message = String(error || "ошибка ввода");
      setStatus(
        message.includes("фокус") ? "стоп  ·  окно потеряло фокус" : "ошибка нативного ввода",
        false,
      );
    } finally {
      running = false;
      stopRequested = false;
      stopReason = "";
    }
  }

  function blockHotkey(event) {
    if (event.key !== "F6" && event.key !== "F9") return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  window.addEventListener(
    "keydown",
    (event) => {
      if (!blockHotkey(event) || event.repeat) return;
      if (event.key === "F6") void run();
      else requestStop("F9");
    },
    true,
  );
  window.addEventListener("keyup", blockHotkey, true);
  window.addEventListener("blur", () => requestStop("окно потеряло фокус"));
  window.addEventListener("beforeunload", () => requestStop("страница закрыта"));
})();
"###;

pub async fn open(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Операция запрещена".into());
    }
    if let Some(existing) = app.get_webview_window("monkeytype") {
        let _ = existing.unminimize();
        let _ = existing.show();
        existing
            .set_focus()
            .map_err(|error| format!("Не удалось показать Monkeytype: {error}"))?;
        return Ok(());
    }

    let url = "https://monkeytype.com/"
        .parse()
        .map_err(|_| "Некорректный адрес Monkeytype".to_string())?;
    WebviewWindowBuilder::new(&app, "monkeytype", WebviewUrl::External(url))
        .title("Monkeytype — TyperX")
        .inner_size(1280.0, 860.0)
        .min_inner_size(900.0, 640.0)
        .center()
        .initialization_script(BOOTSTRAP)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn send_key(window: &WebviewWindow, text: &str) -> Result<(), String> {
    if window.label() != "monkeytype" {
        return Err("Операция запрещена".into());
    }

    let url = window
        .url()
        .map_err(|_| "Не удалось проверить адрес Monkeytype".to_string())?;
    if url.scheme() != "https" || url.host_str() != Some("monkeytype.com") {
        return Err("Нативный ввод разрешён только на monkeytype.com".into());
    }

    let target = window
        .hwnd()
        .map_err(|_| "Не удалось получить окно Monkeytype".to_string())?
        .0 as usize;
    let foreground = unsafe { GetForegroundWindow() } as usize;
    if foreground == 0 || foreground != target {
        return Err("Окно Monkeytype потеряло фокус".into());
    }

    let character = single_character(text)?;
    send_unicode(character)
}

fn single_character(text: &str) -> Result<char, String> {
    let mut characters = text.chars();
    let character = characters
        .next()
        .ok_or_else(|| "Пустой символ запрещён".to_string())?;
    if characters.next().is_some() || character.is_control() {
        return Err("Разрешён только один печатный символ".into());
    }
    Ok(character)
}

fn keyboard_input(unit: u16, flags: u32) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: 0,
                wScan: unit,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn send_unicode(character: char) -> Result<(), String> {
    let mut encoded = [0_u16; 2];
    let units = character.encode_utf16(&mut encoded);
    let mut inputs = Vec::with_capacity(units.len() * 2);
    for unit in units {
        inputs.push(keyboard_input(*unit, KEYEVENTF_UNICODE));
        inputs.push(keyboard_input(
            *unit,
            KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
        ));
    }

    let expected = inputs.len() as u32;
    let sent = unsafe { SendInput(expected, inputs.as_ptr(), size_of::<INPUT>() as i32) };
    if sent != expected {
        return Err(format!(
            "Windows приняла {sent} из {expected} событий клавиатуры"
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::single_character;

    #[test]
    fn accepts_one_printable_unicode_scalar() {
        assert_eq!(single_character("a").unwrap(), 'a');
        assert_eq!(single_character(" ").unwrap(), ' ');
        assert_eq!(single_character("ё").unwrap(), 'ё');
    }

    #[test]
    fn rejects_empty_multiple_and_control_characters() {
        assert!(single_character("").is_err());
        assert!(single_character("ab").is_err());
        assert!(single_character("\n").is_err());
        assert!(single_character("\t").is_err());
    }
}

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Globe2,
  Keyboard,
  LoaderCircle,
  ShieldCheck,
  Square,
} from "lucide-react";
import { Button } from "./ui/button";
import { isDesktop } from "../lib/bridge";
import "./Monkeytype.css";

export function MonkeytypePage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  const open = async () => {
    if (!isDesktop) {
      setError("Monkeytype доступен только в Windows-приложении TyperX.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await invoke("open_monkeytype");
      setOpened(true);
    } catch (cause) {
      setError(
        typeof cause === "string"
          ? cause
          : cause instanceof Error
            ? cause.message
            : "Не удалось открыть Monkeytype",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="monkeytype-layout">
      <section className="monkeytype-hero">
        <div className="monkeytype-hero-top">
          <span className="monkeytype-mark" aria-hidden="true">
            <Keyboard size={25} />
          </span>
          <span className="monkeytype-domain">
            <Globe2 size={14} /> monkeytype.com
          </span>
        </div>

        <div className="monkeytype-copy">
          <p className="monkeytype-kicker">NATIVE WEBVIEW</p>
          <h2>Тест скорости — внутри TyperX.</h2>
          <p>
            Откройте сайт, войдите в аккаунт и запускайте набор одной клавишей.
            Сессия остаётся в отдельном профиле WebView2 приложения.
          </p>
        </div>

        {error && (
          <div className="monkeytype-error" role="alert">
            <AlertCircle size={17} />
            <span>{error}</span>
          </div>
        )}

        <div className="monkeytype-actions">
          <Button
            className="monkeytype-open-button"
            disabled={busy}
            onClick={() => void open()}
          >
            {busy ? <LoaderCircle className="spin" size={17} /> : <Globe2 size={17} />}
            {opened ? "Вернуться в Monkeytype" : "Открыть Monkeytype"}
            <ArrowUpRight size={17} />
          </Button>
          <span className={`monkeytype-window-state ${opened ? "is-open" : ""}`}>
            {opened ? <Check size={14} /> : <span />}
            {opened ? "Окно открыто" : "Готово к запуску"}
          </span>
        </div>
      </section>

      <section className="monkeytype-control-panel">
        <header className="monkeytype-control-header">
          <div>
            <p>УПРАВЛЕНИЕ</p>
            <h2>Две клавиши. Без лишних действий.</h2>
          </div>
          <ShieldCheck size={22} aria-hidden="true" />
        </header>

        <div className="monkeytype-shortcuts">
          <div className="monkeytype-shortcut">
            <kbd>F6</kbd>
            <div>
              <strong>Начать набор</strong>
              <span>Печатает текущий тест нативными клавишами Windows.</span>
            </div>
          </div>
          <div className="monkeytype-shortcut">
            <kbd>F9</kbd>
            <div>
              <strong>Остановить</strong>
              <span>Прерывает цикл после текущего символа.</span>
            </div>
          </div>
        </div>

        <div className="monkeytype-focus-guard">
          <Square size={13} fill="currentColor" />
          <span>
            Набор работает только пока окно Monkeytype находится на переднем
            плане. Переключение окна останавливает его.
          </span>
        </div>

        <ol className="monkeytype-steps">
          <li>
            <span>01</span>
            Откройте сайт и выберите режим теста.
          </li>
          <li>
            <span>02</span>
            Кликните по словам, затем нажмите F6.
          </li>
          <li>
            <span>03</span>
            Для остановки нажмите F9 или смените окно.
          </li>
        </ol>
      </section>
    </div>
  );
}

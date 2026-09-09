import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowRight, Globe, Keyboard, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
import { isDesktop } from "../lib/bridge";

export function MonkeytypePage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  const open = async () => {
    if (!isDesktop) {
      setError("Окно Monkeytype доступно только в Windows-приложении Tauri.");
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
    <div className="studio-grid">
      <article className="card studio-editor">
        <div className="editor-heading">
          <h2>Встроенный Monkeytype</h2>
          <Globe size={18} aria-hidden="true" />
        </div>
        <p className="muted">
          Откроется отдельное окно со сайтом monkeytype.com. Можно войти в свой
          аккаунт: сессия хранится в профиле WebView2 приложения, не в обычном
          браузере.
        </p>
        {error && (
          <div role="alert" className="notice-banner error-banner">
            <ShieldCheck size={18} />
            <span>{error}</span>
          </div>
        )}
        {opened && !error && (
          <div role="status" className="notice-banner success-banner">
            Окно открыто. Если его не видно — проверьте панель задач.
          </div>
        )}
        <Button disabled={busy} onClick={() => void open()}>
          <Globe size={16} />
          {opened ? "Показать окно" : "Открыть Monkeytype"}
          <ArrowRight size={16} />
        </Button>
        <p className="field-hint">
          Синтетические клавиши могут игнорироваться античитом Monkeytype. Если
          набор не идёт — напишите, подключим ввод через Interception в это
          окно.
        </p>
      </article>
      <div className="studio-side">
        <article className="card launch-state">
          <div className="card-heading">
            <h2>Запуск</h2>
            <Keyboard size={18} aria-hidden="true" />
          </div>
          <div className="key-visual">
            <kbd>F6</kbd>
            <ArrowRight size={20} />
            <Keyboard size={40} strokeWidth={1} />
          </div>
          <h3>Печать в окне сайта</h3>
          <div className="launch-steps">
            <p>
              <span>1</span>Откройте Monkeytype и при необходимости войдите
            </p>
            <p>
              <span>2</span>Начните тест и кликните по словам
            </p>
            <p>
              <span>3</span>Нажмите F6 в окне Monkeytype
            </p>
          </div>
          <p className="muted">
            F8 по-прежнему запускает движок Telegram. F9 останавливает набор в
            Monkeytype.
          </p>
        </article>
      </div>
    </div>
  );
}

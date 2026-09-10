import { useEffect, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  ArrowRight,
  Keyboard,
  ShieldCheck,
  Square,
  Zap,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Busy, CardTitle, ignored, Kbd } from "../ui-shared";
import { stageLabels } from "../lib/contracts";
import { useApp } from "../store/app";

export function Studio() {
  const s = useApp();
  const v = s.snapshot;
  const {
    mode,
    setMode,
    draft: text,
    setDraft: setText,
    bindChat,
    setBindChat,
  } = s;
  const [consent, setConsent] = useState(false);
  const [sendAck, setSendAck] = useState(false);
  useEffect(() => {
    setConsent(false);
    setSendAck(false);
  }, [mode, v?.target?.id, v?.config.base_url, bindChat]);
  const locked =
    s.busy || s.connection !== "connected" || !!v?.active || !!v?.prepared;
  const prepare = () =>
    void s
      .run("prepare", {
        mode,
        text: mode === "manual" ? text : undefined,
        consent,
        ack_send: sendAck,
        bind_chat: bindChat,
      })
      .catch(ignored);
  return (
    <div className="studio-grid">
      <article className="card studio-editor">
        <Tabs.Root
          value={mode}
          onValueChange={(val) => {
            if (!locked) setMode(val as "manual" | "ai");
          }}
        >
          <Tabs.List className="tabs-list" aria-label="Режим ввода">
            <Tabs.Trigger value="manual" disabled={locked}>
              <Keyboard size={16} />
              Мой текст
            </Tabs.Trigger>
            <Tabs.Trigger value="ai" disabled={locked}>
              <Zap size={16} />
              AI-ответы
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="manual">
            <div className="editor-heading">
              <h2>Что будем печатать?</h2>
              <span>{text.length.toLocaleString("ru-RU")} / 8 000</span>
            </div>
            <textarea
              className="text-editor"
              aria-label="Текст для печати"
              placeholder="Введите текст. TyperX напечатает его в выбранном окне с естественным ритмом…"
              value={text}
              maxLength={8000}
              disabled={locked}
              onChange={(e) => setText(e.target.value)}
            />
            <p className="field-hint">
              Буфер хранится только в памяти интерфейса. Переносы и управляющие
              символы нормализуются движком.
            </p>
          </Tabs.Content>
          <Tabs.Content value="ai">
            <div className="ai-intro">
              <span className="empty-icon">
                <Zap size={28} />
              </span>
              <h2>Ответы в вашем стиле</h2>
              <p>
                В личке AI ждёт новые сообщения собеседника. В группе сначала
                выберите человека в списке сообщений — читаются и отвечаются
                только его тексты.
              </p>
            </div>
            <div className="detail-row">
              <span>Чат</span>
              <strong>{v?.target?.name ?? "Не выбран"}</strong>
            </div>
            <div className="detail-row">
              <span>Модель</span>
              <strong>{v?.config.model ?? "Не настроена"}</strong>
            </div>
            <div className="detail-row">
              <span>Пресет</span>
              <strong>
                {v?.config.presets.find((p) => p.id === v.config.active_preset)
                  ?.name ?? "—"}
              </strong>
            </div>
            <Button
              variant="outline"
              onClick={() => s.navigate("telegram")}
              disabled={locked}
            >
              Выбрать чат
              <ArrowRight size={16} />
            </Button>
            <label className="consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={locked}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                Разрешаю передать до 50 сообщений выбранного чата провайдеру{" "}
                <strong className="break-anywhere">
                  {v?.config.base_url ?? "из настроек"}
                </strong>{" "}
                для создания ответов.
              </span>
            </label>
          </Tabs.Content>
        </Tabs.Root>
        <div className="editor-footer">
          <label className="consent">
            <input
              type="checkbox"
              checked={bindChat}
              disabled={locked}
              onChange={(event) => setBindChat(event.target.checked)}
              aria-describedby="chat-binding-description"
            />
            <span>Проверять чат назначения</span>
          </label>
          <p id="chat-binding-description" className="field-hint" role="status">
            {bindChat
              ? "Включено: проверяются заголовок и привязка к чату."
              : "Выключено: название чата и заголовок не проверяются. Ввод — в окно, выбранное через F8. Не переключайте чат внутри этого окна."}
          </p>
          {!bindChat && mode === "ai" && (
            <p className="field-hint">
              AI продолжит получать сообщения выбранной цели, но может
              напечатать ответ в другом чате. Проверьте получателя сами.
            </p>
          )}
          <label className="consent">
            <input
              type="checkbox"
              checked={sendAck}
              disabled={locked}
              onChange={(e) => setSendAck(e.target.checked)}
            />
            <span>
              Понимаю: движок нажимает <strong>Enter</strong> после каждого
              фрагмента. Это может отправлять сообщения.
            </span>
          </label>
          <Button
            disabled={
              locked ||
              !sendAck ||
              (mode === "manual"
                ? !text.trim()
                : !consent || !v?.target?.can_reply || !v.profile)
            }
            onClick={prepare}
          >
            {s.busy ? <Busy /> : <ShieldCheck size={17} />}Подготовить запуск
            <ArrowRight size={16} />
          </Button>
        </div>
      </article>
      <div className="studio-side">
        <article
          className={`card launch-state ${v?.prepared ? "ready-card" : ""}`}
        >
          <CardTitle icon={Keyboard}>Состояние запуска</CardTitle>
          <div className="key-visual">
            <Kbd>F8</Kbd>
            <ArrowRight size={20} />
            <Keyboard size={40} strokeWidth={1} />
          </div>
          <h3 aria-live="polite">
            {v ? stageLabels[v.stage] : "Ожидание подключения"}
          </h3>
          <p>
            {v?.detail ?? "Подключите Python-движок, чтобы подготовить ввод."}
          </p>
          <div className="launch-steps">
            <p>
              <span>1</span>Подготовьте запуск в студии
            </p>
            <p>
              <span>2</span>Перейдите в целевое поле ввода
            </p>
            <p>
              <span>3</span>Нажмите F8, не возвращаясь сюда
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void s.stop()}
            disabled={s.connection !== "connected"}
          >
            <Square size={13} />
            Отменить / остановить<Kbd>F9</Kbd>
          </Button>
        </article>
        <div className="note-card">
          <ShieldCheck size={20} />
          <p>
            <strong>Фокус изменился — ввод остановлен.</strong>{" "}
            Автовозобновления нет. Проверьте черновик перед новым запуском.
          </p>
        </div>
      </div>
    </div>
  );
}

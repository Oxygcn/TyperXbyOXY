import { useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  LockKeyhole,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Unplug,
  UserRound,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Confirm } from "../components/ui/dialog";
import { Avatar, Busy, CardTitle, Empty, ignored } from "../ui-shared";
import {
  focusResult,
  loginResult,
  selectResult,
  type PreviewMessage,
} from "../lib/contracts";
import { useApp } from "../store/app";

export function Telegram() {
  const s = useApp();
  const v = s.snapshot;
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"idle" | "code" | "password">("idle");
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [preview, setPreview] = useState<PreviewMessage[]>([]);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [focusName, setFocusName] = useState<string | null>(null);
  const locked =
    s.busy || s.connection !== "connected" || !!v?.active || !!v?.prepared;
  const login = async (op: "code" | "login") => {
    try {
      const response = loginResult.parse(
        await s.run(op, op === "login" ? { code, password } : {}),
      );
      setCode("");
      setPassword("");
      if (response.password_needed) setStep("password");
      else if (response.authorized) {
        setStep("idle");
        await s.run("profile");
        await s.run("chats");
      } else if (response.code_sent) setStep("code");
    } catch {
      setCode("");
      setPassword("");
    }
  };
  const refresh = async () => {
    try {
      await s.run("chats");
      await s.run("profile");
    } catch {
      /* Store shows the error */
    }
  };
  const pickChat = async (id: number) => {
    try {
      const result = selectResult.parse(await s.run("select", { id }));
      setPreview(result.messages);
      setFocusId(result.focus?.id ?? null);
      setFocusName(result.focus?.name ?? null);
    } catch {
      /* Store shows the error */
    }
  };
  const pickSender = async (message: PreviewMessage) => {
    if (message.outgoing) return;
    try {
      const result = focusResult.parse(
        await s.run("focus", { sender_id: message.sender_id }),
      );
      setFocusId(result.focus.id);
      setFocusName(result.focus.name);
    } catch {
      /* Store shows the error */
    }
  };
  return (
    <div className="telegram-grid">
      <article className="card">
        <CardTitle icon={Send}>Аккаунт</CardTitle>
        <div className="profile-centered">
          <Avatar large />
          <h2>{v?.profile?.name ?? "Подключите Telegram"}</h2>
          <p>
            {v?.profile?.username
              ? `@${v.profile.username}`
              : v?.profile
                ? "Авторизован через Telethon"
                : "Используется ваша локальная сессия"}
          </p>
        </div>
        {v?.profile ? (
          <>
            <div className="notice-banner success-banner">
              <CheckCheck size={18} />
              Авторизация подтверждена Telegram
            </div>
            {v.profile.avatar_warning && (
              <p role="status" className="field-hint">
                {v.profile.avatar_warning}
              </p>
            )}
            <Button
              variant="outline"
              disabled={locked}
              onClick={() => void s.run("profile").catch(ignored)}
            >
              <RefreshCw size={15} />
              Обновить фото профиля
            </Button>
            <Button
              variant="danger"
              className="logout"
              disabled={locked}
              onClick={() => setConfirm(true)}
            >
              <Unplug size={16} />
              Выйти из аккаунта
            </Button>
          </>
        ) : (
          <>
            <p className="muted">
              Укажите api_id, api_hash и телефон в настройках. Пароль 2FA и код
              не записываются на диск.
            </p>
            <Button variant="outline" onClick={() => s.navigate("settings")}>
              <Settings2 size={16} />
              Настройки Telegram
            </Button>
            <div className="auth-form">
              {step === "code" && (
                <label>
                  Код из Telegram
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={12}
                  />
                </label>
              )}
              {step === "password" && (
                <label>
                  Пароль двухэтапной проверки
                  <input
                    type="password"
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    maxLength={256}
                  />
                </label>
              )}
              <Button
                disabled={
                  locked ||
                  !v?.config.api_id ||
                  !v.config.has_api_hash ||
                  (step === "code" && !code) ||
                  (step === "password" && !password)
                }
                onClick={() => void login(step === "idle" ? "code" : "login")}
              >
                {s.busy ? <Busy /> : <Send size={16} />}{" "}
                {step === "idle" ? "Войти / запросить код" : "Подтвердить вход"}
              </Button>
              {step !== "idle" && (
                <Button
                  variant="ghost"
                  disabled={locked}
                  onClick={() => {
                    setCode("");
                    setPassword("");
                    setStep("idle");
                  }}
                >
                  Начать заново
                </Button>
              )}
            </div>
            <p className="field-hint">
              Есть сохранённая сессия? Нажмите «Загрузить чаты», чтобы
              подключить её без нового кода.
            </p>
          </>
        )}
        <div className="privacy-note">
          <LockKeyhole size={17} />
          <span>
            Фото загружается напрямую из вашего Telegram. При отсутствии фото
            показывается нейтральная иконка.
          </span>
        </div>
      </article>
      <article className="card chat-panel">
        <div className="card-heading">
          <h2>
            Чаты <span className="count-badge">{v?.chats.length ?? 0}</span>
          </h2>
          <Button
            size="sm"
            variant="outline"
            disabled={locked}
            onClick={() => void refresh()}
          >
            {s.busy ? <Busy /> : <RefreshCw size={15} />}Загрузить чаты
          </Button>
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Поиск чата"
            placeholder="Найти чат или группу"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <p className="field-hint">
          В группе после выбора появятся последние 50 сообщений. Нажмите
          входящее — AI будет читать и отвечать только этому человеку.
        </p>
        <div className="chat-list">
          {v?.chats.length ? (
            v.chats
              .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
              .map((c) => (
                <button
                  key={c.id}
                  className={`chat-row ${v.target?.id === c.id ? "selected-chat" : ""}`}
                  disabled={locked || !c.can_reply}
                  onClick={() => void pickChat(c.id)}
                >
                  <span className="chat-avatar">
                    <MessageCircle size={19} />
                  </span>
                  <span>
                    <strong>{c.name}</strong>
                    <small>
                      {c.can_reply
                        ? "Можно выбрать для AI"
                        : "Канал, бот или недоступно"}
                    </small>
                  </span>
                  {v.target?.id === c.id ? (
                    <Check size={18} />
                  ) : (
                    <ChevronRight size={17} />
                  )}
                </button>
              ))
          ) : (
            <Empty icon={MessageCircle} title="Пока нет чатов">
              Войдите или подключите сохранённую сессию, затем загрузите список
              чатов.
            </Empty>
          )}
          {!!v?.chats.length &&
            !v.chats.some((c) =>
              c.name.toLowerCase().includes(query.toLowerCase()),
            ) && (
              <Empty icon={Search} title="Ничего не найдено">
                Попробуйте другое имя.
              </Empty>
            )}
        </div>
        {preview.length > 0 && (
          <>
            <p className="field-hint">
              {focusName
                ? `Цель AI: ${focusName}. Читаются только сообщения этого человека.`
                : "Нажмите входящее сообщение, чтобы выбрать, кому отвечает AI."}
            </p>
            <div className="chat-list" aria-label="Последние сообщения группы">
              {preview.map((message) => (
                <button
                  key={message.id}
                  className={`chat-row ${
                    !message.outgoing && focusId === message.sender_id
                      ? "selected-chat"
                      : ""
                  }`}
                  disabled={locked || message.outgoing}
                  onClick={() => void pickSender(message)}
                >
                  <span className="chat-avatar">
                    <UserRound size={19} />
                  </span>
                  <span>
                    <strong>{message.name}</strong>
                    <small>{message.text}</small>
                  </span>
                  {!message.outgoing && focusId === message.sender_id ? (
                    <Check size={18} />
                  ) : (
                    <ChevronRight size={17} />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
        {v?.target && (
          <div className="chat-selected">
            <span>
              <Check size={16} />
              {v.target.name}
              {focusName ? ` · ${focusName}` : ""}
            </span>
            <Button size="sm" onClick={() => s.navigate("studio")}>
              В студию
              <ArrowRight size={14} />
            </Button>
          </div>
        )}
      </article>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="Выйти из Telegram?"
        description="Локальная сессия будет отозвана. Выбранный чат и фото будут очищены. Для повторного входа понадобится код."
        onConfirm={() => {
          setPreview([]);
          setFocusId(null);
          setFocusName(null);
          void s.run("logout").catch(ignored);
        }}
      />
    </div>
  );
}

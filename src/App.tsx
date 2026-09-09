import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import * as Tabs from "@radix-ui/react-tabs";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Command,
  FileText,
  Keyboard,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Plus,
  Power,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Terminal,
  Trash2,
  Unplug,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Confirm, Dialog } from "./components/ui/dialog";
import { useApp, type Page } from "./store/app";
import { isDesktop, subscribe } from "./lib/bridge";
import {
  focusResult,
  loginResult,
  publicToEditable,
  selectResult,
  settingsSchema,
  stageLabels,
  type Config,
  type PreviewMessage,
  type SettingsValues,
} from "./lib/contracts";
import validateConfig from "./generated/config.js";

const nav: { page: Page; label: string; icon: typeof Activity }[] = [
  { page: "overview", label: "Обзор", icon: LayoutDashboard },
  { page: "studio", label: "Студия ввода", icon: Keyboard },
  { page: "telegram", label: "Telegram", icon: Send },
  { page: "journal", label: "Журнал событий", icon: Activity },
];
const titles: Record<
  Page,
  { eyebrow: string; title: string; description: string }
> = {
  overview: {
    eyebrow: "ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО",
    title: "Всё под контролем.",
    description: "Естественный ввод. Осознанная автоматизация.",
  },
  studio: {
    eyebrow: "ПОДГОТОВКА И ЗАПУСК",
    title: "Студия ввода",
    description: "Вы управляете текстом. TyperX берёт на себя печать.",
  },
  telegram: {
    eyebrow: "ПОДКЛЮЧЕНИЯ",
    title: "Ваш Telegram",
    description: "Личный чат или группа. В группе цель задаётся сообщением.",
  },
  settings: {
    eyebrow: "ПАРАМЕТРЫ ДВИЖКА",
    title: "Точная настройка",
    description: "Ритм ввода, модель и характер ваших ответов.",
  },
  journal: {
    eyebrow: "ТЕКУЩАЯ СЕССИЯ",
    title: "Журнал событий",
    description: "Состояния движка — без текстов сообщений и секретов.",
  },
};
const ignored = () => {};
function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}
function Avatar({ large = false }: { large?: boolean }) {
  const p = useApp((s) => s.snapshot?.profile);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [p?.avatar]);
  return (
    <span className={`avatar ${large ? "avatar-large" : ""}`}>
      {p?.avatar && !failed ? (
        <img
          alt={`Фото Telegram: ${p.name}`}
          src={p.avatar}
          onError={() => setFailed(true)}
        />
      ) : (
        <UserRound size={large ? 32 : 20} aria-hidden="true" />
      )}
    </span>
  );
}
function Status() {
  const s = useApp();
  return (
    <span
      className={`status-tag ${s.connection === "connected" ? "online" : ""}`}
    >
      <span className="status-dot" />
      {s.connection === "connected"
        ? "Python подключён"
        : s.connection === "connecting"
          ? "Подключение…"
          : s.connection === "browser"
            ? "Просмотр в браузере"
            : "Python отключён"}
    </span>
  );
}
function Empty({
  icon: Icon = Unplug,
  title,
  children,
}: {
  icon?: typeof Activity;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={24} />
      </span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
function CardTitle({
  children,
  icon: Icon,
}: {
  children: ReactNode;
  icon?: typeof Activity;
}) {
  return (
    <div className="card-heading">
      <h2>{children}</h2>
      {Icon && <Icon size={18} aria-hidden="true" />}
    </div>
  );
}
function Busy() {
  return <LoaderCircle className="spin" size={16} />;
}

export default function App() {
  const s = useApp();
  const [help, setHelp] = useState(false);
  const [exit, setExit] = useState(false);
  useEffect(() => {
    if (!isDesktop) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void subscribe(
      () => void useApp.getState().sync(),
      () => useApp.getState().disconnected(),
    )
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        cleanup = fn;
        void useApp.getState().init();
      })
      .catch(() => useApp.getState().disconnected());
    const timer = setInterval(() => void useApp.getState().sync(), 2500);
    return () => {
      cancelled = true;
      cleanup?.();
      clearInterval(timer);
    };
  }, []);
  const title = titles[s.page];
  return (
    <div className="desktop-frame">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            s.navigate("overview");
          }}
          aria-label="TyperX — обзор"
        >
          <span className="brand-symbol">
            <Command size={25} />
          </span>
          Typer<span className="brand-x">X</span>
        </a>
        <div className="sidebar-label">WORKSPACE</div>
        <nav aria-label="Основная навигация">
          {nav.map(({ page, label, icon: Icon }) => (
            <button
              key={page}
              className={`nav-item ${page === s.page ? "selected" : ""}`}
              aria-current={page === s.page ? "page" : undefined}
              onClick={() => s.navigate(page)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {page === "telegram" && s.snapshot?.profile && (
                <span className="nav-dot" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-label second-label">СИСТЕМА</div>
        <button
          className={`nav-item ${s.page === "settings" ? "selected" : ""}`}
          onClick={() => s.navigate("settings")}
          aria-current={s.page === "settings" ? "page" : undefined}
        >
          <Settings2 size={18} />
          Настройки
        </button>
        <button className="nav-item" onClick={() => setHelp(true)}>
          <CircleHelp size={18} />
          Как это работает
        </button>
        <div className="sidebar-bottom">
          <div className="safety-mini">
            <ShieldCheck size={21} />
            <strong>Local first.</strong>
            <p>
              Контроль остаётся
              <br />
              на вашем устройстве.
            </p>
          </div>
          <div className="version">
            <span>DESKTOP STUDIO</span>
            <span>v0.1.0</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Рабочее пространство <ChevronRight size={14} />
            <span>{s.page === "overview" ? "Обзор" : title.title}</span>
          </div>
          <div className="topbar-actions">
            <Status />
            <Button
              variant="outline"
              className="stop-button"
              onClick={() => void s.stop()}
              disabled={s.connection !== "connected"}
              title="Остановить, даже если выполняется другой запрос"
            >
              <Square size={13} fill="currentColor" />
              Стоп<Kbd>F9</Kbd>
            </Button>
            <button
              className="avatar-button"
              onClick={() => s.navigate("telegram")}
              aria-label="Аккаунт Telegram"
            >
              <Avatar />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">{title.eyebrow}</p>
              <h1>
                {s.page === "overview" && s.snapshot?.profile
                  ? `Привет, ${s.snapshot.profile.name.split(" ")[0]}.`
                  : title.title}
              </h1>
              <p>{title.description}</p>
            </div>
            {s.connection !== "connected" && (
              <Button
                variant="outline"
                onClick={() => void s.init()}
                disabled={!isDesktop || s.connection === "connecting"}
              >
                {s.connection === "connecting" ? <Busy /> : <Power size={16} />}
                Подключить движок
              </Button>
            )}
          </div>
          {s.connection === "browser" && (
            <div className="notice-banner">
              <Terminal size={18} />
              <span>
                Режим просмотра. Python и глобальные клавиши доступны только в
                Windows-приложении Tauri. Демоданные не используются.
              </span>
            </div>
          )}
          {s.error && (
            <div role="alert" className="notice-banner error-banner">
              <ShieldCheck size={18} />
              <span>{s.error}</span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Закрыть ошибку"
                onClick={s.dismiss}
              >
                <X size={16} />
              </Button>
            </div>
          )}
          {s.notice && (
            <div role="status" className="notice-banner success-banner">
              <Check size={18} />
              <span>{s.notice}</span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Закрыть уведомление"
                onClick={s.dismiss}
              >
                <X size={16} />
              </Button>
            </div>
          )}
          {s.snapshot?.config.warning && (
            <div role="alert" className="notice-banner">
              {s.snapshot.config.warning}
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={s.page}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
            >
              {s.page === "overview" ? (
                <Overview />
              ) : s.page === "studio" ? (
                <Studio />
              ) : s.page === "telegram" ? (
                <Telegram />
              ) : s.page === "settings" ? (
                <Settings />
              ) : (
                <Journal />
              )}
            </motion.div>
          </AnimatePresence>
          <footer className="workspace-footer">
            <span>
              <LockKeyhole size={13} /> Секреты хранятся в Windows DPAPI
            </span>
            <span>
              <Kbd>F8</Kbd> запуск в целевом окне{" "}
              <span className="footer-dot">·</span> <Kbd>F9</Kbd> экстренный
              стоп
            </span>
          </footer>
        </main>
      </div>
      <Dialog
        open={help}
        onOpenChange={setHelp}
        title="Безопасный запуск"
        description="Два действия до первого нажатия клавиши."
      >
        <ol className="help-steps">
          <li>
            <strong>Подготовьте текст или AI-ответ</strong>
            <p>
              В студии проверьте настройки. AI-режим требует согласия на
              передачу истории LLM-провайдеру.
            </p>
          </li>
          <li>
            <strong>Откройте целевое окно и нажмите F8</strong>
            <p>
              Для AI нужен отдельный чат Telegram с уникальным именем в
              заголовке и пустым полем. При смене окна ввод остановится.
            </p>
          </li>
          <li>
            <strong>F9 — остановка в любой момент</strong>
            <p>
              Печать использует Enter и может отправлять сообщения. Уже
              отправленное не отменяется. Перед повторным запуском проверьте
              черновик.
            </p>
          </li>
        </ol>
        <Button
          variant="outline"
          onClick={() => {
            setHelp(false);
            setExit(true);
          }}
        >
          О завершении работы
        </Button>
      </Dialog>
      <Dialog
        open={exit}
        onOpenChange={setExit}
        title="Закрытие TyperX"
        description="Закрытие окна завершает дочерний движок."
      >
        <p>
          Приложение сначала отправляет остановку и завершение Python, затем
          принудительно завершает зависший процесс по таймауту. Windows Job
          Object завершает дочерний процесс при падении оболочки.
        </p>
        <p>
          Не запускайте второй экземпляр движка на той же Telegram-сессии.
          Драйвер Interception устанавливается отдельно, вручную с правами
          администратора.
        </p>
      </Dialog>
    </div>
  );
}

function Overview() {
  const s = useApp();
  const v = s.snapshot;
  const chart =
    v?.telemetry.map((p) => ({
      ...p,
      time: new Date(p.minute * 60000).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    })) ?? [];
  const total = chart.reduce((sum, p) => sum + p.completed, 0);
  return (
    <>
      <section className="overview-top">
        <article className="hero-card">
          <div className="hero-top">
            <span>
              <span className={`status-dot ${v?.active ? "pulse" : ""}`} />
              {v ? stageLabels[v.stage] : "Движок не подключён"}
            </span>
            <Command size={21} />
          </div>
          <h2>
            {v?.active
              ? "Ваш текст.\nЕстественный ритм."
              : v?.prepared
                ? "Последний шаг — F8."
                : "Готовность\nначинается с вас."}
          </h2>
          <p className="hero-detail" aria-live="polite">
            {v?.detail ??
              "Подключите движок, выберите режим и подготовьте безопасный запуск."}
          </p>
          <div className="hero-stats">
            <div>
              <strong>{v?.config.wpm ?? "—"}</strong>
              <span>слов / минуту</span>
            </div>
            <div>
              <strong>{v?.config.words ?? "—"}</strong>
              <span>слов / сообщение</span>
            </div>
            <div>
              <strong>{v ? total : "—"}</strong>
              <span>AI-ответов за час</span>
            </div>
          </div>
          <Button
            className="hero-action"
            variant="outline"
            onClick={() => s.navigate("studio")}
          >
            Открыть студию
            <ArrowUpRight size={17} />
          </Button>
        </article>
        <article className="card activity-card">
          <CardTitle icon={Activity}>Активность сессии</CardTitle>
          <div className="chart-legend">
            <span>
              <i className="legend-in" />
              Входящие
            </span>
            <span>
              <i className="legend-out" />
              AI-ответы
            </span>
            <span className="chart-range">60 мин</span>
          </div>
          {chart.length > 1 ? (
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chart}
                  margin={{ top: 20, right: 12, left: -24, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="#242725"
                        stopOpacity={0.15}
                      />
                      <stop offset="100%" stopColor="#242725" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="#e7e9e5"
                    strokeDasharray="3 5"
                  />
                  <XAxis
                    dataKey="time"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={48}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip />
                  <Area
                    dataKey="incoming"
                    name="Входящие"
                    type="monotone"
                    stroke="#9ca39b"
                    fill="transparent"
                    strokeWidth={1.5}
                  />
                  <Area
                    dataKey="completed"
                    name="AI-ответы"
                    type="monotone"
                    stroke="#242725"
                    fill="url(#fill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty icon={Activity} title="Здесь появится ваш ритм">
              График заполняется реальными событиями движка. История сообщений
              не сохраняется.
            </Empty>
          )}
          <div className="card-bottom">
            {v
              ? "Текущая сессия · завершённая печать, не статус доставки"
              : "Нет соединения — нет выдуманной статистики"}
          </div>
        </article>
        <article className="card safety-card">
          <CardTitle icon={ShieldCheck}>Защита ввода</CardTitle>
          <div className="safety-seal">
            <ShieldCheck size={46} strokeWidth={1.1} />
            <span>FAIL CLOSED</span>
          </div>
          <ul className="check-list">
            <li>
              <Check size={15} />
              Проверка фокуса окна
            </li>
            <li>
              <Check size={15} />
              Запуск только через F8
            </li>
            <li>
              <Check size={15} />
              Независимый стоп F9
            </li>
          </ul>
          <p className="muted">
            {v?.hotkeys
              ? "Обработчик F8/F9 работает"
              : "Проверка горячих клавиш — после подключения"}
          </p>
        </article>
      </section>
      <section className="overview-bottom">
        <article className="card setup-card">
          <CardTitle>Перед первым запуском</CardTitle>
          <button className="check-step" onClick={() => s.navigate("settings")}>
            <span className={v ? "done" : ""}>
              {v ? <Check size={16} /> : "01"}
            </span>
            <div>
              <strong>Настройте ритм</strong>
              <p>Скорость и длина сообщений</p>
            </div>
            <ChevronRight size={17} />
          </button>
          <button className="check-step" onClick={() => s.navigate("telegram")}>
            <span className={v?.profile ? "done" : ""}>
              {v?.profile ? <Check size={16} /> : "02"}
            </span>
            <div>
              <strong>Подключите Telegram</strong>
              <p>Для автоматических AI-ответов</p>
            </div>
            <ChevronRight size={17} />
          </button>
          <button className="check-step" onClick={() => s.navigate("studio")}>
            <span className={v?.prepared ? "done" : ""}>
              {v?.prepared ? <Check size={16} /> : "03"}
            </span>
            <div>
              <strong>Подготовьте запуск</strong>
              <p>Затем F8 в нужном окне</p>
            </div>
            <ChevronRight size={17} />
          </button>
        </article>
        <article className="card account-card">
          <div>
            <CardTitle icon={Send}>Подключённый аккаунт</CardTitle>
            <div className="account-identity">
              <Avatar large />
              <div>
                <h3>{v?.profile?.name ?? "Ваш аккаунт Telegram"}</h3>
                <p>
                  {v?.profile?.username
                    ? `@${v.profile.username}`
                    : v?.profile
                      ? "Аккаунт подключён"
                      : "Аккаунт ещё не подключён"}
                </p>
              </div>
            </div>
          </div>
          <div className="account-footer">
            <span>
              {v?.target
                ? `Выбран чат: ${v.target.name}`
                : "Чат не выбран"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => s.navigate("telegram")}
            >
              {v?.profile ? "Управление" : "Подключить"}
              <ArrowRight size={15} />
            </Button>
          </div>
        </article>
      </section>
    </>
  );
}

function Studio() {
  const s = useApp();
  const v = s.snapshot;
  const { mode, setMode, draft: text, setDraft: setText, bindChat, setBindChat } = s;
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

function Telegram() {
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
            Чаты{" "}
            <span className="count-badge">{v?.chats.length ?? 0}</span>
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
                      {c.can_reply ? "Можно выбрать для AI" : "Канал, бот или недоступно"}
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

function Settings() {
  const c = useApp((s) => s.snapshot?.config);
  return c ? (
    <SettingsForm config={c} />
  ) : (
    <article className="card">
      <Empty icon={SlidersHorizontal} title="Настройки ещё не загружены">
        Подключите Python. Интерфейс не подставляет и не сохраняет
        демонстрационную конфигурацию.
      </Empty>
    </article>
  );
}
function SettingsForm({ config }: { config: Config }) {
  const s = useApp();
  const locked = s.busy || !!s.snapshot?.active || !!s.snapshot?.prepared;
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { ...publicToEditable(config), api_hash: "", api_key: "" },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "presets",
    keyName: "_key",
  });
  const watchedPresets = useWatch({ control, name: "presets" });
  const [localError, setLocalError] = useState<string | null>(null);
  const save = handleSubmit(async (values) => {
    setLocalError(null);
    const { api_key, api_hash, ...raw } = values;
    const editable = { ...raw, version: 1 };
    if (!validateConfig(editable)) {
      setLocalError("Параметры не соответствуют JSON Schema адаптера.");
      return;
    }
    try {
      await s.run("save", {
        ...editable,
        ...(api_key ? { api_key } : {}),
        ...(api_hash ? { api_hash } : {}),
      });
      reset({ ...values, api_hash: "", api_key: "" });
    } catch {
      setValue("api_key", "");
      setValue("api_hash", "");
    }
  });
  return (
    <form onSubmit={(e) => void save(e)} className="settings-form">
      <div className="settings-grid">
        <article className="card">
          <CardTitle icon={Keyboard}>Ритм печати</CardTitle>
          <div className="field-grid">
            <label>
              Слов в минуту
              <input
                type="number"
                min={25}
                max={300}
                disabled={locked}
                {...register("wpm", { valueAsNumber: true })}
              />
              {errors.wpm && <small role="alert">{errors.wpm.message}</small>}
            </label>
            <label>
              Слов в сообщении
              <input
                type="number"
                min={1}
                max={16}
                disabled={locked}
                {...register("words", { valueAsNumber: true })}
              />
              {errors.words && (
                <small role="alert">{errors.words.message}</small>
              )}
            </label>
          </div>
          <p className="field-hint">
            Backend делит текст на фрагменты и нажимает Enter после каждого.
            Скорость ограничена 25–300 WPM.
          </p>
        </article>
        <article className="card">
          <CardTitle icon={Send}>Telegram API</CardTitle>
          <div className="field-grid">
            <label>
              API ID
              <input
                readOnly={locked || !!s.snapshot?.profile}
                {...register("api_id")}
              />
            </label>
            <label>
              Телефон
              <input
                autoComplete="tel"
                placeholder="+7…"
                readOnly={locked || !!s.snapshot?.profile}
                {...register("phone")}
              />
            </label>
          </div>
          <label>
            API hash{" "}
            <span className="field-hint">
              {config.has_api_hash ? "сохранён в DPAPI" : "не задан"}
            </span>
            <input
              type="password"
              autoComplete="off"
              placeholder="Оставьте пустым, чтобы не менять"
              readOnly={locked || !!s.snapshot?.profile}
              {...register("api_hash")}
            />
            {errors.api_hash && (
              <small role="alert">{errors.api_hash.message}</small>
            )}
          </label>
          <p className="field-hint">
            Получите реквизиты на my.telegram.org. Для изменения аккаунта
            сначала выйдите из Telegram.
          </p>
        </article>
        <article className="card provider-settings">
          <CardTitle icon={Zap}>LLM-провайдер</CardTitle>
          <label>
            Base URL
            <input readOnly={locked} {...register("base_url")} />
            {errors.base_url && (
              <small role="alert">{errors.base_url.message}</small>
            )}
          </label>
          <div className="field-grid">
            <label>
              Модель
              <input readOnly={locked} {...register("model")} />
            </label>
            <label>
              API key{" "}
              <span className="field-hint">
                {config.has_api_key ? "сохранён" : "не задан"}
              </span>
              <input
                type="password"
                autoComplete="off"
                readOnly={locked}
                placeholder="Оставьте пустым, чтобы не менять"
                {...register("api_key")}
              />
            </label>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={locked || isDirty}
            onClick={() =>
              void s
                .run("test")
                .then(() =>
                  setLocalError("Проверка завершена: провайдер ответил."),
                )
                .catch(ignored)
            }
          >
            <Activity size={16} />
            Проверить сохранённое подключение
          </Button>
          <p className="field-hint">
            Проверка отправляет короткий тестовый запрос, без истории чата.
            Может расходовать лимит API.
          </p>
        </article>
      </div>
      <article className="card presets-panel">
        <CardTitle icon={FileText}>Характер ответа</CardTitle>
        <label>
          Активный пресет
          <select disabled={locked} {...register("active_preset")}>
            {fields.map((field, index) => (
              <option
                key={field._key}
                value={watchedPresets?.[index]?.id ?? field.id}
              >
                {index + 1}. {watchedPresets?.[index]?.name ?? field.name}
              </option>
            ))}
          </select>
        </label>
        <div className="presets-grid">
          {fields.map((field, index) => (
            <div className="preset-editor" key={field._key}>
              <div className="preset-top">
                <span>ПРЕСЕТ {String(index + 1).padStart(2, "0")}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Удалить пресет ${index + 1}`}
                  disabled={locked || fields.length === 1}
                  onClick={() => remove(index)}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
              <input type="hidden" {...register(`presets.${index}.id`)} />
              <label>
                Название
                <input
                  readOnly={locked}
                  {...register(`presets.${index}.name`)}
                />
              </label>
              {field.prompts.map((_, prompt) => (
                <label key={prompt}>
                  Системный промпт {prompt + 1}
                  <textarea
                    rows={4}
                    readOnly={locked}
                    {...register(`presets.${index}.prompts.${prompt}`)}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={locked || fields.length >= 30}
          onClick={() =>
            append({
              id: crypto.randomUUID(),
              name: "Новый пресет",
              prompts: ["Отвечай кратко и по существу."],
            })
          }
        >
          <Plus size={16} />
          Добавить пресет
        </Button>
      </article>
      {(localError || Object.keys(errors).length > 0) && (
        <p role="status" className="notice-banner">
          {localError ??
            "Проверьте поля: имя и промпт не должны быть пустыми; ID — уникальны; активный пресет должен существовать."}
        </p>
      )}
      <div className="save-bar">
        <span>
          <LockKeyhole size={16} />
          Ключи не возвращаются в интерфейс и не попадают в журнал.
        </span>
        <Button type="submit" disabled={locked || !isDirty}>
          {s.busy ? <Busy /> : <Check size={16} />}Сохранить настройки
        </Button>
      </div>
    </form>
  );
}
function Journal() {
  const entries = useApp((s) => s.entries);
  return (
    <article className="card journal">
      <CardTitle icon={Activity}>
        События движка <span className="count-badge">{entries.length}</span>
      </CardTitle>
      <p className="field-hint">
        Последние 100 переходов состояния, только в памяти. Содержимое чатов,
        коды входа и пароли здесь не отображаются.
      </p>
      {entries.length ? (
        <ol className="event-list">
          {entries.map((e) => (
            <li key={e.id}>
              <span className="event-marker">
                <ArrowDownLeft size={16} />
              </span>
              <time>{e.time}</time>
              <strong>{e.detail}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <Empty icon={Activity} title="Чистый лист">
          Когда движок изменит состояние, событие появится здесь.
        </Empty>
      )}
    </article>
  );
}

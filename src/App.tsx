import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  Check,
  ChevronRight,
  CircleHelp,
  Command,
  Globe,
  Keyboard,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  Power,
  Send,
  Settings2,
  ShieldCheck,
  Square,
  Terminal,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Dialog } from "./components/ui/dialog";
import { MonkeytypePage } from "./components/Monkeytype";
import { Journal, Overview, Settings, Studio, Telegram } from "./screens";
import { useApp, type Page } from "./store/app";
import { isDesktop, subscribe } from "./lib/bridge";

const nav: { page: Page; label: string; icon: typeof Activity }[] = [
  { page: "overview", label: "Обзор", icon: LayoutDashboard },
  { page: "studio", label: "Студия ввода", icon: Keyboard },
  { page: "telegram", label: "Telegram", icon: Send },
  { page: "monkeytype", label: "Monkeytype", icon: Globe },
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
  monkeytype: {
    eyebrow: "ТРЕНАЖЁР",
    title: "Monkeytype",
    description: "Встроенное окно сайта. Войдите в аккаунт и нажмите F6.",
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
function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}
function Avatar() {
  const p = useApp((s) => s.snapshot?.profile);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [p?.avatar]);
  return (
    <span className="avatar">
      {p?.avatar && !failed ? (
        <img
          alt={`Фото Telegram: ${p.name}`}
          src={p.avatar}
          onError={() => setFailed(true)}
        />
      ) : (
        <UserRound size={20} aria-hidden="true" />
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
              ) : s.page === "monkeytype" ? (
                <MonkeytypePage />
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
              <span className="footer-dot">·</span> <Kbd>F6</Kbd> Monkeytype{" "}
              <span className="footer-dot">·</span> <Kbd>F9</Kbd> стоп
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

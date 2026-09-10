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
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Command,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Avatar, CardTitle, Empty } from "../ui-shared";
import { stageLabels } from "../lib/contracts";
import { useApp } from "../store/app";

export function Overview() {
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
              {v?.target ? `Выбран чат: ${v.target.name}` : "Чат не выбран"}
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

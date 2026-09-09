# Архитектура

React WebView → типизированный Tauri invoke → Rust → JSON Lines stdin/stdout
→ упакованный Python adapter → реальный Runtime из TyperX backend.

Исследован backend 1.2.0, commit dc013dfa7db7116e8907ef8086a939a7e2bdac37.
app.run() только настраивает лог и возвращает 0. HTTP API и опубликованной
JSON Schema нет. Схемы bridge/ — новый контракт адаптера, а не выдуманные
существующие endpoint. Подкласс использует Runtime.submit/dispatch/stop/close,
TelegramGateway.client и AIStore.public. Движок печати не переписан.

## Границы доверия

- Нет Node.js, shell/fs/http/opener plugin в WebView. Только local main window.
- Путь sidecar фиксирован Rust. Произвольные команды, аргументы и env не принимаются.
- HWND передаёт Rust, не JavaScript. Команды start в IPC allowlist нет.
- prepare требует ack_send; AI требует consent. F8 выполняет реальный запуск.
- F9 обслуживается отдельным потоком backend. Кнопка stop обходит UI busy и
  Runtime.request_lock. При отказе hotkeys адаптер блокирует запуск.
- Запрос до 64 КиБ, ответ до 4 МБ, ограниченное число pending, ID и таймауты.
  Неизвестный результат мутации никогда не повторяется автоматически.
- При таймауте останавливается процесс. При закрытии — graceful shutdown,
  ожидание до 14 сек, затем принудительное завершение. Windows Job Object
  уничтожает потомков при падении оболочки. EOF закрывает адаптер.
- Блокировка файла запрещает два sidecar одного профиля; сторонними движками
  она не управляет. Принудительный kill не отменяет отправленное и требует
  проверки черновика/состояния клавиш.
- CSP без unsafe-eval. Ajv standalone генерируется на этапе build.
  unsafe-inline разрешён только для style, нужного Motion/Radix/Recharts.
- Динамических HTML-вставок нет. Аватар — только JPEG data URI до 2 МБ от get_me.

## Telegram и данные

profile вызывает get_me и download_profile_photo(me,file=bytes,download_big=False).
Аватар не подменяется фото GitHub. При отсутствии/ошибке — нейтральная иконка.
DPAPI и атомарное сохранение используют существующий AIStore. Public config
возвращает только has_api_* вместо секретов. Пароль и код живут в памяти.
Телефон и параметры сохраняются upstream в ai.json. telegram.session —
НЕ DPAPI-encrypted: файл чувствителен и должен быть исключён из бэкапов.

Runtime select читает историю, но adapter не передаёт её в WebView. Передача
истории LLM возможна только после consent/F8 в AI mode. Метрики — минутные
счётчики текущего процесса; завершённый AI output, НЕ receipt доставки.
Журнал — до 100 имён стадий в памяти. Нет логов сообщений, токенов и паролей.

Защита целевого окна основана на HWND, имени Telegram, заголовке чата и UIA.
Это не криптографическое доказательство личности собеседника. Пользователь
проверяет адресата, пустое поле и последствия Enter. Автовозобновления нет.

## Не входит в проверенную поставку

Windows E2E, подпись установщика, auto-update/tray, Linux/macOS typing,
Monkeytype UI, экспорт чатов. До выпуска нужны реальные locks и Windows QA.

# Архитектура TyperX Desktop

## 1. Назначение

Архитектура разделяет недоверенный UI, процессный контроль и привилегированный Windows-ввод. WebView не получает прямого доступа к shell, файловой системе, произвольному HTTP или запуску процессов. Все управляющие действия проходят через узкий Tauri IPC и локальный версионированный протокол.

## 2. Контекст системы

```text
Пользователь
    │
    ▼
React 19 + TypeScript + Zustand
    │ Tauri invoke / events
    ▼
Rust host (Tauri 2 + Tokio)
    │ bounded JSON Lines over stdin/stdout
    ▼
Python adapter (PyInstaller sidecar)
    │ typed calls / subclassing
    ▼
Pinned TyperX backend 1.2.0
    ├── Telegram / Telethon
    ├── LLM-compatible endpoint
    ├── Windows UI Automation
    └── Interception keyboard driver
```

Закреплённый backend: репозиторий и commit заданы в `backend.lock.json`. Локальная правка backend применяется `scripts/patch-backend.py` только после проверки ожидаемой ревизии и blob.

## 3. Компоненты

### 3.1 WebView

`src/` содержит интерфейс и клиентские контракты. `src/lib/contracts.ts` определяет типы операций и snapshot. `src/lib/bridge.ts` вызывает только `backend_connect` и `backend_request`, а входящий snapshot проверяется сгенерированным Ajv standalone-валидатором. `src/store/app.ts` управляет состоянием подключения, синхронизацией и журналом до 100 смен стадий в памяти.

Browser-only режим предназначен для просмотра UI: управляющие операции в нём запрещены.

### 3.2 Rust host

`src-tauri/src/lib.rs` публикует две команды только для окна `main`. `src-tauri/src/process.rs`:

- выбирает фиксированный путь sidecar;
- удаляет `PYTHONPATH` и `PYTHONHOME` из окружения дочернего процесса;
- ограничивает request 64 KiB и response frame 4 MB;
- ограничивает очередь ожидающих ответов;
- применяет таймаут записи 2 секунды и ответа 65 секунд;
- не повторяет автоматически операции с неизвестным результатом;
- связывает процесс с Windows Job Object;
- завершает sidecar при нарушении framing/JSON или закрытии приложения.

### 3.3 Python adapter

`bridge/typerx_desktop/` содержит:

- `protocol.py` — envelope validation и телеметрия;
- `__main__.py` — runtime, handshake, dispatch и Telegram gateway;
- `auth.py` — code/2FA/logout и безопасные диагностические коды;
- `guard.py` — привязка к HWND/PID/title/UIA field;
- `typing_output.py` — нормализация, разбиение и последовательный ввод;
- `keyboard.py` — lifecycle Interception keyboard;
- `peers.py` — допустимые Telegram-цели и фильтрация истории.

### 3.4 Upstream backend

Adapter использует `Runtime`, `TelegramGateway`, `AIStore` и hotkeys upstream backend. Backend не копируется в Git: bootstrap клонирует точный commit в игнорируемую директорию `backend/`.

## 4. Основные потоки

### Подключение

1. UI вызывает `backend_connect`.
2. Rust запускает sidecar и получает событие `boot`.
3. Rust отправляет `hello` с protocol version и HWND главного окна.
4. Python регистрирует F8/F9 и отвечает подтверждением.
5. Rust запрашивает `snapshot`; UI валидирует его JSON Schema.

### Безопасный запуск

1. Пользователь сохраняет настройки и выбирает режим/цель.
2. `prepare` проверяет Enter acknowledgement, AI consent и параметры.
3. Ввод не начинается через WebView.
4. Пользователь переводит фокус в целевое поле и нажимает F8.
5. Python захватывает target guard и запускает job.
6. Перед каждой клавишей проверяются stop flag и окно; key-up выполняется даже при остановке.

### Остановка

F9 обрабатывается отдельным backend-потоком. UI-команда `stop` обходит флаг `busy`. Автовозобновления нет. Завершение процесса не гарантирует отмену уже обработанного Enter.

## 5. Хранение и данные

Публичный snapshot содержит конфигурацию без API key/hash, статус, список чатов, выбранную цель, профиль и агрегированные минутные счётчики. Код входа и 2FA-пароль существуют только в памяти текущего запроса. Telegram session-файл остаётся чувствительным локальным активом и не защищается DPAPI.

## 6. Ограничения

- контроль адресата основан на свойствах UI/окна, а не на криптографической идентичности;
- целевая скорость WPM не является гарантированной измеренной скоростью;
- `completed` означает завершённый локальный output callback, а не delivery receipt;
- Windows, драйвер, Telegram и UI Automation требуют отдельной E2E-проверки;
- установщик current-user не подписан и auto-update отсутствует.
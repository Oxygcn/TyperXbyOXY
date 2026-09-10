# Модель безопасности

## 1. Цели

Модель безопасности предотвращает скрытый запуск ввода, произвольное управление процессами из WebView, утечку секретов через IPC/логи, автоматический повтор опасных операций и продолжение ввода после потери цели.

Она не гарантирует идентичность адресата на уровне Telegram и не может отменить уже отправленное сообщение.

## 2. Защищаемые активы

- Telegram session и учётная запись;
- Telegram API ID/hash, LLM API key и 2FA-пароль;
- история выбранного диалога и AI-промпты;
- Monkeytype session в профиле WebView2;
- целостность целевого окна и поля;
- управление клавиатурным вводом;
- целостность supply chain и собранного sidecar.

## 3. Границы доверия

### WebView → Rust

Локальное окно `main` имеет только event listen/unlisten и allowlist backend-команд. Shell, filesystem, HTTP и opener capabilities не предоставлены. CSP запрещает внешние script/font/frame/object/form sources и `unsafe-eval`; inline разрешён только для styles.

Удалённое окно `monkeytype` ограничено URL `https://monkeytype.com/*` и отдельной capability, содержащей только команду `monkeytype_key`. Команда дополнительно проверяет label окна, HTTPS host, foreground HWND и ровно один печатный Unicode-символ. Backend-команды и остальные возможности Tauri удалённой странице недоступны.

### Rust → Python

Executable path и аргументы не контролируются frontend. `PYTHONPATH`/`PYTHONHOME` удаляются. Frames ограничены по размеру, ожидающие requests — по количеству, операции — allowlist. Process помещается в Job Object.

### Python → внешние системы

Telethon обращается к Telegram в рамках авторизованной сессии. AI backend может передать до 50 сообщений выбранного контекста настроенному провайдеру только после явного consent и F8. URL правила требуют HTTPS; HTTP разрешён только для loopback.

### Monkeytype WebView → Windows input

F6 запускает цикл только внутри app-owned WebView. DOM используется для выбора следующего ожидаемого символа, но фактическое нажатие создаётся Rust через `SendInput`. Переносы строк, Tab, управляющие символы и строки длиннее одного Unicode scalar отклоняются. Если Monkeytype перестаёт быть foreground-окном, ввод прекращается.

## 4. Секреты и приватность

API key/hash не возвращаются в public snapshot. Код входа и 2FA-пароль не должны сохраняться или логироваться. Диагностика использует тип исключения и безопасный код, но не raw exception message, локальные переменные, телефон или содержимое сообщений.

Backend-хранилище использует Windows DPAPI для API-секретов. `telegram.session` DPAPI не защищён: его необходимо считать credential-файлом, исключить из облачной синхронизации, архивов и issue attachments.

Аватар загружается только для `get_me`, принимается как JPEG не более 2 MB и передаётся как data URI. Журнал UI хранит только имена стадий в памяти. Cookies Monkeytype находятся в WebView2 user-data приложения и наследуют защиту Windows-профиля.

## 5. Контроль опасного действия

- `prepare` требует `ack_send=true`;
- AI требует `consent=true`;
- WebView не может вызвать Telegram `start`;
- F8 действует только при prepared state и исправных hotkeys;
- F9 и stop доступны независимо от UI busy;
- перед Telegram-вводом проверяется пустое поле;
- во время Telegram-ввода проверяются HWND/PID/title/UIA identity;
- key-up выполняется в `finally`, даже после stop/focus error;
- автоматический retry и resume отсутствуют;
- Monkeytype F6 доступен только в его foreground-окне и отправляет по одному проверенному символу;
- F9, blur и Alt+Tab завершают цикл Monkeytype без автоматического возобновления.

Опция `bind_chat=false` ослабляет проверку адресата до окна/PID и доступной UIA identity. Она не должна использоваться без осознанной ручной проверки получателя.

## 6. Supply chain

Node, Cargo и Python dependency graphs фиксируются lock-файлами. Python install использует `--require-hashes`. Upstream backend закреплён commit SHA; patch проверяет ожидаемую ревизию. Release должен собираться в чистой Windows-среде и сопровождаться provenance/checksums. Текущий NSIS не подписан.

## 7. Остаточные риски

- подмена окна/контрола внутри доверенного процесса;
- особенности заголовков разных версий Telegram/Notepad;
- компрометация локального Windows-профиля, session-файла или WebView2 cookies;
- уязвимости Telethon, WebView2, Tauri, PyInstaller или backend;
- ошибки/ограничения Interception driver, Windows `SendInput` и UI Automation;
- изменение DOM Monkeytype, при котором автонабор не находит активную букву;
- скомпрометированная страница Monkeytype может вызвать разрешённую команду только для одного символа и только пока собственное app-owned окно находится на переднем плане;
- ошибочный выбор чата или модели пользователем;
- передача чувствительного контекста внешнему LLM после согласия;
- отсутствие code signing и независимого security audit.

## 8. Security review triggers

Обязательный отдельный review нужен при добавлении сетевого endpoint, новых Tauri capabilities, динамического executable path, логирования, auto-retry, фонового запуска, auto-update, новых хранилищ или изменении target guard.

Порядок приватного сообщения об уязвимости описан в корневом [SECURITY.md](../SECURITY.md).

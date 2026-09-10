# TyperX Desktop

TyperX Desktop — Windows-приложение на Tauri 2 для управляемого ввода подготовленного текста и AI-ответов в выбранный Telegram-диалог. Интерфейс реализован на React/TypeScript, процессная граница — на Rust, локальный движок — на Python и упаковывается PyInstaller.

> **Статус:** версия `0.1.0`, активная разработка. Репозиторий содержит исходный код и воспроизводимый процесс сборки, но не является подтверждённым production-релизом. Установщик не подписан; перед распространением обязательна Windows-проверка из [docs/TESTING.md](docs/TESTING.md).

## Возможности

- ручной ввод текста с разбиением на группы по 1–16 слов;
- AI-режим с Telegram-аутентификацией, выбором личного чата или участника группы;
- встроенное окно Monkeytype с нативным автонабором по F6 и остановкой по F9/Alt+Tab;
- явное подтверждение отправки через Enter и отдельное согласие на передачу контекста LLM-провайдеру;
- глобальные клавиши F8 для подготовленного запуска и F9 для остановки;
- контроль окна, процесса, заголовка и, когда доступно, UI Automation-поля;
- строгий локальный JSON Lines-протокол между Rust и Python;
- ограничение размеров сообщений, числа ожидающих запросов и времени операций;
- хранение API-секретов через backend-хранилище с Windows DPAPI;
- локальная телеметрия только по числу входящих событий и завершённых AI-выводов.

## Границы проекта

TyperX не является Telegram-ботом и не отправляет сообщения через скрытый HTTP endpoint. Движок эмулирует клавиатурный ввод в выбранное пользователем поле и нажимает Enter. Это действие может немедленно отправить сообщение. Уже отправленный текст нельзя отозвать через приложение.

Поддерживается только Windows 10/11 x64. Linux и macOS не поддерживаются. Автоматический перезапуск движка и автоматическое повторение операций намеренно отключены.

## Быстрый старт

### Требования

- Windows 10/11 x64;
- Node.js `>=22.12 <25`;
- Python 3.12 x64;
- Rust stable, совместимый с `rust-version = 1.85`;
- Visual Studio Build Tools с workload **Desktop development with C++**;
- Git и Microsoft Edge WebView2;
- установленный отдельно Interception driver.

### Подготовка

Откройте PowerShell в корне репозитория:

```powershell
./scripts/bootstrap.ps1
./scripts/build-engine.ps1
npm run desktop:dev
```

`bootstrap.ps1` создаёт `.venv`, устанавливает Python-зависимости по hash-locked файлу, извлекает закреплённый backend commit, создаёт lock-файлы Node/Rust и устанавливает зависимости. `build-engine.ps1` собирает sidecar в:

```text
src-tauri/binaries/typerx-engine-x86_64-pc-windows-msvc.exe
```

После любого изменения в `bridge/`, `backend.lock.json` или Python-зависимостях движок необходимо пересобрать.

## Проверка перед работой

```powershell
node scripts/check-locks.mjs
npm ci
npm run test
npm run build
.venv/Scripts/python.exe -m unittest discover -s tests -p "test_*.py" -v
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run desktop:build -- --no-bundle
```

Первый ввод выполняйте только в пустом локальном тестовом документе. До проверки F8/F9, переключения окна и отпускания клавиш не используйте настоящий чат.

## Документация

- [Обзор документации](docs/README.md)
- [Архитектура](docs/ARCHITECTURE.md)
- [Среда разработки и сборка](docs/DEVELOPMENT.md)
- [Локальный протокол](docs/PROTOCOL.md)
- [Модель безопасности](docs/SECURITY.md)
- [Monkeytype](docs/MONKEYTYPE.md)
- [Эксплуатация и диагностика](docs/OPERATIONS.md)
- [Тестирование и критерии выпуска](docs/TESTING.md)
- [Правила участия](CONTRIBUTING.md)
- [Политика раскрытия уязвимостей](SECURITY.md)

## Лицензия

Проект распространяется по лицензии [MIT](LICENSE). Лицензия не заменяет проверку условий использования Telegram, LLM-провайдера, Interception driver и сторонних зависимостей.

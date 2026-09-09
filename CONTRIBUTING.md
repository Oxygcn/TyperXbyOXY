# Участие в разработке

## До начала работы

Создайте issue с описанием проблемы, ожидаемым поведением, рисками и планом проверки. Для security-sensitive изменений сначала согласуйте threat model. Не публикуйте секреты и содержимое реальных чатов.

## Ветки и commits

Используйте короткие ветки вида `fix/...`, `feat/...`, `docs/...`. Один commit должен выражать одну логическую причину. Commit message — в повелительном наклонении и без утверждений о проверках, которые не выполнялись.

## Требования к pull request

PR должен содержать:

- проблему и границы изменения;
- решение и отклонённые альтернативы;
- security/privacy impact;
- migration/rollback plan;
- выполненные автоматические и ручные тесты;
- обновление документации и схем;
- известные ограничения.

Не объединяйте PR при красном CI, непроверенном Windows-вводе или несогласованном protocol change.

## Локальная проверка

```powershell
npm ci
npm run test
npm run build
.venv/Scripts/python.exe -m unittest discover -s tests -p "test_*.py" -v
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Изменения adapter требуют `./scripts/build-engine.ps1` и smoke test. Изменения dependency graph требуют осмысленного обновления соответствующего lock-файла.

## Инварианты безопасности

Запрещено без отдельного review:

- добавлять WebView-доступ к shell/fs/http/opener;
- передавать frontend произвольный executable path;
- добавлять IPC `start` или автозапуск;
- логировать raw exceptions, prompts, chat history или credentials;
- повторять мутации после timeout;
- ослаблять Enter acknowledgement, AI consent, F9 или target guard;
- коммитить `.env`, session, secret store или бинарник движка.

## Документация

Поведение и документация меняются вместе. Термины и ссылки должны соответствовать [docs/README.md](docs/README.md). Кодовые примеры должны быть запускаемыми из корня репозитория.

## Review

Минимум один reviewer проверяет correctness и tests. Изменения auth, storage, protocol, Tauri permissions, keyboard injection, release pipeline или dependency pins требуют security-focused review.
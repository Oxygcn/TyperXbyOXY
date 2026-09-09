# Тестирование и критерии выпуска

## 1. Принцип

Успешная компиляция не доказывает безопасность ввода. Release gate включает статические проверки, unit-тесты трёх слоёв, сборку sidecar, Tauri integration и ручной Windows smoke test.

## 2. Автоматические проверки

```powershell
node scripts/check-locks.mjs
npm ci
npm run test
npm run build
.venv/Scripts/python.exe -m unittest discover -s tests -p "test_*.py" -v
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run desktop:build -- --no-bundle
```

### TypeScript

Проверяются Zod-настройки, contract/schema compatibility, strict TypeScript и production Vite build. Generated Ajv должен создаваться только из versioned schemas и не содержать runtime eval.

### Python

Проверяются envelope/allowlist/limits, handshake, consent/acknowledgement, rolling counters, Telegram auth state machine, отсутствие секретов в диагностике, group focus, target guards, разбиение текста, preflight символов, последовательный key-down/key-up и cancellation.

### Rust

Проверяются bounded frame reader и host lifecycle-компоненты. Любое изменение timeout, pending limits, allowlist или shutdown требует regression test.

## 3. Обязательный Windows smoke test

1. Чистая установка зависимостей и сборка из clone.
2. Проверка отсутствующего/повреждённого sidecar и version mismatch.
3. Проверка запрета второго engine для того же профиля.
4. Ручной ввод в пустом локальном документе.
5. F9 до первой клавиши, во время удержания клавиши и между фрагментами.
6. Переключение окна, процесса, документа и поля во время ввода.
7. Проверка Caps Lock и зажатых модификаторов.
8. Telegram code login, 2FA, existing session и logout на тестовом аккаунте.
9. Выбор user/group; отклонение self, bot, channel и left group.
10. Выбор участника группы и фильтрация истории.
11. AI consent, provider URL, timeout и остановка во время generation.
12. Убийство Python и Tauri; отсутствие orphan process и auto-resume.
13. UI при 1000×700 и 1440×940, Windows scale 125–200%, keyboard-only и reduced motion.
14. NSIS install/uninstall под обычным пользователем.
15. Проверка отсутствия секретов в UI journal, local/session storage, logs и артефактах.

Все действия с Enter выполняются только в согласованном тестовом чате.

## 4. Release gates

Релиз запрещён, если:

- любой lock-файл отсутствует или изменился без review;
- backend commit/patch не проверен;
- автоматические тесты не зелёные;
- sidecar собран не из того же commit;
- Windows smoke test не подписан ответственным QA;
- известна проблема с F9, key-up, target guard или secret exposure;
- отсутствуют checksums артефактов;
- release notes скрывают ограничения;
- production release объявляется подписанным, когда code signing отсутствует.

## 5. Release evidence

Для каждого кандидата храните:

- git commit и tag;
- версии toolchain;
- CI run URL;
- SHA-256 sidecar и NSIS;
- результаты автоматических тестов;
- заполненный smoke checklist;
- список известных ограничений;
- подпись reviewer/QA и дату.

## 6. Тестовые данные

Используйте отдельный Telegram-аккаунт, отдельный чат и непроизводственные промпты. Fixtures не должны содержать реальные телефоны, access hashes, session blobs, токены или сообщения пользователей.
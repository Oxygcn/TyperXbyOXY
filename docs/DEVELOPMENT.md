# Разработка и сборка

## 1. Поддерживаемая среда

Сборка движка поддерживается только на Windows x64 с Python 3.12 x64. Node.js должен удовлетворять `>=22.12 <25`; CI использует 22.18. Rust package объявляет минимальную версию 1.85. Для native-сборки требуются MSVC Build Tools и WebView2.

Interception driver устанавливается отдельно официальным способом с административными правами и перезагрузкой. Проект не устанавливает драйвер и не повышает привилегии автоматически.

## 2. Структура репозитория

```text
.github/workflows/       Windows CI
bridge/                  Python desktop adapter, schemas, Python locks
scripts/                 bootstrap, build, validator and integrity scripts
src/                     React/TypeScript WebView
src-tauri/               Rust host, Tauri policy and installer config
tests/                   Python and TypeScript tests
docs/                    Architecture and operational documentation
backend.lock.json        Immutable upstream backend reference
```

`backend/`, `.venv/`, `build/`, `dist/`, `node_modules/` и собранные sidecar binaries не должны коммититься.

## 3. Первичная настройка

```powershell
git clone <repository-url>
cd TyperXbyOXY
./scripts/bootstrap.ps1
```

Bootstrap выполняет:

1. создание `.venv` через Python 3.12;
2. установку закреплённого `uv`;
3. генерацию `bridge/requirements.lock` с SHA-256 hashes;
4. установку Python-зависимостей с `--require-hashes`;
5. clone/checkout backend по `backend.lock.json`;
6. проверяемое применение backend patch;
7. создание и установку Node lock graph;
8. генерацию Cargo lockfile.

Изменения lock-файлов после bootstrap должны быть осмысленно просмотрены, а не приняты автоматически.

## 4. Сборка sidecar

```powershell
./scripts/build-engine.ps1
```

Скрипт проверяет Windows x64 и Python 3.12, повторно устанавливает Python graph по hashes, применяет patch и запускает PyInstaller `--onefile --console`. Сборка создаётся в `build/engine/`, затем копируется под target-triple именем в `src-tauri/binaries/`.

Пересборка обязательна после изменений:

- `bridge/**/*.py`;
- `bridge/*.json`;
- `bridge/requirements.*`;
- `backend.lock.json`;
- backend patch.

Запуск старого exe после изменения Python-исходников является распространённой причиной несовместимости.

## 5. Development loop

```powershell
npm run desktop:dev
```

Tauri запускает Vite через `beforeDevCommand`. Только UI можно открыть командой `npm run dev`, но управление движком в browser-view отключено.

Рекомендуемый цикл перед commit:

```powershell
npm run check
npm run test
npm run build
.venv/Scripts/python.exe -m unittest discover -s tests -p "test_*.py" -v
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

## 6. Production build

```powershell
node scripts/check-locks.mjs
./scripts/build-engine.ps1
npm run desktop:build
```

NSIS output размещается в `src-tauri/target/release/bundle/nsis/`. Конфигурация использует `currentUser`; артефакт по умолчанию не подписан.

## 7. Контракты и схемы

`npm run build` регенерирует Ajv standalone-валидаторы из `bridge/config.schema.json` и `bridge/snapshot.schema.json`. При изменении контракта необходимо синхронно обновить Python validation, Rust allowlist, TypeScript types, JSON Schema и tests.

## 8. Стиль изменений

- не добавляйте shell/fs/http/opener capability без отдельного security review;
- не выводите raw exceptions Telegram/driver в UI или лог;
- не добавляйте автоматический retry для мутаций;
- не ослабляйте F9, target guard или подтверждение Enter ради удобства;
- документируйте новые коды ошибок и release checks.
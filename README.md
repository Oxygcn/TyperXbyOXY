# TyperX Desktop

Tauri 2 + React/TypeScript интерфейс и stdio-адаптер к TyperX backend.
**Исходники реализации. Не проверенный Windows-релиз и не готовый установщик.**

## Реализовано в коде

- Интерфейс по референсу: светлая полупрозрачная оболочка, тёмная карточка
  состояния, монохромная навигация, адаптивность, Motion/reduced motion.
- Обзор, ручной ввод и AI-студия, Telegram code/2FA/logout, фото собственного
  аккаунта через get_me, выбор собеседника, настройки/пресеты, журнал.
- Zustand; React Hook Form + Zod; build-time Ajv standalone; Recharts;
  Tailwind 4, локальные shadcn-style компоненты Radix, Lucide, React strict TS.
- Rust process lifecycle, IPC allowlist, bounded messages, stop вне busy-очереди,
  Job Object, таймауты, отсутствие автоповтора и автоматического старта.

## Что пока НЕ завершено

Среда не имела Windows, Rust и доступа к npm/PyPI/Cargo. Прямые версии
зависимостей зафиксированы. Backend закреплён commit в backend.lock.json.
**Полные package-lock.json, Cargo.lock и requirements.lock не сгенерированы.**
Не подложены вымышленные или частичные lockfiles. Требование полностью
воспроизводимой сборки ещё не выполнено. Скрипт bootstrap создаёт настоящие
locks на Windows с сетью; их нужно проверить и добавить в git.

`npm ci`, strict tsc, полноценный Vitest/Rust test, PyInstaller и Tauri build
не выполнены. Нет гарантии сборки/интеграции без последующей Windows-проверки.
Статус и smoke checklist: docs/VERIFICATION.md. Release блокируется без locks.

## Первый запуск — Windows 10/11 x64

Нужны Node 22.18+ (<25), Python 3.12 x64, Git, Rust stable MSVC,
Visual Studio Build Tools (Desktop development with C++) и WebView2.
Interception устанавливается отдельно через официальный installer backend
с правами администратора и перезагрузкой. Приложение не устанавливает драйвер
и не повышает права автоматически.

PowerShell из корня:

```powershell
./scripts/bootstrap.ps1
# Проверить/закоммитить созданные package-lock.json, Cargo.lock, requirements.lock.
./scripts/build-engine.ps1
npm run desktop:dev
```

Bootstrap скачивает immutable backend commit и применяет точечный patch
четырёх незакавыченных Unicode-ключей в ai_runtime.py. Patch проверяет commit
и blob и отказывается менять неизвестную ревизию.

```powershell
node scripts/check-locks.mjs
npm ci
npm run test
npm run build
.venv/Scripts/python.exe -m unittest discover -s tests -p "test_*.py" -v
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run desktop:build
```

После успешной сборки NSIS: src-tauri/target/release/bundle/nsis/.
Установщик unsigned. В архиве нет exe, Python runtime или секретов.
`npm run dev` открывает только browser-view, где управление честно отключено.

## Подключение и безопасность

1. Подключите движок. В Настройках сохраните Telegram api_id/api_hash/телефон.
2. Во вкладке Telegram войдите по коду и 2FA. Сохранённая сессия подключается
   кнопкой «Загрузить чаты». Фото берётся только у авторизованного get_me.
3. Настройте модель/пресет и выберите личный чат. AI требует отдельного согласия
   на передачу до 50 сообщений выбранному LLM-провайдеру.
4. Подтвердите последствия Enter, подготовьте запуск. Перейдите в нужное поле
   и нажмите F8. В WebView команды прямого запуска нет.
5. F9 останавливает независимо от UI busy. Смена фокуса останавливает ввод.
   Автовозобновления нет. Уже отправленные сообщения не отзываются.

Сначала тестируйте ручной ввод в пустом локальном документе. Затем — только
в согласованном тестовом Telegram-чате. Движок нажимает Enter после фрагментов:
это НЕ dry-run. Проверьте текст и черновик перед каждым новым запуском.

API-секреты хранятся backend через Windows DPAPI. Telegram SQLite session
НЕ зашифрована DPAPI; не публикуйте и не копируйте её в облачные бэкапы.
Коды, пароль 2FA, сообщения и аватар не пишутся в журнал UI или localStorage.

Подробнее: docs/ARCHITECTURE.md.

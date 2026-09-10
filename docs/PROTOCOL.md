# Локальный протокол Rust ↔ Python

## 1. Транспорт

Протокол использует UTF-8 JSON Lines через stdin/stdout дочернего процесса. Один JSON-объект занимает одну строку и завершается `\n`. stdout зарезервирован для протокола; обычный Python stdout перенаправляется в stderr. HTTP listener и динамическое выполнение команд отсутствуют.

Версия протокола: `2`.

## 2. Лимиты

| Параметр | Значение |
| --- | ---: |
| Максимальный request | 65 536 bytes |
| Максимальный response frame | 4 000 000 bytes |
| Write timeout | 2 s |
| Обычный response timeout | 65 s |
| Stop/shutdown timeout | 2 s |
| Обычных pending requests | до 4 |
| Всего pending с urgent | до 8 |

Превышение лимита, EOF посередине frame, невалидный JSON или нарушение envelope приводят к остановке процесса. Неизвестный результат операции не повторяется автоматически.

## 3. Envelope

Request содержит ровно три поля:

```json
{ "id": "42", "operation": "snapshot", "data": {} }
```

- `id`: непустая строка длиной до 80 символов;
- `operation`: значение allowlist;
- `data`: JSON object.

Успешный response: `{ "id": "42", "ok": true, "data": {} }`.

Ошибка: `{ "id": "42", "ok": false, "error": "Безопасное сообщение" }`.

События без `id`: `boot`, `state` и `fatal`. `state` является только сигналом для повторного `snapshot`.

## 4. Handshake

Первой управляющей операцией должна быть:

```json
{ "id": "1", "operation": "hello", "data": { "protocol": 2, "window": 123456 } }
```

HWND получает Rust host, а не JavaScript. Повторный handshake запрещён.

## 5. Операции

| Операция | Назначение | Основные параметры |
| --- | --- | --- |
| `snapshot` | Полное публичное состояние | отсутствуют |
| `save` | Проверка и сохранение настроек | config + опциональные secrets |
| `code` | Запрос Telegram-кода | отсутствуют |
| `login` | Код или 2FA-пароль | `code`, `password` |
| `logout` | Подтверждённый выход | отсутствуют |
| `chats` | Загрузка допустимых диалогов | отсутствуют |
| `select` | Выбор peer | integer `id` |
| `focus` | Выбор участника группы | integer `sender_id` |
| `test` | Backend self-test | отсутствуют |
| `calibrate` | Выбор клавиатуры по нажатию F7 | отсутствуют |
| `prepare` | Подготовка запуска | `mode`, `text`, опциональные подтверждения |
| `stop` | Срочная остановка | отсутствуют |
| `profile` | Публичный профиль текущего аккаунта | отсутствуют |
| `shutdown` | Завершение sidecar | только host lifecycle |

`prepare.mode` принимает `manual`, `live` или `ai`. Для `manual` и `ai` обязательно `ack_send: true`, так как эти режимы генерируют Enter. Для `live` подтверждение Enter не является условием запуска: этот режим никогда не генерирует Enter. AI дополнительно требует `consent: true`.

Операция `start` отсутствует в WebView/Rust/Python IPC allowlist. Запуск возможен только локальной F8 после `prepare`.

## 6. Snapshot

Public config дополнительно содержит `live_enabled`, `live_calibrated` и короткую необратимую метку `live_device`. Полный Hardware ID не покидает Python-sidecar. Схема запрещает дополнительные поля. API key/hash заменяются флагами наличия.

Стадии: `idle`, `ready`, `listening`, `incoming`, `thinking`, `typing`, `error`.

Telemetry содержит rolling window до 60 минут с полями `minute`, `incoming`, `completed`. `completed` не доказывает доставку сообщения.

## 7. Совместимость

Изменение operation, envelope, limit, поля snapshot или semantics требует одновременного изменения Python validation/dispatch, Rust allowlist/parser, TypeScript contracts, JSON Schema, generated validator, тестов и документации. Несовместимые изменения требуют увеличения `PROTOCOL`.

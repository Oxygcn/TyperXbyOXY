# Локальный протокол Rust ↔ Python

## 1. Транспорт

Протокол использует UTF-8 JSON Lines через stdin/stdout дочернего процесса. Один JSON-объект занимает одну строку и завершается `\n`. stdout зарезервирован для протокола; обычный Python stdout перенаправляется в stderr. HTTP listener и динамическое выполнение команд отсутствуют.

Версия протокола: `1`.

## 2. Лимиты

| Параметр | Значение |
|---|---:|
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
{"id":"42","operation":"snapshot","data":{}}
```

- `id`: непустая строка длиной до 80 символов;
- `operation`: значение allowlist;
- `data`: JSON object.

Успешный response:

```json
{"id":"42","ok":true,"data":{}}
```

Ошибка:

```json
{"id":"42","ok":false,"error":"Безопасное сообщение"}
```

События без `id`:

```json
{"event":"boot","protocol":1}
{"event":"state"}
{"event":"fatal","error":"Причина"}
```

`state` является только сигналом для повторного `snapshot`; конфигурация или сообщения в событии не передаются.

## 4. Handshake

Первой управляющей операцией должна быть:

```json
{"id":"1","operation":"hello","data":{"protocol":1,"window":123456}}
```

HWND получает Rust host, а не JavaScript. Повторный handshake запрещён. После handshake Rust запрашивает snapshot.

## 5. Операции

| Операция | Назначение | Основные параметры |
|---|---|---|
| `snapshot` | Полное публичное состояние | отсутствуют |
| `save` | Проверка и сохранение настроек | config + опциональные secrets |
| `code` | Запрос Telegram-кода | отсутствуют |
| `login` | Код или 2FA-пароль | `code`, `password` |
| `logout` | Подтверждённый выход | отсутствуют |
| `chats` | Загрузка допустимых диалогов | отсутствуют |
| `select` | Выбор peer | integer `id` |
| `focus` | Выбор участника группы | integer `sender_id` |
| `test` | Backend self-test | отсутствуют |
| `prepare` | Подготовка ручного/AI запуска | `mode`, `text`, `ack_send`, опционально `consent`, `bind_chat` |
| `stop` | Срочная остановка | отсутствуют |
| `profile` | Публичный профиль текущего аккаунта | отсутствуют |
| `shutdown` | Завершение sidecar | отсутствуют; только host lifecycle |

Операция `start` намеренно отсутствует в WebView/Rust/Python IPC allowlist. Запуск возможен только локальной F8 после `prepare`.

## 6. Snapshot

Snapshot включает `protocol`, public `config`, `stage`, `detail`, `prepared`, `active`, `chats`, `target`, `profile`, `hotkeys` и `telemetry`. Схема запрещает дополнительные поля. API key/hash заменяются флагами наличия.

Стадии: `idle`, `ready`, `listening`, `incoming`, `thinking`, `typing`, `error`.

Telemetry содержит ровно rolling window до 60 минут с полями `minute`, `incoming`, `completed`. `completed` не доказывает доставку сообщения.

## 7. Совместимость

Изменение operation, envelope, limit, поля snapshot или semantics требует:

1. изменения Python validation/dispatch;
2. изменения Rust allowlist/parser;
3. изменения TypeScript contracts;
4. изменения JSON Schema и generated validator;
5. regression tests;
6. обновления этого документа.

Несовместимые изменения требуют увеличения `PROTOCOL` и одновременного обновления host и sidecar.
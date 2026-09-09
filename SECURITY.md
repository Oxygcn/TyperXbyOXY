# Политика безопасности

## Поддерживаемые версии

Проект находится в стадии `0.1.x`. Security fixes применяются только к последней версии ветки `main`. Публичные бинарные релизы не считаются поддерживаемыми, пока release checklist не выполнен полностью.

## Сообщение об уязвимости

Не создавайте публичный issue для уязвимостей, способных раскрыть Telegram session, API credentials, сообщения, выполнить несанкционированный ввод или обойти target guard/F9.

Используйте GitHub Private Vulnerability Reporting, если оно включено для репозитория. Если канал недоступен, свяжитесь с владельцем репозитория приватно через GitHub, не прикладывая секретные данные.

В отчёте укажите:

- затронутый commit/version;
- класс уязвимости и impact;
- минимальные шаги воспроизведения на тестовых данных;
- необходимые права и конфигурацию;
- безопасный proof of concept;
- предполагаемое исправление, если известно.

Не отправляйте API key/hash, 2FA-пароль, Telegram code, телефон, `telegram.session`, `ai-secrets.bin`, реальные chat messages или полный memory dump.

## Ожидаемая обработка

Maintainer подтверждает получение, оценивает severity, готовит исправление и согласует disclosure. Сроки зависят от воспроизводимости и риска; до подтверждения исправления не обещается production SLA.

## Scope

В scope входят Tauri IPC, Python protocol, auth/session handling, secret storage, target guard, keyboard lifecycle, dependency/build integrity и утечки данных. Ошибки стороннего Telegram/LLM API без специфичного влияния TyperX следует сообщать соответствующему поставщику.

Техническая модель угроз: [docs/SECURITY.md](docs/SECURITY.md).
"""Validated Telegram code/2FA flow with diagnostics that never echo secrets."""
from __future__ import annotations

import asyncio
import re


class AuthFlowError(Exception):
    pass


def normalized_phone(raw):
    if not isinstance(raw, str):
        raise AuthFlowError('Укажите телефон в международном формате +кодстраныномер [TG_PHONE].')
    phone = re.sub(r'[\s()\-]', '', raw)
    if not re.fullmatch(r'\+[1-9][0-9]{6,14}', phone):
        raise AuthFlowError('Телефон должен иметь вид +кодстраныномер; затем сохраните настройки [TG_PHONE].')
    return phone


def validate_identity(config, secrets):
    raw = config.get('api_id', '')
    api_hash = secrets.get('api_hash', '')
    if not isinstance(raw, str) or not re.fullmatch(r'[0-9]{1,10}', raw) or not 1 <= int(raw) <= 2147483647:
        raise AuthFlowError('Сохранённый API ID должен быть положительным числом из my.telegram.org [TG_API_ID].')
    if not isinstance(api_hash, str) or not re.fullmatch(r'[a-fA-F0-9]{32}', api_hash):
        raise AuthFlowError('Сохранённый API hash отсутствует или имеет неверный формат. Введите его в настройках без кавычек [TG_API_HASH].')


def safe_diagnostic(action, error):
    # Source coordinates only, never exception text, locals, full filesystem paths,
    # request bodies, phone, password, code, API hash, access_hash or session data.
    action = action if action in {'connect', 'code', 'login', 'password', 'profile', 'logout', 'status'} else 'operation'
    name = re.sub(r'[^A-Za-z0-9_]', '', type(error).__name__)[:60] or 'Error'
    known = {
        'PhoneCodeInvalidError': 'Неверный код Telegram. Введите действующий код.',
        'PhoneCodeEmptyError': 'Введите код Telegram.',
        'PhoneCodeExpiredError': 'Код Telegram истёк. Запросите новый.',
        'PhoneCodeHashEmptyError': 'Запросите новый код входа.',
        'PasswordHashInvalidError': 'Неверный пароль двухэтапной проверки.',
        'PhoneNumberInvalidError': 'Telegram отклонил номер телефона.',
        'ApiIdInvalidError': 'Telegram отклонил API ID/API hash.',
        'AuthKeyUnregisteredError': 'Сессия Telegram отозвана. Войдите заново.',
        'FloodWaitError': 'Telegram ограничил попытки. Не повторяйте запрос немедленно.',
        'TimeoutError': 'Telegram не ответил вовремя. Результат запроса может быть неизвестен; автоматического повтора нет.',
    }
    note = known.get(name, 'Telegram не завершил операцию. Сохраните диагностический код для разбора.')
    locations = []
    tb = error.__traceback__
    while tb:
        module = tb.tb_frame.f_globals.get('__name__', '')
        if isinstance(module, str) and module.startswith(('telethon.', 'typerx_desktop.')):
            function = tb.tb_frame.f_code.co_name
            location = f'{module}.{function}:{tb.tb_lineno}'
            locations.append(re.sub(r'[^A-Za-z0-9_.:]', '', location)[-130:])
        tb = tb.tb_next
    location = locations[-1] if locations else 'no-source'
    return f'{note} [TG:{action}:{name}:{location}]'


class AuthController:
    def __init__(self, gateway, store):
        self.gateway = gateway
        self.store = store
        self.phase = 'idle'

    def reset(self):
        self.phase = 'idle'
        self.gateway.phone = ''
        self.gateway.code_hash = None

    async def call(self, action, awaitable):
        try:
            return await asyncio.wait_for(awaitable, timeout=45)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            if type(error).__name__ == 'SessionPasswordNeededError':
                raise
            raise AuthFlowError(safe_diagnostic(action, error)) from None

    async def connect(self):
        validate_identity(self.store.config, self.store.secrets)
        try:
            return await self.call('connect', self.gateway.connect())
        except AuthFlowError:
            # Release a half-initialized/disconnected client, but NEVER delete the
            # session, revoke authorization or clear saved secrets automatically.
            try:
                await asyncio.wait_for(self.gateway.close(logout=False), timeout=2)
            except Exception:
                pass
            self.reset()
            raise

    async def request_code(self):
        if await self.connect():
            self.phase = 'authorized'
            return {'authorized': True}
        phone = normalized_phone(self.store.config.get('phone', ''))
        self.reset()
        self.gateway.phone = phone
        sent = await self.call('code', self.gateway.client.send_code_request(phone))
        code_hash = getattr(sent, 'phone_code_hash', None)
        if not isinstance(code_hash, str) or not code_hash:
            raise AuthFlowError('Telegram не вернул идентификатор запроса кода; вход не подтверждён [TG_CODE_HASH].')
        self.gateway.code_hash = code_hash
        self.phase = 'code'
        return {'code_sent': True}

    async def login(self, code='', password=''):
        if await self.connect():
            self.phase = 'authorized'
            self.gateway.code_hash = None
            return {'authorized': True}
        if not isinstance(code, str) or not isinstance(password, str):
            raise AuthFlowError('Некорректный формат данных входа [TG_LOGIN_SHAPE].')
        try:
            if self.phase == 'password':
                if not password:
                    raise AuthFlowError('Введите пароль двухэтапной проверки [TG_PASSWORD_REQUIRED].')
                # Password is not stripped or normalized: spaces may be meaningful.
                await self.call('password', self.gateway.client.sign_in(password=password))
            else:
                if password:
                    raise AuthFlowError('Сначала подтвердите код Telegram; пароль 2FA нужен только на следующем шаге [TG_ORDER].')
                if self.phase != 'code' or not self.gateway.phone or not self.gateway.code_hash:
                    raise AuthFlowError('Сначала запросите код входа. После перезапуска старый запрос не восстанавливается [TG_CODE_REQUIRED].')
                code = re.sub(r'[\s\-]', '', code)
                if not re.fullmatch(r'[0-9]{3,12}', code):
                    raise AuthFlowError('Введите только цифры из кода Telegram [TG_CODE_FORMAT].')
                await self.call('login', self.gateway.client.sign_in(
                    phone=self.gateway.phone, code=code, phone_code_hash=self.gateway.code_hash))
        except Exception as error:
            if type(error).__name__ == 'SessionPasswordNeededError':
                self.phase = 'password'
                return {'password_needed': True}
            if isinstance(error, AuthFlowError) and ('PhoneCodeExpiredError' in str(error) or 'PhoneCodeHashEmptyError' in str(error)):
                self.reset()
            raise
        # sign_in may return a SentCode object if called incorrectly. Never infer
        # authorization just because it returned without an exception.
        authorized = await self.call('status', self.gateway.client.is_user_authorized())
        if not authorized:
            raise AuthFlowError('Telegram не подтвердил авторизацию [TG_NOT_AUTHORIZED].')
        self.phase = 'authorized'
        self.gateway.code_hash = None
        return {'authorized': True}

    async def logout(self):
        client = self.gateway.client
        if client:
            authorized = await self.call('status', client.is_user_authorized())
            if authorized:
                ok = await self.call('logout', client.log_out())
                if not ok:
                    raise AuthFlowError('Telegram не подтвердил выход. Сессия не считается отозванной [TG_LOGOUT_FAILED].')
            await self.call('logout', self.gateway.close(logout=False))
        self.reset()
        return {}

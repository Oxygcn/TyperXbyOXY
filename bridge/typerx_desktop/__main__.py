"""Frozen sidecar entry point. stdout is reserved for framed protocol replies."""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import sys
import threading
from pathlib import Path

from .auth import AuthController, AuthFlowError, safe_diagnostic
from .typing_output import driver_output, TypingInputError, TypingStopped
from .guard import capture_guard
from .peers import (
    can_reply_to_dialog,
    dialog_kind,
    history_for_focus,
    is_private_user,
    sender_label,
    should_accept_incoming,
)

from .protocol import MAX_REQUEST, MAX_RESPONSE, MinuteCounters, ProtocolError, parse_request


def main() -> int:
    wire = sys.stdout
    sys.stdout = sys.stderr  # accidental dependency prints never corrupt protocol
    logging.disable(logging.CRITICAL)  # no auth values, chats or prompts in logs
    output_lock = threading.Lock()
    runtime = None
    hotkeys = None
    stopping = threading.Event()
    instance_lock = None

    def emit(message):
        if message.get('id', '').startswith('hotkey:'):
            if not message.get('ok') and runtime:
                runtime.notify('error', message.get('error', 'Запуск не выполнен'))
            return
        payload = json.dumps(message, ensure_ascii=True, allow_nan=False)
        if len(payload.encode('utf-8')) > MAX_RESPONSE:
            payload = json.dumps({'id': message.get('id'), 'ok': False,
                                  'error': 'Ответ слишком большой. Сократите настройки или список чатов.'})
        try:
            with output_lock:
                wire.write(payload + '\n')
                wire.flush()
        except (OSError, BrokenPipeError):
            stopping.set()
            if runtime:
                runtime.stop()

    if sys.platform != 'win32':
        emit({'event': 'fatal', 'error': 'Backend TyperX поддерживает только Windows 10/11.'})
        return 1
    try:
        from typerx.ai import AIError, TelegramGateway
        from typerx.ai_runtime import Runtime
        from typerx.studio_hotkeys import GlobalHotkeys

        class DesktopGateway(TelegramGateway):
            def __init__(self, store, notify):
                super().__init__(store, notify)
                self.focus_sender_id = None
                self.focus_sender_name = None
                self.preview_names = {}

            def clear_focus(self):
                self.focus_sender_id = None
                self.focus_sender_name = None
                self.preview_names = {}

            async def chats(self):
                if not await self.connect():
                    raise AIError('Сначала войдите в Telegram')
                from telethon import utils
                result = []
                async for dialog in self.client.iter_dialogs():
                    self.peers[dialog.id] = dialog.entity
                    result.append({'id': dialog.id, 'name': dialog.name or str(dialog.id),
                                   'can_reply': can_reply_to_dialog(dialog),
                                   'peer_id': utils.get_peer_id(dialog.entity),
                                   'kind': dialog_kind(dialog)})
                return result

            async def history(self, peer_id):
                if peer_id not in self.peers:
                    raise AIError('Загрузите чаты и выберите собеседника')
                messages = await self.client.get_messages(self.peers[peer_id], limit=50)
                rows = []
                for message in reversed(messages):
                    if not message.raw_text:
                        continue
                    rows.append({
                        'id': message.id,
                        'outgoing': bool(message.out),
                        'sender_id': message.sender_id,
                        'content': message.raw_text[:6000],
                    })
                return history_for_focus(rows, self.focus_sender_id)

            async def preview_messages(self, peer_id):
                if peer_id not in self.peers:
                    raise AIError('Загрузите чаты и выберите группу')
                messages = await self.client.get_messages(self.peers[peer_id], limit=50)
                rows = []
                names = {}
                for message in reversed(list(messages)):
                    if not message.raw_text or message.sender_id is None:
                        continue
                    sender = await message.get_sender()
                    sender_id = int(message.sender_id)
                    name = sender_label(sender, bool(message.out), str(sender_id))
                    if not message.out:
                        names[sender_id] = name
                    rows.append({
                        'id': int(message.id),
                        'sender_id': sender_id,
                        'name': name,
                        'outgoing': bool(message.out),
                        'text': message.raw_text[:500],
                    })
                self.preview_names = names
                return rows[-50:]

            async def _incoming(self, event):
                if not should_accept_incoming(self.target, event, self.peers, self.focus_sender_id):
                    return
                if self.on_message:
                    self.on_message(event.id)

        class DesktopRuntime(Runtime):
            def __init__(self, root, callback):
                self.metrics = MinuteCounters()
                self.profile_cache = None
                self.hotkeys_ok = False
                self.bind_chat = True
                super().__init__(root, callback)
                self.telegram = DesktopGateway(self.store, self.notify)
                self.auth = AuthController(self.telegram, self.store)
                self.detail = "Движок chat-binding-3 · подготовьте безопасный запуск"

            def notify(self, stage, detail):
                if stage == 'incoming':
                    self.metrics.add('incoming')
                super().notify(stage, detail)

            async def _output(self, text):
                if self.stopped.is_set():
                    raise asyncio.CancelledError
                await self.loop.run_in_executor(self.ui_executor, lambda: self.guard.check_field(empty=True))
                self.writer = asyncio.create_task(asyncio.to_thread(
                    driver_output, text, self.store.config, self.guard, self.stopped, self.notify))
                try:
                    await asyncio.shield(self.writer)
                except TypingStopped:
                    raise asyncio.CancelledError from None
                except TypingInputError as error:
                    raise AIError(str(error)) from None
                if self.mode == 'ai' and not self.stopped.is_set():
                    self.metrics.add('completed')

            async def get_profile(self):
                if not await self.auth.connect():
                    self.profile_cache = None
                    return None
                me = await self.auth.call("profile", self.telegram.client.get_me())
                if not me:
                    self.profile_cache = None
                    raise AIError('Telegram не вернул профиль аккаунта')
                profile = {'id': me.id,
                           'name': ' '.join(v for v in [me.first_name, me.last_name] if v) or str(me.id),
                           'username': me.username, 'avatar': None, 'avatar_warning': None}
                try:
                    photo = await self.telegram.client.download_profile_photo(me, file=bytes, download_big=False)
                    if photo:
                        if not isinstance(photo, bytes) or len(photo) > 2_000_000 or not photo.startswith(b'\xff\xd8'):
                            profile['avatar_warning'] = 'Фото недоступно в безопасном формате JPEG.'
                        else:
                            profile['avatar'] = 'data:image/jpeg;base64,' + base64.b64encode(photo).decode('ascii')
                except Exception:
                    profile['avatar_warning'] = 'Фото временно недоступно; профиль авторизован.'
                self.profile_cache = profile
                return profile

            async def dispatch(self, operation, data):
                try:
                    return await self._desktop_dispatch(operation, data)
                except AuthFlowError as error:
                    raise AIError(str(error)) from None
                except Exception as error:
                    if operation in {'code', 'login', 'profile', 'chats', 'logout', 'select', 'focus'} and not isinstance(error, AIError):
                        raise AIError(safe_diagnostic(operation if operation in {'code', 'login', 'profile', 'logout'} else 'status', error)) from None
                    raise

            async def _desktop_dispatch(self, operation, data):
                if operation == 'snapshot':
                    active = bool(self.job and not self.job.done())
                    return {'protocol': 1, 'config': self.store.public(),
                            'stage': self.stage, 'detail': self.detail,
                            'prepared': self.prepared, 'active': active,
                            'chats': self.chat_list, 'target': self.target,
                            'profile': self.profile_cache, 'hotkeys': self.hotkeys_ok,
                            'telemetry': self.metrics.snapshot()}
                if operation in {'prepare', 'start'} and not self.hotkeys_ok:
                    raise AIError('Глобальная остановка F9 недоступна. Запуск заблокирован.')
                if operation == 'prepare':
                    if data.get('mode') == 'ai' and self.target:
                        entity = self.telegram.peers.get(self.target['id'])
                        if entity and not is_private_user(entity) and not self.telegram.focus_sender_id:
                            raise AIError('В группе нажмите на сообщение человека, которому отвечает AI.')
                    self.bind_chat = True
                    result = await super().dispatch(operation, data)
                    self.bind_chat = data.get('bind_chat', True)
                    focused = self.telegram.focus_sender_name
                    extra = (' Цель: ' + focused + '.') if focused else ''
                    self.notify('ready', 'Откройте целевое поле и нажмите F8. ' +
                                ('Проверка чата включена.' if self.bind_chat else
                                 'Привязка к чату выключена; получателя проверяете вы.') + extra)
                    return result
                if operation == 'start':
                    self.idle_only()
                    if not self.prepared:
                        raise AIError('Сначала подготовьте запуск [INPUT_PREPARE].')
                    if self.mode == 'ai' and (not self.telegram.client or not self.telegram.client.is_connected()):
                        raise AIError('Telegram отключён. Подключите аккаунт перед запуском.')
                    epoch = self.epoch
                    self.guard = await self.loop.run_in_executor(
                        self.ui_executor, capture_guard, self.target['name'] if self.mode == 'ai' else None, self.bind_chat)
                    if not self.guard.hwnd or self.guard.hwnd == self.own_window:
                        raise AIError('Откройте поле в целевом приложении и нажмите F8 [INPUT_OWN_WINDOW].')
                    with self.control_lock:
                        if epoch != self.epoch:
                            raise AIError('Отложенный запуск отменён через F9.')
                        self.stopped.clear()
                        self.prepared = False
                        self.job = asyncio.create_task(self._run())
                    return {}
                if operation in {'code', 'login', 'profile', 'logout', 'chats', 'save', 'focus'}:
                    self.idle_only()
                if operation == 'code':
                    return await self.auth.request_code()
                if operation == 'login':
                    return await self.auth.login(data.get('code', ''), data.get('password', ''))
                if operation == 'profile':
                    return await self.get_profile()
                if operation == 'logout':
                    result = await self.auth.logout()
                    self.target, self.chat_list, self.prepared = None, [], False
                    self.profile_cache = None
                    self.telegram.clear_focus()
                    return result
                if operation == 'chats':
                    if not await self.auth.connect():
                        raise AIError('Сначала войдите в Telegram по коду и, если требуется, 2FA.')
                if operation == 'focus':
                    if not self.target:
                        raise AIError('Сначала выберите группу.')
                    entity = self.telegram.peers.get(self.target['id'])
                    if is_private_user(entity):
                        raise AIError('В личном чате собеседник уже выбран.')
                    sender_id = int(data['sender_id'])
                    name = self.telegram.preview_names.get(sender_id)
                    if not name:
                        raise AIError('Нажмите на входящее сообщение этого человека в списке.')
                    self.telegram.focus_sender_id = sender_id
                    self.telegram.focus_sender_name = name
                    self.prepared = False
                    return {'focus': {'id': sender_id, 'name': name}}
                if operation == 'save' and self.telegram.client:
                    changed = (data.get('api_id', '') != self.store.config['api_id']
                               or data.get('phone', '') != self.store.config['phone']
                               or bool(data.get('api_hash')))
                    if changed and not await self.auth.call('status', self.telegram.client.is_user_authorized()):
                        await self.auth.call('status', self.telegram.close(logout=False))
                        self.auth.reset()
                result = await super().dispatch(operation, data)
                if operation == 'logout':
                    self.profile_cache = None
                    self.telegram.clear_focus()
                if operation == 'select':
                    self.telegram.clear_focus()
                    peer_id = self.target['id']
                    entity = self.telegram.peers.get(peer_id)
                    if is_private_user(entity):
                        self.telegram.focus_sender_id = peer_id
                        self.telegram.focus_sender_name = self.target['name']
                        return {'selected': peer_id, 'kind': 'user',
                                'focus': {'id': peer_id, 'name': self.target['name']},
                                'messages': []}
                    messages = await self.telegram.preview_messages(peer_id)
                    return {'selected': peer_id, 'kind': 'group', 'focus': None, 'messages': messages}
                return result

        root = Path(os.environ.get('APPDATA', str(Path.home()))) / 'TyperX'
        import msvcrt
        root.mkdir(parents=True, exist_ok=True)
        instance_lock = open(root / 'desktop.lock', 'a+b')
        instance_lock.seek(0)
        instance_lock.write(b'0')
        instance_lock.flush()
        instance_lock.seek(0)
        try:
            msvcrt.locking(instance_lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            emit({'event': 'fatal', 'error': 'Другой TyperX уже использует эту сессию.'})
            return 1
        runtime = DesktopRuntime(root, emit)
        handshake = False
        counter = 0

        def start():
            nonlocal counter
            if runtime.hotkeys_ok and runtime.prepared and not stopping.is_set():
                counter += 1
                runtime.submit(f'hotkey:{counter}', 'start', {})

        def hotkey_error(message):
            runtime.hotkeys_ok = False
            runtime.stop()
            runtime.notify('error', message)

        emit({'event': 'boot', 'protocol': 1})
        while not stopping.is_set():
            line = sys.stdin.buffer.readline(MAX_REQUEST + 1)
            if not line:
                break
            request = None
            try:
                request = parse_request(line)
            except (ProtocolError, TypeError):
                runtime.stop()
                emit({'event': 'fatal', 'error': 'Нарушен локальный протокол. Движок остановлен.'})
                break
            rid, operation, data = request['id'], request['operation'], request['data']
            if operation in {'stop', 'shutdown'}:
                runtime.stop()
                emit({'id': rid, 'ok': True, 'data': {}})
                if operation == 'shutdown':
                    break
            elif operation == 'hello':
                if handshake:
                    emit({'id': rid, 'ok': False, 'error': 'Повторная инициализация запрещена'})
                    continue
                runtime.own_window = data['window']
                hotkeys = GlobalHotkeys(start, runtime.stop, hotkey_error)
                hotkeys.start()
                runtime.hotkeys_ok = True
                handshake = True
                emit({'id': rid, 'ok': True, 'data': {'protocol': 1}})
            elif not handshake:
                emit({'id': rid, 'ok': False, 'error': 'Сначала выполните инициализацию'})
            else:
                runtime.submit(rid, operation, data)
                request = None
    except Exception:
        emit({'event': 'fatal', 'error': 'Не удалось запустить Python-движок. Проверьте сборку и зависимости.'})
        return 1
    finally:
        stopping.set()
        if runtime:
            runtime.hotkeys_ok = False
            runtime.stop()
        if hotkeys:
            hotkeys.close()
        if runtime:
            runtime.close()
        if instance_lock:
            instance_lock.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

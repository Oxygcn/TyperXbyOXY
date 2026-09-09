"""Tracked, idempotent cleanup around the existing Interception driver."""
from __future__ import annotations

import ctypes

from typerx.platform.interception_keyboard import InterceptionKeyboard
from .typing_output import TypingInputError


class DesktopKeyboard(InterceptionKeyboard):
    def __init__(self, target_window):
        self._down = set()
        self._closed = False
        try:
            super().__init__(target_window)
        except Exception:
            self.close()
            raise

    def assert_ready(self):
        self.assert_focus()
        user32 = ctypes.WinDLL('user32', use_last_error=True)
        async_state = user32.GetAsyncKeyState
        async_state.argtypes = [ctypes.c_int]
        async_state.restype = ctypes.c_short
        key_state = user32.GetKeyState
        key_state.argtypes = [ctypes.c_int]
        key_state.restype = ctypes.c_short
        if key_state(0x14) & 1:
            raise TypingInputError('Выключите Caps Lock перед запуском [INPUT_CAPS_LOCK].')
        if any(async_state(vk) & 0x8000 for vk in (0x10, 0x11, 0x12, 0x5B, 0x5C)):
            raise TypingInputError('Отпустите Shift, Ctrl, Alt и Win перед F8 [INPUT_MODIFIER].')

    def validate_char(self, char):
        _, modifiers, _ = self._resolve_char(char)
        if modifiers & ~1:
            raise TypingInputError(
                'Для символа нужна комбинация Ctrl/Alt или неподдерживаемая раскладка. '
                'Ввод не начат [INPUT_LAYOUT].')

    def press(self, char):
        if not isinstance(char, str) or len(char) != 1:
            raise TypingInputError('Ожидался один символ [INPUT_CHARACTER].')
        vk, modifiers, hkl = self._resolve_char(char)
        if modifiers & ~1:
            raise TypingInputError('Раскладка изменилась на неподдерживаемую [INPUT_LAYOUT].')
        return self._press_vk(vk, modifiers, hkl)

    def _send(self, scan, flags, key_up=False):
        token = (scan, flags)
        if not key_up:
            # Track before send: an exception cannot prove the OS saw no key-down.
            self._down.add(token)
        super()._send(scan, flags, key_up)
        if key_up:
            self._down.discard(token)

    def close(self):
        if getattr(self, '_closed', True):
            return
        self._closed = True
        failure = False
        for scan, flags in tuple(getattr(self, '_down', ())):
            try:
                # Bypass focus guards for key-up cleanup.
                super()._send(scan, flags, True)
            except Exception:
                failure = True
        self._down.clear()
        if hasattr(self, '_held_modifiers'):
            self._held_modifiers.clear()
        if hasattr(self, '_context'):
            try:
                super().close()
            except Exception:
                failure = True
        if failure:
            raise TypingInputError(
                'Не удалось подтвердить очистку драйвера. Проверьте состояние клавиш '
                'и не возобновляйте ввод автоматически [INPUT_RELEASE].')

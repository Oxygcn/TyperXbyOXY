"""Normalize only known self-induced title changes, retaining target protection."""
from __future__ import annotations

import re

# Static text only: diagnostics never include window titles or chat contents.
GUARD_MESSAGES = {
    'INPUT_WINDOW': 'Windows сообщает, что активным стало другое окно. Ввод остановлен.',
    'INPUT_PROCESS': 'Изменилась принадлежность целевого окна процессу. Ввод остановлен.',
    'INPUT_TITLE': 'Изменился заголовок документа или чата после нормализации служебных отметок. Ввод остановлен.',
    'INPUT_TITLE_STRICT': 'Изменился исходный заголовок окна. Для этого окна действует строгая проверка: безопасная нормализация недоступна.',
    'INPUT_TARGET_UNAVAILABLE': 'Windows не позволила повторно проверить целевое окно. Ввод остановлен.',
    'INPUT_UIA_UNAVAILABLE': 'Windows UI Automation перестала предоставлять поле ввода. Это не обязательно означает ваше действие.',
    'INPUT_FIELD': 'UI Automation вернула другой идентификатор поля ввода. Ввод остановлен.',
    'INPUT_DRAFT': 'Перед запуском поле должно быть пустым.',
    'INPUT_KEYBOARD_WINDOW': 'Непосредственно перед нажатием клавиши драйвер обнаружил другое активное окно.',
}


def guard_message(code):
    return GUARD_MESSAGES[code] + ' [' + code + ']'


def canonical_title(title, host):
    if host == 'telegram.exe':
        return re.sub(r'^\(\d+\)\s*', '', title).strip()
    if host == 'notepad.exe':
        # Notepad adds a dirty-document marker on the very first keystroke.
        # Do not normalize document names, tab changes or other applications.
        return title.removeprefix('*')
    return title


def process_identity(hwnd):
    import ctypes
    from ctypes import wintypes
    import win32api
    import win32process
    _, pid = win32process.GetWindowThreadProcessId(hwnd)
    handle = win32api.OpenProcess(0x1000, False, pid)
    try:
        query = ctypes.WinDLL('kernel32', use_last_error=True).QueryFullProcessImageNameW
        query.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
        query.restype = wintypes.BOOL
        size = wintypes.DWORD(32768)
        buffer = ctypes.create_unicode_buffer(size.value)
        if not query(int(handle), 0, buffer, ctypes.byref(size)):
            raise OSError('Process identity unavailable')
        return pid, buffer.value.replace('\\', '/').rsplit('/', 1)[-1].lower()
    finally:
        win32api.CloseHandle(handle)


def _capture_bound_guard(peer_name=None):
    from typerx.ai import AIError
    from typerx.ai_runtime import TargetGuard, focused_editor
    import win32gui
    import win32process

    def fail(code):
        error = AIError(guard_message(code))
        error.desktop_guard_code = code
        raise error

    class DesktopGuard(TargetGuard):
        def __init__(self):
            self.desktop_host = None
            self.desktop_pid = None
            self.manual_focus = None
            super().__init__(peer_name)
            try:
                self.desktop_pid, host = process_identity(self.hwnd)
            except Exception:
                # Keep the original strict guard when verification is unavailable.
                return
            if peer_name:
                self.desktop_host = 'telegram.exe'  # verified by original TargetGuard
            elif host in {'notepad.exe', 'telegram.exe'}:
                try:
                    focus_id, _ = focused_editor()
                except Exception:
                    return  # no UIA field identity => no title normalization
                if not focus_id:
                    return
                if host == 'telegram.exe' and canonical_title(self.title, host) in {'Telegram', 'Telegram Desktop'}:
                    raise AIError('Для ручного ввода откройте отдельное окно нужного чата Telegram [INPUT_CHAT_WINDOW].')
                self.manual_focus = focus_id
                self.desktop_host = host
            if self.desktop_host:
                self.desktop_title = canonical_title(self.title, self.desktop_host)
            self.check()

        def check(self):
            # Preserve the existing fail-closed policy; distinguish its causes.
            if win32gui.GetForegroundWindow() != self.hwnd:
                fail('INPUT_WINDOW')
            if self.desktop_pid is not None:
                try:
                    _, pid = win32process.GetWindowThreadProcessId(self.hwnd)
                except Exception:
                    fail('INPUT_TARGET_UNAVAILABLE')
                if pid != self.desktop_pid:
                    fail('INPUT_PROCESS')
            title = win32gui.GetWindowText(self.hwnd)
            if self.desktop_host is None:
                if title != self.title:
                    fail('INPUT_TITLE_STRICT')
            elif canonical_title(title, self.desktop_host) != self.desktop_title:
                fail('INPUT_TITLE')

        def check_field(self, empty=False):
            self.check()
            expected = self.focus_id if self.peer_name else self.manual_focus
            if expected:
                try:
                    focus_id, value = focused_editor()
                except Exception:
                    fail('INPUT_UIA_UNAVAILABLE')
                if focus_id != expected:
                    fail('INPUT_FIELD')
                if empty and value.strip():
                    fail('INPUT_DRAFT')

    return DesktopGuard()


def capture_guard(peer_name=None, bind_chat=True):
    if type(bind_chat) is not bool:
        raise ValueError('Chat binding must be boolean')
    if bind_chat:
        return _capture_bound_guard(peer_name)
    # Explicit opt-out: no call to the old title/chat-checking constructor.
    from typerx.ai import AIError
    from typerx.ai_runtime import focused_editor
    import win32gui
    import win32process

    def fail(code):
        error = AIError(guard_message(code))
        error.desktop_guard_code = code
        raise error

    class WindowOnlyGuard:
        def __init__(self):
            self.hwnd = win32gui.GetForegroundWindow()
            if not self.hwnd:
                fail('INPUT_TARGET_UNAVAILABLE')
            try:
                _, self.pid = win32process.GetWindowThreadProcessId(self.hwnd)
            except Exception:
                fail('INPUT_TARGET_UNAVAILABLE')
            if not self.pid:
                fail('INPUT_TARGET_UNAVAILABLE')
            self.focus_id = None
            try:
                identity, _ = focused_editor()
                self.focus_id = identity or None
            except Exception:
                # This explicitly selected mode guarantees window binding, not
                # recipient identity. Retain field checks whenever UIA supports it.
                pass
            self.check()

        def check(self):
            if win32gui.GetForegroundWindow() != self.hwnd:
                fail('INPUT_WINDOW')
            try:
                _, pid = win32process.GetWindowThreadProcessId(self.hwnd)
            except Exception:
                fail('INPUT_TARGET_UNAVAILABLE')
            if pid != self.pid:
                fail('INPUT_PROCESS')
            # Deliberately DO NOT read the title or validate peer_name here.

        def check_field(self, empty=False):
            self.check()
            if self.focus_id is not None:
                try:
                    identity, value = focused_editor()
                except Exception:
                    fail('INPUT_UIA_UNAVAILABLE')
                if identity != self.focus_id:
                    fail('INPUT_FIELD')
                if empty and value.strip():
                    fail('INPUT_DRAFT')

    return WindowOnlyGuard()

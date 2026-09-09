"""Deterministic desktop output: exact word groups, no overlapping keys or typos.

The existing backend still owns target selection, focus checks, cancellation and
Telegram/AI orchestration. Only its desktop output scheduling is replaced.
"""
from __future__ import annotations

import random
import re
import time

from .guard import GUARD_MESSAGES, guard_message


class TypingStopped(Exception):
    pass


class TypingInputError(Exception):
    pass


def normalize_text(text: str) -> str:
    if not isinstance(text, str):
        raise TypingInputError('Текст должен быть строкой [INPUT_TEXT].')
    table = str.maketrans({'“': '"', '”': '"', '‘': "'", '’': "'", '—': '-',
                          '–': '-', '…': '...', '\u00a0': ' '})
    return re.sub(r'[\x00-\x1f\x7f-\x9f]', ' ', text).translate(table).strip()


def split_messages(text: str, words: int) -> tuple[str, ...]:
    if type(words) is not int or not 1 <= words <= 16:
        raise TypingInputError('Слов в сообщении: целое число от 1 до 16 [INPUT_WORDS].')
    tokens = re.findall(r'\S+', normalize_text(text))
    # Do not treat greetings, punctuation or Russian question words as separators.
    return tuple(' '.join(tokens[i:i + words]) for i in range(0, len(tokens), words))


def run_output(text, config, guard, stopped, notify, keyboard_factory, *,
               clock=time.monotonic, rng=None):
    wpm = config.get('wpm')
    if type(wpm) is not int or not 25 <= wpm <= 300:
        raise TypingInputError('Скорость: целое число от 25 до 300 WPM [INPUT_WPM].')
    messages = split_messages(text, config.get('words'))
    if not messages:
        raise TypingInputError('Введите непустой текст [INPUT_EMPTY].')
    rng = rng or random.Random()
    keyboard = None
    phase = 'preflight'
    current = 0

    def check():
        if stopped.is_set():
            raise TypingStopped()
        guard.check()  # Do not loosen HWND/title protection to hide a failure.

    def wait(seconds):
        deadline = clock() + seconds
        while True:
            check()
            remaining = deadline - clock()
            if remaining <= 0:
                return
            if stopped.wait(min(0.01, remaining)):
                raise TypingStopped()

    def tap(press, dwell):
        check()
        key = press()
        try:
            wait(dwell)
        finally:
            # Release even after F9, focus loss, or an exception during a key hold.
            # Key-up must NOT be blocked by the foreground-window guard.
            keyboard.release(key)
        check()

    try:
        check()
        keyboard = keyboard_factory(guard.hwnd)
        keyboard.assert_ready()
        # Complete character validation before any key-down or Enter.
        for char in sorted(set(''.join(messages))):
            check()
            keyboard.validate_char(char)
        for current, message in enumerate(messages, 1):
            check()
            notify('typing', f'Печать фрагмента {current} из {len(messages)}')
            phase = 'characters'
            for char in message:
                period = (60.0 / (wpm * 5.0)) * rng.uniform(0.95, 1.05)
                dwell = min(0.045, max(0.012, period * 0.40))
                onset = clock()
                tap(lambda ch=char: keyboard.press(ch), dwell)
                # The next key cannot begin until the previous key and its
                # modifiers have been released. Actual speed may be below target.
                wait(max(0.0, period - (clock() - onset)))
            phase = 'enter'
            wait(0.04)
            tap(keyboard.press_enter, 0.025)
            # Allow the target editor to process Enter before the next group.
            # This is not an acknowledgement that Telegram delivered anything.
            wait(0.15)
    except (TypingStopped, TypingInputError):
        raise
    except Exception as error:
        # Never include typed text, window titles, or raw driver exception text.
        known = type(error).__name__
        code = getattr(error, 'desktop_guard_code', None)
        if isinstance(code, str) and code in GUARD_MESSAGES:
            raise TypingInputError(guard_message(code) +
                f' Этап: {phase}; фрагмент: {current}.') from None
        if known == 'FocusChangedError':
            raise TypingInputError(guard_message('INPUT_KEYBOARD_WINDOW') +
                f' Этап: {phase}; фрагмент: {current}.') from None
        if known == 'AIError':
            raise TypingInputError(
                'Окно, заголовок или поле ввода изменились. Ввод остановлен; '
                'проверьте черновик [INPUT_FOCUS].') from None
        raise TypingInputError(
            f'Ввод остановлен: {known}; этап {phase}, фрагмент {current}. '
            'Проверьте раскладку, драйвер и целевое окно [INPUT_DRIVER].') from None
    finally:
        if keyboard is not None:
            keyboard.close()


def driver_output(text, config, guard, stopped, notify):
    from .keyboard import DesktopKeyboard
    return run_output(text, config, guard, stopped, notify, DesktopKeyboard)

"""Physical-key driven output for local text fields.

The source key is deliberately ignored: one accepted physical key-down advances
one character in the prepared text. Control keys, Enter and modified shortcuts
are passed through unchanged. The Interception receive loop lives in the Python
sidecar and is always bounded by F9, the stop event and the target guard.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import time

from .typing_output import TypingInputError, TypingStopped, normalize_text

KEY_UP = 0x01
KEY_E0 = 0x02
KEY_E1 = 0x04
F7_SCAN = 0x41
F9_SCAN = 0x43
CAPS_LOCK_SCAN = 0x3A

# Scan codes which must retain their native meaning and never advance text.
_PASSTHROUGH = frozenset({
    0x01,  # Esc
    0x0E,  # Backspace
    0x0F,  # Tab
    0x1C,  # Enter
    0x3A,  # Caps Lock
    0x45,  # Num Lock
    0x46,  # Scroll Lock
    *range(0x3B, 0x45),  # F1-F10
    0x57, 0x58,  # F11/F12
})
_MODIFIERS = frozenset({0x1D, 0x2A, 0x36, 0x38, 0x5B, 0x5C})


@dataclass(frozen=True, slots=True)
class CapturedStroke:
    code: int
    flags: int
    raw: object
    device: int

    @property
    def key_up(self) -> bool:
        return bool(self.flags & KEY_UP)

    @property
    def key_id(self) -> tuple[int, int]:
        return self.code, self.flags & (KEY_E0 | KEY_E1)

    @property
    def extended(self) -> bool:
        return bool(self.flags & (KEY_E0 | KEY_E1))


class LiveSettings:
    """Small adapter-owned settings file; upstream AIStore remains unchanged."""

    VERSION = 1

    def __init__(self, root: Path):
        self.path = root / "live.json"
        self.enabled = False
        self.device_hwid = ""
        self.warning = ""
        self._load()

    def _load(self) -> None:
        try:
            if not self.path.exists():
                return
            value = json.loads(self.path.read_text("utf-8"))
            if (not isinstance(value, dict) or set(value) != {"version", "enabled", "device_hwid"}
                    or value.get("version") != self.VERSION
                    or type(value.get("enabled")) is not bool
                    or not isinstance(value.get("device_hwid"), str)
                    or len(value["device_hwid"]) > 500):
                raise ValueError("invalid live settings")
            self.enabled = value["enabled"]
            self.device_hwid = value["device_hwid"]
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            self.enabled = False
            self.device_hwid = ""
            self.warning = "Настройки живой печати повреждены и были отключены."

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps({
            "version": self.VERSION,
            "enabled": self.enabled,
            "device_hwid": self.device_hwid,
        }, ensure_ascii=True, separators=(",", ":"))
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(payload, "utf-8")
        os.replace(temporary, self.path)

    def set_enabled(self, enabled: bool) -> None:
        if type(enabled) is not bool:
            raise TypingInputError("Некорректное состояние живой печати [LIVE_CONFIG].")
        if enabled and not self.device_hwid:
            raise TypingInputError("Сначала откалибруйте клавиатуру [LIVE_CALIBRATION].")
        self.enabled = enabled
        self.warning = ""
        self.save()

    def set_device(self, hwid: str) -> None:
        if not isinstance(hwid, str) or not hwid or len(hwid) > 500:
            raise TypingInputError("Клавиатура не определена [LIVE_DEVICE].")
        self.device_hwid = hwid
        self.warning = ""
        self.save()

    def public(self) -> dict:
        return {
            "enabled": self.enabled,
            "calibrated": bool(self.device_hwid),
            "device": device_label(self.device_hwid) if self.device_hwid else None,
            "warning": self.warning,
        }


def device_label(hwid: str) -> str:
    digest = hashlib.sha256(hwid.encode("utf-8", "replace")).hexdigest()[:8]
    return f"Клавиатура • {digest}"


class InterceptionLiveDriver:
    """One Interception context shared by receive, passthrough and output."""

    def __init__(self, target_window: int, device_hwid: str):
        from interception.constants import FilterKeyFlag
        from interception.interception import Interception
        from .keyboard import DesktopKeyboard

        self._filter_none = int(FilterKeyFlag.FILTER_KEY_NONE)
        self._filter_all = int(FilterKeyFlag.FILTER_KEY_ALL)
        self.context = Interception()
        self.active = False
        self.closed = False
        if not self.context.valid:
            self.context.destroy()
            raise TypingInputError(
                "Interception driver недоступен. Установите драйвер и перезагрузите Windows "
                "[LIVE_DRIVER].")
        self.device = self._resolve_device(device_hwid)
        self.keyboard = DesktopKeyboard(
            target_window, context=self.context, keyboard=self.device)

    def _resolve_device(self, expected: str) -> int:
        for index in range(10):
            try:
                value = (self.context.devices[index].get_HWID() or "").rstrip("\x00")
            except OSError:
                continue
            if value and value == expected:
                return index
        self.context.destroy()
        raise TypingInputError(
            "Откалиброванная клавиатура не найдена. Выполните калибровку снова "
            "[LIVE_DEVICE].")

    def assert_ready(self) -> None:
        self.keyboard.assert_ready()

    def validate_char(self, char: str) -> None:
        self.keyboard.validate_char(char)

    def activate(self) -> None:
        result = self.context.devices[self.device].set_filter(self._filter_all)
        if not result.succeeded:
            raise TypingInputError("Не удалось включить перехват клавиатуры [LIVE_FILTER].")
        self.active = True

    def receive(self, timeout_ms: int) -> CapturedStroke | None:
        device = self.context.await_input(timeout_ms)
        if device is None:
            return None
        stroke = self.context.devices[device].receive()
        if stroke is None:
            return None
        return CapturedStroke(int(stroke.code), int(stroke.flags), stroke, device)

    def forward(self, event: CapturedStroke) -> None:
        self.context.send(event.device, event.raw)

    def emit(self, char: str) -> None:
        key = self.keyboard.press(char)
        self.keyboard.release(key)

    def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        failure = False
        if self.active:
            try:
                result = self.context.devices[self.device].set_filter(self._filter_none)
                failure = not result.succeeded
            except Exception:
                failure = True
            self.active = False
        try:
            self.keyboard.close()
        except Exception:
            failure = True
        try:
            self.context.destroy()
        except Exception:
            failure = True
        if failure:
            raise TypingInputError(
                "Не удалось подтвердить отключение перехвата. Перезапустите TyperX "
                "[LIVE_RELEASE].")


def _is_modifier(event: CapturedStroke) -> bool:
    return event.code in _MODIFIERS


def _must_passthrough(event: CapturedStroke) -> bool:
    return event.extended or event.code in _PASSTHROUGH or _is_modifier(event)


def run_live_output(text, settings, guard, stopped, notify,
                    driver_factory=InterceptionLiveDriver) -> None:
    prepared = normalize_text(text)
    if not prepared:
        raise TypingInputError("Введите непустой текст [LIVE_EMPTY].")
    if not settings.enabled:
        raise TypingInputError("Включите живую печать в настройках [LIVE_DISABLED].")
    if not settings.device_hwid:
        raise TypingInputError("Сначала откалибруйте клавиатуру [LIVE_CALIBRATION].")

    driver = None
    swallowed: set[tuple[int, int]] = set()
    modifiers: set[tuple[int, int]] = set()
    cursor = 0
    last_notice = -8

    def check() -> None:
        if stopped.is_set():
            raise TypingStopped()
        guard.check()

    try:
        check()
        driver = driver_factory(guard.hwnd, settings.device_hwid)
        driver.assert_ready()
        for char in sorted(set(prepared)):
            check()
            driver.validate_char(char)
        driver.activate()
        notify("typing", f"Живая печать: 0 из {len(prepared)}")

        while cursor < len(prepared) or swallowed:
            check()
            event = driver.receive(50)
            if event is None:
                continue

            key_id = event.key_id
            if event.code == F9_SCAN and not event.extended:
                driver.forward(event)
                stopped.set()
                raise TypingStopped()

            if _is_modifier(event):
                if event.key_up:
                    modifiers.discard(key_id)
                else:
                    modifiers.add(key_id)
                driver.forward(event)
                continue

            if event.code == CAPS_LOCK_SCAN and not event.key_up:
                driver.forward(event)
                raise TypingInputError(
                    "Caps Lock изменён во время живой печати. Режим остановлен "
                    "[LIVE_CAPS_LOCK].")

            if key_id in swallowed:
                if event.key_up:
                    swallowed.discard(key_id)
                continue

            if event.key_up or _must_passthrough(event) or modifiers or cursor >= len(prepared):
                driver.forward(event)
                continue

            swallowed.add(key_id)
            driver.emit(prepared[cursor])
            cursor += 1
            if cursor == len(prepared) or cursor - last_notice >= 8:
                notify("typing", f"Живая печать: {cursor} из {len(prepared)}")
                last_notice = cursor
    except (TypingStopped, TypingInputError):
        raise
    except Exception as error:
        code = getattr(error, "desktop_guard_code", None)
        suffix = f" [{code}]" if isinstance(code, str) and code.startswith("INPUT_") else " [LIVE_DRIVER]"
        raise TypingInputError(
            f"Живая печать остановлена на символе {cursor} из {len(prepared)}{suffix}.") from None
    finally:
        if driver is not None:
            driver.close()


def calibrate_keyboard(stopped, timeout_seconds: float = 12.0) -> str:
    """Capture one F7 press, forward every other event, and return its HWID."""
    from interception.constants import FilterKeyFlag
    from interception.interception import Interception

    context = Interception()
    if not context.valid:
        context.destroy()
        raise TypingInputError(
            "Interception driver недоступен. Установите драйвер и перезагрузите Windows "
            "[LIVE_DRIVER].")
    selected = None
    deadline = time.monotonic() + timeout_seconds
    try:
        context.set_filter(context.is_keyboard, int(FilterKeyFlag.FILTER_KEY_ALL))
        while time.monotonic() < deadline:
            if stopped.is_set():
                raise TypingStopped()
            device = context.await_input(50)
            if device is None:
                continue
            stroke = context.devices[device].receive()
            if stroke is None:
                continue
            code, flags = int(stroke.code), int(stroke.flags)
            is_up = bool(flags & KEY_UP)
            is_extended = bool(flags & (KEY_E0 | KEY_E1))
            if code == F9_SCAN and not is_extended:
                context.send(device, stroke)
                stopped.set()
                raise TypingStopped()
            if code == F7_SCAN and not is_extended:
                if not is_up and selected is None:
                    selected = device
                    continue
                if is_up and selected == device:
                    value = (context.devices[device].get_HWID() or "").rstrip("\x00")
                    if not value:
                        raise TypingInputError(
                            "Драйвер не вернул идентификатор клавиатуры [LIVE_DEVICE].")
                    return value
            context.send(device, stroke)
        raise TypingInputError(
            "Калибровка не завершена: нажмите F7 после запуска проверки "
            "[LIVE_CALIBRATION_TIMEOUT].")
    finally:
        try:
            context.set_filter(context.is_keyboard, int(FilterKeyFlag.FILTER_KEY_NONE))
        finally:
            context.destroy()

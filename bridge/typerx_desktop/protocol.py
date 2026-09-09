"""Strict, versioned local protocol. No HTTP listener, eval, shell or arbitrary paths."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Callable

MAX_REQUEST = 65_536
MAX_RESPONSE = 4_000_000
PROTOCOL = 1
ALLOWED = frozenset({'snapshot', 'save', 'code', 'login', 'logout', 'chats',
                     'select', 'focus', 'test', 'prepare', 'stop', 'profile', 'hello', 'shutdown'})


class ProtocolError(ValueError):
    pass


class MinuteCounters:
    """Rolling 60-minute incoming/completed counters for snapshot telemetry."""

    WINDOW = 60

    def __init__(self, clock: Callable[[], float] = time.time):
        self._clock = clock
        self._counts: dict[int, dict[str, int]] = {}

    def _minute(self) -> int:
        return int(self._clock() // 60)

    def add(self, name: str) -> None:
        minute = self._minute()
        bucket = self._counts.setdefault(minute, {'incoming': 0, 'completed': 0})
        if name in bucket:
            bucket[name] += 1

    def snapshot(self) -> list[dict[str, int]]:
        now = self._minute()
        start = now - (self.WINDOW - 1)
        for key in [key for key in self._counts if key < start]:
            del self._counts[key]
        rows = []
        empty = {'incoming': 0, 'completed': 0}
        for minute in range(start, now + 1):
            bucket = self._counts.get(minute, empty)
            rows.append({
                'minute': minute,
                'incoming': bucket['incoming'],
                'completed': bucket['completed'],
            })
        return rows


def text(value: Any, limit: int) -> bool:
    return isinstance(value, str) and len(value) <= limit


def reject_constant(_: str):
    raise ProtocolError('Non-finite number')


def parse_request(line: bytes) -> dict:
    if len(line) > MAX_REQUEST:
        raise ProtocolError('Request too large')
    try:
        value = json.loads(line.decode('utf-8'), parse_constant=reject_constant)
    except (UnicodeError, ValueError, RecursionError) as exc:
        raise ProtocolError('Invalid JSON') from exc
    if not isinstance(value, dict) or set(value) != {'id', 'operation', 'data'}:
        raise ProtocolError('Invalid envelope')
    if not text(value['id'], 80) or not value['id']:
        raise ProtocolError('Invalid ID')
    if not isinstance(value['operation'], str) or value['operation'] not in ALLOWED or not isinstance(value['data'], dict):
        raise ProtocolError('Unsupported operation')
    op, data = value['operation'], value['data']
    if op in {'snapshot', 'code', 'logout', 'chats', 'test', 'stop', 'profile', 'shutdown'}:
        if data:
            raise ProtocolError('Unexpected parameters')
    elif op == 'hello':
        if set(data) != {'protocol', 'window'} or data['protocol'] != PROTOCOL or type(data['window']) is not int or data['window'] <= 0:
            raise ProtocolError('Invalid handshake')
    elif op == 'login':
        if not set(data) <= {'code', 'password'} or not text(data.get('code', ''), 12) or not text(data.get('password', ''), 256):
            raise ProtocolError('Invalid credentials shape')
    elif op == 'select':
        if set(data) != {'id'} or type(data['id']) is not int or abs(data['id']) > 2**53-1:
            raise ProtocolError('Invalid peer')
    elif op == 'focus':
        if set(data) != {'sender_id'} or type(data['sender_id']) is not int or abs(data['sender_id']) > 2**53-1:
            raise ProtocolError('Invalid focus sender')
    elif op == 'prepare':
        if not set(data) <= {'mode', 'text', 'consent', 'ack_send', 'bind_chat'} or data.get('mode') not in {'manual', 'ai'}:
            raise ProtocolError('Invalid preparation')
        if type(data.get('bind_chat', True)) is not bool:
            raise ProtocolError('Invalid chat binding option')
        if data.get('ack_send') is not True:
            raise ProtocolError('Enter acknowledgement required')
        if not text(data.get('text', ''), 8000):
            raise ProtocolError('Invalid text')
        if data['mode'] == 'ai' and data.get('consent') is not True:
            raise ProtocolError('Provider consent required')
    elif op == 'save':
        validate_config(data)
    return value


def validate_config(data: dict) -> None:
    from jsonschema import Draft7Validator
    config = {k: v for k, v in data.items() if k not in {'api_hash', 'api_key'}}
    schema = json.loads((Path(__file__).resolve().parent.parent / 'config.schema.json').read_text('utf-8'))
    if not Draft7Validator(schema).is_valid(config):
        raise ProtocolError('Invalid settings')
    if not text(data.get('api_key', ''), 2048) or not text(data.get('api_hash', ''), 128):
        raise ProtocolError('Invalid secret length')

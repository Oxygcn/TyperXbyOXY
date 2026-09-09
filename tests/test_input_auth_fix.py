"""Regression tests use fakes: no keyboard injection, network, credentials or session files."""
import asyncio
import importlib
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bridge'))
from typerx_desktop.typing_output import (run_output, split_messages, normalize_text,
                                         TypingStopped, TypingInputError)
from typerx_desktop.auth import AuthController, AuthFlowError, normalized_phone, validate_identity, safe_diagnostic
from typerx_desktop.guard import canonical_title

TEXT = 'Привет Привет Привет как дела?'


class Clock:
    def __init__(self): self.now = 0.0
    def __call__(self): return self.now


class Stop:
    def __init__(self, clock): self.clock, self.value, self.trigger = clock, False, None
    def is_set(self): return self.value
    def set(self): self.value = True
    def wait(self, delay):
        self.clock.now += max(delay, 1e-9)
        if self.trigger: self.trigger()
        return self.value


class FocusChangedError(Exception): pass


class Guard:
    hwnd = 42
    def __init__(self): self.lost = False
    def check(self):
        if self.lost: raise FocusChangedError('sensitive window title')


class Keyboard:
    def __init__(self):
        self.events, self.output, self.held = [], '', None
        self.closed, self.on_press, self.unsupported = False, None, None
    def assert_ready(self): pass
    def validate_char(self, char):
        if char == self.unsupported: raise ValueError('sensitive character')
    def press(self, char):
        if self.held is not None: raise AssertionError('Overlapping key or Shift!')
        self.held = char
        self.events.append(('down', char))
        self.output += char
        if self.on_press: self.on_press(char)
        return char
    def press_enter(self): return self.press('\n')
    def release(self, key):
        self.events.append(('up', key))
        self.held = None
    def close(self):
        if self.held is not None: self.release(self.held)
        self.closed = True


class OutputTests(unittest.TestCase):
    def setUp(self):
        self.clock, self.guard, self.keyboard = Clock(), Guard(), Keyboard()
        self.stop = Stop(self.clock)
        self.notifications = []
    def run_text(self, text=TEXT, words=3, wpm=300):
        return run_output(text, {'words':words,'wpm':wpm}, self.guard, self.stop,
                          lambda *x:self.notifications.append(x), lambda _:self.keyboard, clock=self.clock)
    def test_exact_three_words(self):
        self.assertEqual(split_messages(TEXT, 3), ('Привет Привет Привет', 'как дела?'))
    def test_no_greeting_or_question_special_cases(self):
        self.assertEqual(split_messages('Привет как дела?', 3), ('Привет как дела?',))
    def test_remainder(self):
        self.assertEqual(split_messages('один два три четыре пять',2), ('один два','три четыре','пять'))
    def test_controls_never_become_keyboard_shortcuts(self):
        self.assertEqual(normalize_text('a\tb\nc\x00d'), 'a b c d')
    def test_quote_normalization(self):
        self.assertEqual(normalize_text('“Тест”—…'), '"Тест"-...')
    def test_speed_bounds(self):
        for speed in [0,301,True,'300']:
            with self.assertRaises(TypingInputError): self.run_text(wpm=speed)
    def test_word_bounds(self):
        for words in [0,17,True,'3']:
            with self.assertRaises(TypingInputError): split_messages(TEXT,words)
    def test_full_exact_output_at_300(self):
        self.run_text()
        self.assertEqual(self.keyboard.output,'Привет Привет Привет\nкак дела?\n')
        self.assertTrue(self.keyboard.closed)
        self.assertIsNone(self.keyboard.held)
    def test_release_before_next_character_or_enter(self):
        self.run_text()
        for i in range(0,len(self.keyboard.events),2):
            down, up = self.keyboard.events[i:i+2]
            self.assertEqual(down[0],'down');self.assertEqual(up,('up',down[1]))
    def test_whole_text_preflight_before_first_key(self):
        self.keyboard.unsupported='?'
        with self.assertRaises(TypingInputError):self.run_text()
        self.assertEqual(self.keyboard.events,[])
        self.assertTrue(self.keyboard.closed)
    def test_stop_before_start_emits_nothing(self):
        self.stop.set()
        with self.assertRaises(TypingStopped):self.run_text()
        self.assertEqual(self.keyboard.events,[])
    def test_f9_while_shift_key_is_held_releases_key(self):
        self.keyboard.on_press=lambda _:self.stop.set()
        with self.assertRaises(TypingStopped):self.run_text()
        self.assertEqual(self.keyboard.events,[('down','П'),('up','П')])
        self.assertNotIn('\n',self.keyboard.output)
    def test_focus_loss_releases_key_and_does_not_send(self):
        self.keyboard.on_press=lambda _:setattr(self.guard,'lost',True)
        with self.assertRaisesRegex(TypingInputError,'INPUT_KEYBOARD_WINDOW'):self.run_text()
        self.assertIsNone(self.keyboard.held)
        self.assertTrue(self.keyboard.closed)
        self.assertNotIn('\n',self.keyboard.output)
    def test_stop_between_groups_no_second_group(self):
        self.keyboard.on_press=lambda char:self.stop.set() if char=='\n' else None
        with self.assertRaises(TypingStopped):self.run_text()
        self.assertEqual(self.keyboard.output,'Привет Привет Привет\n')
        self.assertEqual(self.keyboard.events[-1],('up','\n'))
    def test_error_does_not_echo_window_title(self):
        self.guard.lost=True
        with self.assertRaises(TypingInputError) as cm:self.run_text()
        self.assertNotIn('sensitive window title',str(cm.exception))
    def test_empty_text(self):
        with self.assertRaises(TypingInputError):self.run_text(' \n\t ')
        self.assertEqual(self.keyboard.events,[])
    def test_status_has_no_text(self):
        self.run_text()
        self.assertEqual(len(self.notifications),2)
        self.assertNotIn('Привет',str(self.notifications))


class SessionPasswordNeededError(Exception): pass
class PhoneCodeExpiredError(Exception): pass


class Client:
    def __init__(self):
        self.authorized=False;self.two_factor=False;self.sign_calls=[];self.code_calls=[]
        self.failure=None;self.confirm=True;self.logout_ok=True
    async def is_user_authorized(self):return self.authorized
    async def send_code_request(self, phone):
        self.code_calls.append(phone)
        return types.SimpleNamespace(phone_code_hash='test-hash-not-a-secret')
    async def sign_in(self, **kwargs):
        self.sign_calls.append(kwargs)
        if self.failure:raise self.failure
        if self.two_factor and 'password' not in kwargs:raise SessionPasswordNeededError()
        if self.confirm:self.authorized=True
        return object()
    async def log_out(self):
        if self.logout_ok:self.authorized=False
        return self.logout_ok


class Gateway:
    def __init__(self):
        self.client=Client();self.phone='';self.code_hash=None;self.close_calls=[];self.connect_error=None
    async def connect(self):
        if self.connect_error:raise self.connect_error
        return self.client.authorized
    async def close(self, logout=False):self.close_calls.append(logout)


class AuthTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.gateway=Gateway()
        self.store=types.SimpleNamespace(config={'api_id':'12345','phone':'+7 (900) 123-45-67'},secrets={'api_hash':'a'*32})
        self.auth=AuthController(self.gateway,self.store)
    async def test_normal_code_login(self):
        self.assertEqual(await self.auth.request_code(),{'code_sent':True})
        self.assertEqual(self.gateway.client.code_calls,['+79001234567'])
        self.assertEqual(await self.auth.login('12 345'),{'authorized':True})
        self.assertEqual(self.gateway.client.sign_calls[-1]['code'],'12345')
        self.assertIsNone(self.gateway.code_hash)
    async def test_two_factor_preserves_hash_and_password_spaces(self):
        self.gateway.client.two_factor=True
        await self.auth.request_code()
        self.assertEqual(await self.auth.login('12345'),{'password_needed':True})
        self.assertEqual(self.auth.phase,'password')
        self.assertIsNotNone(self.gateway.code_hash)
        self.assertEqual(await self.auth.login(password=' padded password '),{'authorized':True})
        self.assertEqual(self.gateway.client.sign_calls[-1],{'password':' padded password '})
    async def test_no_code_request_means_no_signin(self):
        with self.assertRaisesRegex(AuthFlowError,'TG_CODE_REQUIRED'):await self.auth.login('12345')
        self.assertEqual(self.gateway.client.sign_calls,[])
    async def test_whitespace_code_does_not_resend(self):
        await self.auth.request_code()
        with self.assertRaisesRegex(AuthFlowError,'TG_CODE_FORMAT'):await self.auth.login('   ')
        self.assertEqual(len(self.gateway.client.code_calls),1)
        self.assertEqual(self.gateway.client.sign_calls,[])
    async def test_password_rejected_before_code_challenge(self):
        await self.auth.request_code()
        with self.assertRaisesRegex(AuthFlowError,'TG_ORDER'):await self.auth.login(password='test')
        self.assertEqual(self.gateway.client.sign_calls,[])
    async def test_existing_session_no_new_code(self):
        self.gateway.client.authorized=True
        self.assertEqual(await self.auth.request_code(),{'authorized':True})
        self.assertEqual(self.gateway.client.code_calls,[])
    async def test_positive_api_id_required(self):
        self.store.config['api_id']='0'
        with self.assertRaisesRegex(AuthFlowError,'TG_API_ID'):await self.auth.request_code()
    async def test_saved_hash_checked_without_echoing(self):
        self.store.secrets['api_hash']='PRIVATE_VALUE'
        with self.assertRaises(AuthFlowError) as cm:await self.auth.request_code()
        self.assertNotIn('PRIVATE_VALUE',str(cm.exception))
    async def test_phone_format_explained(self):
        self.store.config['phone']='TelegramName'
        with self.assertRaisesRegex(AuthFlowError,'TG_PHONE'):await self.auth.request_code()
        self.assertEqual(self.gateway.client.code_calls,[])
    async def test_valueerror_has_action_but_no_secret(self):
        await self.auth.request_code()
        self.gateway.client.failure=ValueError('api_hash=PRIVATE_VALUE password=DO_NOT_LOG')
        with self.assertRaises(AuthFlowError) as cm:await self.auth.login('12345')
        msg=str(cm.exception)
        self.assertIn('TG:login:ValueError',msg)
        self.assertNotIn('PRIVATE_VALUE',msg);self.assertNotIn('DO_NOT_LOG',msg)
    async def test_sentcode_is_not_authorization(self):
        self.gateway.client.confirm=False
        await self.auth.request_code()
        with self.assertRaisesRegex(AuthFlowError,'TG_NOT_AUTHORIZED'):await self.auth.login('12345')
    async def test_expired_code_resets_pending_request(self):
        await self.auth.request_code()
        self.gateway.client.failure=PhoneCodeExpiredError('do not echo')
        with self.assertRaises(AuthFlowError):await self.auth.login('12345')
        self.assertEqual(self.auth.phase,'idle');self.assertIsNone(self.gateway.code_hash)
    async def test_failed_connect_disconnects_without_logout(self):
        self.gateway.connect_error=ValueError('private session data')
        with self.assertRaisesRegex(AuthFlowError,'TG:connect:ValueError'):await self.auth.request_code()
        self.assertEqual(self.gateway.close_calls,[False])
        self.assertEqual(self.store.secrets,{'api_hash':'a'*32})
    async def test_logout_failure_not_claimed_success(self):
        self.gateway.client.authorized=True;self.gateway.client.logout_ok=False
        with self.assertRaisesRegex(AuthFlowError,'TG_LOGOUT_FAILED'):await self.auth.logout()
        self.assertEqual(self.gateway.close_calls,[])


class GuardTitleTests(unittest.TestCase):
    def test_notepad_dirty_marker_only(self):
        self.assertEqual(canonical_title('*note.txt - Notepad','notepad.exe'),'note.txt - Notepad')
        self.assertNotEqual(canonical_title('*other.txt - Notepad','notepad.exe'),'note.txt - Notepad')
    def test_telegram_unread_counter_only(self):
        self.assertEqual(canonical_title('(12) Test — Telegram','telegram.exe'),'Test — Telegram')
        self.assertNotEqual(canonical_title('(12) Other — Telegram','telegram.exe'),'Test — Telegram')
    def test_other_apps_titles_remain_strict(self):
        self.assertEqual(canonical_title('*Changed','other.exe'),'*Changed')


class KeyboardCleanupTests(unittest.TestCase):
    def test_partial_keypress_cleanup_and_idempotence(self):
        class Base:
            def __init__(self, hwnd):self.events=[];self._context=True;self._held_modifiers={};self.destroyed=0
            def _send(self,scan,flags,key_up=False):
                self.events.append((scan,key_up))
                if scan==30 and not key_up:raise OSError('partial send')
            def close(self):self.destroyed+=1
        fake=types.ModuleType('typerx.platform.interception_keyboard');fake.InterceptionKeyboard=Base
        with patch.dict(sys.modules,{'typerx':types.ModuleType('typerx'),'typerx.platform':types.ModuleType('typerx.platform'),'typerx.platform.interception_keyboard':fake}):
            sys.modules.pop('typerx_desktop.keyboard',None)
            module=importlib.import_module('typerx_desktop.keyboard')
            keyboard=module.DesktopKeyboard(42)
            keyboard._send(42,0)
            with self.assertRaises(OSError):keyboard._send(30,0)
            keyboard.close();keyboard.close()
            self.assertIn((42,True),keyboard.events);self.assertIn((30,True),keyboard.events)
            self.assertEqual(keyboard.destroyed,1)
            self.assertEqual(keyboard._down,set())
        sys.modules.pop('typerx_desktop.keyboard',None)


class GuardBehaviorTests(unittest.TestCase):
    def setUp(self):
        import typerx_desktop.guard as guard_module
        self.module=guard_module
        self.state={'hwnd':42,'pid':7,'title':'note.txt - Notepad','focus':(1,2),'value':''}
        state=self.state
        class AIError(Exception):pass
        self.error=AIError
        class BaseGuard:
            def __init__(self, peer_name=None):
                self.peer_name=peer_name;self.hwnd=42;self.title=state['title'];self.focus_id=state['focus'];self.check()
            def check(self):
                if state['hwnd']!=self.hwnd or state['title']!=self.title:raise AIError('changed')
            def check_field(self,empty=False):
                self.check()
                if state['focus']!=self.focus_id:raise AIError('field changed')
                if empty and state['value']:raise AIError('draft')
        ai=types.ModuleType('typerx.ai');ai.AIError=AIError
        runtime=types.ModuleType('typerx.ai_runtime');runtime.TargetGuard=BaseGuard
        runtime.focused_editor=lambda:(state['focus'],state['value'])
        gui=types.ModuleType('win32gui');gui.GetForegroundWindow=lambda:state['hwnd'];gui.GetWindowText=lambda _:state['title']
        process=types.ModuleType('win32process');process.GetWindowThreadProcessId=lambda _:(1,state['pid'])
        self.mods=patch.dict(sys.modules,{'typerx':types.ModuleType('typerx'),'typerx.ai':ai,'typerx.ai_runtime':runtime,'win32gui':gui,'win32process':process})
        self.mods.start();self.addCleanup(self.mods.stop)
    def capture(self,host='notepad.exe',peer=None):
        with patch.object(self.module,'process_identity',return_value=(7,host)):
            return self.module.capture_guard(peer)
    def test_same_document_dirty_marker_is_allowed(self):
        guard=self.capture();self.state['title']='*note.txt - Notepad';guard.check();guard.check_field()
    def test_document_change_stops(self):
        guard=self.capture();self.state['title']='other.txt - Notepad'
        with self.assertRaises(self.error):guard.check()
    def test_process_or_window_change_stops(self):
        guard=self.capture();self.state['pid']=8
        with self.assertRaises(self.error):guard.check()
        self.state['pid']=7;self.state['hwnd']=43
        with self.assertRaises(self.error):guard.check()
    def test_field_change_stops(self):
        guard=self.capture();self.state['focus']=(9,9)
        with self.assertRaises(self.error):guard.check_field()
    def test_existing_draft_stops(self):
        guard=self.capture();self.state['value']='private draft'
        with self.assertRaises(self.error):guard.check_field(empty=True)
    def test_generic_telegram_window_rejected(self):
        self.state['title']='(2) Telegram'
        with self.assertRaises(self.error):self.capture('telegram.exe')


    def test_title_failure_has_specific_code(self):
        guard=self.capture();self.state['title']='another document'
        with self.assertRaises(self.error) as cm:guard.check()
        self.assertEqual(cm.exception.desktop_guard_code,'INPUT_TITLE')
        self.assertNotIn('another document',str(cm.exception))
    def test_field_failure_is_not_window_switch(self):
        guard=self.capture()
        self.state['focus']=(99,)
        with self.assertRaises(self.error) as cm:guard.check_field()
        self.assertEqual(cm.exception.desktop_guard_code,'INPUT_FIELD')
    def test_writer_preserves_guard_code(self):
        guard=self.capture();self.state['title']='private title'
        clock=Clock();stop=Stop(clock);keyboard=Keyboard()
        with self.assertRaises(TypingInputError) as cm:
            run_output(TEXT,{'wpm':300,'words':3},guard,stop,lambda *x:None,lambda _:keyboard,clock=clock)
        self.assertIn('[INPUT_TITLE]',str(cm.exception))
        self.assertNotIn('[INPUT_FOCUS]',str(cm.exception))
        self.assertNotIn('private title',str(cm.exception))
        self.assertEqual(keyboard.events,[])

if __name__=='__main__':unittest.main()

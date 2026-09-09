import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'bridge'))
from typerx_desktop.protocol import parse_request, ProtocolError
import typerx_desktop.guard as guards

class BindingProtocolTests(unittest.TestCase):
    def parse(self, **kwargs):
        data={'mode':'manual','text':'Hello','ack_send':True,**kwargs}
        return parse_request(json.dumps({'id':'1','operation':'prepare','data':data}).encode())
    def test_true_and_false(self):
        for flag in (True,False):self.assertIs(self.parse(bind_chat=flag)['data']['bind_chat'],flag)
    def test_omission_remains_compatible(self):self.parse()
    def test_only_boolean(self):
        for flag in (0,1,None,'false',[],{}):
            with self.assertRaises(ProtocolError):self.parse(bind_chat=flag)
    def test_enter_ack_still_required(self):
        with self.assertRaises(ProtocolError):self.parse(bind_chat=False,ack_send=False)
    def test_ai_consent_still_required(self):
        with self.assertRaises(ProtocolError):self.parse(mode='ai',bind_chat=False)
        self.parse(mode='ai',bind_chat=False,consent=True)

class WindowOnlyTests(unittest.TestCase):
    def setUp(self):
        self.state={'hwnd':42,'pid':7,'field':(1,2),'value':'','uia':True}
        state=self.state
        class AIError(Exception):pass
        self.error=AIError
        ai=types.ModuleType('typerx.ai');ai.AIError=AIError
        runtime=types.ModuleType('typerx.ai_runtime')
        def editor():
            if not state['uia']:raise RuntimeError('UIA unavailable')
            return state['field'],state['value']
        runtime.focused_editor=editor
        gui=types.ModuleType('win32gui');gui.GetForegroundWindow=lambda:state['hwnd']
        def title(_):raise AssertionError('Unbound mode must never inspect a title')
        gui.GetWindowText=title
        process=types.ModuleType('win32process');process.GetWindowThreadProcessId=lambda _:(1,state['pid'])
        p=patch.dict(sys.modules,{'typerx':types.ModuleType('typerx'),'typerx.ai':ai,'typerx.ai_runtime':runtime,'win32gui':gui,'win32process':process})
        p.start();self.addCleanup(p.stop)
    def test_ai_binding_opt_out_skips_old_constructor_and_title(self):
        # No TargetGuard exists in the stub. Calling it would fail this test.
        g=guards.capture_guard('Selected AI source',False);g.check();g.check_field(empty=True)
    def test_manual_binding_opt_out(self):guards.capture_guard(None,False).check()
    def test_window_switch_still_stops(self):
        g=guards.capture_guard(None,False);self.state['hwnd']=99
        with self.assertRaises(self.error) as cm:g.check()
        self.assertEqual(cm.exception.desktop_guard_code,'INPUT_WINDOW')
    def test_process_change_still_stops(self):
        g=guards.capture_guard(None,False);self.state['pid']=99
        with self.assertRaises(self.error):g.check()
    def test_field_change_still_stops(self):
        g=guards.capture_guard(None,False);self.state['field']=(2,3)
        with self.assertRaises(self.error):g.check_field()
    def test_uia_disappearance_after_capture_stops(self):
        g=guards.capture_guard(None,False);self.state['uia']=False
        with self.assertRaises(self.error):g.check_field()
    def test_no_uia_at_capture_retains_window_check(self):
        self.state['uia']=False;g=guards.capture_guard(None,False);g.check_field()
        self.state['hwnd']=99
        with self.assertRaises(self.error):g.check_field()
    def test_nonempty_field_still_stops_start(self):
        g=guards.capture_guard(None,False);self.state['value']='draft'
        with self.assertRaises(self.error):g.check_field(empty=True)
    def test_default_and_true_use_bound_guard(self):
        with patch.object(guards,'_capture_bound_guard',return_value='bound') as fn:
            self.assertEqual(guards.capture_guard('peer'),'bound')
            self.assertEqual(guards.capture_guard('peer',True),'bound')
            self.assertEqual(fn.call_count,2)

if __name__=='__main__':unittest.main()

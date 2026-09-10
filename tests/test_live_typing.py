import json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'bridge'))
from typerx_desktop.live_typing import CapturedStroke,LiveSettings,run_live_output
from typerx_desktop.typing_output import TypingInputError,TypingStopped
class Stop:
 def __init__(self):self.value=False
 def is_set(self):return self.value
 def set(self):self.value=True
class Guard:
 hwnd=42
 def __init__(self):self.lost=False
 def check(self):
  if self.lost:
   error=RuntimeError('private title');error.desktop_guard_code='INPUT_TITLE';raise error
class Settings:enabled=True;device_hwid='keyboard-a'
def event(code,up=False,flags=0):return CapturedStroke(code,flags|(1 if up else 0),object(),2)
class Driver:
 def __init__(self,events):self.events=list(events);self.forwarded=[];self.output='';self.closed=False;self.on_emit=None
 def assert_ready(self):pass
 def validate_char(self,char):pass
 def activate(self):pass
 def receive(self,timeout):
  if self.events:return self.events.pop(0)
  raise AssertionError('test ran out of events')
 def forward(self,e):self.forwarded.append((e.code,e.key_up))
 def emit(self,char):
  self.output+=char
  if self.on_emit:self.on_emit(char)
 def close(self):self.closed=True
class LiveTypingTests(unittest.TestCase):
 def run_session(self,text,events):
  driver=Driver(events);run_live_output(text,Settings(),Guard(),Stop(),lambda *x:None,lambda *_:driver);return driver
 def test_one_keydown_advances_one_character(self):
  d=self.run_session('abc',[event(0x1E),event(0x30),event(0x1E,True),event(0x2E),event(0x30,True),event(0x2E,True)]);self.assertEqual(d.output,'abc');self.assertEqual(d.forwarded,[])
 def test_hardware_repeat_is_suppressed(self):
  d=self.run_session('ab',[event(0x1E),event(0x1E),event(0x1E,True),event(0x30),event(0x30,True)]);self.assertEqual(d.output,'ab')
 def test_enter_and_backspace_pass_through(self):
  d=self.run_session('a',[event(0x1C),event(0x1C,True),event(0x0E),event(0x0E,True),event(0x1E),event(0x1E,True)]);self.assertEqual(d.output,'a');self.assertEqual(d.forwarded,[(0x1C,False),(0x1C,True),(0x0E,False),(0x0E,True)])
 def test_modified_shortcut_passes_through(self):
  d=self.run_session('a',[event(0x1D),event(0x2E),event(0x2E,True),event(0x1D,True),event(0x1E),event(0x1E,True)]);self.assertEqual(d.output,'a');self.assertEqual([x[0] for x in d.forwarded],[0x1D,0x2E,0x2E,0x1D])
 def test_f9_stops_and_is_forwarded(self):
  d=Driver([event(0x43)]);stop=Stop()
  with self.assertRaises(TypingStopped):run_live_output('a',Settings(),Guard(),stop,lambda *_:None,lambda *_:d)
  self.assertTrue(stop.is_set());self.assertEqual(d.forwarded,[(0x43,False)])
 def test_caps_lock_fails_closed(self):
  d=Driver([event(0x3A)])
  with self.assertRaisesRegex(TypingInputError,'LIVE_CAPS_LOCK'):run_live_output('a',Settings(),Guard(),Stop(),lambda *_:None,lambda *_:d)
 def test_disabled_and_uncalibrated(self):
  s=Settings();s.enabled=False
  with self.assertRaisesRegex(TypingInputError,'LIVE_DISABLED'):run_live_output('a',s,Guard(),Stop(),lambda *_:None,lambda *_:None)
  s.enabled=True;s.device_hwid=''
  with self.assertRaisesRegex(TypingInputError,'LIVE_CALIBRATION'):run_live_output('a',s,Guard(),Stop(),lambda *_:None,lambda *_:None)
 def test_guard_message_hides_title(self):
  g=Guard();d=Driver([event(0x1E),event(0x1E,True)]);d.on_emit=lambda _:setattr(g,'lost',True)
  with self.assertRaises(TypingInputError) as cm:run_live_output('a',Settings(),g,Stop(),lambda *_:None,lambda *_:d)
  self.assertIn('INPUT_TITLE',str(cm.exception));self.assertNotIn('private title',str(cm.exception))
class LiveSettingsTests(unittest.TestCase):
 def test_persists_without_exposing_hwid(self):
  with tempfile.TemporaryDirectory() as t:
   s=LiveSettings(Path(t));s.set_device('HID\\VID_1234');s.set_enabled(True);self.assertNotIn('VID_1234',json.dumps(s.public()));self.assertTrue(LiveSettings(Path(t)).enabled)
 def test_enable_requires_calibration(self):
  with tempfile.TemporaryDirectory() as t:
   with self.assertRaisesRegex(TypingInputError,'LIVE_CALIBRATION'):LiveSettings(Path(t)).set_enabled(True)
if __name__=='__main__':unittest.main()

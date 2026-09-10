import json,subprocess,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'bridge'))
from typerx_desktop.protocol import MAX_REQUEST,PROTOCOL,MinuteCounters,ProtocolError,parse_request
def req(op,data=None):return json.dumps({'id':'1','operation':op,'data':data or {}}).encode()
class ProtocolTests(unittest.TestCase):
 def test_stop(self):self.assertEqual(parse_request(req('stop'))['operation'],'stop')
 def test_calibrate(self):self.assertEqual(parse_request(req('calibrate'))['operation'],'calibrate')
 def test_no_start_or_exec(self):
  for op in ['start','exec','shell','open','send','__import__']:
   with self.assertRaises(ProtocolError):parse_request(req(op))
 def test_manual_ack(self):
  with self.assertRaises(ProtocolError):parse_request(req('prepare',{'mode':'manual','text':'Hello'}))
 def test_live_without_enter_ack(self):self.assertTrue(parse_request(req('prepare',{'mode':'live','text':'Hello'})))
 def test_ai_consent(self):
  with self.assertRaises(ProtocolError):parse_request(req('prepare',{'mode':'ai','ack_send':True}))
 def test_frames(self):
  for v in [b'null',b'[]',b'{',b'\xff',b'x'*(MAX_REQUEST+1)]:
   with self.assertRaises(ProtocolError):parse_request(v)
 def test_handshake(self):
  self.assertTrue(parse_request(req('hello',{'protocol':PROTOCOL,'window':123})))
  with self.assertRaises(ProtocolError):parse_request(req('hello',{'protocol':PROTOCOL-1,'window':123}))
 def test_counters(self):
  c=[7200];m=MinuteCounters(lambda:c[0]);m.add('completed');self.assertEqual(m.snapshot()[-1]['completed'],1)
 @unittest.skipIf(sys.platform=='win32','non-Windows refusal only')
 def test_nonwindows(self):
  root=Path(__file__).resolve().parents[1];r=subprocess.run([sys.executable,str(root/'bridge/entry.py')],capture_output=True,timeout=5);self.assertEqual(r.returncode,1);self.assertEqual(json.loads(r.stdout)['event'],'fatal')
if __name__=='__main__':unittest.main()

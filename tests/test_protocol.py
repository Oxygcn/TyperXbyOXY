import json, subprocess, sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'bridge'))
from typerx_desktop.protocol import MAX_REQUEST, MinuteCounters, ProtocolError, parse_request

def req(op,data=None):return json.dumps({'id':'1','operation':op,'data':data or {}}).encode()
class ProtocolTests(unittest.TestCase):
 def test_stop(self):
  self.assertEqual(parse_request(req('stop'))['operation'],'stop')
  with self.assertRaises(ProtocolError):parse_request(req('stop',{'command':'x'}))
 def test_no_start_or_exec(self):
  for op in ['start','exec','shell','open','send','__import__']:
   with self.assertRaises(ProtocolError):parse_request(req(op))
 def test_manual_ack(self):
  with self.assertRaises(ProtocolError):parse_request(req('prepare',{'mode':'manual','text':'Hello'}))
  self.assertTrue(parse_request(req('prepare',{'mode':'manual','text':'Hello','ack_send':True})))
 def test_ai_consent(self):
  with self.assertRaises(ProtocolError):parse_request(req('prepare',{'mode':'ai','ack_send':True}))
  self.assertTrue(parse_request(req('prepare',{'mode':'ai','ack_send':True,'consent':True})))
 def test_ids(self):
  for value in [True,'12',{},2**54]:
   with self.assertRaises(ProtocolError):parse_request(req('select',{'id':value}))
  with self.assertRaises(ProtocolError):parse_request(req([]))
 def test_focus(self):
  self.assertEqual(parse_request(req('focus',{'sender_id':42}))['data']['sender_id'],42)
  with self.assertRaises(ProtocolError):parse_request(req('focus'))
  with self.assertRaises(ProtocolError):parse_request(req('focus',{'sender_id':'42'}))
 def test_credentials(self):
  with self.assertRaises(ProtocolError):parse_request(req('login',{'password':'x'*257}))
 def test_frames(self):
  for value in [b'null',b'[]',b'{',b'\xff',b'x'*(MAX_REQUEST+1)]:
   with self.assertRaises(ProtocolError):parse_request(value)
 def test_handshake(self):
  self.assertTrue(parse_request(req('hello',{'protocol':1,'window':123})))
  with self.assertRaises(ProtocolError):parse_request(req('hello',{'protocol':2,'window':123}))
 def test_secret_not_echoed(self):
  secret='PRIVATE_VALUE'
  try:parse_request(req('login',{'secret':secret}))
  except ProtocolError as e:self.assertNotIn(secret,str(e))
  else:self.fail('Expected rejection')
 def test_nonfinite(self):
  with self.assertRaises(ProtocolError):parse_request(b'{"id":"1","operation":"select","data":{"id":NaN}}')
 def test_counters(self):
  clock=[120*60];m=MinuteCounters(lambda:clock[0]);self.assertEqual(len(m.snapshot()),60)
  self.assertEqual(sum(r['completed'] for r in m.snapshot()),0)
  m.add('completed');self.assertEqual(m.snapshot()[-1]['completed'],1)
  clock[0]+=61*60;self.assertEqual(sum(r['completed'] for r in m.snapshot()),0)
 @unittest.skipIf(sys.platform=='win32','non-Windows refusal only')
 def test_nonwindows(self):
  root=Path(__file__).resolve().parents[1]
  result=subprocess.run([sys.executable,str(root/'bridge/entry.py')],capture_output=True,timeout=5)
  self.assertEqual(result.returncode,1);self.assertEqual(json.loads(result.stdout)['event'],'fatal')
  self.assertNotIn(b'Traceback',result.stdout)
if __name__=='__main__':unittest.main()

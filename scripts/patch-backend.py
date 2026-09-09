import json, subprocess, sys
from pathlib import Path
root=Path(__file__).resolve().parent.parent
lock=json.loads((root/'backend.lock.json').read_text())
backend=root/'backend'
sha=subprocess.check_output(['git','-C',str(backend),'rev-parse','HEAD'],text=True).strip()
if sha!=lock['commit']: raise SystemExit('Backend revision mismatch. Review adapter before upgrading.')
path=backend/'src/typerx/ai_runtime.py'
text=path.read_text('utf-8')
old = '{“: \'"\', ”: \'"\', ‘: "\'", ’: "\'",'
new = '{"“": \'"\', "”": \'"\', "‘": "\'", "’": "\'",'
if new in text:
    print('Quote normalization patch already applied.')
else:
    blob=subprocess.check_output(['git','hash-object',str(path)],text=True).strip()
    if blob!=lock['runtimeBlob'] or text.count(old)!=1:
        raise SystemExit('Runtime differs from inspected source. Refusing to patch.')
    path.write_text(text.replace(old,new),encoding='utf-8')
    print('Patched four unquoted Unicode dictionary keys.')
subprocess.run([sys.executable,'-m','compileall','-q',str(backend/'src')],check=True)

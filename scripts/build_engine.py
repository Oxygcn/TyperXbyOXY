"""Build the pinned TyperX engine with absolute paths (Windows x64 only)."""
from __future__ import annotations

import os
import platform
import shutil
import struct
import subprocess
import sys
from pathlib import Path


def build_command(root: Path, python: str) -> list[str]:
    root = root.resolve()
    return [
        python, '-m', 'PyInstaller', '--noconfirm', '--clean',
        '--onefile', '--console', '--name', 'typerx-engine',
        '--distpath', str(root / 'build' / 'engine'),
        '--workpath', str(root / 'build' / 'pyinstaller'),
        '--specpath', str(root / 'build'),
        '--paths', str(root / 'backend' / 'src'),
        '--paths', str(root / 'bridge'),
        '--add-data', str(root / 'bridge' / 'config.schema.json') + os.pathsep + '.',
        '--collect-all', 'typerx', '--collect-all', 'telethon',
        '--collect-all', 'interception', '--hidden-import', 'win32crypt',
        '--hidden-import', 'pythoncom', '--hidden-import', 'pywinauto',
        str(root / 'bridge' / 'entry.py'),
    ]


def build_environment(root: Path, inherited: dict[str, str]) -> dict[str, str]:
    root = root.resolve()
    env = dict(inherited)
    # --collect-all helper subprocesses run before Analysis applies --paths.
    # Set PYTHONPATH for this subprocess only; do not change the user's session.
    env['PYTHONPATH'] = os.pathsep.join((str(root / 'backend' / 'src'), str(root / 'bridge')))
    return env


def main() -> int:
    if sys.platform != 'win32' or struct.calcsize('P') != 8 or platform.machine().lower() not in {'amd64', 'x86_64'}:
        print('Use Windows x64 with x64 Python 3.12.', file=sys.stderr)
        return 1
    if sys.version_info[:2] != (3, 12):
        print('Use the Python 3.12 virtual environment created for this project.', file=sys.stderr)
        return 1
    root = Path(__file__).resolve().parent.parent
    required = [
        root / 'bridge' / 'requirements.lock',
        root / 'bridge' / 'config.schema.json',
        root / 'bridge' / 'entry.py',
        root / 'backend' / 'src' / 'typerx' / '__init__.py',
        root / 'scripts' / 'patch-backend.py',
    ]
    for path in required:
        if not path.is_file():
            print(f'Required project file is missing: {path}', file=sys.stderr)
            return 1
    python = sys.executable
    try:
        subprocess.run([python, '-m', 'pip', 'install', '--require-hashes', '-r', str(required[0])], cwd=root, check=True)
        subprocess.run([python, str(root / 'scripts' / 'patch-backend.py')], cwd=root, check=True)
        env = build_environment(root, dict(os.environ))
        subprocess.run([python, '-c',
                        'import importlib.util; s=importlib.util.find_spec("typerx"); '
                        'assert s and s.submodule_search_locations, "typerx package not found"'],
                       cwd=root, env=env, check=True)
        subprocess.run(build_command(root, python), cwd=root, env=env, check=True)
        output = root / 'build' / 'engine' / 'typerx-engine.exe'
        if not output.is_file():
            print('PyInstaller did not produce the expected engine executable.', file=sys.stderr)
            return 1
        target = root / 'src-tauri' / 'binaries' / 'typerx-engine-x86_64-pc-windows-msvc.exe'
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(output, target)
        print(f'Engine built: {target}')
        return 0
    except subprocess.CalledProcessError as error:
        print(f'Build stopped: command exited with status {error.returncode}. See the error above.', file=sys.stderr)
        return error.returncode or 1
    except OSError as error:
        print(f'Build file/process error: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())

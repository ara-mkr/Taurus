#!/usr/bin/env python3
"""Synchronize only the four canonical Taurus skills to Claude's project folder."""
from __future__ import annotations
import argparse
import hashlib
import shutil
import sys
from pathlib import Path

NAMES = ('taurus-ui', 'taurus-ui-audit', 'taurus-phase-gate', 'taurus-action-safety')

def digest_tree(path: Path) -> dict[str, str]:
    if not path.is_dir():
        return {}
    return {str(p.relative_to(path)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in path.rglob('*') if p.is_file() and '__pycache__' not in p.parts}

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Report drift without changing files.')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    source_root, target_root = root / '.agents/skills', root / '.claude/skills'
    if source_root.is_symlink() or target_root.is_symlink():
        raise RuntimeError('Skill roots must be ordinary directories, not symlinks.')
    drift = []
    for name in NAMES:
        source, target = source_root / name, target_root / name
        if source.is_symlink() or target.is_symlink():
            raise RuntimeError(f'Refusing to overwrite a symlink: {name}')
        if not (source / 'SKILL.md').is_file():
            raise FileNotFoundError(f'Missing canonical skill: {source}')
        if digest_tree(source) != digest_tree(target):
            drift.append(name)
            if not args.check:
                target_root.mkdir(parents=True, exist_ok=True)
                if target.exists():
                    shutil.rmtree(target)
                shutil.copytree(source, target)
    if args.check and drift:
        print('Skill drift: ' + ', '.join(drift), file=sys.stderr)
        return 1
    print(('Checked' if args.check else 'Synchronized') + f' {len(NAMES)} Taurus skills. Drift: {len(drift)}.')
    return 0

if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError) as exc:
        print(f'Error: {exc}', file=sys.stderr)
        raise SystemExit(1)

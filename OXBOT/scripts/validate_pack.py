#!/usr/bin/env python3
"""Validate the initial Taurus planning pack. Standard library only; no network."""
from __future__ import annotations
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAMES = ('taurus-ui', 'taurus-ui-audit', 'taurus-phase-gate', 'taurus-action-safety')

def luminance(value: str) -> float:
    rgb = [int(value[i:i+2], 16)/255 for i in (1, 3, 5)]
    lin = [x/12.92 if x <= .04045 else ((x+.055)/1.055)**2.4 for x in rgb]
    return .2126*lin[0] + .7152*lin[1] + .0722*lin[2]

def contrast(a: str, b: str) -> float:
    x, y = sorted((luminance(a), luminance(b)))
    return (y+.05)/(x+.05)

def main() -> int:
    errors=[]
    required=['README.md','AGENTS.md','CLAUDE.md','PROJECT_STATE.json','LICENSE-DECISION.md',
              'design/tokens.css','design/ui-direction.html','prompts/01-first-build.md',
              'docs/00-start-here.md','docs/03-ui-specification.md','docs/04-architecture.md',
              'docs/08-references.md','docs/source-catalog.json','docs/09-initial-backlog.md']
    for name in required:
        if not (ROOT/name).is_file(): errors.append('Missing '+name)
    state=json.loads((ROOT/'PROJECT_STATE.json').read_text())
    # Boundary approved by the owner on 2026-10-30 and 2026-10-31: local server, read-only connectors,
    # the Electron desktop app and the home-screen phone app on; sending, writes, purchases and the
    # native iPhone build still off. Change deliberately.
    if state['external_actions_authorized'] or state.get('ios_native_app_authorized'):
        errors.append('External actions or the native iPhone build are now enabled; review owner authorization and checks.')
    if state['owner_decision'].get('date') != '2026-10-30' or state['data_mode'] != 'live_read_only_with_labelled_sample_fallback':
        errors.append('Phase state no longer matches the 2026-10-30 owner decision; update this check deliberately.')
    catalog=json.loads((ROOT/'docs/source-catalog.json').read_text())
    ids={s['id'] for s in catalog}
    if len(ids)!=len(catalog) or len(ids)!=60: errors.append('Source catalog must have 60 unique references.')
    for file in (ROOT/'docs').glob('*.md'):
        for ref in re.findall(r'\bR\d{2}\b',file.read_text()):
            if ref not in ids: errors.append(f'Unknown source {ref} in {file.name}')
    for name in NAMES:
        folder=ROOT/'.agents/skills'/name
        text=(folder/'SKILL.md').read_text()
        if not text.startswith('---\nname: '+name+'\n'): errors.append('Invalid skill name: '+name)
        if 'description:' not in text.split('---',2)[1]: errors.append('Missing description: '+name)
        if not (folder/'agents/openai.yaml').is_file(): errors.append('Missing metadata: '+name)
        if '[TODO' in text: errors.append('Unfinished skill template: '+name)
        for ref in re.findall(r'references/[\w-]+\.md',text):
            if not (folder/ref).is_file(): errors.append(f'Missing skill reference: {name}/{ref}')
    html=(ROOT/'design/ui-direction.html').read_text()
    if re.search(r'(?:src|href)=[\"\']https?://',html): errors.append('Preview loads an external resource.')
    if re.search(r'\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(',html): errors.append('Preview contains network code.')
    if 'Synthetic data only' not in html: errors.append('Preview is missing clear simulation labeling.')
    pairs=[('dark primary','#F2F3F5','#17181B'),('dark secondary','#A7ABB5','#17181B'),
           ('dark muted','#8F94A0','#17181B'),('dark button','#111329','#AFB7FF'),
           ('light primary','#202229','#FFFFFF'),('light secondary','#626976','#FFFFFF'),
           ('light button','#FFFFFF','#4C54C9'),('dark warning','#E5B66C','#17181B'),
           ('light warning','#815318','#FFFFFF')]
    for label,a,b in pairs:
        ratio=contrast(a,b)
        print(f'Contrast {label}: {ratio:.2f}:1')
        if ratio<4.5: errors.append('Insufficient proposed text contrast: '+label)
    result=subprocess.run([sys.executable,str(ROOT/'scripts/sync_skills.py'),'--check'],capture_output=True,text=True)
    print(result.stdout.strip())
    if result.returncode: errors.append(result.stderr.strip())
    if errors:
        print('\nFAILED:\n'+'\n'.join(errors),file=sys.stderr)
        return 1
    print(f'PASS: planning structure, initial scope, 4 skill mirrors, {len(ids)} sources, offline preview and selected contrast pairs.')
    print('This is not an application, security, medical or legal certification.')
    return 0

if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, KeyError, ValueError) as exc:
        print(f'Validation error: {exc}',file=sys.stderr)
        raise SystemExit(1)

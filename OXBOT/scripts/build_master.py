#!/usr/bin/env python3
"""Rebuild the master Markdown from canonical modular documents (standard library only)."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
FILES=['00-start-here.md','01-product-and-brand.md','02-phased-roadmap.md','03-ui-specification.md',
       '04-architecture.md','05-integrations-and-evaluations.md','06-repo-and-coding-workflow.md',
       '07-legal-launch-and-risk.md','08-references.md','09-initial-backlog.md',
       '10-phone-app.md','11-design-rules.md','12-connections.md']
header='''# Taurus
## Product, design and engineering blueprint

Prepared for Akhil | October 20, 2026 | Version 1.0

**Current work: a local, read-only Taurus with live connectors and ringing. See docs/10-12.**
Product and company names remain provisional. This document is a proposal and build guide, not proof of production capabilities, legal clearance or a security certification.

The complete bundle also includes an interactive HTML direction study, design tokens, coding prompts, four custom skills, project instructions and validation scripts. Use the modular files in docs/ for daily work; rebuild this master after editing them.

## Contents

'''
parts=[]
for f in FILES:
 text=(ROOT/'docs'/f).read_text()
 title=text.splitlines()[0].lstrip('# ')
 header+=f'- {title}\n'
 parts.append(text)
(ROOT/'Taurus_Master_Plan.md').write_text(header+'\n---\n\n'+'\n\n---\n\n'.join(parts)+'\n')
print('Rebuilt Taurus_Master_Plan.md from '+str(len(FILES))+' canonical documents.')

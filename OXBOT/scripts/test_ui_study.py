#!/usr/bin/env python3
"""Optional visual-study smoke test. Requires Playwright and an installed Chromium browser.
Install a compatible Playwright release in a virtual environment, then run
python -m playwright install chromium if no local Chromium is available.
This tests the static HTML study, not the future Ox application.
"""
from pathlib import Path
import json, shutil, os
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
out=root/'qa-local'/'ui-study';out.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
 executable=shutil.which('chromium') or shutil.which('google-chrome')
 options={'headless':True}
 if executable: options['executable_path']=executable
 # Root-only local container test accommodation; normal desktop runs keep sandbox defaults.
 if hasattr(os,'geteuid') and os.geteuid()==0: options['args']=['--no-sandbox']
 browser=p.chromium.launch(**options)
 page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
 errors=[]; requests=[]
 page.on('pageerror',lambda exc:errors.append(str(exc)))
 page.on('request',lambda req:requests.append(req.url))
 page.set_content((root/'design/ui-direction.html').read_text())
 for w,h in [(1440,1000),(1280,900),(768,1024),(390,844),(320,740)]:
  page.set_viewport_size({'width':w,'height':h})
  page.screenshot(path=str(out/f'dark-{w}.png'),full_page=True,animations="disabled")
  overflow=page.evaluate('document.documentElement.scrollWidth > innerWidth')
  results.append({'test':f'no horizontal overflow {w}','pass':not overflow})
 page.set_viewport_size({'width':1440,'height':1000})
 page.get_by_role('button',name='Switch to light theme').click()
 page.screenshot(path=str(out/'light-1440.png'),full_page=True,animations="disabled")
 results.append({'test':'light theme toggle','pass':page.locator('html').get_attribute('data-theme')=='light'})
 page.get_by_role('button',name='Switch to dark theme').click()
 page.get_by_role('button',name='Review draft').click()
 page.screenshot(path=str(out/'email-drawer-1440.png'),full_page=True,animations="disabled")
 results.append({'test':'dialog visible','pass':page.get_by_role('dialog').is_visible()})
 page.get_by_role('button',name='Approve simulation').click()
 results.append({'test':'explicit simulated approval result','pass':page.locator('#actionResult').inner_text()=='Simulation complete. No email was sent.'})
 page.keyboard.press('Escape')
 results.append({'test':'escape closes and focus returns','pass':not page.get_by_role('dialog').is_visible() and page.evaluate("document.activeElement.matches('[data-open=email]')")})
 page.get_by_role('button',name='Pause preview').click()
 page.get_by_role('button',name='Review plan').click()
 page.get_by_role('button',name='Save plan simulation').click()
 results.append({'test':'pause blocks demo mutation','pass':'paused' in page.locator('#actionResult').inner_text()})
 page.keyboard.press('Escape')
 page.get_by_role('button',name='Reset demo').click()
 results.append({'test':'reset restores initial count','pass':page.locator('#needsCount').inner_text()=='2'})
 page.locator('#askInput').fill('book an international flight')
 page.get_by_role('button',name='Run sample request').click()
 results.append({'test':'unsupported command honest fallback','pass':'not connected to a live AI' in page.locator('#inlineResult').inner_text()})
 page.locator('#askInput').fill('get me ready for tomorrow')
 page.get_by_role('button',name='Run sample request').click()
 results.append({'test':'supported sample opens plan','pass':page.get_by_role('heading',name='An easier start tomorrow').is_visible()})
 page.set_viewport_size({'width':390,'height':844})
 page.screenshot(path=str(out/'plan-drawer-390.png'),full_page=True,animations="disabled")
 page.keyboard.press('Escape')
 page.emulate_media(reduced_motion='reduce')
 results.append({'test':'reduced motion supported','pass':page.evaluate("getComputedStyle(document.querySelector('button')).transitionDuration")=='0s'})
 results.append({'test':'no script errors','pass':not errors,'details':errors})
 external=[r for r in requests if r.startswith('http')]
 results.append({'test':'no network requests','pass':not external,'details':external})
 # Basic accessible-name checks, not a full axe or screen-reader audit.
 nameless=page.locator('button').evaluate_all("els => els.filter(e => !e.textContent.trim() && !e.getAttribute('aria-label')).length")
 results.append({'test':'buttons have visible or aria text','pass':nameless==0})
 browser.close()
(out/'results.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
if not all(r['pass'] for r in results):raise SystemExit(1)

# Working agreement for implementers

You are implementing one ticket of **FIRST LIGHT**. The lead reviews every ticket in the running game, reads the code and returns it with remarks if it falls short. Read `docs/DESIGN.md` first — it is binding.

## Environment
- Windows 10, repo root = current working directory. Shells: Bash (Git Bash) and PowerShell.
- **No Node.js.** Plain ES modules, no bundler, no npm. Python 3.12 is available (numpy, scipy, soundfile, pillow, onnxruntime, kokoro-onnx, piper-tts).
- three.js r170 is vendored: import as `import * as THREE from 'three'` and `from 'three/addons/...'` (import map in `index.html`).
- Blender 5.2.2: `"C:/Users/Svyatoslav/AppData/Local/Programs/blender-5.2.2-windows-x64/blender.exe" -b --factory-startup -P blender/<script>.py`
- ffmpeg / ffprobe are on PATH.
- Chrome: `"C:/Program Files/Google/Chrome/Application/chrome.exe"`. Headless screenshot example (server must be running):
  `chrome.exe --headless=new --enable-unsafe-swiftshader --use-angle=swiftshader --window-size=1920,1080 --virtual-time-budget=8000 --screenshot=C:/path/out.png "http://localhost:8080/?scene=title"`
  Use headless screenshots for your own self-check (your own `--user-data-dir` and your own `--remote-debugging-port`, e.g. 9457). Do **not** use the in-app browser pane tools and never attach to any other browser or debug port — the lead uses those for review.
- Dev server: the lead keeps `python tools/serve.py` running on port **8080** for review — never stop or kill it. For your own checks start a second server with `python tools/serve.py --port 8090` in the background and stop only that process (by its PID) when done.

## Rules
- Stay inside the ticket's scope. Do not edit `docs/DESIGN.md` or `docs/TICKETS.md` (the lead owns them). If the design seems wrong, say so in your report instead.
- Code quality: small focused modules, clear names, brief comments only where intent is non-obvious, no dead code, dispose GPU resources on scene exit, no global leaks except the `window.__fl` debug API.
- Keep every feature verifiable through `window.__fl` hooks (see DESIGN §4). Add hooks you need for your feature and list them in your report.
- No console errors/warnings from our code.
- Commit in logical steps with clear messages ending with:
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
  then `git push origin main`.
- Your final report must list: files changed, how to verify each acceptance criterion (exact URL params / `__fl` calls), screenshots you produced (absolute paths), known limitations. Be honest — never claim something works unless you checked it.

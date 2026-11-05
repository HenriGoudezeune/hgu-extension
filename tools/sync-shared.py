"""Kopieert de gedeelde frontend (app.js, style.css, theme.js) uit HGU (ufora-sync/web) naar src/app/.

    python tools/sync-shared.py [pad/naar/ufora-sync]
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
hgu = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "ufora-sync"
(ROOT / "src" / "app").mkdir(parents=True, exist_ok=True)
for name in ("app.js", "style.css", "theme.js"):
    shutil.copyfile(hgu / "web" / name, ROOT / "src" / "app" / name)
    print("gekopieerd:", name)

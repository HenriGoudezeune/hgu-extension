"""Bouwt dist/chrome (Chrome/Edge, identiek aan src/) en dist/firefox plus een zip van elk.

    python tools/build.py
"""
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC, DIST = ROOT / "src", ROOT / "dist"
base = json.loads((SRC / "manifest.json").read_text("utf-8"))

TARGETS = {
    "chrome": {},
    "firefox": {
        "background": {"scripts": ["background.js"]},
        "browser_specific_settings": {"gecko": {
            "id": "hgu@hydrargyrum.be", "strict_min_version": "142.0",
            "data_collection_permissions": {"required": ["none"]}}},
    },
}

shutil.rmtree(DIST, ignore_errors=True)
for name, extra in TARGETS.items():
    out = DIST / name
    shutil.copytree(SRC, out)
    (out / "manifest.json").write_text(json.dumps({**base, **extra}, indent=2, ensure_ascii=False) + "\n", "utf-8")
    z = DIST / f"hgu-{name}-{base['version']}.zip"
    with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(out.rglob("*")):
            if f.is_file():
                zf.write(f, f.relative_to(out).as_posix())
    print("gebouwd:", out, "->", z.name)

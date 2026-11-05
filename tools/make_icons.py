"""Maakt src/icons/icon-{16,48,128}.png (zelfde Hg-icoon als HGU) met Playwright (Chrome)."""
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / "src" / "icons"
SVG = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='{s}' height='{s}'><rect width='32' height='32' rx='8' fill='#1d1d1f'/>"
       "<text x='16' y='22.5' font-size='17' font-family='Segoe UI, Arial, sans-serif' font-weight='700' text-anchor='middle' fill='#f5f5f7'>Hg</text></svg>")
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    for s in (16, 48, 128):
        page = b.new_page(viewport={"width": s, "height": s}, device_scale_factor=1)
        page.set_content(f"<body style='margin:0;background:transparent'>{SVG.format(s=s)}</body>")
        page.screenshot(path=str(OUT / f"icon-{s}.png"), omit_background=True)
    b.close()
print("icons klaar")

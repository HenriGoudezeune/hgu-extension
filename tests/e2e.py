"""End-to-end: de uitgepakte extensie (src/) in echte Chrome, tegen een nagebootst Ufora en Hydra
(Playwright-routes met Brightspace-vormige JSON). Met je echte Ufora-sessie is dit niet te testen zonder in te loggen.

    python tests/e2e.py
"""
import json
import re
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pdfmaker import make_pdf  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "src"  # precies wat een gebruiker als uitgepakte extensie laadt
SHOTS = ROOT / "tests" / "shots"

PDF = make_pdf()
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082")
HEADERS = {"Access-Control-Allow-Origin": "*"}
RECENT = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S.000Z")  # ongelezen op het overzicht


def enrollments():
    def item(i, name, code, pin):
        return {"OrgUnit": {"Id": i, "Name": name, "Code": code}, "Access": {"CanAccess": True, "LastAccessed": "2026-11-04T10:00:00.000Z"}, "PinDate": pin}
    return {"Items": [item(1001, "C003777A - Artificial Intelligence", "C003777A_2026", "2026-09-20T10:00:00.000Z"),
                      item(1002, "C001234A - Wiskundige modellering", "C001234A_2026", None)],
            "PagingInfo": {"HasMoreItems": False, "Bookmark": ""}}


def topic(i, title, kind="File", url=None, order=0, **extra):
    return {"TopicId": i, "Title": title, "TypeIdentifier": kind, "Url": url, "LastModifiedDate": "2026-10-01T10:00:00.000Z",
            "Unread": False, "SortOrder": order, "IsHidden": False, "Description": {"Html": ""}, **extra}


class Mock:
    """Nagebootst Ufora + Hydra; houdt bij wat de extensie opvraagt."""

    def __init__(self):
        self.logged_in = False
        self.modified = "2026-10-01T10:00:00.000Z"
        self.requests = []
        self.ufora_hits = 0

    def toc(self):
        notes = topic(5001, "Hoofdstuk 1", url="/content/enforced/1001-X/hoofdstuk1.pdf", order=0)
        notes["LastModifiedDate"] = self.modified
        week = topic(5004, "Notities week 1", url="/content/enforced/1001-X/week1/notities.txt")
        week["LastModifiedDate"] = self.modified
        return {"Modules": [
            {"Title": "Lecture notes", "SortOrder": 0, "IsHidden": False, "Description": {"Html": "<p>Slides van de lessen</p>"},
             "Topics": [notes, topic(5002, "Handige website", "Link", "https://example.org/", 1)],
             "Modules": [{"Title": "Week 1", "SortOrder": 0, "IsHidden": False, "Description": {"Html": ""},
                          "Topics": [week], "Modules": []}]},
            {"Title": "Opdrachten", "SortOrder": 1, "IsHidden": False, "Description": {"Html": ""},
             "Topics": [topic(5003, "Opdracht 1", "Link", "/d2l/lms/dropbox/user/folder_submit_files.d2l?db=7001&ou=1001", 0, ToolId=2000, ToolItemId=7001)],
             "Modules": []}]}

    def handle(self, route):
        req = route.request
        url = re.sub(r"^https://", "", req.url)
        self.requests.append(req.url)
        host, _, path = url.partition("/")
        path = "/" + path
        if host == "hydra.ugent.be":
            return self.hydra(route, path)
        if host != "ufora.ugent.be":
            return route.fulfill(status=599, body="onverwacht")
        self.ufora_hits += 1
        if not self.logged_in:
            if path.startswith("/d2l/home"):
                return route.fulfill(status=200, content_type="text/html", body="<h1>Ufora login</h1>")
            return route.fulfill(status=302, headers={"Location": "https://ufora.ugent.be/d2l/login"})
        j = lambda data: route.fulfill(status=200, content_type="application/json", body=json.dumps(data), headers=HEADERS)
        if path.startswith("/d2l/api/lp/1.43/users/whoami"):
            return j({"Identifier": "1"})
        if path.startswith("/d2l/api/lp/1.43/enrollments/myenrollments"):
            return j(enrollments())
        if re.search(r"/content/toc$", path):
            return j(self.toc())
        if re.search(r"/dropbox/folders/$", path):
            return j([{"Id": 7001, "Name": "Opdracht 1", "IsHidden": False, "DueDate": "2026-12-01T22:59:00.000Z",
                       "Availability": {"StartDate": None, "EndDate": None}, "DropboxType": 0,
                       "CustomInstructions": {"Html": "<p>Maak de oefeningen.</p>"},
                       "Attachments": [{"FileId": 9001, "FileName": "opgave.pdf", "Size": 1234, "IsDeleted": False}],
                       "LinkAttachments": [], "Assessment": {"ScoreDenominator": 20}}] if "/1001/" in path else [])
        if re.search(r"/dropbox/folders/\d+/submissions/$", path):
            return j([])
        if re.search(r"/news/$", path):
            return j([{"Id": 3001, "Title": "Welkom bij AI", "IsHidden": False, "IsPinned": False,
                       "Body": {"Html": "<p>Hallo allemaal <img src='/content/enforced/img.png' alt='logo'></p>"},
                       "StartDate": RECENT, "CreatedDate": RECENT,
                       "Attachments": [{"FileId": 9101, "FileName": "info.pdf", "Size": 500, "IsDeleted": False}]}] if "/1001/" in path else [])
        if path.endswith("hoofdstuk1.pdf"):
            return route.fulfill(status=200, content_type="application/pdf", body=make_pdf("Hoofdstuk 1 " + self.modified), headers=HEADERS)
        if path.endswith("notities.txt"):
            return route.fulfill(status=200, content_type="text/plain", body="week 1 " + self.modified, headers=HEADERS)
        if path.endswith("img.png"):
            return route.fulfill(status=200, content_type="image/png", body=PNG, headers=HEADERS)
        if re.search(r"/(dropbox/folders/7001/attachments/9001|news/3001/attachments/9101)$", path):
            return route.fulfill(status=200, content_type="application/pdf", body=PDF, headers=HEADERS)
        return route.fulfill(status=404, body="niet gevonden")

    def hydra(self, route, path):
        j = lambda data: route.fulfill(status=200, content_type="application/json", body=json.dumps(data), headers=HEADERS)
        if path.endswith("sandwiches.json"):
            return j([{"name": "Kaas", "ingredients": ["gouda", "tomaat"], "price_medium": "2.55", "price_small": ""}])
        if path.endswith("salads.json"):
            return j([{"name": "Wrap boulet", "description": "Wrap met boulet", "price": ""}, {"name": "Salade scampi", "description": "Met scampi", "price": ""}])
        if path.endswith("overview.json"):
            return j([])
        if re.search(r"/menu/nl-(sterre|ardoyen)/\d+/\d+/\d+\.json$", path):
            return j({"open": True, "meals": [
                {"allergens": ["selder"], "kind": "soup", "name": "Tomatensoep klein", "price": "€ 1,20", "type": "side"},
                {"allergens": ["selder"], "kind": "soup", "name": "Tomatensoep groot", "price": "€ 1,80", "type": "side"},
                {"allergens": [], "kind": "vegan", "name": "Spaghetti met groentesaus", "price": "€ 4,50", "type": "main"}],
                "vegetables2": [{"allergens": [], "kind": "vegan", "name": "Broccoli"}]})
        return route.fulfill(status=404, body="{}")


class Extension(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mock = Mock()
        cls.pw = sync_playwright().start()
        cls.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        cls.ctx = cls.pw.chromium.launch_persistent_context(
            cls.tmp.name, headless=False, viewport={"width": 1100, "height": 900},
            args=[f"--disable-extensions-except={DIST}", f"--load-extension={DIST}", "--headless=new"])
        cls.ctx.route("**/*", lambda r: cls.mock.handle(r) if r.request.url.startswith("https://") else r.continue_())
        cls.from_extension = []  # verzoeken van extensiepagina's (niet van het Ufora-tabblad dat de gebruiker zelf opent)

        def note(r):
            try:
                if r.frame.url.startswith("chrome-extension://"):
                    cls.from_extension.append(r.url)
            except Exception:
                pass
        cls.ctx.on("request", note)
        sw = cls.ctx.service_workers[0] if cls.ctx.service_workers else cls.ctx.wait_for_event("serviceworker")
        cls.id = sw.url.split("/")[2]
        cls.base = f"chrome-extension://{cls.id}"
        cls.errors = []
        SHOTS.mkdir(exist_ok=True)

    @classmethod
    def tearDownClass(cls):
        cls.ctx.close()
        cls.pw.stop()
        cls.tmp.cleanup()

    def open(self, path):
        page = self.ctx.new_page()
        page.on("pageerror", lambda e: self.errors.append(str(e)))
        page.on("console", lambda m: self.errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
        page.goto(f"{self.base}/{path}")
        return page

    def shot(self, page, name):
        page.screenshot(path=str(SHOTS / f"{name}.png"))

    # ---- de tests lopen in volgorde (nummers) ----
    def test_01_logged_out_shows_login_prompt_then_recovers(self):
        self.mock.logged_in = False
        page = self.open("app.html")
        page.wait_for_selector("text=Je Ufora-sessie is verlopen")
        self.shot(page, "uitgelogd")
        n_pages = len(self.ctx.pages)
        page.click("text=Inloggen bij Ufora")
        page.wait_for_selector("text=Wacht op login")
        for _ in range(50):  # Ufora opent in een nieuw tabblad
            if len(self.ctx.pages) > n_pages:
                break
            page.wait_for_timeout(100)
        self.assertGreater(len(self.ctx.pages), n_pages)
        self.mock.logged_in = True                        # "de gebruiker logt in"
        page.wait_for_selector(".tile", timeout=20000)
        page.close()

    def test_02_overview_course_and_files(self):
        self.mock.logged_in = True
        page = self.open("app.html")
        page.wait_for_selector("text=Artificial Intelligence")
        page.wait_for_selector("text=Opdracht 1")
        self.assertTrue(page.locator("text=Welkom bij AI").count() >= 1)
        # dagmenu met broodjes/wraps/salades, zonder allergenen
        page.wait_for_selector("text=Tomatensoep")
        page.click("text=Volledig menu")
        page.wait_for_selector("text=Wrap boulet")
        self.assertEqual(page.locator("text=/allergen/i").count(), 0)
        page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(900)
        page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(900)
        self.shot(page, "overzicht")
        # vak openen: mappen en bestanden
        page.goto(f"{self.base}/app.html#/vak/1001")
        page.wait_for_selector("text=Lecture notes")
        page.click("summary:has-text('Lecture notes')")
        page.click("text=Hoofdstuk 1")
        # PDF in de viewer (iframe naar file.html, daarin een blob)
        page.wait_for_selector("iframe.viewer")
        frame = page.frame_locator("iframe.viewer")
        frame.locator("iframe").wait_for(timeout=15000)
        src = page.frame(url=re.compile("file.html")).evaluate("document.querySelector('iframe').src")
        self.assertTrue(src.startswith("blob:"), src)
        page.wait_for_timeout(1500)
        page.wait_for_timeout(1500)
        self.shot(page, "viewer")
        # downloaden
        with page.expect_download(timeout=15000) as dl:
            page.click("text=Download")
        self.assertEqual(dl.value.suggested_filename, "hoofdstuk1.pdf")
        page.close()

    def test_03_news_image_and_attachment(self):
        self.mock.logged_in = True
        page = self.open("app.html#/aankondigingen")
        page.wait_for_selector("text=Welkom bij AI")
        page.click("text=Welkom bij AI >> nth=0")
        page.wait_for_selector(".rich img")
        for _ in range(100):
            if page.evaluate("() => document.querySelector('.rich img').src.startsWith('blob:')"):
                break
            page.wait_for_timeout(100)
        self.assertTrue(page.evaluate("() => document.querySelector('.rich img').src.startsWith('blob:')"))
        with self.ctx.expect_page() as popup:  # een pdf-bijlage opent in een nieuw tabblad (viewer)
            page.click("text=info.pdf")
        viewer = popup.value
        viewer.wait_for_selector("iframe", timeout=15000)
        self.assertTrue(viewer.evaluate("document.querySelector('iframe').src").startswith("blob:"))
        viewer.close()
        page.close()

    def test_04_submit_is_disabled(self):
        page = self.open("app.html")
        for _ in range(100):  # wait_for_function gebruikt eval, wat de CSP van de extensie (terecht) blokkeert
            if page.evaluate("() => !!window.HGU_URL"):
                break
            page.wait_for_timeout(100)
        r = page.evaluate("fetch('/api/submit/1001/7001', {method:'POST', body:'{}'}).then(async r => [r.status, (await r.json()).error])")
        self.assertEqual(r[0], 403)
        self.assertIn("Indienen staat uit", r[1])
        page.close()

    def test_05_sync_rules(self):
        self.mock.logged_in = True
        self.mock.modified = "2026-10-01T10:00:00.000Z"
        page = self.open("sync.html?opfs")
        page.wait_for_selector("text=Artificial Intelligence")
        page.check("#c1001")
        self.shot(page, "sync")
        read = lambda p: page.evaluate("""async p => { let d = await navigator.storage.getDirectory(); const parts = p.split('/');
            for (const x of parts.slice(0, -1)) d = await d.getDirectoryHandle(x);
            return await (await (await d.getFileHandle(parts.at(-1))).getFile()).text(); }""", p)
        listing = lambda: page.evaluate("""async () => { const out = []; const walk = async (d, pre) => { for await (const [n, h] of d.entries())
            h.kind === 'directory' ? await walk(h, pre + n + '/') : out.push(pre + n); };
            await walk(await navigator.storage.getDirectory(), ''); return out.sort(); }""")
        page.click("#run")
        page.wait_for_selector("text=Klaar: 2 bestand(en)")
        files = listing()
        self.assertIn("Artificial Intelligence/Lecture notes/hoofdstuk1.pdf", files)
        self.assertIn("Artificial Intelligence/Lecture notes/Week 1/notities.txt", files)
        # nogmaals: niets nieuws
        page.click("#run")
        page.wait_for_selector("text=Geen nieuwe bestanden")
        # gewijzigd op Ufora, lokaal niet aangeraakt: overschreven
        self.mock.modified = "2026-10-15T10:00:00.000Z"
        page.click("#run")
        page.wait_for_selector("text=bijgewerkt -> Lecture notes/hoofdstuk1.pdf")
        self.assertIn("2026-10-15", read("Artificial Intelligence/Lecture notes/hoofdstuk1.pdf"))
        # gewijzigd op Ufora én lokaal bewerkt: nooit overschrijven, nieuwe versie ernaast
        page.evaluate("""async () => { let d = await navigator.storage.getDirectory();
            for (const x of ['Artificial Intelligence', 'Lecture notes', 'Week 1']) d = await d.getDirectoryHandle(x);
            const w = await (await d.getFileHandle('notities.txt')).createWritable(); await w.write('mijn eigen notities'); await w.close(); }""")
        self.mock.modified = "2026-10-25T10:00:00.000Z"
        page.click("#run")
        page.wait_for_selector("text=/Week 1\\/notities \\(Ufora \\d\\d-\\d\\d\\)\\.txt/")
        self.assertEqual(read("Artificial Intelligence/Lecture notes/Week 1/notities.txt"), "mijn eigen notities")
        page.close()

    def test_06_only_ufora_and_hydra_are_contacted(self):
        outside = [u for u in self.from_extension if u.startswith("http") and not re.match(r"https://(ufora|hydra)\.ugent\.be/", u)]
        self.assertEqual(outside, [])
        self.assertGreater(len([u for u in self.from_extension if u.startswith("https://ufora")]), 5)
        self.assertEqual(self.errors, [], self.errors)

    def test_07_manifest_permissions_are_minimal(self):
        m = json.loads((DIST / "manifest.json").read_text("utf-8"))
        self.assertEqual(m["manifest_version"], 3)
        self.assertEqual(sorted(m["host_permissions"]), ["https://hydra.ugent.be/*", "https://ufora.ugent.be/*"])
        self.assertNotIn("permissions", m)
        self.assertNotIn("content_scripts", m)
        self.assertNotIn("https:", m["content_security_policy"]["extension_pages"].replace("https://", ""))


if __name__ == "__main__":
    sys.exit(0 if unittest.main(exit=False).result.wasSuccessful() else 1)

// Data-laag: de Brightspace-API van Ufora met de sessie van de browser zelf, plus het restomenu van Hydra.
// Port van ufora_home.py (HGU). Alle verzoeken gaan rechtstreeks van deze extensiepagina naar ufora.ugent.be en
// hydra.ugent.be; er is geen server van ons tussen en er wordt niets naar anderen gestuurd.
import * as store from "./store.js";

export const BASE = "https://ufora.ugent.be";
const HYDRA = "https://hydra.ugent.be/api/2.0/resto";
const RESTOS = { sterre: "nl-sterre", ardoyen: "nl-ardoyen" };
const MENU_TTL = 3 * 3600 * 1000;
const ext = globalThis.browser ?? globalThis.chrome;

export class NotLoggedIn extends Error {}
/** Ufora gaf een antwoord dat niet de verwachte vorm heeft (API gewijzigd of onverwachte pagina). */
export class FormatError extends Error {}
export class HttpError extends Error {
  constructor(status, detail = "") { super(`HTTP ${status} ${detail}`.trim()); this.status = status; }
}

// Ufora-topic-URL's bevatten soms rauwe spaties; al gecodeerde %xx blijven ongemoeid
const encodePath = p => encodeURI(p).replace(/%25([0-9A-Fa-f]{2})/g, "%$1");

// Vriendelijk voor Ufora: hoogstens CONCURRENCY verzoeken tegelijk; bij 429/5xx/netwerkfout opnieuw proberen met
// exponentiële wachttijd (500 ms, 1 s, 2 s, ...; Retry-After wordt gerespecteerd).
const CONCURRENCY = 3;
const MAX_TRIES = 4;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchRetry(url, opts) {
  for (let n = 0; ; n++) {
    let r = null;
    try { r = await fetch(url, opts); } catch (e) { if (n + 1 >= MAX_TRIES) throw e; }
    if (r && r.status !== 429 && r.status < 500) return r;
    if (n + 1 >= MAX_TRIES) return r;  // laatste poging: geef de fout door (r is hier niet null)
    const ra = r && Number(r.headers.get("retry-after"));
    await sleep(ra > 0 ? Math.min(ra, 30) * 1000 : 500 * 2 ** n + Math.random() * 250);
  }
}

/** GET op Ufora met de cookies van de browser. Een verlopen sessie eindigt in een redirect naar de loginpagina. */
export async function raw(path) {
  let r;
  try {
    r = await fetchRetry(BASE + encodePath(path), { credentials: "include", redirect: "manual" });
  } catch (e) {
    throw new Error("Geen verbinding met Ufora.");
  }
  if (r.type === "opaqueredirect" || r.status === 401) throw new NotLoggedIn();
  if (r.status === 403) {
    // 403 met een geldige sessie = echt geen toegang
    if (await loggedIn()) throw new HttpError(403);
    throw new NotLoggedIn();
  }
  if (r.status === 429) throw new HttpError(429, "Ufora vraagt om even te wachten (te veel verzoeken). Probeer het later opnieuw.");
  if (!r.ok) throw new HttpError(r.status, r.status >= 500 ? "Ufora heeft een storing. Probeer het later opnieuw." : "");
  return r;
}

export async function loggedIn() {
  try {
    const r = await fetch(`${BASE}/d2l/api/lp/1.43/users/whoami`, { credentials: "include", redirect: "manual" });
    return r.ok && (r.headers.get("content-type") || "").includes("json");
  } catch { return false; }
}

async function getJSON(path) {
  const r = await raw(path);
  if (!(r.headers.get("content-type") || "").includes("json")) throw new NotLoggedIn();  // loginpagina met status 200
  try { return await r.json(); }
  catch { throw new FormatError("Ufora gaf geen leesbaar antwoord."); }
}

/** Controleer de vorm van een antwoord; een onverwachte vorm is een duidelijke fout, nooit een stille lege lijst. */
function expect(ok, what) {
  if (!ok) throw new FormatError(`onverwacht antwoord van Ufora (${what})`);
}
const isArr = Array.isArray;

// ---------- vakken, inhoud, opdrachten, aankondigingen ----------
const shortName = name => name.replace(/^[A-Z]\d{6}[A-Z]?\s*-\s*/, "");

async function getCourses() {
  let data = await getJSON("/d2l/api/lp/1.43/enrollments/myenrollments/?orgUnitTypeId=3");
  expect(isArr(data?.Items) && data.PagingInfo, "lijst met vakken");
  const items = [...data.Items];
  while (data.PagingInfo.HasMoreItems) {
    data = await getJSON("/d2l/api/lp/1.43/enrollments/myenrollments/?orgUnitTypeId=3&bookmark=" + data.PagingInfo.Bookmark);
    expect(isArr(data?.Items) && data.PagingInfo, "lijst met vakken");
    items.push(...data.Items);
  }
  const year = code => { const m = /_(\d{4})$/.exec(code); return m && +m[1]; };
  return items.filter(it => it.Access.CanAccess).map(it => ({
    id: it.OrgUnit.Id, name: shortName(it.OrgUnit.Name), code: it.OrgUnit.Code, year: year(it.OrgUnit.Code),
    pinned: it.PinDate, lastAccessed: it.Access.LastAccessed,
  }));
}

/** Beschrijving (HTML) van een map of item; null als er niets zichtbaars in staat. */
function desc(item) {
  const html = item.Description?.Html || "";
  const text = html.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;|\s/g, "");
  return text || html.includes("<img") ? html : null;
}

function simplify(modules) {
  return [...modules].sort((a, b) => a.SortOrder - b.SortOrder).filter(m => !m.IsHidden).map(m => ({
    title: m.Title,
    desc: desc(m),
    topics: [...m.Topics].sort((a, b) => a.SortOrder - b.SortOrder).filter(t => !t.IsHidden).map(t => ({
      id: t.TopicId, title: t.Title, type: t.TypeIdentifier, url: t.Url ?? null, modified: t.LastModifiedDate ?? null,
      unread: t.Unread ?? false, desc: desc(t),
      // snelkoppeling naar een opdracht (ToolId 2000 = dropbox): id van die opdrachtmap
      dropbox: t.ToolId === 2000 ? t.ToolItemId ?? null : null,
    })),
    modules: simplify(m.Modules),
  }));
}

/** De ruwe inhoudsopgave van een vak (ook voor de synchronisatie). */
export const getToc = async ou => {
  const toc = await getJSON(`/d2l/api/le/1.75/${ou}/content/toc`);
  expect(isArr(toc?.Modules), "inhoudsopgave van een vak");
  return toc;
};

async function getCourse(ou) {
  return { id: ou, modules: simplify((await getToc(ou)).Modules) };
}

async function currentCourses() {
  const courses = await cached("courses", getCourses, true);
  const year = Math.max(0, ...courses.map(c => c.year || 0));
  return [courses.filter(c => c.year == null || c.year === year || c.pinned), year];
}

/** producer(vak) met hoogstens CONCURRENCY tegelijk; enkel vakken zonder toegang (403/404) vallen weg, elke andere fout stopt het geheel met een melding. */
async function perCourse(courses, producer) {
  const out = new Array(courses.length);
  let next = 0;
  const worker = async () => {
    while (next < courses.length) {
      const i = next++;
      try { out[i] = await producer(courses[i]); }
      catch (e) { if (e instanceof HttpError && (e.status === 403 || e.status === 404)) out[i] = []; else throw e; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, courses.length) }, worker));
  return out.flat();
}

const files = blocks => blocks.filter(f => !f.IsDeleted).map(f => ({ id: f.FileId, name: f.FileName, size: f.Size }));

async function assignment(ou, f) {
  const mine = await getJSON(`/d2l/api/le/1.75/${ou}/dropbox/folders/${f.Id}/submissions/`);
  const me = mine[0] || {}, fb = me.Feedback, ent = me.Entity || {}, av = f.Availability || {};
  return {
    ou, id: f.Id, name: f.Name, due: f.DueDate, start: av.StartDate ?? null, end: av.EndDate ?? null,
    group: f.DropboxType === 1,
    instructions: f.CustomInstructions.Html,
    attachments: files(f.Attachments),
    links: f.LinkAttachments.map(l => ({ name: l.LinkName, href: l.Href })),
    outOf: f.Assessment.ScoreDenominator,
    submissions: (me.Submissions || []).map(s => ({ id: s.Id, date: s.SubmissionDate, comment: s.Comment.Html, files: files(s.Files) })),
    feedback: fb ? {
      score: fb.Score, symbol: fb.GradedSymbol ?? null, html: fb.Feedback?.Html || "", files: files(fb.Files),
      links: (fb.Links || []).map(l => ({ name: l.LinkName, href: l.Href })),
      entity: `${(ent.EntityType || "User").toLowerCase()}/${ent.EntityId}`,
    } : null,
  };
}

async function getAssignments() {
  const [courses] = await currentCourses();
  const items = await perCourse(courses.filter(c => c.year), async c => {  // infosites (jaarloos) hebben geen opdrachten
    const folders = await getJSON(`/d2l/api/le/1.75/${c.id}/dropbox/folders/`);
    expect(isArr(folders), "opdrachten");
    return Promise.all(folders.filter(f => !f.IsHidden).map(f => assignment(c.id, f)));
  });
  return items.sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
}

const expectNews = list => { expect(isArr(list), "aankondigingen"); return list; };

async function getNews() {
  const [courses, year] = await currentCourses();
  const since = `${year}-08-01`;  // oudere berichten van de infosites zijn niet meer relevant
  const items = await perCourse(courses, async c =>
    (expectNews(await getJSON(`/d2l/api/le/1.75/${c.id}/news/`)))
      .filter(n => !n.IsHidden && (n.StartDate || n.CreatedDate || "") >= since)
      .map(n => ({ ou: c.id, id: n.Id, title: n.Title, html: n.Body.Html, date: n.StartDate || n.CreatedDate,
                   pinned: n.IsPinned, attachments: files(n.Attachments) })));
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------- cache: toon meteen iets, ververs op de achtergrond ----------
async function cached(name, producer, useCache) {
  if (useCache) {
    const hit = await store.get("cache:" + name);
    if (hit !== undefined) return hit;
  }
  const value = await producer();
  await store.put("cache:" + name, value);
  return value;
}

// ---------- dagmenu (Hydra, geen login) ----------
async function hydra(path) {
  const r = await fetch(`${HYDRA}/${path}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new HttpError(r.status);
  return r.json();
}

const clean = t => (t || "").replace(/ /g, " ").trim();

function tidyMenu(raw) {
  const soups = new Map(), mains = [];
  for (const m of raw.meals || []) {
    const name = clean(m.name), price = clean(m.price);
    if (m.kind === "soup") {
      const i = name.lastIndexOf(" "), size = i < 0 ? "" : name.slice(i + 1);
      const [base, sz] = size === "klein" || size === "groot" ? [name.slice(0, i), size] : [name, "klein"];
      if (!soups.has(base)) soups.set(base, { name: base, allergens: m.allergens || [], prices: {} });
      soups.get(base).prices[sz] = price;
    } else if (m.type === "main") {
      mains.push({ name, price, kind: m.kind, allergens: [...new Set(m.allergens || [])].sort() });
    }
  }
  const sides = (raw.vegetables2 || []).map(v => ({ name: clean(v.name), kind: v.kind, allergens: v.allergens || [] }));
  return { open: !!raw.open && (soups.size > 0 || mains.length > 0), soups: [...soups.values()], mains, sides };
}

async function getExtra() {
  const hit = await store.get("menu-extra");
  if (hit && Date.now() - hit.at < MENU_TTL) return hit.value;
  try {
    const sandwiches = ((await hydra("sandwiches.json")) || []).map(s => ({ name: clean(s.name), ingredients: (s.ingredients || []).map(clean) }));
    const cold = ((await hydra("salads.json")) || []).map(s => ({ name: clean(s.name), description: clean(s.description) }));
    const isWrap = s => s.name.toLowerCase().startsWith("wrap");
    const value = { sandwiches, wraps: cold.filter(isWrap), salads: cold.filter(s => !isWrap(s)) };
    await store.put("menu-extra", { at: Date.now(), value });
    return value;
  } catch {
    return hit ? hit.value : { sandwiches: [], wraps: [], salads: [] };  // offline: liever verouderd dan niets
  }
}

async function getMenu(resto, day) {
  const key = `menu:${resto}:${day}`;
  const hit = await store.get(key);
  if (hit && Date.now() - hit.at < MENU_TTL) return hit.value;
  const [y, m, d] = day.split("-").map(Number);
  try {
    const raw = await hydra(`menu/${RESTOS[resto]}/${y}/${m}/${d}.json`);
    const menu = raw ? tidyMenu(raw) : { open: false, soups: [], mains: [], sides: [] };
    menu.next = null;
    if (!menu.open) {  // weekend/gesloten: wijs de eerstvolgende dag met menu aan
      const days = (await hydra(`menu/${RESTOS[resto]}/overview.json`)) || [];
      menu.next = days.find(x => x.date > day && x.open && x.meals?.length)?.date ?? null;
    }
    Object.assign(menu, { resto, date: day, source: "hydra.ugent.be" });
    await store.put(key, { at: Date.now(), value: menu });
    return menu;
  } catch (e) {
    if (hit) return hit.value;
    throw e;
  }
}

// ---------- inloggen: de gebruiker logt zelf in op Ufora (UGent + MFA) in een gewoon tabblad ----------
const login = { state: "idle", timer: null };

async function startLogin() {
  if (login.state === "waiting") return;
  login.state = "waiting";
  try { await ext.tabs.create({ url: BASE + "/d2l/home" }); } catch { window.open(BASE + "/d2l/home", "_blank"); }
  const until = Date.now() + 10 * 60 * 1000;
  clearInterval(login.timer);
  login.timer = setInterval(async () => {
    if (await loggedIn()) { login.state = "ok"; clearInterval(login.timer); }
    else if (Date.now() > until) { login.state = "failed"; clearInterval(login.timer); }
  }, 2000);
}

// ---------- de "server": beantwoordt de /api/-aanvragen van de HGU-pagina ----------
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function handleApi(url, init = {}) {
  const u = new URL(url, "http://hgu.local");
  const useCache = u.searchParams.has("cache");
  const method = (init.method || "GET").toUpperCase();
  try {
    if (u.pathname === "/api/login") {
      if (method === "POST") await startLogin();
      return json(200, { state: login.state });
    }
    if (u.pathname.startsWith("/api/submit/")) {
      return json(403, { error: "Indienen staat uit in de extensie. Dien in op Ufora zelf." });
    }
    if (u.pathname === "/api/courses") return json(200, await cached("courses", getCourses, useCache));
    let m;
    if ((m = /^\/api\/course\/(\d+)$/.exec(u.pathname))) return json(200, await cached(`course-${m[1]}`, () => getCourse(+m[1]), useCache));
    if (u.pathname === "/api/assignments") return json(200, await cached("assignments", getAssignments, useCache));
    if (u.pathname === "/api/news") return json(200, await cached("news", getNews, useCache));
    if (u.pathname === "/api/menu") {
      const resto = u.searchParams.get("resto") || "sterre", day = u.searchParams.get("date") || ymd(new Date());
      if (!(resto in RESTOS) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return json(400, { error: "ongeldige resto of datum" });
      return json(200, { ...(await getMenu(resto, day)), ...(await getExtra()) });
    }
    return json(404, { error: "niet gevonden" });
  } catch (e) {
    if (e instanceof NotLoggedIn) return json(401, { error: "login" });
    if (e instanceof FormatError || e instanceof TypeError || e instanceof SyntaxError) {  // TypeError = ontbrekend veld in een antwoord
      console.error("HGU: onverwacht antwoord", e);
      return json(502, { error: "Ufora gaf een antwoord dat HGU niet begrijpt (" + (e instanceof FormatError ? e.message : "ontbrekend veld") + "). De Ufora-API is mogelijk gewijzigd. Controleer je gegevens op Ufora zelf en meld dit op GitHub." });
    }
    return json(502, { error: e.message || String(e) });
  }
}

/** Vind een topic in de (gecachete) vakinhoud, voor de bestandspagina. */
export async function findTopic(ou, topicId) {
  const course = (await store.get(`cache:course-${ou}`)) || (await cached(`course-${ou}`, () => getCourse(ou), false));
  const walk = mods => {
    for (const m of mods) {
      const t = m.topics.find(t => t.id === topicId) || walk(m.modules);
      if (t) return t;
    }
  };
  return walk(course.modules);
}

"use strict";
const app = document.getElementById("app");
const topbar = document.getElementById("top");
const state = { courses: null, course: {}, assignments: null, news: null, errors: {}, tab: load("tab") || "pinned" };
const UFORA = "https://ufora.ugent.be";
const NAME = window.CONFIG?.name || "";
const DAY = 864e5;

function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
function save(k, v) { try { localStorage.setItem(k, v); } catch {} }

// HGU met accounts: CSRF-token op elke schrijvende aanvraag; een verlopen HGU-sessie stuurt naar de loginpagina
// (een 401 met {"error":"login"} is iets anders: de Ufora-sessie van het account is verlopen)
const nativeFetch = window.fetch.bind(window);
let csrfToken = null;
const getCsrf = () => csrfToken ||= nativeFetch("/auth/me").then(r => r.json()).then(d => d.csrf || "");
window.fetch = async (url, opts = {}) => {
  if (!window.CONFIG?.auth) return nativeFetch(url, opts);
  if (opts.method && opts.method !== "GET") opts = { ...opts, headers: { ...opts.headers, "X-CSRF-Token": await getCsrf() } };
  const r = await nativeFetch(url, opts);
  if (r.status === 401 && (await r.clone().json().catch(() => ({}))).error === "auth") {
    location.assign("/login");
    await new Promise(() => {});
  }
  return r;
};

async function logout() {
  await fetch("/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  location.assign("/login");
}

// onderaan elke pagina: wie is ingelogd (ook op de telefoon, waar de navigatiebalk te krap is)
function renderFooter() {
  const foot = document.getElementById("foot");
  if (!foot || !window.CONFIG?.auth) return;
  foot.replaceChildren(h("span", {}, "Ingelogd als ", h("b", {}, window.CONFIG.user || "?")), " · ",
    h("a", { href: "/account" }, "Account"), " · ",
    h("button", { type: "button", class: "linklike", onclick: logout }, "Uitloggen"));
}

// zoals replaceChildren, maar slaat null over en maakt lijsten plat (net als h)
const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(k => k != null));

// URL-hook: de browserextensie (hgu-extension) zet window.HGU_URL om /file/, /dl/ en /u/ naar haar eigen bestandspagina te leiden
const asset = u => window.HGU_URL ? window.HGU_URL(u) : u;

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v != null) el.setAttribute(k, k === "href" || k === "src" ? asset(v) : v);
  }
  el.append(...kids.flat(Infinity).filter(k => k != null));
  return el;
}

function svg(markup, size = 16) {
  const s = h("span", { class: "icon", "aria-hidden": "true" });
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${markup}</svg>`;
  return s;
}
const ICON = {
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
};

const fmtDate = iso => iso ? new Date(iso).toLocaleDateString("nl-BE", { day: "numeric", month: "short" }) : "";
const fmtDue = iso => new Date(iso).toLocaleString("nl-BE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtLong = iso => new Date(iso).toLocaleString("nl-BE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const fmtNum = x => (+x).toLocaleString("nl-BE", { maximumFractionDigits: 2 });
const fmtSize = b => b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} kB` : `${(b / 1048576).toFixed(1)} MB`;
const ext = url => (url || "").split("?")[0].split(".").pop().toLowerCase();
const plain = html => new DOMParser().parseFromString((html || "").replace(/<br\s*\/?>|<\/(p|div|li)>/gi, " "), "text/html").body.textContent.replace(/\s+/g, " ").trim();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const PREVIEW = ["pdf", "png", "jpg", "jpeg", "gif", "svg", "webp", "txt", "html", "htm", "mp4", "webm", "mp3"];

const rtf = new Intl.RelativeTimeFormat("nl", { numeric: "auto" });
function ago(iso) {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  for (const [unit, size, max] of [["minute", 60, 60], ["hour", 3600, 24], ["day", 86400, 7], ["week", 604800, 5]])
    if (Math.abs(s) < size * max) return rtf.format(Math.round(s / size), unit);
  return fmtDate(iso);
}
// resterende tijd als [getal, eenheid], voor de grote cijfers op de tegels
function remaining(iso) {
  const ms = Date.parse(iso) - Date.now();
  if (ms < 3600e3) return [Math.max(1, Math.round(ms / 60e3)), "min"];
  if (ms < 2 * DAY) return [Math.round(ms / 3600e3), "uur"];
  const d = Math.round(ms / DAY);
  return [d, d === 1 ? "dag" : "dagen"];
}
const countdown = iso => "nog " + remaining(iso).join(" ");

// korte namen en vaste kleuren voor de vakken die je volgt (config.json); de rest krijgt een kleur via het id
const COURSES = window.CONFIG?.courses || {};
const label = ou => COURSES[ou]?.[0] || courseName(ou) || "Vak";
const colorOf = ou => `var(--c${COURSES[ou]?.[1] ?? ou % 10})`;
const tint = ou => `--chip:${colorOf(ou)}`;
const eyebrow = ou => h("div", { class: "eyebrow", style: tint(ou) }, label(ou));

// eerst cache (meteen), dan vers van Ufora (achtergrond); onData enkel als er iets veranderde
async function getJSON(url, onData) {
  let prev = null;
  for (const u of [url + "?cache=1", url]) {
    const r = await fetch(u);
    if (r.status === 401) throw new Error("login");
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
    const text = await r.text();
    if (text !== prev) onData(JSON.parse(text));
    prev = text;
  }
}

// ---------- inloggen bij Ufora (de gebruiker logt zelf in) ----------
let loginState = "idle"; // idle | waiting | ok | failed
let loginTimer = null;

function paintLogin() {
  const txt = { waiting: "Wacht op login… log in in het venster of tabblad dat opende.", ok: "Ingelogd.",
    failed: "Inloggen mislukt of afgebroken." }[loginState];
  for (const box of document.querySelectorAll(".loginbox"))
    fill(box, loginState === "waiting" || loginState === "ok" ? null : h("button", { class: "primary", type: "button", onclick: startLogin },
      loginState === "failed" ? "Opnieuw proberen" : "Inloggen bij Ufora"),
      txt ? h("span", { class: "login-status " + loginState, role: "status" }, txt) : null);
}

function setLogin(st) {
  const was = loginState;
  loginState = st;
  paintLogin();
  if (st === "waiting" && !loginTimer) loginTimer = setInterval(() => pollLogin(), 2000);
  if (st !== "waiting" && loginTimer) { clearInterval(loginTimer); loginTimer = null; }
  if (st === "ok" && was === "waiting") {  // sessie is vers: alles opnieuw laden
    state.errors = {}; started = false;
    setTimeout(() => { loginState = "idle"; route(); }, 1200);
  }
}

// fresh = eerste blik bij het tonen van de knop: een oud "mislukt" van een vorige poging tonen we niet
async function pollLogin(fresh) {
  try {
    const st = (await (await fetch("/api/login")).json()).state;
    setLogin(fresh && (st === "failed" || st === "ok") ? "idle" : st);
  } catch {}
}

async function startLogin() {
  setLogin("waiting");
  try {
    const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    setLogin((await r.json()).state);
  } catch { setLogin("failed"); }
}

function loginBox() {
  const box = h("div", { class: "loginbox" });
  queueMicrotask(() => { paintLogin(); if (loginState === "idle") pollLogin(true); });
  return box;
}

function message(err) {
  return err.message === "login"
    ? h("div", { class: "msg" }, h("p", {}, "Je Ufora-sessie is verlopen. Log opnieuw in op Ufora; er opent een venster of tabblad waarin je zelf inlogt."), loginBox())
    : h("div", { class: "msg" }, "Kon Ufora niet bereiken: " + err.message);
}

// placeholder zolang data laadt, of de fout als het misging
function pending(key, text = "Laden…") {
  return state.errors[key] ? message(state.errors[key]) : h("div", { class: "empty" }, text);
}

// HTML van Ufora (aankondigingen, opgaves, feedback) veilig en in onze stijl tonen
const DROP = "script,style,iframe,object,embed,form,link,meta,base,input,button,textarea,select";
const STRIP = ["style", "class", "id", "color", "bgcolor", "face", "size", "width", "height", "align", "border"];
function rich(html) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  doc.querySelectorAll(DROP).forEach(e => e.remove());
  for (const el of doc.body.querySelectorAll("*")) {
    for (const { name, value } of [...el.attributes])
      if (name.startsWith("on") || STRIP.includes(name) || /^\s*javascript:/i.test(value)) el.removeAttribute(name);
    const src = el.getAttribute("src") || "", href = el.getAttribute("href") || "";
    if (el.tagName === "IMG") {
      el.setAttribute("src", asset(src.startsWith("/content/") ? "/u" + src : src.startsWith("/") ? UFORA + src : src));
      el.setAttribute("loading", "lazy");
    }
    if (el.tagName === "A") {
      if (href.startsWith("/")) el.setAttribute("href", UFORA + href);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener");
    }
  }
  const div = h("div", { class: "rich" });
  div.append(...doc.body.childNodes);
  return div;
}

// bijlagen: bekijkbare bestanden openen in een nieuw tabblad, de rest downloaden
function fileList(items, base) {
  if (!items?.length) return null;
  return h("div", { class: "files" }, items.map(f => {
    const e = ext(f.name), view = PREVIEW.includes(e);
    const href = `${base(f)}?name=${encodeURIComponent(f.name)}${view ? "" : "&download=1"}`;
    return h("a", { class: "file", href, ...(view ? { target: "_blank" } : {}) },
      h("span", { class: "ext" }, e.slice(0, 4)),
      h("span", { class: "name" }, f.name),
      h("span", { class: "meta" }, fmtSize(f.size)),
      view ? null : svg(ICON.download));
  }));
}
const linkList = links => links?.length ? h("div", { class: "files" }, links.map(l =>
  h("a", { class: "file", href: l.href, target: "_blank", rel: "noopener" },
    h("span", { class: "ext" }, "link"), h("span", { class: "name" }, l.name), h("span", { class: "meta" }, "↗")))) : null;

// ---------- bouwstenen ----------
// sectiekop zoals op apple.com: vetgedrukt woord, daarna grijze toelichting
const headline = (bold, rest, extra) => h("div", { class: "headline" },
  h("h2", {}, bold + " ", rest ? h("span", {}, rest) : null), extra);

function pageHead(title, lead, above) {
  return h("header", { class: "pagehead" }, above, h("h1", {}, title), lead ? h("p", { class: "lead" }, lead) : null);
}

// segmented control; opties zijn [sleutel, tekst, badge] met een href of een onpick
function segmented(options, active, onpick) {
  return h("div", { class: "seg", role: "tablist" }, options.map(([k, text, badge, href]) =>
    h(href ? "a" : "button", { class: k === active ? "on" : "", role: "tab", href,
      onclick: href ? null : () => onpick(k) }, text, badge ? h("span", { class: "badge" }, badge) : null)));
}

// ---------- thema (Apple of HyGra) ----------
const isHygra = () => document.documentElement.dataset.theme === "hygra";
function setTheme(t) {
  if (t === "hygra") document.documentElement.dataset.theme = "hygra";
  else document.documentElement.removeAttribute("data-theme");
  save("theme", t);
  renderNav();
}
function themeSwitch() {
  const on = isHygra();
  return h("button", { class: "themesw", type: "button", role: "switch", "aria-checked": String(on),
    title: on ? "Terug naar het Apple-thema" : "Schakel naar het HyGra-thema", "aria-label": "HyGra-thema",
    onclick: () => setTheme(on ? "apple" : "hygra") },
    h("span", { class: "track" }, h("span", { class: "knob" })), h("span", { class: "lbl" }, "HyGra"));
}

// ---------- navigatie (doorschijnende balk bovenaan) ----------
function renderNav() {
  const active = app.dataset.nav;
  const todo = state.assignments?.filter(isTodo).length;
  const unread = state.news?.filter(n => shown(n) && isUnread(n)).length;
  const item = (href, key, text, count) => h("a", { class: key === active ? "on" : "", href }, text,
    count ? h("span", { class: "badge" }, count) : null);
  fill(topbar, h("div", { class: "navin" },
    h("a", { class: "brand", href: "#/", title: "HydrarGyrum Ufora" }, "Hg", h("span", {}, "Ufora")),
    h("nav", {},
      item("#/", "home", "Overzicht"),
      item("#/opdrachten", "opdrachten", "Opdrachten", todo),
      item("#/aankondigingen", "nieuws", "Aankondigingen", unread)),
    themeSwitch(),
    h("a", { class: "out", href: UFORA, target: "_blank" }, "Ufora ↗")));
}

// ---------- overzicht ----------
function greeting() {
  const hr = new Date().getHours();
  return hr < 6 ? "Goedenacht" : hr < 12 ? "Goedemorgen" : hr < 18 ? "Goedemiddag" : "Goedenavond";
}

function taskTile(a) {
  const [num, unit] = a.due ? remaining(a.due) : ["–", ""];
  const urgent = a.due && Date.parse(a.due) - Date.now() < 2 * DAY;
  return h("a", { class: "tile task" + (urgent ? " urgent" : ""), href: `#/opdracht/${a.ou}/${a.id}`, style: tint(a.ou) },
    eyebrow(a.ou),
    h("div", { class: "tile-title" }, a.name),
    h("div", { class: "tile-foot" },
      h("div", { class: "count" }, h("span", { class: "big" }, num), h("span", { class: "unit" }, unit)),
      h("div", { class: "when" }, a.due ? fmtDue(a.due) : "Geen deadline")));
}

// kruisje (alleen bij hover/focus): markeert als gelezen zonder te openen
function dismissBtn(n) {
  return h("button", { class: "dismiss", type: "button", title: "Markeer als gelezen", "aria-label": "Markeer als gelezen",
    onclick: ev => { ev.preventDefault(); ev.stopPropagation(); markSeen([n.id]); route(); } },
    svg('<path d="M6 6l12 12M18 6L6 18"/>', 14));
}

function newsTile(n) {
  return h("a", { class: "tile news-tile", href: `#/aankondigingen/${n.id}`, style: tint(n.ou) },
    h("div", { class: "eyebrow-row" }, eyebrow(n.ou), isUnread(n) ? h("span", { class: "dot" }) : null),
    h("div", { class: "tile-title" }, n.title),
    h("p", { class: "excerpt" }, plain(n.html)),
    h("div", { class: "when" }, ago(n.date)),
    isUnread(n) ? dismissBtn(n) : null);
}

function courseTile(c) {
  const todo = (state.assignments || []).filter(a => a.ou === c.id && isTodo(a)).length;
  const unread = (state.news || []).filter(n => n.ou === c.id && isUnread(n)).length;
  const facts = [todo ? plural(todo, "opdracht", "opdrachten") : null, unread ? `${unread} nieuw` : null].filter(Boolean);
  return h("a", { class: "tile course", href: `#/vak/${c.id}`, style: tint(c.id) },
    h("div", { class: "mono" }, COURSES[c.id]?.[0] || c.name.split(/\s+/).filter(w => w.length > 3).map(w => w[0]).join("").slice(0, 4)),
    h("div", { class: "course-name" }, c.name),
    facts.length ? h("div", { class: "when" }, facts.join(" · ")) : null);
}

function courseRow(c) {
  return h("a", { class: "row", href: `#/vak/${c.id}` },
    h("span", { class: "rtext" }, h("span", { class: "name" }, c.name)),
    h("span", { class: "chev" }, "›"));
}

// ---------- dagmenu (UGent-restaurants, via /api/menu) ----------
const RESTOS = [["sterre", "Sterre"], ["ardoyen", "Ardoyen"]];
const KIND = { vegan: "Vegan", vegetarian: "Vegetarisch", fish: "Vis", meat: "Vlees" };
const menuState = { resto: RESTOS.some(([k]) => k === load("resto")) ? load("resto") : "sterre", day: null, data: {}, errors: {}, full: false };
const menuKey = () => `${menuState.resto}|${menuState.day || ""}`;
const fmtDay = iso => new Date(iso + "T12:00").toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long" });

function loadMenu() {
  const key = menuKey();
  if (key in menuState.data) return;
  menuState.data[key] = null;
  const [resto, day] = key.split("|");
  fetch(`/api/menu?resto=${resto}` + (day ? `&date=${day}` : ""))
    .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)))
    .then(d => { menuState.data[key] = d; delete menuState.errors[key]; })
    .catch(e => { delete menuState.data[key]; menuState.errors[key] = e; })
    .finally(() => { if (app.dataset.nav === "home") renderHome(); });
}

function dish(d) {
  const veggie = d.kind === "vegan" || d.kind === "vegetarian";
  return h("div", { class: "dish" },
    h("span", { class: "dname" }, d.name),
    KIND[d.kind] ? h("span", { class: "pill " + (veggie ? "done" : "todo") }, KIND[d.kind]) : null);
}

// enkel de naam; een klik op de naam klapt de uitleg (ingrediënten/beschrijving) eronder open, nog een klik klapt hem dicht
function coldSec(title, items, detail) {
  return items?.length ? h("div", { class: "menu-sec" }, h("div", { class: "group" }, title),
    items.map(s => {
      const text = detail(s);
      if (!text) return h("div", { class: "dish" }, h("span", { class: "dname" }, s.name));
      const note = h("div", { class: "allergens", hidden: "" }, text);
      const btn = h("button", { class: "dname dish-toggle", type: "button", "aria-expanded": "false",
        onclick: () => { const open = note.hidden; note.hidden = !open; btn.setAttribute("aria-expanded", String(open)); } }, s.name);
      return h("div", { class: "dish" }, btn, note);
    })) : null;
}

function menuCard() {
  const key = menuKey(), m = menuState.data[key];
  if (menuState.errors[key]) return h("div", { class: "msg" }, "Kon het menu niet laden: " + menuState.errors[key].message);
  if (!m) return h("div", { class: "empty" }, "Laden…");
  const name = RESTOS.find(([k]) => k === m.resto)[1];
  if (!m.open)
    return h("div", { class: "menu" }, h("div", { class: "menu-empty" },
      `${name} heeft op ${fmtDay(m.date)} geen menu (gesloten).`,
      m.next ? h("button", { class: "more-link", type: "button", onclick: () => { menuState.day = m.next; renderHome(); } },
        `Bekijk ${fmtDay(m.next)} ›`) : null));
  // zonder prijs = opmerking (bv. ‘extra gerechten in de toonbank’), geen gerecht; prijzen zelf tonen we niet
  const warm = m.mains.filter(d => d.price), extra = m.mains.filter(d => !d.price);
  const full = h("details", { class: "menu-full", open: menuState.full ? "" : null,
    ontoggle: ev => { menuState.full = ev.target.open; } },
    h("summary", {}, h("span", {}, "Volledig menu"), h("span", { class: "meta" }, "groenten, broodjes, wraps, salades")),
    h("div", { class: "body" },
      m.sides.length ? h("div", { class: "menu-sec" }, h("div", { class: "group" }, "Groenten en bijgerechten"),
        m.sides.map(d => h("div", { class: "dish" }, h("span", { class: "dname" }, d.name),
          KIND[d.kind] ? h("span", { class: "pill " + (d.kind === "meat" || d.kind === "fish" ? "todo" : "done") }, KIND[d.kind]) : null))) : null,
      coldSec("Broodjes", m.sandwiches, s => s.ingredients?.join(", ")),
      coldSec("Wraps", m.wraps, s => s.description),
      coldSec("Salades en bowls", m.salads, s => s.description),
      extra.map(d => h("div", { class: "allergens" }, d.name + ".")),
      h("div", { class: "allergens" }, "Bron: Hydra (hydra.ugent.be); broodjes, wraps en salades zijn voor alle resto's gelijk")));
  return h("div", { class: "menu" },
    m.soups.length ? h("div", { class: "menu-sec" }, h("div", { class: "group" }, "Soep"),
      m.soups.map(s => h("div", { class: "dish" }, h("span", { class: "dname" }, s.name)))) : null,
    warm.length ? h("div", { class: "menu-sec" }, h("div", { class: "group" }, "Warm"), warm.map(dish)) : null,
    full);
}

function menuBlock() {
  loadMenu();
  const m = menuState.data[menuKey()];
  const sw = segmented(RESTOS, menuState.resto, k => {
    menuState.resto = k; menuState.day = null; save("resto", k); renderHome();
  });
  return h("section", { class: "block" },
    headline("Dagmenu.", m ? fmtDay(m.date) : "Wat er vandaag te eten is.", sw), menuCard());
}

function renderHome() {
  const cs = state.courses;
  const todo = (state.assignments || []).filter(isTodo);
  const shownNews = (state.news || []).filter(shown);
  const fresh = shownNews.filter(isUnread);

  const parts = [todo.length ? plural(todo.length, "opdracht te doen", "opdrachten te doen") : null,
    fresh.length ? plural(fresh.length, "nieuwe aankondiging", "nieuwe aankondigingen") : null].filter(Boolean);
  const lead = !state.assignments || !state.news ? "Even kijken wat er nieuw is…"
    : parts.length ? `Je hebt ${parts.join(" en ")}.` : "Alles is bij. Niets in te dienen, niets te lezen.";

  let courses;
  if (!cs) courses = pending("courses");
  else if (state.tab === "pinned") {
    const pinned = cs.filter(c => c.pinned).sort((a, b) => a.name.localeCompare(b.name));
    courses = pinned.length ? h("div", { class: "grid courses" }, pinned.map(courseTile))
      : h("div", { class: "empty" }, "Geen vastgepinde vakken.");
  } else {
    const years = [...new Set(cs.map(c => c.year))].sort((a, b) => (b ?? -1) - (a ?? -1));
    courses = years.map(y => [
      h("div", { class: "group" }, y ? `${y}–${y + 1}` : "Overig"),
      h("div", { class: "inset" }, cs.filter(c => c.year === y).sort((a, b) => a.name.localeCompare(b.name)).map(courseRow)),
    ]);
  }

  // enkel secties die iets te melden hebben; zonder opdrachten of nieuws staan de vakken bovenaan
  fill(app,
    pageHead(NAME ? `${greeting()}, ${NAME}.` : `${greeting()}.`, lead),
    state.errors.assignments ? message(state.errors.assignments) : null,
    todo.length ? h("section", { class: "block" },
      headline("Te doen.", "Wat er binnenkort binnen moet.", h("a", { class: "more-link", href: "#/opdrachten" }, "Alle opdrachten ›")),
      h("div", { class: "grid tasks" }, todo.map(taskTile))) : null,
    fresh.length ? h("section", { class: "block" },
      headline("Nieuw.", "Aankondigingen die je nog niet las.",
        h("a", { class: "more-link", href: "#/aankondigingen" }, "Alle aankondigingen ›")),
      h("div", { class: "grid news-grid" }, fresh.slice(0, 6).map(newsTile))) : null,
    h("section", { class: "block" },
      headline("Vakken.", state.tab === "pinned" ? "Je vastgepinde vakken." : "Alles waarvoor je ingeschreven bent.",
        segmented([["pinned", "Vastgepind"], ["all", "Alle"]], state.tab, k => { state.tab = k; save("tab", k); renderHome(); })),
      courses),
    menuBlock());
}

// ---------- opdrachten ----------
const closed = a => a.end && Date.now() > Date.parse(a.end);
const pastDue = a => a.due && Date.now() > Date.parse(a.due);
const isTodo = a => !a.submissions.length && !closed(a) && !pastDue(a);

function status(a) {
  const fb = a.feedback;
  if (fb && fb.score != null) return ["graded", fmtNum(fb.score) + (a.outOf ? ` / ${fmtNum(a.outOf)}` : "")];
  if (fb && (fb.symbol || fb.html)) return ["graded", fb.symbol || "Feedback"];
  if (a.submissions.length) return ["done", "Ingediend"];
  if (closed(a)) return ["missed", "Gesloten"];
  if (pastDue(a)) return ["missed", "Niet ingediend"];
  if (!a.due) return ["todo", "Open"];
  return [Date.parse(a.due) - Date.now() < 2 * DAY ? "todo urgent" : "todo", countdown(a.due)];
}

function assignmentRow(a, withCourse = true) {
  const [kind, text] = status(a);
  const sub = [withCourse ? label(a.ou) : null, a.due ? fmtDue(a.due) : "Geen deadline"].filter(Boolean).join(" · ");
  return h("a", { class: "row", href: `#/opdracht/${a.ou}/${a.id}`, style: tint(a.ou) },
    h("span", { class: "swatch" }),
    h("span", { class: "rtext" }, h("span", { class: "name" }, a.name), h("span", { class: "sub" }, sub)),
    h("span", { class: `pill ${kind}` }, text),
    h("span", { class: "chev" }, "›"));
}

function assignmentLists(items, withCourse) {
  const open = items.filter(a => !pastDue(a) && !closed(a));
  const past = items.filter(a => pastDue(a) || closed(a)).reverse();
  return [
    h("div", { class: "group" }, "Open"),
    open.length ? h("div", { class: "inset" }, open.map(a => assignmentRow(a, withCourse)))
      : h("div", { class: "inset" }, h("div", { class: "empty" }, "Geen openstaande opdrachten.")),
    past.length ? [h("div", { class: "group" }, "Afgelopen"),
      h("div", { class: "inset" }, past.map(a => assignmentRow(a, withCourse)))] : null,
  ];
}

function renderAssignments() {
  const items = state.assignments;
  const todo = items?.filter(isTodo).length;
  fill(app,
    pageHead("Opdrachten.", !items ? null : todo ? `${plural(todo, "opdracht", "opdrachten")} nog in te dienen.` : "Alles is ingediend."),
    !items ? pending("assignments") : items.length ? assignmentLists(items, true)
      : h("div", { class: "empty" }, "Geen opdrachten dit jaar."));
}

// bestanden die klaarstaan om in te dienen; blijven bewaard als de pagina hertekent
const uploads = {};

function renderAssignment(ou, fid) {
  const a = state.assignments?.find(a => a.ou === ou && a.id === fid);
  app.dataset.view = `opd${ou}/${fid}`;
  const back = h("a", { class: "back", href: "#/opdrachten" }, "‹ Opdrachten");
  if (!a) return fill(app, back,
    state.assignments ? h("div", { class: "empty" }, "Opdracht niet gevonden.") : pending("assignments"));
  const [kind, text] = status(a);
  const fb = a.feedback;
  const subs = [...a.submissions].sort((x, y) => y.date.localeCompare(x.date));
  const dbase = `/dl/${ou}/dropbox/folders/${fid}`;
  const extra = state.course[ou] && courseFiles(a, state.course[ou]);
  fill(app,
    back,
    pageHead(a.name, null, h("a", { href: `#/vak/${ou}/opdrachten` }, eyebrow(ou))),
    h("div", { class: "facts" },
      h("span", {}, a.due ? ["Deadline ", h("strong", {}, fmtLong(a.due))] : "Geen deadline"),
      h("span", { class: `pill ${kind}` }, text),
      a.group ? h("span", {}, "Groepsopdracht") : null,
      h("a", { class: "more-link", href: `${UFORA}/d2l/lms/dropbox/user/folder_submit_files.d2l?db=${fid}&ou=${ou}`, target: "_blank" }, "Op Ufora ↗")),

    fb ? h("section", { class: "card grade" },
      h("div", { class: "grade-top" },
        h("div", {}, h("div", { class: "cardhead" }, "Beoordeling"), fb.html ? rich(fb.html) : null),
        fb.score != null ? h("div", { class: "score" }, fmtNum(fb.score), a.outOf ? h("small", {}, `/${fmtNum(a.outOf)}`) : null) : null),
      fileList(fb.files, f => `${dbase}/feedback/${fb.entity}/attachments/${f.id}`),
      linkList(fb.links)) : null,

    a.instructions || a.attachments.length || a.links.length || extra ? h("section", { class: "card" },
      h("div", { class: "cardhead" }, "Opgave"),
      a.instructions ? rich(a.instructions) : null,
      fileList(a.attachments, f => `${dbase}/attachments/${f.id}`),
      linkList(a.links),
      extra ? courseFileList(ou, extra) : null) : null,

    submitBox(a),

    h("section", { class: "card" },
      h("div", { class: "cardhead" }, subs.length ? `Jouw inzendingen (${subs.length})` : "Jouw inzendingen"),
      subs.length ? subs.map(s => h("div", { class: "sub-item" },
        h("div", { class: "subhead" }, fmtLong(s.date),
          a.due && s.date > a.due ? h("span", { class: "pill missed" }, "te laat") : null),
        s.comment ? rich(s.comment) : null,
        fileList(s.files, f => `${dbase}/submissions/${s.id}/files/${f.id}`)))
        : h("div", { class: "empty flush" }, "Nog niets ingediend.")));
}

// bestanden uit de vakinhoud die bij een opdracht horen. Enkel zekere koppelingen, nooit gokken:
// 1) de map waarin de docent de opdracht zelf zette (en geen andere opdracht), of anders
// 2) één map met exact dezelfde titel na de dubbele punt én hetzelfde nummer
//    ("Week 01: Ridge and Lasso" ↔ "Practical 1: Ridge and Lasso")
function courseFiles(a, course) {
  const all = [];
  const walk = (mods, path) => mods.forEach(m => { all.push({ m, path: [...path, m.title] }); walk(m.modules, [...path, m.title]); });
  walk(course.modules, []);
  let hit = all.find(({ m }) => {
    const ids = m.topics.filter(t => t.dropbox).map(t => t.dropbox);
    return ids.includes(a.id) && ids.every(id => id === a.id);
  });
  if (!hit) {
    const key = title => {
      const i = title.indexOf(":");
      if (i < 0) return null;
      const num = title.slice(0, i).match(/\d+/);
      const rest = title.slice(i + 1).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      return num && rest.length >= 6 ? `${+num[0]}|${rest}` : null;
    };
    const k = key(a.name);
    const same = k ? all.filter(({ m }) => key(m.title) === k) : [];
    if (same.length === 1) hit = same[0];
  }
  if (!hit) return null;
  // bestanden en externe links; geen snelkoppelingen naar Ufora-tools (opdracht, forum, …)
  const topics = [];
  const collect = m => { topics.push(...m.topics.filter(t => t.type === "File" || (t.type === "Link" && !t.url?.startsWith("/d2l/")))); m.modules.forEach(collect); };
  collect(hit.m);
  return topics.length ? { path: hit.path, topics } : null;
}

function courseFileList(ou, { path, topics }) {
  return [
    h("div", { class: "files-from" }, "Uit de vakinhoud: ", h("a", { href: `#/vak/${ou}` }, path.join(" › "))),
    h("div", { class: "files" }, topics.map(t => {
      const e = ext(t.url), link = t.type === "Link", view = PREVIEW.includes(e);
      const attrs = link ? { href: t.url, target: "_blank", rel: "noopener" }
        : view ? { href: `#/vak/${ou}/${t.id}`, onclick: () => { viewerBack = location.hash; } }
        : { href: `/file/${ou}/${t.id}?download=1` };
      return h("a", { class: "file", ...attrs },
        h("span", { class: "ext" }, link ? "link" : e.slice(0, 4)),
        h("span", { class: "name" }, t.title),
        h("span", { class: "meta" }, link ? "↗" : fmtDate(t.modified)),
        link || view ? null : svg(ICON.download));
    })),
  ];
}

function submitBox(a) {
  const key = `${a.ou}/${a.id}`;
  const p = uploads[key] ||= { files: [], comment: "", confirm: false, busy: false, msg: null };
  const box = h("section", { class: "card submit" });
  if (closed(a)) return fill(box, h("div", { class: "cardhead" }, "Indienen"),
    h("div", { class: "empty flush" }, "Deze opdracht is gesloten; indienen kan niet meer.")), box;
  const paint = () => {
    const input = h("input", { type: "file", multiple: "", hidden: "", onchange: e => add(e.target.files) });
    const zone = h("label", { class: "drop" + (p.busy ? " busy" : "") }, input,
      h("span", { class: "drop-icon" }, svg(ICON.upload, 22)),
      h("strong", {}, "Sleep je bestanden hierheen"), h("span", { class: "sub" }, "of klik om te kiezen"));
    zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("over"));
    zone.addEventListener("drop", e => { e.preventDefault(); e.stopPropagation(); add(e.dataTransfer.files); });
    const n = p.files.length;
    const btn = h("button", { class: "primary" + (p.confirm ? " confirm" : ""), disabled: !n || p.busy ? "" : null,
      onclick: () => {
        if (!p.confirm) { p.confirm = true; paint(); clearTimeout(p.timer); p.timer = setTimeout(() => { p.confirm = false; paint(); }, 8000); }
        else send(a, p);
      } },
      p.busy ? "Bezig met indienen…" : p.confirm ? `Ja, dien ${n === 1 ? "het bestand" : `${n} bestanden`} in`
        : n ? `Indienen (${plural(n, "bestand", "bestanden")})` : "Indienen");
    fill(box,
      h("div", { class: "cardhead" }, a.submissions.length ? "Opnieuw indienen" : "Indienen"),
      pastDue(a) ? h("div", { class: "note" }, "De deadline is voorbij: Ufora markeert een nieuwe inzending als te laat.") : null,
      zone,
      n ? h("div", { class: "files" }, p.files.map((f, i) => h("div", { class: "file" },
        h("span", { class: "ext" }, ext(f.name).slice(0, 4)),
        h("span", { class: "name" }, f.name),
        h("span", { class: "meta" }, fmtSize(f.size)),
        p.busy ? null : h("button", { class: "x", title: "Verwijderen", onclick: () => { p.files.splice(i, 1); p.confirm = false; paint(); } }, "×")))) : null,
      h("textarea", { placeholder: "Opmerking voor de lesgever (optioneel)", rows: 2, disabled: p.busy ? "" : null,
        oninput: e => { p.comment = e.target.value; } }, p.comment),
      h("div", { class: "actions" },
        p.confirm && !p.busy ? h("button", { class: "link", onclick: () => { p.confirm = false; paint(); } }, "Annuleren") : null,
        btn),
      p.msg ? h("div", { class: `result ${p.msg[0]}`, role: "status" }, p.msg[1], p.msg[2] === "login" ? loginBox() : null) : null);
  };
  const add = list => {
    if (p.busy) return;
    for (const f of list) if (!p.files.some(x => x.name === f.name && x.size === f.size)) p.files.push(f);
    p.confirm = false; p.msg = null;
    paint();
  };
  box.addFiles = add;
  paint();
  return box;
}

const toBase64 = file => new Promise((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(r.result.split(",")[1]);
  r.onerror = () => fail(r.error);
  r.readAsDataURL(file);
});

async function send(a, p) {
  clearTimeout(p.timer);
  p.busy = true; p.confirm = false; p.msg = null;
  route();
  const sent = [...p.files];
  try {
    const files = await Promise.all(sent.map(async f => ({ name: f.name, type: f.type, data: await toBase64(f) })));
    const r = await fetch(`/api/submit/${a.ou}/${a.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: p.comment, files }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error === "login" ? "Je Ufora-sessie is verlopen. Log opnieuw in en probeer nog eens." : d.error || `fout ${r.status}`), { login: d.error === "login" });
    // controleren wat Ufora echt ontving
    const latest = [...d.submissions].sort((x, y) => y.date.localeCompare(x.date))[0];
    const got = latest ? latest.files.map(f => f.name) : [];
    const missing = sent.filter(f => !got.includes(f.name));
    p.files = missing; p.comment = "";
    p.msg = missing.length
      ? ["warn", `Ufora ontving ${sent.length - missing.length} van de ${sent.length} bestanden. De ontbrekende staan nog klaar: dien ze opnieuw in.`]
      : ["ok", `Ingediend om ${new Date(latest.date).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}. `
        + `Ufora ontving ${sent.length === 1 ? "je bestand" : `alle ${sent.length} bestanden`}.`];
    state.assignments = state.assignments.map(x => x.ou === d.ou && x.id === d.id ? d : x);
  } catch (e) {
    p.msg = ["err", "Niet ingediend: " + e.message, e.login ? "login" : null];
  }
  p.busy = false;
  route();
}

// bestanden overal op de opdrachtpagina kunnen neerzetten
window.addEventListener("dragover", e => { if (app.dataset.view?.startsWith("opd")) e.preventDefault(); });
window.addEventListener("drop", e => {
  if (!app.dataset.view?.startsWith("opd")) return;
  e.preventDefault();
  app.querySelector(".submit")?.addFiles?.(e.dataTransfer.files);
});

// ---------- aankondigingen ----------
// gelezen = gezien op het scherm; alles ouder dan het eerste gebruik telt als gelezen
const seen = new Set(JSON.parse(load("seenNews") || "[]"));
const baseline = load("newsBaseline") || (() => { const b = new Date(Date.now() - 7 * DAY).toISOString(); save("newsBaseline", b); return b; })();
const hidden = new Set(JSON.parse(load("hiddenNews") || "[]"));
const isUnread = n => n.date > baseline && !seen.has(n.id);
const shown = n => !hidden.has(n.ou);
let query = "", filtersOpen = false;

function markSeen(ids) {
  ids.forEach(id => seen.add(id));
  save("seenNews", JSON.stringify([...seen].slice(-3000)));
  renderNav();
}

function dayGroup(iso) {
  const d = new Date(iso), today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.floor((today - new Date(d).setHours(0, 0, 0, 0)) / DAY);
  if (days <= 0) return "Vandaag";
  if (days === 1) return "Gisteren";
  if (days < 7) return "Deze week";
  return d.toLocaleDateString("nl-BE", { month: "long", year: "numeric" });
}

// kaartjes worden 'gelezen' zodra ze ruim een seconde in beeld staan
const seenObserver = new IntersectionObserver(entries => {
  for (const e of entries) {
    const el = e.target;
    clearTimeout(el.seenTimer);
    if (e.isIntersecting) el.seenTimer = setTimeout(() => {
      el.classList.remove("unread");
      seenObserver.unobserve(el);
      markSeen([+el.dataset.id]);
    }, 1200);
  }
}, { threshold: 0.6 });

function newsCard(n, withCourse) {
  const unread = isUnread(n);
  const card = h("article", { class: "news" + (unread ? " unread" : ""), "data-id": n.id, id: `n${n.id}`, style: tint(n.ou) },
    h("div", { class: "nhead" }, withCourse ? eyebrow(n.ou) : null,
      h("span", { class: "meta", title: fmtLong(n.date) }, ago(n.date)),
      n.pinned ? h("span", { class: "meta" }, "· vastgepind") : null),
    h("h3", {}, h("span", { class: "dot" }), n.title),
    h("div", { class: "clamp" }, rich(n.html)),
    fileList(n.attachments, f => `/dl/${n.ou}/news/${n.id}/attachments/${f.id}`));
  if (unread) { card.append(dismissBtn(n)); seenObserver.observe(card); }
  return card;
}

function newsFeed(items, withCourse) {
  if (!items.length) return h("div", { class: "empty" }, query ? "Niets gevonden." : "Geen aankondigingen.");
  let group = null;
  return h("div", { class: "feed" }, items.map(n => {
    const g = dayGroup(n.date);
    const head = g !== group ? h("div", { class: "group" }, (group = g)) : null;
    return [head, newsCard(n, withCourse)];
  }));
}

// na het tekenen: lange berichten inkorten met een 'Meer'-knop
function clampLong() {
  for (const c of app.querySelectorAll(".clamp:not(.done)")) {
    c.classList.add("done");
    if (c.scrollHeight > c.clientHeight + 24)
      c.after(h("button", { class: "more", onclick: e => { c.classList.add("open"); e.target.remove(); } }, "Lees meer"));
    else c.classList.add("open");
  }
}

function matches(n) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (n.title + " " + plain(n.html) + " " + label(n.ou)).toLowerCase().includes(q);
}

function renderNews(focusId) {
  const all = state.news;
  if (!all) return fill(app, pageHead("Aankondigingen."), pending("news"));
  const sources = [...new Set(all.map(n => n.ou))]
    .sort((a, b) => (COURSES[a] ? 0 : 1) - (COURSES[b] ? 0 : 1) || label(a).localeCompare(label(b)));
  const unread = all.filter(n => shown(n) && isUnread(n));
  const chips = h("div", { class: "chips" }, sources.map(ou => {
    const count = all.filter(n => n.ou === ou && isUnread(n)).length;
    return h("button", { class: "filter" + (hidden.has(ou) ? " off" : ""), style: tint(ou),
      title: hidden.has(ou) ? "Verborgen: klik om te tonen" : "Klik om te verbergen",
      onclick: () => { hidden.has(ou) ? hidden.delete(ou) : hidden.add(ou); save("hiddenNews", JSON.stringify([...hidden])); renderNews(); renderNav(); } },
      label(ou), count ? h("span", { class: "count" }, count) : null);
  }));
  const search = h("label", { class: "search" }, svg(ICON.search),
    h("input", { type: "search", placeholder: "Zoeken in aankondigingen", value: query,
      oninput: e => { query = e.target.value; fill(app.querySelector("#feed"), newsFeed(all.filter(n => shown(n) && matches(n)), true)); clampLong(); } }));
  // zoeken en filters enkel op vraag; de knop toont wel of er iets verborgen is
  const open = filtersOpen || query;
  const toggle = h("button", { class: "link", "aria-expanded": open ? "true" : "false",
    onclick: () => { filtersOpen = !open; if (!filtersOpen) query = ""; renderNews(); if (filtersOpen) app.querySelector(".search input").focus(); } },
    open ? "Verbergen" : hidden.size ? `Filter · ${hidden.size} verborgen` : "Zoeken & filteren");
  fill(app,
    pageHead("Aankondigingen.", unread.length ? `${plural(unread.length, "nieuw bericht", "nieuwe berichten")}.` : "Je bent helemaal bij."),
    h("div", { class: "toolbar" }, toggle,
      unread.length ? h("button", { class: "link", onclick: () => { markSeen(unread.map(n => n.id)); renderNews(); } }, "Alles gelezen") : null),
    open ? h("div", { class: "filters" }, search, chips) : null,
    h("div", { id: "feed" }, newsFeed(all.filter(n => shown(n) && matches(n)), true)));
  clampLong();
  if (focusId) {
    const el = document.getElementById(`n${focusId}`);
    if (el) {
      el.querySelector(".clamp").classList.add("open");
      el.querySelector(".more")?.remove();
      el.classList.add("focus");
      el.scrollIntoView({ block: "start" });
    }
  }
}

// ---------- vakpagina: inhoud ----------
function topicRow(ou, t) {
  const e = ext(t.url);
  const attrs = t.type === "File" ? { href: `#/vak/${ou}/${t.id}` }
    : t.dropbox ? { href: `#/opdracht/${ou}/${t.dropbox}` }
    : t.type === "Link" ? { href: t.url?.startsWith("/") ? UFORA + t.url : t.url, target: "_blank", rel: "noopener" }
    : { href: `https://ufora.ugent.be/d2l/le/content/${ou}/viewContent/${t.id}/View`, target: "_blank" };
  if (t.type === "File" && !PREVIEW.includes(e))
    attrs.onclick = ev => { ev.preventDefault(); rowError(ev.currentTarget, "Kan niet geopend worden"); };
  return h("a", { class: "row", ...attrs },
    h("span", { class: "ext" }, t.dropbox ? "opdr" : t.type === "Link" ? "link" : e.slice(0, 4)),
    h("span", { class: "name" }, t.title),
    t.type === "File" ? downloadBtn(`/file/${ou}/${t.id}?download=1`) : null,
    h("span", { class: "grow" }),
    t.unread ? h("span", { class: "dot", title: "Nieuw" }) : null,
    h("span", { class: "meta" }, fmtDate(t.modified)));
}

// uitleg van de docent bij een map of item (Ufora-"beschrijving"), onder de rij zelf
const descEl = html => html ? h("div", { class: "desc" }, rich(html)) : null;

// korte rode melding in de rij zelf, net naast de downloadknop; verdwijnt vanzelf
function rowError(row, text) {
  let el = row.querySelector(".err");
  if (!el) row.querySelector(".grow").before(el = h("span", { class: "err", role: "status" }));
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(el.timer);
  el.timer = setTimeout(() => el.classList.remove("show"), 1800);
}

// downloadknop binnen een rij-link: verschijnt bij hover (CSS), opent het bestand niet
function downloadBtn(href) {
  return h("button", { class: "dl", title: "Download", "aria-label": "Download", onclick: ev => {
    ev.preventDefault();
    ev.stopPropagation();
    h("a", { href, download: "" }).click();
  } }, svg(ICON.download));
}

// standaard dichtgeklapt; open mappen blijven bewaard zolang dit tabblad openstaat
// (sessionStorage), ook als je naar een ander vak of de viewer gaat en terugkeert
function openSet(ou) {
  try { return new Set(JSON.parse(sessionStorage.getItem(`open-${ou}`)) || []); } catch { return new Set(); }
}

function moduleEl(ou, m, opened, path = m.title, nested = false) {
  const count = m.topics.length + m.modules.length;
  const el = h("details", { class: nested ? "sub-mod" : "mod", ...(opened.has(path) ? { open: "" } : {}) },
    h("summary", {}, h("span", {}, m.title), h("span", { class: "meta" }, count ? plural(count, "item", "items") : "leeg")),
    h("div", { class: "body" },
      descEl(m.desc),
      count ? [m.topics.map(t => [topicRow(ou, t), descEl(t.desc)]), m.modules.map(sub => moduleEl(ou, sub, opened, path + "/" + sub.title, true))]
        : m.desc ? null : h("div", { class: "empty" }, "Leeg")));
  el.addEventListener("toggle", () => {
    const s = openSet(ou);
    el.open ? s.add(path) : s.delete(path);
    try { sessionStorage.setItem(`open-${ou}`, JSON.stringify([...s])); } catch {}
  });
  return el;
}

function courseName(ou) {
  return state.courses?.find(c => c.id === ou)?.name || "";
}

function renderCourse(ou, tab) {
  const data = state.course[ou];
  const opened = openSet(ou);
  const tasks = (state.assignments || []).filter(a => a.ou === ou);
  const news = (state.news || []).filter(n => n.ou === ou);
  const unread = news.filter(isUnread).length;
  const todo = tasks.filter(isTodo).length;
  const tabs = tasks.length || news.length ? segmented([
    ["", "Inhoud", null, `#/vak/${ou}`],
    tasks.length ? ["opdrachten", "Opdrachten", todo, `#/vak/${ou}/opdrachten`] : null,
    news.length ? ["aankondigingen", "Aankondigingen", unread, `#/vak/${ou}/aankondigingen`] : null,
  ].filter(Boolean), tab || "") : null;
  let body;
  if (tab === "opdrachten") body = assignmentLists(tasks, false);
  else if (tab === "aankondigingen") body = newsFeed(news, false);
  else body = !data ? h("div", { class: "empty" }, "Laden…")
    : data.modules.length ? h("div", { class: "mods" }, data.modules.map(m => moduleEl(ou, m, opened)))
    : h("div", { class: "empty" }, "Nog geen inhoud.");
  fill(app,
    h("a", { class: "back", href: "#/" }, "‹ Overzicht"),
    pageHead(courseName(ou), null, COURSES[ou] ? eyebrow(ou) : null),
    h("div", { class: "course-bar" }, tabs, h("a", { class: "more-link", href: `${UFORA}/d2l/home/${ou}`, target: "_blank" }, "Op Ufora ↗")),
    body);
  clampLong();
}

// ---------- viewer ----------
function findTopic(mods, id) {
  for (const m of mods) {
    const t = m.topics.find(t => t.id === id) || findTopic(m.modules, id);
    if (t) return t;
  }
}

// geopend vanuit een opdracht? dan brengt ‹ je daar terug in plaats van naar het vak
let viewerBack = null;

function renderViewer(ou, tid) {
  const t = state.course[ou] && findTopic(state.course[ou].modules, tid);
  if (app.dataset.view === `file${tid}` && t) return; // iframe niet herladen bij verse data
  app.dataset.view = t ? `file${tid}` : "";
  const src = `/file/${ou}/${tid}`;
  const canPreview = t && PREVIEW.includes(ext(t.url));
  fill(app,
    h("div", { class: "bar" },
      viewerBack ? h("a", { class: "back", href: viewerBack }, "‹ Opdracht")
        : h("a", { class: "back", href: `#/vak/${ou}` }, "‹ " + (COURSES[ou]?.[0] || courseName(ou) || "Terug")),
      h("span", { class: "title" }, t ? t.title : ""),
      h("a", { class: "btn", href: src, target: "_blank" }, "Nieuw tabblad"),
      h("a", { class: "btn primary-sm", href: src + "?download=1" }, "Download")),
    !t ? h("div", { class: "nopreview" }, "Laden…")
      : canPreview ? h("iframe", { class: "viewer", src, title: t.title })
      : h("div", { class: "nopreview" }, `.${ext(t.url)} kan niet in de browser getoond worden. `,
          h("a", { href: src + "?download=1" }, "Download")));
}

// ---------- routing ----------
function loadAll() {
  getJSON("/api/courses", d => { state.courses = d; route(); }).catch(showErr);
  // opdrachten en aankondigingen apart: een fout daar mag de rest niet blokkeren
  for (const [key, url] of [["assignments", "/api/assignments"], ["news", "/api/news"]])
    getJSON(url, d => { state[key] = d; delete state.errors[key]; route(); })
      .catch(e => { state.errors[key] = e; route(); });
}
let started = false;

function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (!started) { started = true; loadAll(); }
  // niet hertekenen terwijl je in een formulier typt (bv. het zoekveld of de opmerking)
  const typing = document.activeElement?.matches?.("textarea, .search input");
  const viewer = parts[0] === "vak" && /^\d+$/.test(parts[2] || "");
  document.body.classList.toggle("viewing", viewer);
  app.classList.toggle("wide", viewer);
  try {
    if (parts[0] === "vak") {
      const ou = +parts[1], sub = parts[2];
      app.dataset.nav = "";
      const draw = () => viewer ? renderViewer(ou, +sub) : (app.dataset.view = "", renderCourse(ou, sub));
      if (!(ou in state.course)) {
        state.course[ou] = null;
        getJSON(`/api/course/${ou}`, d => { state.course[ou] = d; if (location.hash.startsWith(`#/vak/${ou}`)) draw(); }).catch(showErr);
      }
      draw();
    } else if (!(typing && app.dataset.route === location.hash)) {
      app.dataset.route = location.hash;
      if (parts[0] === "opdracht") {
        const ou = +parts[1];
        app.dataset.nav = "opdrachten";
        // vakinhoud erbij voor de bestanden van de opdracht; mislukt dat, dan gewoon zonder
        if (!(ou in state.course)) {
          state.course[ou] = null;
          getJSON(`/api/course/${ou}`, d => { state.course[ou] = d; if (location.hash.startsWith(`#/opdracht/${ou}/`)) route(); })
            .catch(() => {});
        }
        renderAssignment(ou, +parts[2]);
      }
      else {
        app.dataset.view = "";
        if (parts[0] === "opdrachten") { app.dataset.nav = "opdrachten"; renderAssignments(); }
        else if (parts[0] === "aankondigingen") { app.dataset.nav = "nieuws"; renderNews(parts[1] && +parts[1]); }
        else { app.dataset.nav = "home"; renderHome(); }
      }
    }
  } catch (e) { showErr(e); }
  renderNav();
}

function showErr(e) {
  if (app.querySelector(".row, .tile, iframe")) return; // er staat al (gecachete) inhoud
  fill(app, pageHead("HydrarGyrum Ufora."), message(e));
}

window.addEventListener("hashchange", () => {
  if (!/^#\/vak\/\d+\/\d+/.test(location.hash)) viewerBack = null;
  window.scrollTo(0, 0);
  route();
  // korte intro-animatie enkel bij navigeren, niet bij elke verse data
  app.classList.remove("enter"); void app.offsetWidth; app.classList.add("enter");
  setTimeout(() => app.classList.remove("enter"), 700);
});
route();
app.classList.add("enter");
setTimeout(() => app.classList.remove("enter"), 700);
renderFooter();

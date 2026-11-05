// Synchronisatie en instellingen. Bestanden van je vakken gaan naar een map die je zelf kiest (File System Access API,
// Chrome/Edge) of, waar dat niet kan (Firefox), in één zip. Regels zijn dezelfde als in ufora_sync.py (HGU):
//   nieuw op Ufora -> downloaden; gewijzigd en lokaal niet aangeraakt -> overschrijven;
//   gewijzigd en lokaal bewerkt -> nieuwe versie ernaast als "naam (Ufora DD-MM).ext"; wat er al stond vóór de eerste sync blijft.
import * as store from "./store.js";
import { handleApi, getToc, raw, NotLoggedIn, BASE } from "./api.js";
import { makeZip } from "./zip.js";

const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const hasPicker = "showDirectoryPicker" in window;
const useOpfs = new URLSearchParams(location.search).has("opfs");  // enkel voor tests: browser-eigen opslag i.p.v. een gekozen map

const safe = name => name.replace(/[<>:"/\\|?*]/g, "_").replace(/^[ .]+|[ .]+$/g, "") || "_";
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const sha = async bytes => hex(await crypto.subtle.digest("SHA-256", bytes));

let config = (await store.get("config")) || {};
config.sync ||= {};
config.courses ||= {};

const saveConfig = () => store.put("config", config);
const logBox = $("log");
const log = (msg, cls = "") => { logBox.append(el("div", { className: cls, textContent: msg })); logBox.scrollTop = logBox.scrollHeight; };

// ---------- vakken ----------
async function loadCourses() {
  const r = await handleApi("/api/courses?cache=1");
  if (r.status === 401) return null;
  if (!r.ok) throw new Error((await r.json()).error);
  const courses = await r.json();
  const year = Math.max(0, ...courses.map(c => c.year || 0));
  return courses.filter(c => c.year === year || c.pinned);
}

async function paintCourses() {
  const box = $("courses");
  box.replaceChildren(el("p", { className: "meta", textContent: "Vakken laden…" }));
  let courses;
  try { courses = await loadCourses(); } catch (e) { box.replaceChildren(el("p", { textContent: e.message })); return; }
  if (!courses) {
    box.replaceChildren(el("p", { textContent: "Je bent niet ingelogd op Ufora. " }, el("a", { href: BASE + "/d2l/home", target: "_blank", rel: "noopener", textContent: "Log eerst in op Ufora" }), "."));
    return [];
  }
  box.replaceChildren(...courses.map(c => {
    const cb = el("input", { type: "checkbox", checked: !!config.sync[c.id], id: "c" + c.id });
    cb.onchange = () => { config.sync[c.id] = cb.checked; saveConfig(); };
    const label = el("input", { type: "text", value: config.courses[c.id]?.[0] || "", placeholder: "korte naam", maxLength: 8, className: "short" });
    label.onchange = () => {
      const color = config.courses[c.id]?.[1] ?? c.id % 10;
      if (label.value.trim()) config.courses[c.id] = [label.value.trim(), color]; else delete config.courses[c.id];
      saveConfig();
    };
    return el("div", { className: "crow" }, cb, el("label", { htmlFor: "c" + c.id, textContent: c.name }), label);
  }));
  return courses;
}

// ---------- map ----------
async function targetDir(interactive) {
  if (useOpfs) return navigator.storage.getDirectory();
  if (!hasPicker) return null;
  const h = await store.get("dir");
  if (!h) return null;
  if ((await h.queryPermission({ mode: "readwrite" })) !== "granted") {
    if (!interactive || (await h.requestPermission({ mode: "readwrite" })) !== "granted") return null;
  }
  return h;
}

async function paintDir() {
  const h = useOpfs ? { name: "(browser-eigen opslag, test)" } : await store.get("dir");
  $("dirname").textContent = h ? h.name : hasPicker ? "nog geen map gekozen" : "niet beschikbaar in deze browser: je krijgt één zip";
  $("pick").hidden = !hasPicker || useOpfs;
}

$("pick").onclick = async () => {
  try {
    const h = await window.showDirectoryPicker({ id: "hgu-sync", mode: "readwrite" });
    await store.put("dir", h);
    await paintDir();
  } catch (e) { if (e.name !== "AbortError") log(e.message, "err"); }
};

async function walkTo(root, parts, create) {
  let d = root;
  for (const p of parts) d = await d.getDirectoryHandle(p, { create });
  return d;
}

async function readFile(root, parts) {
  try {
    const d = await walkTo(root, parts.slice(0, -1), false);
    const f = await (await d.getFileHandle(parts.at(-1))).getFile();
    return new Uint8Array(await f.arrayBuffer());
  } catch { return null; }
}

async function writeFile(root, parts, data) {
  const d = await walkTo(root, parts.slice(0, -1), true);
  const w = await (await d.getFileHandle(parts.at(-1), { create: true })).createWritable();
  await w.write(data);
  await w.close();
}

// ---------- synchroniseren ----------
function* topics(modules, path = []) {
  for (const m of modules) {
    const p = [...path, m.Title];
    for (const t of m.Topics) yield [p, t];
    yield* topics(m.Modules, p);
  }
}

const fmt = d => `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;

async function syncCourse(root, course, state, zipFiles) {
  const ou = String(course.id);
  const first = !(ou in state);
  const cs = state[ou] ||= {};
  let n = 0;
  const toc = await getToc(course.id);
  for (const [modpath, t] of topics(toc.Modules)) {
    if (t.TypeIdentifier !== "File" || !t.Url) continue;
    const key = String(t.TopicId), mod = t.LastModifiedDate || "", prev = cs[key];
    if (prev && prev.modified === mod) continue;  // niets nieuws
    const filename = decodeURIComponent(t.Url.split("?")[0].split("/").pop());
    let parts = [config.courses[ou]?.[2] || safe(course.name), ...modpath.map(safe), safe(filename)];
    let existing = root ? await readFile(root, parts) : null;
    const existingSha = existing && (await sha(existing));
    if (!prev && existing && first) {  // stond er al vóór de eerste sync: aannemen dat je deze versie al hebt
      cs[key] = { modified: mod, path: parts.join("/"), sha: existingSha };
      continue;
    }
    const r = await raw(t.Url);
    const data = new Uint8Array(await r.arrayBuffer());
    const newSha = await sha(data);
    if (existing && !(prev && prev.path === parts.join("/") && existingSha === prev.sha)) {
      if (newSha === existingSha) { cs[key] = { modified: mod, path: parts.join("/"), sha: existingSha }; continue; }
      // lokaal bewerkt (of onbekend): nooit overschrijven, de nieuwe versie komt ernaast
      const dot = filename.lastIndexOf(".");
      const stem = dot > 0 ? filename.slice(0, dot) : filename, suffix = dot > 0 ? filename.slice(dot) : "";
      parts = [...parts.slice(0, -1), safe(`${stem} (Ufora ${fmt(new Date())})${suffix}`)];
    }
    if (root) await writeFile(root, parts, data); else zipFiles.push({ path: parts.join("/"), data });
    cs[key] = { modified: mod, path: parts.join("/"), sha: newSha };
    log(`${course.name}: ${prev ? "bijgewerkt" : "nieuw"} -> ${parts.slice(1).join("/")}`);
    n++;
  }
  return n;
}

let running = false;
$("run").onclick = async () => {
  if (running) return;
  running = true;
  $("run").disabled = true;
  logBox.replaceChildren();
  try {
    const courses = (await paintCourses()) || [];
    const chosen = courses.filter(c => config.sync[c.id]);
    if (!chosen.length) { log("Vink eerst de vakken aan die je wil synchroniseren.", "err"); return; }
    const root = await targetDir(true);
    if (!root && hasPicker) { log("Kies eerst een map (en geef toestemming om erin te schrijven).", "err"); return; }
    const state = (await store.get("syncstate")) || {};
    const zipFiles = [];
    let total = 0;
    for (const c of chosen) {
      try { total += await syncCourse(root, c, state, zipFiles); }
      catch (e) { if (e instanceof NotLoggedIn) throw e; log(`${c.name}: mislukt (${e.message})`, "err"); }
      await store.put("syncstate", state);
    }
    if (zipFiles.length) {
      const name = `HGU-sync-${new Date().toISOString().slice(0, 10)}.zip`;
      const a = el("a", { href: URL.createObjectURL(makeZip(zipFiles)), download: name });
      document.body.append(a); a.click(); a.remove();
      log(`Zip gedownload: ${name}`);
    }
    log(total ? `Klaar: ${total} bestand(en).` : "Geen nieuwe bestanden.", "ok");
  } catch (e) {
    log(e instanceof NotLoggedIn ? "Je Ufora-sessie is verlopen. Log in op Ufora en probeer opnieuw." : "Fout: " + e.message, "err");
  } finally {
    running = false;
    $("run").disabled = false;
  }
};

// ---------- instellingen ----------
$("name").value = config.name || "";
$("name").onchange = () => { config.name = $("name").value.trim(); saveConfig(); };
$("wipe").onclick = async () => {
  if (!confirm("Alle lokale gegevens van de extensie wissen (cache, instellingen, syncstatus, gekozen map)? Je bestanden in de map blijven staan.")) return;
  await store.clear();
  location.reload();
};

await paintDir();
await paintCourses();

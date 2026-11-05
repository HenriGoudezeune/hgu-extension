// Lijm tussen de HGU-pagina (app.js, ongewijzigd uit HGU) en de browserextensie:
//  - fetch("/api/...") wordt beantwoord door api.js in plaats van door een server;
//  - /file/, /dl/ en /u/ gaan naar file.html (bestanden ophalen met de sessie van de browser);
//  - afbeeldingen uit Ufora worden met die sessie opgehaald;
//  - voetregel met instellingen en synchronisatie.
import { handleApi, BASE } from "./api.js";

const ext = globalThis.browser ?? globalThis.chrome;
const FILE_PAGE = ext.runtime.getURL("file.html");

const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
  const path = url.startsWith("/") ? url : url.startsWith(location.origin) ? url.slice(location.origin.length) : "";
  return path.startsWith("/api/") ? handleApi(path, init) : nativeFetch(input, init);
};

// /u/content/... zijn afbeeldingen in aankondigingen: direct naar Ufora (zie hieronder), de rest naar file.html
window.HGU_URL = u => {
  if (typeof u !== "string") return u;
  if (u.startsWith("/u/")) return BASE + u.slice(2);
  return /^\/(file|dl)\//.test(u) ? `${FILE_PAGE}#${u}` : u;
};

// Afbeeldingen van Ufora laden we zelf met de sessie van de browser en tonen we als blob.
const seen = new WeakSet();
async function loadImage(img) {
  if (seen.has(img)) return;
  seen.add(img);
  const src = img.getAttribute("src") || "";
  if (!src.startsWith(BASE + "/")) return;
  try {
    const r = await nativeFetch(src, { credentials: "include", redirect: "manual" });
    if (r.ok && (r.headers.get("content-type") || "").startsWith("image/")) img.src = URL.createObjectURL(await r.blob());
  } catch { /* de gewone laadpoging blijft staan */ }
}
new MutationObserver(muts => {
  for (const m of muts)
    for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.tagName === "IMG") loadImage(n);
      n.querySelectorAll?.("img").forEach(loadImage);
    }
}).observe(document, { childList: true, subtree: true });

// voetregel: instellingen en synchronisatie
const foot = document.getElementById("foot");
if (foot) {
  const link = (text, file) => Object.assign(document.createElement("a"), { textContent: text, href: ext.runtime.getURL(file) });
  foot.replaceChildren(link("Synchroniseren", "sync.html"), " · ", link("Instellingen", "sync.html#instellingen"),
    " · ", Object.assign(document.createElement("span"), { textContent: "HGU-extensie: alles blijft in je browser" }));
}

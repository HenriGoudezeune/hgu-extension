// Bestandspagina: haalt een bestand van Ufora met de sessie van de browser en toont of downloadt het.
//   file.html#/file/<ou>/<topic>[?download=1]            bestand uit de vakinhoud
//   file.html#/dl/<ou>/<pad>?name=..[&download=1]         bijlage (opdracht, inzending, feedback, aankondiging)
import { raw, findTopic, NotLoggedIn, BASE } from "./api.js";

const ext = globalThis.browser ?? globalThis.chrome;
const out = document.getElementById("out");

// html/svg/xml kunnen scripts bevatten: die tonen we nooit op de oorsprong van de extensie, enkel als download
const RISKY = new Set(["text/html", "application/xhtml+xml", "image/svg+xml", "text/xml", "application/xml"]);
const MIME = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  txt: "text/plain", mp4: "video/mp4", mp3: "audio/mpeg", webm: "video/webm" };

const say = (text, ...kids) => out.replaceChildren(Object.assign(document.createElement("p"), { className: "msg", textContent: text }), ...kids);

function save(blob, name) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
}

async function target() {
  const [path, query = ""] = location.hash.slice(1).split("?");
  const q = new URLSearchParams(query);
  let m;
  if ((m = /^\/file\/(\d+)\/(\d+)$/.exec(path))) {
    const t = await findTopic(+m[1], +m[2]);
    if (!t?.url) throw new Error("Bestand niet gevonden.");
    return { ufora: t.url, name: decodeURIComponent(t.url.split("?")[0].split("/").pop()), download: q.has("download") };
  }
  if ((m = /^\/dl\/(\d+)\/(.+)$/.exec(path)) && /^(dropbox\/folders\/\d+\/(attachments\/\d+|submissions\/\d+\/files\/\d+|feedback\/(user|group)\/\d+\/attachments\/\d+)|news\/\d+\/attachments\/\d+)$/.test(m[2]))
    return { ufora: `/d2l/api/le/1.75/${m[1]}/${m[2]}`, name: q.get("name") || "bestand", download: q.has("download") };
  throw new Error("Onbekend bestand.");
}

try {
  say("Bestand ophalen…");
  const t = await target();
  const r = await raw(t.ufora);
  let type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!type || type.startsWith("d2l/") || type === "application/octet-stream") {
    type = MIME[t.name.split(".").pop().toLowerCase()] || "application/octet-stream";
  }
  const blob = new Blob([await r.blob()], { type });
  const risky = RISKY.has(type);
  if (t.download || risky) {
    save(blob, t.name);
    say(`Gedownload: ${t.name}` + (risky ? " (dit bestandstype tonen we niet in de browser)" : ""));
    if (window.top === window && history.length > 1) setTimeout(() => history.back(), 400);  // terug naar waar je was
  } else if (type.startsWith("image/")) {
    out.replaceChildren(Object.assign(document.createElement("img"), { src: URL.createObjectURL(blob), alt: t.name }));
  } else if (type.startsWith("video/") || type.startsWith("audio/")) {
    out.replaceChildren(Object.assign(document.createElement(type.startsWith("video/") ? "video" : "audio"),
      { src: URL.createObjectURL(blob), controls: true }));
  } else if (type === "application/pdf" || type.startsWith("text/")) {
    out.replaceChildren(Object.assign(document.createElement("iframe"), { src: URL.createObjectURL(blob), title: t.name }));
  } else {
    save(blob, t.name);
    say(`Gedownload: ${t.name}`);
  }
} catch (e) {
  if (e instanceof NotLoggedIn) {
    say("Je Ufora-sessie is verlopen. Log in op Ufora en probeer opnieuw.",
      Object.assign(document.createElement("a"), { href: BASE + "/d2l/home", target: "_blank", rel: "noopener", textContent: "Naar Ufora" }));
  } else {
    say(e.message || String(e));
  }
}

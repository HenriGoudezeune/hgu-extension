// Start van de HGU-pagina in de extensie: instellingen laden, toegang controleren, dan app.js (uit HGU) laden.
import * as store from "./store.js";

const ext = globalThis.browser ?? globalThis.chrome;
const ORIGINS = ext.runtime.getManifest().host_permissions;

async function needAccess() {
  // Firefox (MV3) geeft sitetoegang niet automatisch bij het installeren: vraag ze hier (vereist een klik)
  const app = document.getElementById("app");
  app.replaceChildren(Object.assign(document.createElement("div"), { className: "msg" }));
  const box = app.firstChild;
  box.append(Object.assign(document.createElement("p"), {
    textContent: "Deze extensie heeft toegang nodig tot ufora.ugent.be (je vakken) en hydra.ugent.be (het restomenu). "
      + "Er gaat niets naar andere websites of naar ons." }));
  const btn = Object.assign(document.createElement("button"), { className: "primary", type: "button", textContent: "Toegang geven" });
  btn.onclick = async () => { if (await ext.permissions.request({ origins: ORIGINS })) location.reload(); };
  box.append(btn);
}

const cfg = (await store.get("config")) || {};
window.CONFIG = { name: cfg.name || "", courses: cfg.courses || {}, auth: false, user: "" };

if (ext.permissions && !(await ext.permissions.contains({ origins: ORIGINS }))) {
  await needAccess();
} else {
  await import("./compat.js");
  const s = document.createElement("script");
  s.src = "app/app.js";
  document.body.append(s);
}

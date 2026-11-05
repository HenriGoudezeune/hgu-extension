// Lokale opslag in de browser (IndexedDB van de extensie): cache, instellingen, syncstatus en de gekozen map.
// Niets hiervan verlaat de browser.
const NAME = "hgu";

let opened;
function open() {
  return opened ||= new Promise((resolve, reject) => {
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction("kv", mode);
    const req = fn(t.objectStore("kv"));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = t.onabort = () => reject(t.error);
  });
}

export const get = key => tx("readonly", s => s.get(key));
export const put = (key, value) => tx("readwrite", s => s.put(value, key));
export const del = key => tx("readwrite", s => s.delete(key));
export const keys = () => tx("readonly", s => s.getAllKeys());

/** Alles wissen (knop "Alles wissen" in de instellingen). */
export const clear = () => tx("readwrite", s => s.clear());

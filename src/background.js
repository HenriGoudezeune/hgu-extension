// Een klik op het extensie-icoon opent HGU in een tabblad. Verder doet de extensie niets op de achtergrond.
const ext = globalThis.browser ?? globalThis.chrome;

ext.action.onClicked.addListener(async () => {
  const url = ext.runtime.getURL("app.html");
  let existing;
  try { [existing] = await ext.tabs.query({ url }); } catch { /* zonder tabs-recht: gewoon een nieuw tabblad */ }
  if (existing) {
    await ext.tabs.update(existing.id, { active: true });
    await ext.windows.update(existing.windowId, { focused: true });
  } else {
    await ext.tabs.create({ url });
  }
});

/* Highlighter – Seitenleiste
 * Zeigt die Highlights der aktiven Seite, erlaubt Notiz/Farbe/Löschen und
 * springt per Klick zur Markierung auf der Seite.
 */
(() => {
  "use strict";

  const COLORS = [
    "#ffe066",
    "#a3e635",
    "#7dd3fc",
    "#f9a8d4",
    "#fdba74",
    "#d8b4fe",
  ];

  const listEl = document.getElementById("list");
  const countEl = document.getElementById("count");
  const emptyEl = document.getElementById("empty");
  const pageTitleEl = document.getElementById("pageTitle");

  let currentTabId = null;
  let currentKey = null;
  let lastTypedAt = 0;

  const normUrl = (url) => (url || "").split("#")[0];
  const keyFor = (url) => "hl::" + normUrl(url);

  async function getActiveTab() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  async function load() {
    const tab = await getActiveTab();
    if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
      currentTabId = null;
      currentKey = null;
      pageTitleEl.textContent = "";
      render([]);
      return;
    }
    currentTabId = tab.id;
    currentKey = keyFor(tab.url);
    pageTitleEl.textContent = tab.title || tab.url;
    const res = await browser.storage.local.get(currentKey);
    const list = Array.isArray(res[currentKey]) ? res[currentKey] : [];
    list.sort((a, b) => a.createdAt - b.createdAt);
    render(list);
  }

  async function patch(id, patchObj) {
    const res = await browser.storage.local.get(currentKey);
    const list = Array.isArray(res[currentKey]) ? res[currentKey] : [];
    const i = list.findIndex((h) => h.id === id);
    if (i === -1) return;
    list[i] = { ...list[i], ...patchObj };
    await browser.storage.local.set({ [currentKey]: list });
  }

  async function remove(id) {
    const res = await browser.storage.local.get(currentKey);
    const list = Array.isArray(res[currentKey]) ? res[currentKey] : [];
    await browser.storage.local.set({
      [currentKey]: list.filter((h) => h.id !== id),
    });
  }

  function scrollTo(id) {
    if (currentTabId != null) {
      browser.tabs.sendMessage(currentTabId, { type: "scrollTo", id }).catch(() => {});
    }
  }

  function render(list) {
    listEl.textContent = "";
    countEl.textContent = String(list.length);
    emptyEl.style.display = list.length ? "none" : "block";

    for (const hl of list) {
      const li = document.createElement("li");
      li.className = "item";
      li.style.borderLeftColor = hl.color;

      const quote = document.createElement("div");
      quote.className = "item-quote";
      quote.textContent = hl.text;
      quote.title = "Zur Markierung springen";
      quote.addEventListener("click", () => scrollTo(hl.id));

      const note = document.createElement("textarea");
      note.className = "item-note";
      note.placeholder = "Notiz …";
      note.value = hl.note || "";
      note.rows = 1;
      let t = null;
      note.addEventListener("input", () => {
        lastTypedAt = Date.now();
        clearTimeout(t);
        const val = note.value;
        t = setTimeout(() => patch(hl.id, { note: val }), 300);
      });

      const foot = document.createElement("div");
      foot.className = "item-foot";
      const swatches = document.createElement("div");
      swatches.className = "swatches";
      COLORS.forEach((c) => {
        const dot = document.createElement("button");
        dot.className = "dot" + (c === hl.color ? " active" : "");
        dot.style.backgroundColor = c;
        dot.title = "Farbe ändern";
        dot.addEventListener("click", () => patch(hl.id, { color: c }));
        swatches.appendChild(dot);
      });
      const del = document.createElement("button");
      del.className = "del";
      del.textContent = "Löschen";
      del.addEventListener("click", () => remove(hl.id));

      foot.append(swatches, del);
      li.append(quote, note, foot);
      listEl.appendChild(li);
    }
  }

  // Live-Aktualisierung, wenn sich der Speicher der aktuellen Seite ändert.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !currentKey || !changes[currentKey]) return;
    const change = changes[currentKey];
    const oldLen = Array.isArray(change.oldValue) ? change.oldValue.length : 0;
    const newLen = Array.isArray(change.newValue) ? change.newValue.length : 0;

    // Highlights hinzugefügt/entfernt: immer sofort rendern. Dafür wird auf der
    // Seite markiert – man tippt in dem Moment ohnehin nicht in der Notiz.
    if (newLen === oldLen) {
      // Reine Feldänderung (z. B. Notiz beim eigenen Speichern). Nur überspringen,
      // wenn wirklich gerade getippt wird – sonst zerstört der Neuaufbau der Liste
      // das fokussierte Textarea und der Fokus (und die Eingabe) geht verloren.
      const active = document.activeElement;
      const typing =
        active &&
        active.classList &&
        active.classList.contains("item-note") &&
        Date.now() - lastTypedAt < 1000;
      if (typing) return;
    }
    load();
  });

  // Auf Tab-Wechsel / Navigation reagieren.
  browser.tabs.onActivated.addListener(load);
  browser.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === "complete" || info.title || info.url) load();
  });
  if (browser.windows && browser.windows.onFocusChanged) {
    browser.windows.onFocusChanged.addListener(load);
  }

  load();
})();

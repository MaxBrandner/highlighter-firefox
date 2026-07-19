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
  const overviewEl = document.getElementById("overview");
  const countEl = document.getElementById("count");
  const emptyEl = document.getElementById("empty");
  const pageTitleEl = document.getElementById("pageTitle");
  const themeToggleEl = document.getElementById("themeToggle");
  const overviewToggleEl = document.getElementById("overviewToggle");
  const viewLabelEl = document.getElementById("viewLabel");

  function setEmpty(kind) {
    emptyEl.textContent = "";
    if (kind === "overview") {
      emptyEl.textContent = "Noch keine Seiten mit Highlights.";
    } else {
      emptyEl.append(
        document.createTextNode("Noch keine Highlights auf dieser Seite."),
        document.createElement("br"),
        document.createTextNode("Markiere Text und wähle eine Farbe.")
      );
    }
  }

  // "page" = Highlights der aktiven Seite, "overview" = Liste aller Seiten.
  let mode = "page";

  // --- Theme-Umschalter (System → Hell → Dunkel → …) -----------------------
  const THEME_KEY = "hl:themeMode";
  const THEME_ORDER = ["system", "light", "dark"];
  const THEME_META = {
    system: { icon: "🖥️", label: "Design: System (klicken für hell)" },
    light: { icon: "☀️", label: "Design: hell (klicken für dunkel)" },
    dark: { icon: "🌙", label: "Design: dunkel (klicken für System)" },
  };

  function applyTheme(mode) {
    const m = THEME_ORDER.includes(mode) ? mode : "system";
    document.documentElement.dataset.theme = m;
    themeToggleEl.dataset.state = m;
    themeToggleEl.textContent = THEME_META[m].icon;
    themeToggleEl.title = THEME_META[m].label;
    themeToggleEl.setAttribute("aria-label", THEME_META[m].label);
  }

  async function loadTheme() {
    const res = await browser.storage.local.get(THEME_KEY);
    applyTheme(res[THEME_KEY]);
  }

  themeToggleEl.addEventListener("click", async () => {
    const current = document.documentElement.dataset.theme || "system";
    const next = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];
    applyTheme(next);
    await browser.storage.local.set({ [THEME_KEY]: next });
  });

  let currentTabId = null;
  let currentKey = null;
  let lastTypedAt = 0;

  const normUrl = (url) => (url || "").split("#")[0];
  const keyFor = (url) => "hl::" + normUrl(url);

  // --- Modus-Umschaltung (Diese Seite ↔ Alle Seiten) -----------------------
  function refresh() {
    return mode === "overview" ? showOverview() : load();
  }

  function updateOverviewToggle() {
    const isOverview = mode === "overview";
    overviewToggleEl.textContent = isOverview ? "←" : "🗂";
    const label = isOverview
      ? "Zurück zu dieser Seite"
      : "Alle Seiten mit Highlights";
    overviewToggleEl.title = label;
    overviewToggleEl.setAttribute("aria-label", label);
  }

  overviewToggleEl.addEventListener("click", () => {
    mode = mode === "overview" ? "page" : "overview";
    updateOverviewToggle();
    refresh();
  });

  const hostOf = (url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (e) {
      return url;
    }
  };

  // Alle gespeicherten Seiten einsammeln (Schlüssel "hl::<url>"), neueste zuerst.
  async function loadOverview() {
    const all = await browser.storage.local.get(null);
    const pages = [];
    for (const [key, val] of Object.entries(all)) {
      if (!key.startsWith("hl::") || !Array.isArray(val) || !val.length) continue;
      const url = key.slice(4);
      const title = (val.find((h) => h.title) || {}).title || url;
      const lastAt = val.reduce((m, h) => Math.max(m, h.createdAt || 0), 0);
      pages.push({ url, title, count: val.length, lastAt });
    }
    pages.sort((a, b) => b.lastAt - a.lastAt);
    return pages;
  }

  async function showOverview() {
    renderOverview(await loadOverview());
  }

  function renderOverview(pages) {
    listEl.style.display = "none";
    pageTitleEl.style.display = "none";
    overviewEl.style.display = "block";
    viewLabelEl.textContent = "Alle Seiten";
    countEl.textContent = String(pages.length);
    overviewEl.textContent = "";
    setEmpty("overview");
    emptyEl.style.display = pages.length ? "none" : "block";

    for (const p of pages) {
      const li = document.createElement("li");
      li.className = "ov-item";
      li.title = p.url + " – zum Öffnen klicken";

      const t = document.createElement("div");
      t.className = "ov-title";
      t.textContent = p.title;

      const meta = document.createElement("div");
      meta.className = "ov-meta";
      const host = document.createElement("span");
      host.className = "ov-host";
      host.textContent = hostOf(p.url);
      const cnt = document.createElement("span");
      cnt.className = "ov-count";
      cnt.textContent = String(p.count);
      meta.append(host, cnt);

      li.append(t, meta);
      // Linksklick: im Vordergrund öffnen und zurück in die "Diese Seite"-Ansicht
      // wechseln – der Tab-Wechsel rendert dann die Highlights der neuen Seite.
      li.addEventListener("click", () => {
        mode = "page";
        updateOverviewToggle();
        browser.tabs.create({ url: p.url });
      });
      // Mittlere Maustaste: wie in Firefox in neuem Hintergrund-Tab öffnen; die
      // Übersicht bleibt stehen.
      li.addEventListener("auxclick", (e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        browser.tabs.create({ url: p.url, active: false });
      });
      // Autoscroll-Kreis der mittleren Taste unterdrücken.
      li.addEventListener("mousedown", (e) => {
        if (e.button === 1) e.preventDefault();
      });
      overviewEl.appendChild(li);
    }
  }

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
    overviewEl.style.display = "none";
    listEl.style.display = "block";
    pageTitleEl.style.display = "";
    viewLabelEl.textContent = "Diese Seite";
    setEmpty("page");
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
    if (area !== "local") return;
    // In der Übersicht auf jede Seiten-Änderung reagieren.
    if (mode === "overview") {
      if (Object.keys(changes).some((k) => k.startsWith("hl::"))) showOverview();
      return;
    }
    if (!currentKey || !changes[currentKey]) return;
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

  // Auf Tab-Wechsel / Navigation reagieren (in der Übersicht bleibt der Modus).
  browser.tabs.onActivated.addListener(refresh);
  browser.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === "complete" || info.title || info.url) refresh();
  });
  if (browser.windows && browser.windows.onFocusChanged) {
    browser.windows.onFocusChanged.addListener(refresh);
  }

  loadTheme();
  updateOverviewToggle();
  refresh();
})();

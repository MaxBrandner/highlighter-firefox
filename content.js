/* Highlighter – Content-Script
 * - Zeigt beim Markieren von Text eine schwebende Farbleiste.
 * - Wickelt die Auswahl in farbige <span>-Elemente.
 * - Speichert Highlights pro Seite (browser.storage.local) und stellt sie beim Laden wieder her.
 * - Notizen: sichtbar beim Hovern (Tooltip) und bearbeitbar per Klick-Popup.
 * - Hält sich mit der Seitenleiste über storage.onChanged synchron.
 */
(() => {
  "use strict";

  const COLORS = [
    { key: "yellow", value: "#ffe066" },
    { key: "green", value: "#a3e635" },
    { key: "blue", value: "#7dd3fc" },
    { key: "pink", value: "#f9a8d4" },
    { key: "orange", value: "#fdba74" },
    { key: "purple", value: "#d8b4fe" },
  ];
  const CONTEXT_LEN = 40;
  const HL_CLASS = "__hlx";
  const UI_CLASS = "__hlx_ui";

  const pageUrl = () => location.href.split("#")[0];
  const storageKey = () => "hl::" + pageUrl();
  const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // ------------------------------------------------------------------ Storage
  async function loadHighlights() {
    const key = storageKey();
    const res = await browser.storage.local.get(key);
    return Array.isArray(res[key]) ? res[key] : [];
  }
  async function saveHighlights(list) {
    await browser.storage.local.set({ [storageKey()]: list });
  }
  async function upsertHighlight(hl) {
    const list = await loadHighlights();
    const i = list.findIndex((h) => h.id === hl.id);
    if (i === -1) list.push(hl);
    else list[i] = hl;
    await saveHighlights(list);
  }
  async function patchHighlight(id, patch) {
    const list = await loadHighlights();
    const i = list.findIndex((h) => h.id === id);
    if (i === -1) return;
    list[i] = { ...list[i], ...patch };
    await saveHighlights(list);
  }
  async function removeHighlight(id) {
    const list = await loadHighlights();
    await saveHighlights(list.filter((h) => h.id !== id));
  }

  // -------------------------------------------------------------- Dokumenttext
  // Baut den zusammenhängenden Text der Seite plus eine Map Textknoten -> Offset.
  function buildDocText() {
    const map = [];
    let str = "";
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const p = node.parentNode;
          if (!p) return NodeFilter.FILTER_REJECT;
          const tag = p.nodeName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT")
            return NodeFilter.FILTER_REJECT;
          if (p.closest && p.closest("." + UI_CLASS))
            return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );
    let n;
    while ((n = walker.nextNode())) {
      map.push({ node: n, start: str.length });
      str += n.nodeValue;
    }
    return { str, map };
  }

  function firstTextNodeIn(node) {
    if (node.nodeType === Node.TEXT_NODE) return node;
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    return w.nextNode();
  }

  function globalOffset(container, offset, map) {
    if (container.nodeType === Node.TEXT_NODE) {
      for (const m of map) if (m.node === container) return m.start + offset;
      return null;
    }
    const child = container.childNodes[offset];
    if (child) {
      const tn = firstTextNodeIn(child);
      if (tn) for (const m of map) if (m.node === tn) return m.start;
    }
    return null;
  }

  function commonSuffixLen(a, b) {
    let i = 0;
    while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i])
      i++;
    return i;
  }
  function commonPrefixLen(a, b) {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
  }

  function pointAt(map, g) {
    for (const m of map) {
      const len = m.node.nodeValue.length;
      if (g <= m.start + len) return { node: m.node, offset: g - m.start };
    }
    const last = map[map.length - 1];
    return { node: last.node, offset: last.node.nodeValue.length };
  }

  // Findet die beste Position des gespeicherten Textes anhand von Prefix/Suffix.
  function locateRange(hl) {
    const { str, map } = buildDocText();
    if (!map.length || !hl.text) return null;
    const occ = [];
    let i = 0;
    while ((i = str.indexOf(hl.text, i)) !== -1) {
      occ.push(i);
      i += 1;
    }
    if (!occ.length) return null;
    let best = occ[0];
    let bestScore = -1;
    for (const idx of occ) {
      const before = str.slice(Math.max(0, idx - CONTEXT_LEN), idx);
      const after = str.slice(
        idx + hl.text.length,
        idx + hl.text.length + CONTEXT_LEN
      );
      const score =
        commonSuffixLen(before, hl.prefix || "") +
        commonPrefixLen(after, hl.suffix || "");
      if (score > bestScore) {
        bestScore = score;
        best = idx;
      }
    }
    const p1 = pointAt(map, best);
    const p2 = pointAt(map, best + hl.text.length);
    const range = document.createRange();
    try {
      range.setStart(p1.node, p1.offset);
      range.setEnd(p2.node, p2.offset);
    } catch (e) {
      return null;
    }
    return range;
  }

  // -------------------------------------------------------------- Range wrappen
  function textNodesInRange(range) {
    const root =
      range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentNode
        : range.commonAncestorContainer;
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
        const p = node.parentNode;
        const tag = p && p.nodeName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT")
          return NodeFilter.FILTER_REJECT;
        if (p && p.closest && p.closest("." + UI_CLASS))
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    // Falls die Range komplett in EINEM Textknoten liegt, wird er von
    // intersectsNode manchmal übersprungen – sicherheitshalber ergänzen.
    if (
      range.startContainer === range.endContainer &&
      range.startContainer.nodeType === Node.TEXT_NODE &&
      !nodes.includes(range.startContainer)
    ) {
      nodes.push(range.startContainer);
    }
    return nodes;
  }

  function wrapRange(range, hl) {
    const nodes = textNodesInRange(range);
    const spans = [];
    for (const node of nodes) {
      let s = 0;
      let e = node.nodeValue.length;
      if (node === range.startContainer) s = range.startOffset;
      if (node === range.endContainer) e = range.endOffset;
      if (e <= s) continue;
      if (!node.nodeValue.slice(s, e)) continue;

      let target = node;
      if (s > 0) target = target.splitText(s);
      if (e - s < target.nodeValue.length) target.splitText(e - s);

      const span = document.createElement("span");
      span.className = HL_CLASS;
      span.dataset.hlid = hl.id;
      span.style.backgroundColor = hl.color;
      if (hl.note) span.dataset.note = hl.note;
      target.parentNode.insertBefore(span, target);
      span.appendChild(target);
      spans.push(span);
    }
    return spans;
  }

  function unwrapHighlight(id) {
    const spans = document.querySelectorAll(
      `.${HL_CLASS}[data-hlid="${CSS.escape(id)}"]`
    );
    spans.forEach((span) => {
      const parent = span.parentNode;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      parent.normalize();
    });
  }

  // --------------------------------------------------------- Highlights anlegen
  async function createHighlightFromSelection(color) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const text = range.toString();
    if (!text.trim()) return;

    const { str, map } = buildDocText();
    let gStart = globalOffset(range.startContainer, range.startOffset, map);
    let gEnd = globalOffset(range.endContainer, range.endOffset, map);
    if (gStart == null || gEnd == null) {
      gStart = str.indexOf(text);
      gEnd = gStart >= 0 ? gStart + text.length : -1;
    }
    const prefix = gStart >= 0 ? str.slice(Math.max(0, gStart - CONTEXT_LEN), gStart) : "";
    const suffix = gEnd >= 0 ? str.slice(gEnd, gEnd + CONTEXT_LEN) : "";

    const hl = {
      id: uid(),
      url: pageUrl(),
      title: document.title,
      color,
      text,
      prefix,
      suffix,
      note: "",
      createdAt: Date.now(),
    };

    wrapRange(range, hl);
    sel.removeAllRanges();
    hideToolbar();
    await upsertHighlight(hl);
  }

  // ------------------------------------------------------------- Farb-Toolbar
  let toolbar = null;

  function buildToolbar() {
    const bar = document.createElement("div");
    bar.className = UI_CLASS + " __hlx_toolbar";
    COLORS.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "__hlx_swatch";
      btn.style.backgroundColor = c.value;
      btn.title = "Markieren";
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        createHighlightFromSelection(c.value);
      });
      bar.appendChild(btn);
    });
    document.body.appendChild(bar);
    return bar;
  }

  function showToolbar() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const text = sel.toString();
    if (!text.trim()) return;
    // Nicht innerhalb unserer eigenen UI reagieren.
    const anchor = sel.anchorNode;
    if (anchor && anchor.parentElement && anchor.parentElement.closest("." + UI_CLASS))
      return;

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!toolbar) toolbar = buildToolbar();
    toolbar.style.display = "flex";
    const barW = toolbar.offsetWidth || 200;
    const barH = toolbar.offsetHeight || 36;
    // Standardmäßig unter der Auswahl anzeigen (dort weniger im Weg).
    // Nur nach oben klappen, wenn darunter kein Platz mehr im Viewport ist.
    let top = rect.bottom + window.scrollY + 8;
    if (rect.bottom + barH + 8 > document.documentElement.clientHeight) {
      top = rect.top + window.scrollY - barH - 8;
    }
    let left = rect.left + window.scrollX + rect.width / 2 - barW / 2;
    left = Math.max(
      window.scrollX + 4,
      Math.min(left, window.scrollX + document.documentElement.clientWidth - barW - 4)
    );
    toolbar.style.top = top + "px";
    toolbar.style.left = left + "px";
  }

  function hideToolbar() {
    if (toolbar) toolbar.style.display = "none";
  }

  // ----------------------------------------------------------------- Tooltip
  let tooltip = null;
  let tooltipTimer = null;

  function showTooltip(span) {
    const note = span.dataset.note;
    if (!note) return;
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = UI_CLASS + " __hlx_tooltip";
      document.body.appendChild(tooltip);
    }
    tooltip.textContent = note;
    tooltip.style.display = "block";
    const rect = span.getBoundingClientRect();
    tooltip.style.top = rect.bottom + window.scrollY + 6 + "px";
    tooltip.style.left = rect.left + window.scrollX + "px";
  }
  function hideTooltip() {
    if (tooltip) tooltip.style.display = "none";
  }

  // ------------------------------------------------------------- Klick-Popup
  let popup = null;

  async function openPopup(id, anchorRect) {
    const list = await loadHighlights();
    const hl = list.find((h) => h.id === id);
    if (!hl) return;
    closePopup();

    popup = document.createElement("div");
    popup.className = UI_CLASS + " __hlx_popup";
    popup.addEventListener("mousedown", (e) => e.stopPropagation());

    const swatches = document.createElement("div");
    swatches.className = "__hlx_popup_colors";
    COLORS.forEach((c) => {
      const b = document.createElement("button");
      b.className = "__hlx_swatch";
      b.style.backgroundColor = c.value;
      if (c.value === hl.color) b.classList.add("__hlx_active");
      b.addEventListener("click", () => {
        document
          .querySelectorAll(`.${HL_CLASS}[data-hlid="${CSS.escape(id)}"]`)
          .forEach((s) => (s.style.backgroundColor = c.value));
        patchHighlight(id, { color: c.value });
        swatches
          .querySelectorAll(".__hlx_swatch")
          .forEach((x) => x.classList.remove("__hlx_active"));
        b.classList.add("__hlx_active");
      });
      swatches.appendChild(b);
    });

    const ta = document.createElement("textarea");
    ta.className = "__hlx_note";
    ta.placeholder = "Notiz hinzufügen …";
    ta.value = hl.note || "";

    const actions = document.createElement("div");
    actions.className = "__hlx_popup_actions";
    const del = document.createElement("button");
    del.className = "__hlx_btn __hlx_del";
    del.textContent = "Löschen";
    del.addEventListener("click", () => {
      unwrapHighlight(id);
      removeHighlight(id);
      closePopup();
    });
    const done = document.createElement("button");
    done.className = "__hlx_btn __hlx_done";
    done.textContent = "Fertig";
    done.addEventListener("click", () => closePopup());
    actions.append(del, done);

    popup.append(swatches, ta, actions);
    document.body.appendChild(popup);

    // Notiz speichern (entprellt) und Tooltip-Datensatz aktualisieren.
    let t = null;
    ta.addEventListener("input", () => {
      const val = ta.value;
      document
        .querySelectorAll(`.${HL_CLASS}[data-hlid="${CSS.escape(id)}"]`)
        .forEach((s) => {
          if (val) s.dataset.note = val;
          else delete s.dataset.note;
        });
      clearTimeout(t);
      t = setTimeout(() => patchHighlight(id, { note: val }), 350);
    });

    const pw = popup.offsetWidth;
    let left = anchorRect.left + window.scrollX;
    left = Math.max(
      window.scrollX + 4,
      Math.min(left, window.scrollX + document.documentElement.clientWidth - pw - 4)
    );
    popup.style.top = anchorRect.bottom + window.scrollY + 8 + "px";
    popup.style.left = left + "px";
    ta.focus();
  }

  function closePopup() {
    if (popup) {
      popup.remove();
      popup = null;
    }
  }

  // --------------------------------------------------------------- Wiederherstellen
  async function restoreAll() {
    const list = await loadHighlights();
    for (const hl of list) {
      // schon vorhanden? überspringen
      if (document.querySelector(`.${HL_CLASS}[data-hlid="${CSS.escape(hl.id)}"]`))
        continue;
      const range = locateRange(hl);
      if (range) wrapRange(range, hl);
    }
  }

  // --------------------------------------------------------------- Events
  document.addEventListener("mouseup", (e) => {
    if (e.target.closest && e.target.closest("." + UI_CLASS)) return;
    setTimeout(showToolbar, 0);
  });

  document.addEventListener("mousedown", (e) => {
    if (e.target.closest && e.target.closest("." + UI_CLASS)) return;
    hideToolbar();
    // Klick außerhalb des Popups schließt es.
    if (popup && !popup.contains(e.target)) closePopup();
  });

  document.addEventListener("scroll", hideToolbar, true);

  // Klick auf ein Highlight -> Popup
  document.addEventListener("click", (e) => {
    const span = e.target.closest && e.target.closest("." + HL_CLASS);
    if (span) {
      e.preventDefault();
      e.stopPropagation();
      openPopup(span.dataset.hlid, span.getBoundingClientRect());
    }
  });

  // Hover -> Notiz-Tooltip
  document.addEventListener("mouseover", (e) => {
    const span = e.target.closest && e.target.closest("." + HL_CLASS);
    if (span) {
      clearTimeout(tooltipTimer);
      tooltipTimer = setTimeout(() => showTooltip(span), 250);
    }
  });
  document.addEventListener("mouseout", (e) => {
    const span = e.target.closest && e.target.closest("." + HL_CLASS);
    if (span) {
      clearTimeout(tooltipTimer);
      hideTooltip();
    }
  });

  // Nachrichten von der Seitenleiste (z. B. „zu Highlight scrollen")
  browser.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "scrollTo") return;
    const span = document.querySelector(
      `.${HL_CLASS}[data-hlid="${CSS.escape(msg.id)}"]`
    );
    if (span) {
      span.scrollIntoView({ behavior: "smooth", block: "center" });
      span.classList.add("__hlx_flash");
      setTimeout(() => span.classList.remove("__hlx_flash"), 1200);
    }
  });

  // Änderungen aus der Seitenleiste (Farbe/Notiz/Löschen) auf die Seite spiegeln.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const change = changes[storageKey()];
    if (!change) return;
    const list = Array.isArray(change.newValue) ? change.newValue : [];
    const seen = new Set();
    for (const hl of list) {
      seen.add(hl.id);
      const spans = document.querySelectorAll(
        `.${HL_CLASS}[data-hlid="${CSS.escape(hl.id)}"]`
      );
      spans.forEach((s) => {
        s.style.backgroundColor = hl.color;
        if (hl.note) s.dataset.note = hl.note;
        else delete s.dataset.note;
      });
    }
    // In der Seitenleiste gelöschte Highlights von der Seite entfernen.
    document.querySelectorAll("." + HL_CLASS).forEach((s) => {
      if (!seen.has(s.dataset.hlid)) unwrapHighlight(s.dataset.hlid);
    });
  });

  // Start – auch bei nachträglich geladenen Inhalten mehrfach versuchen.
  function boot() {
    restoreAll();
    setTimeout(restoreAll, 800);
    setTimeout(restoreAll, 2000);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

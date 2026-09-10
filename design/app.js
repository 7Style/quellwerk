/* Quellwerk. Behaviour for the static design reference.
   No framework, no build. Everything is wired from data attributes so the
   React port can keep the same contract: data-collapse, data-dialog-open,
   data-cite, data-source, data-chip-fill. */

(function () {
  "use strict";

  /* ------------------------------------------------------------- icons */
  /* One sprite, injected once. Pages reference symbols with
     <svg class="icon"><use href="#i-name"></use></svg>. */

  var ICONS = {
    plus: '<path d="M8 3.3v9.4M3.3 8h9.4"/>',
    doc: '<path d="M9 2H4.5A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V6z"/><path d="M9 2v4h4"/>',
    web: '<circle cx="8" cy="8" r="5.6"/><path d="M2.6 8h10.8M8 2.4c1.4 1.5 2.2 3.5 2.2 5.6S9.4 12.1 8 13.6C6.6 12.1 5.8 10.1 5.8 8s.8-4.1 2.2-5.6z"/>',
    text: '<path d="M3.4 4.2h9.2M3.4 8h9.2M3.4 11.8h6"/>',
    close: '<path d="M4 4l8 8M12 4l-8 8"/>',
    send: '<path d="M3 8.2l9.5-4.4-3.3 9.9-2-4.2z"/>',
    stop: '<rect x="4.5" y="4.5" width="7" height="7" rx="1"/>',
    copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-1a1.5 1.5 0 0 0-1.5-1.5H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 11h1"/>',
    download: '<path d="M8 3v7.4M5.2 7.8L8 10.6l2.8-2.8M3.2 13h9.6"/>',
    trash: '<path d="M3.4 4.6h9.2M6.4 4.6V3.4h3.2v1.2M5 4.6l.6 8.2h4.8L11 4.6"/>',
    sliders: '<path d="M3 5.2h6M11 5.2h2M3 10.8h2M7 10.8h6"/><circle cx="10" cy="5.2" r="1.4"/><circle cx="6" cy="10.8" r="1.4"/>',
    sun: '<circle cx="8" cy="8" r="3.1"/><path d="M8 1.6v1.4M8 13v1.4M2.9 2.9l1 1M12.1 12.1l1 1M1.6 8H3M13 8h1.4M2.9 13.1l1-1M12.1 3.9l1-1"/>',
    moon: '<path d="M13 9.4A5.6 5.6 0 0 1 6.6 3a5.6 5.6 0 1 0 6.4 6.4z"/>',
    chevronLeft: '<path d="M9.8 3.6L5.4 8l4.4 4.4"/>',
    chevronRight: '<path d="M6.2 3.6L10.6 8l-4.4 4.4"/>',
    chevronDown: '<path d="M3.6 6.2L8 10.6l4.4-4.4"/>',
    search: '<circle cx="7.2" cy="7.2" r="4.2"/><path d="M10.4 10.4l3 3"/>',
    warning: '<path d="M8 2.6l5.6 10H2.4z"/><path d="M8 6.4v3M8 11.2v.1"/>',
    refresh: '<path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13.2 2.6v3h-3"/>',
    report: '<path d="M3.6 3h8.8v10H3.6z"/><path d="M5.8 5.8h4.4M5.8 8h4.4M5.8 10.2h2.6"/>',
    mindmap: '<circle cx="4" cy="8" r="1.6"/><circle cx="12" cy="4.4" r="1.6"/><circle cx="12" cy="11.6" r="1.6"/><path d="M5.5 7.3l5-2.2M5.5 8.7l5 2.2"/>',
    audio: '<path d="M3 6.6v2.8M5.6 4.6v6.8M8.2 2.8v10.4M10.8 5.4v5.2M13.4 7v2"/>',
    quote: '<path d="M4 3.4h8M4 6.4h8M4 9.4h5"/><path d="M2.2 3v7"/>',
    check: '<path d="M3.4 8.4l3 3 6.2-6.8"/>',
    external: '<path d="M12.6 9v3.1a1.4 1.4 0 0 1-1.4 1.4H3.9a1.4 1.4 0 0 1-1.4-1.4V4.8a1.4 1.4 0 0 1 1.4-1.4H7"/><path d="M9.8 2.6h3.6v3.6M13.4 2.6L7.8 8.2"/>'
  };

  function injectSprite() {
    if (document.getElementById("qw-sprite")) return;
    var parts = ['<svg id="qw-sprite" aria-hidden="true" style="display:none">'];
    Object.keys(ICONS).forEach(function (name) {
      parts.push('<symbol id="i-' + name + '" viewBox="0 0 16 16">' + ICONS[name] + "</symbol>");
    });
    parts.push("</svg>");
    var holder = document.createElement("div");
    holder.innerHTML = parts.join("");
    document.body.insertBefore(holder.firstChild, document.body.firstChild);
  }

  /* ------------------------------------------------------------- theme */

  var THEME_KEY = "quellwerk-theme";

  function applyTheme(mode) {
    if (mode === "light" || mode === "dark") {
      document.documentElement.setAttribute("data-theme", mode);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      var dark = resolvedTheme() === "dark";
      btn.setAttribute("aria-pressed", String(dark));
      btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
      var use = btn.querySelector("use");
      if (use) use.setAttribute("href", dark ? "#i-sun" : "#i-moon");
    });
  }

  function resolvedTheme() {
    var set = document.documentElement.getAttribute("data-theme");
    if (set) return set;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function initTheme() {
    var stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (e) { /* private mode */ }
    applyTheme(stored);
    document.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-theme-toggle]");
      if (!btn) return;
      var next = resolvedTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    });
  }

  /* ------------------------------------------------------------ panels */

  function initPanels() {
    document.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-collapse]");
      if (!btn) return;
      var which = btn.getAttribute("data-collapse");
      var workspace = document.querySelector(".workspace");
      var col = document.getElementById("panel-" + which);
      if (!workspace || !col) return;
      var collapsed = col.getAttribute("data-collapsed") === "true";
      col.setAttribute("data-collapsed", String(!collapsed));
      workspace.setAttribute("data-" + which, collapsed ? "expanded" : "collapsed");
      btn.setAttribute("aria-expanded", String(collapsed));
    });
  }

  /* ----------------------------------------------------------- dialogs */

  function initDialogs() {
    document.addEventListener("click", function (ev) {
      var opener = ev.target.closest("[data-dialog-open]");
      if (opener) {
        var dlg = document.getElementById(opener.getAttribute("data-dialog-open"));
        if (dlg && typeof dlg.showModal === "function") dlg.showModal();
        return;
      }
      var closer = ev.target.closest("[data-dialog-close]");
      if (closer) {
        var owner = closer.closest("dialog");
        if (owner) owner.close();
      }
    });

    /* Clicking the backdrop closes. A dialog's own box swallows the click. */
    document.querySelectorAll("dialog.dialog").forEach(function (dlg) {
      dlg.addEventListener("click", function (ev) {
        if (ev.target === dlg) dlg.close();
      });
      if (dlg.hasAttribute("data-open-on-load")) dlg.showModal();
    });
  }

  /* ------------------------------------------------------------- tabs */

  function initTabs() {
    document.addEventListener("click", function (ev) {
      var tab = ev.target.closest(".tab");
      if (!tab) return;
      var group = tab.closest(".tabs");
      if (!group) return;
      group.querySelectorAll(".tab").forEach(function (t) {
        t.setAttribute("aria-selected", String(t === tab));
      });
      var panelId = tab.getAttribute("aria-controls");
      var scope = group.parentElement;
      if (!panelId || !scope) return;
      scope.querySelectorAll("[data-tabpanel]").forEach(function (p) {
        p.hidden = p.id !== panelId;
      });
    });
  }

  /* --------------------------------------------------------- citations */

  var citations = {};
  var pop = null;
  var popCite = null;
  var hideTimer = null;

  function loadCitations() {
    var node = document.getElementById("qw-citations");
    if (!node) return;
    try { citations = JSON.parse(node.textContent); } catch (e) { citations = {}; }
  }

  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement("div");
    pop.className = "cite-pop";
    pop.hidden = true;
    pop.setAttribute("role", "tooltip");
    pop.addEventListener("mouseenter", function () { clearTimeout(hideTimer); });
    pop.addEventListener("mouseleave", scheduleHide);
    document.body.appendChild(pop);
    return pop;
  }

  function textNode(value) { return document.createTextNode(value); }

  function showPop(chip) {
    var id = chip.getAttribute("data-cite");
    var rec = citations[id];
    if (!rec) return;
    clearTimeout(hideTimer);
    var el = ensurePop();
    el.textContent = "";

    var head = document.createElement("div");
    head.className = "cite-pop-head";
    var title = document.createElement("span");
    title.className = "cite-pop-title";
    title.appendChild(textNode(rec.sourceTitle));
    var offs = document.createElement("span");
    offs.className = "offsets";
    offs.appendChild(textNode(rec.start + "-" + rec.end));
    head.appendChild(title);
    head.appendChild(offs);

    var body = document.createElement("div");
    body.className = "cite-pop-body";
    if (rec.before) body.appendChild(textNode(rec.before));
    var mark = document.createElement("mark");
    mark.className = "mark";
    mark.appendChild(textNode(rec.cited));
    body.appendChild(mark);
    if (rec.after) body.appendChild(textNode(rec.after));

    var foot = document.createElement("div");
    foot.className = "cite-pop-foot";
    foot.appendChild(textNode("Click to open the source at this passage"));

    el.appendChild(head);
    el.appendChild(body);
    el.appendChild(foot);
    el.hidden = false;

    var r = chip.getBoundingClientRect();
    var w = el.offsetWidth;
    var h = el.offsetHeight;
    var left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
    var top = r.top - h - 8;
    if (top < 12) top = r.bottom + 8;
    el.style.left = Math.round(left + window.scrollX) + "px";
    el.style.top = Math.round(top + window.scrollY) + "px";

    if (popCite && popCite !== chip) popCite.setAttribute("aria-expanded", "false");
    popCite = chip;
    chip.setAttribute("aria-expanded", "true");
  }

  function hidePop() {
    if (!pop) return;
    pop.hidden = true;
    if (popCite) popCite.setAttribute("aria-expanded", "false");
    popCite = null;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hidePop, 160);
  }

  function openCitation(chip) {
    var id = chip.getAttribute("data-cite");
    var rec = citations[id];
    if (!rec) return;
    var sources = document.getElementById("panel-sources");
    if (sources && sources.getAttribute("data-collapsed") === "true") {
      sources.setAttribute("data-collapsed", "false");
      var ws = document.querySelector(".workspace");
      if (ws) ws.setAttribute("data-sources", "expanded");
    }

    var reader = document.querySelector('[data-reader]');
    var target = document.querySelector('[data-passage-for="' + id + '"]');
    if (!reader || !target) return; /* page without a reader keeps the popover */

    reader.hidden = false;
    var list = document.querySelector("[data-source-list]");
    if (list) list.hidden = true;

    reader.querySelectorAll("[data-source-doc]").forEach(function (doc) {
      doc.hidden = doc.getAttribute("data-source-doc") !== rec.sourceId;
    });
    var titleSlot = reader.querySelector("[data-reader-title]");
    if (titleSlot) titleSlot.textContent = rec.sourceTitle;

    reader.querySelectorAll(".mark-active").forEach(function (m) {
      m.classList.remove("mark-active");
    });
    reader.querySelectorAll(".passage-active").forEach(function (p) {
      p.classList.remove("passage-active");
    });

    target.classList.add("mark-active");
    var block = target.closest(".passage") || target;
    block.classList.add("passage-active");
    block.classList.remove("flash");
    void block.offsetWidth; /* restart the animation on a repeat click */
    block.classList.add("flash");
    block.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    hidePop();
  }

  function closeReader() {
    var reader = document.querySelector("[data-reader]");
    var list = document.querySelector("[data-source-list]");
    if (reader) reader.hidden = true;
    if (list) list.hidden = false;
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function initCitations() {
    loadCitations();
    document.addEventListener("mouseover", function (ev) {
      var chip = ev.target.closest(".cite");
      if (chip) showPop(chip);
    });
    document.addEventListener("mouseout", function (ev) {
      if (ev.target.closest(".cite")) scheduleHide();
    });
    document.addEventListener("focusin", function (ev) {
      var chip = ev.target.closest(".cite");
      if (chip) showPop(chip);
    });
    document.addEventListener("click", function (ev) {
      var chip = ev.target.closest(".cite");
      if (chip) { ev.preventDefault(); openCitation(chip); return; }
      if (ev.target.closest("[data-reader-close]")) { closeReader(); return; }
      if (!ev.target.closest(".cite-pop")) hidePop();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") hidePop();
    });
    window.addEventListener("scroll", hidePop, true);
  }

  /* -------------------------------------------------------- composer */

  function initComposer() {
    document.querySelectorAll(".composer-input").forEach(function (input) {
      autosize(input);
      input.addEventListener("input", function () { autosize(input); });
    });

    document.addEventListener("click", function (ev) {
      var chip = ev.target.closest("[data-chip-fill]");
      if (!chip) return;
      var input = document.querySelector(".composer-input");
      if (!input) return;
      input.value = chip.getAttribute("data-chip-fill") || chip.textContent.trim();
      autosize(input);
      input.focus();
    });

    document.querySelectorAll("[data-counter-for]").forEach(function (out) {
      var field = document.getElementById(out.getAttribute("data-counter-for"));
      if (!field) return;
      var max = field.getAttribute("maxlength") || "";
      var render = function () { out.textContent = field.value.length + (max ? " / " + max : ""); };
      field.addEventListener("input", render);
      render();
    });
  }

  function autosize(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  /* -------------------------------------------------------- streaming */
  /* Drives the "answer streams in" page. The finished text lives in the
     markup, so the page is readable with JavaScript switched off. */

  function initStream() {
    var host = document.querySelector("[data-stream]");
    if (!host) return;
    var full = host.innerHTML;
    if (prefersReducedMotion()) return;

    /* Join the block children, so the typed text keeps its paragraph breaks. */
    var blocks = Array.prototype.map.call(host.children, function (el) {
      return el.textContent.replace(/\s+/g, " ").trim();
    }).filter(Boolean);
    var plain = blocks.length ? blocks.join("\n\n") : host.textContent;

    host.innerHTML = "";
    var caret = document.createElement("span");
    caret.className = "caret";
    var textHolder = document.createElement("span");
    textHolder.style.whiteSpace = "pre-wrap";
    host.appendChild(textHolder);
    host.appendChild(caret);

    var i = 0;
    var step = function () {
      if (i >= plain.length) {
        host.innerHTML = full; /* chips and marks appear with the finished text */
        finishStream();
        host.dispatchEvent(new CustomEvent("qw:stream-done", { bubbles: true }));
        return;
      }
      i = Math.min(plain.length, i + 3);
      textHolder.textContent = plain.slice(0, i);
      setTimeout(step, 16);
    };
    setTimeout(step, 400);

    document.addEventListener("click", function (ev) {
      if (!ev.target.closest("[data-stream-stop]")) return;
      i = plain.length;
      host.innerHTML = full;
      finishStream();
    });
  }

  /* The turn is over: the pending affordances give way to the finished ones. */
  function finishStream() {
    document.querySelectorAll("[data-stream-pending]").forEach(function (el) { el.hidden = true; });
    document.querySelectorAll("[data-stream-final]").forEach(function (el) { el.hidden = false; });
    document.querySelectorAll(".composer-input[disabled]").forEach(function (el) {
      el.disabled = false;
    });
    document.querySelectorAll(".composer-meta .btn[disabled]").forEach(function (el) {
      el.disabled = false;
    });
  }

  /* ------------------------------------------------------------- boot */

  function boot() {
    injectSprite();
    initTheme();
    initPanels();
    initDialogs();
    initTabs();
    initCitations();
    initComposer();
    initStream();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

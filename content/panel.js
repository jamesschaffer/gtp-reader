// GTP-Reader in-page floating panel (headline + tone + bullets)
// Panel auto-sizes to content height (no scrollbars).

(() => {
  if (window.__gtpReaderPanelInstalled) return;
  window.__gtpReaderPanelInstalled = true;

  const PANEL_ID = "gtp-reader-panel-root";

  function ensurePanel() {
    let host = document.getElementById(PANEL_ID);
    if (host) return host;

    host = document.createElement("div");
    host.id = PANEL_ID;
    host.style.position = "fixed";
    host.style.top = "12px";
    host.style.right = "12px";
    host.style.zIndex = "2147483646";
    host.style.width = "420px";
    host.style.maxWidth = "92vw";
    host.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, "Noto Sans", Arial';
    host.style.border = "1px solid rgba(0,0,0,0.1)";
    host.style.borderRadius = "12px";
    host.style.boxShadow = "0 8px 28px rgba(0,0,0,0.18)";
    host.style.background = "#fff";

    const shadow = host.attachShadow({ mode: "open" });

    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        .wrap { font: 14px/1.55 system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, "Noto Sans", Arial; color: #111; background: #fff; }
        header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #eee; }
        header .title { font-size: 13px; font-weight: 600; color: #111; }
        header .host { font-size: 12px; color: #666; margin-left: 8px; }
        header .actions { display: flex; align-items: center; gap: 6px; }
        button.icon { border: none; background: transparent; padding: 6px; cursor: pointer; border-radius: 8px; }
        button.icon:hover { background: #f2f2f2; }

        .body { padding: 12px 14px 14px; }
        .status { padding: 8px 10px; background: #f7f7f8; border: 1px solid #eee; border-radius: 8px; color: #333; }

        .headline { font-size: 15px; font-weight: 600; margin: 0 0 4px; line-height: 1.45; }
        .tone { margin: 0 0 10px; font-size: 12px; color: #666; }
        .tone strong { color: #333; }

        ul { margin: 8px 0 0 18px; padding: 0; }
        li { margin: 6px 0; }

        .hidden { display: none; }
      </style>
      <div class="wrap">
        <header>
          <div class="title">GTP-Reader <span class="host"></span></div>
          <div class="actions">
            <button class="icon" title="Close" aria-label="Close" id="closeBtn">✕</button>
          </div>
        </header>
        <div class="body">
          <div class="status" id="status">Summarizing…</div>
          <h3 id="headline" class="headline hidden"></h3>
          <div id="tone" class="tone hidden"></div>
          <ul id="bullets" class="hidden"></ul>
        </div>
      </div>
    `;

    document.documentElement.appendChild(host);

    const api = {
      setHost: (hostname) => {
        const h = shadow.querySelector(".host");
        h.textContent = hostname ? `· ${hostname}` : "";
      },
      setStatus: (msg) => {
        const s = shadow.getElementById("status");
        s.textContent = msg;
        s.classList.remove("hidden");
      },
      renderSummary: (headline, lines, tone) => {
        const s = shadow.getElementById("status");
        const h = shadow.getElementById("headline");
        const ul = shadow.getElementById("bullets");
        const t = shadow.getElementById("tone");

        // headline
        h.textContent = headline || "";
        h.classList.toggle("hidden", !headline);

        // tone
        t.innerHTML = tone ? `Tone: <strong>${tone}</strong>` : "";
        t.classList.toggle("hidden", !tone);

        // bullets (cap at 7)
        ul.innerHTML = "";
        (lines || []).slice(0, 7).forEach((line) => {
          const li = document.createElement("li");
          li.textContent = line;
          ul.appendChild(li);
        });
        ul.classList.toggle("hidden", !lines || lines.length === 0);

        s.classList.add("hidden");

        // auto-resize panel height to fit content
        host.style.height = "auto";
      },
      destroy: () => { host.remove(); window.__gtpReaderPanelInstalled = false; }
    };

    shadow.getElementById("closeBtn").addEventListener("click", api.destroy);
    host.__gtpApi = api;
    return host;
  }

  function getApi() {
    const host = ensurePanel();
    return host.__gtpApi;
  }

  function parseSummary(raw) {
    const out = { headline: "", bullets: [], tone: "" };
    if (!raw) return out;

    const lines = raw.split(/\r?\n/).map(l => l.trim());

    const hIdx = lines.findIndex(l => l.toUpperCase().startsWith("HEADLINE:"));
    if (hIdx !== -1) out.headline = lines[hIdx].slice("HEADLINE:".length).trim();

    for (const l of lines) {
      if (/^- /.test(l)) out.bullets.push(l.replace(/^- /, "").trim());
    }

    const tIdx = lines.findIndex(l => l.toUpperCase().startsWith("TONE:"));
    if (tIdx !== -1) out.tone = lines[tIdx].slice("TONE:".length).trim();

    return out;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return;
    const api = getApi();

    if (msg.type === "GTP_PANEL_INIT") {
      try {
        const url = msg.url || "";
        let host = "";
        try { host = new URL(url).hostname; } catch {}
        api.setHost(host);
        api.setStatus("Summarizing…");
      } catch (e) {
        console.error("[GTP-Reader panel] init error", e);
      }
    }

    if (msg.type === "GTP_PANEL_SUMMARY") {
      try {
        const raw = (msg.data?.raw || "").trim();
        const parsed = parseSummary(raw);
        if (parsed.headline || parsed.bullets.length || parsed.tone) {
          api.renderSummary(parsed.headline, parsed.bullets, parsed.tone);
        } else {
          api.setStatus("No summary available.");
        }
      } catch (e) {
        console.error("[GTP-Reader panel] render error", e);
        api.setStatus("Render error.");
      }
    }

    if (msg.type === "GTP_PANEL_ERROR") {
      api.setStatus(msg.error || "Error");
    }
  });
})();
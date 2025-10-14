// sw.js — Chrome Extension Service Worker (Manifest V3)

// Create and persist a per-install token so your proxy can identify this install.
async function getInstallToken() {
  const { installToken } = await chrome.storage.local.get("installToken");
  if (installToken) return installToken;
  const token = crypto.randomUUID();
  await chrome.storage.local.set({ installToken: token });
  return token;
}

// Ensure an install token exists and clean up any old per-user API key.
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await getInstallToken();
    const { openaiApiKey } = await chrome.storage.local.get("openaiApiKey");
    if (openaiApiKey) {
      await chrome.storage.local.remove("openaiApiKey");
      await chrome.storage.local.set({ migratedFromUserKey: true });
    }
  } catch (e) {
    await chrome.storage.local.set({ installBootstrapError: String(e?.message || e) });
  }
});

// (Optional) liveness ping
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "ping") {
    sendResponse({ ok: true, ts: Date.now() });
    return true;
  }
});

// Context menu
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: "gtp-reader-summarize",
      title: "Summarize this page (GTP Reader)",
      contexts: ["page"]
    });
  } catch {}
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "gtp-reader-summarize" || !tab?.id) return;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async () => {
      // ---------- Overlay ----------
      const existing = document.getElementById("gtp-reader-overlay");
      if (existing) existing.remove();

      const overlay = document.createElement("div");
      overlay.id = "gtp-reader-overlay";
      Object.assign(overlay.style, {
        position: "fixed",
        top: "16px",
        right: "16px",
        width: "480px",
        maxHeight: "72vh",
        overflow: "auto",
        background: "#fff",
        color: "#111",
        border: "1px solid #e5e7eb",
        borderRadius: "14px",
        boxShadow: "0 10px 30px rgba(0,0,0,.15)",
        padding: "16px",
        font: "16px/1.65 system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'",
        zIndex: 2147483647
      });

      const close = document.createElement("button");
      close.textContent = "×";
      Object.assign(close.style, {
        position: "absolute",
        top: "6px",
        right: "8px",
        border: "none",
        background: "transparent",
        fontSize: "28px",
        cursor: "pointer",
        lineHeight: "1",
        padding: "12px"
      });
      close.onclick = () => overlay.remove();

      const header = document.createElement("div");
      Object.assign(header.style, {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "8px"
      });

      const title = document.createElement("h1");
      title.textContent = "GTP Reader";
      Object.assign(title.style, {
        fontSize: "1.25rem",
        margin: "0 0 .25rem",
        fontWeight: "700"
      });

      const headlineEl = document.createElement("div");
      Object.assign(headlineEl.style, {
        fontSize: "1rem",
        fontWeight: "600",
        lineHeight: "1.5",      // tighter line-height
        marginBottom: "1.2rem"  // more breathing room under headline
      });

      const toneEl = document.createElement("span");
      Object.assign(toneEl.style, {
        display: "none",        // hidden until we have tone
        fontSize: "0.9rem",
        background: "#f1f5f9",
        border: "1px solid #e2e8f0",
        color: "#334155",
        padding: "4px 12px",
        borderRadius: "999px",
        marginBottom: "10px"
      });

      const listEl = document.createElement("ul");
      Object.assign(listEl.style, {
        margin: ".5rem 0 0 1.25rem",
        padding: "0"
      });

      // Pre-loader chip (animated dots)
      const statusEl = document.createElement("div");
      Object.assign(statusEl.style, {
        color: "#374151",
        fontSize: "0.9rem",
        padding: ".5rem .75rem",
        background: "#f3f4f6",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        margin: "0",
        display: "inline-block"
      });
      let dots = 0;
      const tick = () => {
        const seq = ".".repeat((dots++ % 3) + 1);
        statusEl.textContent = `Summarizing your article, please wait${seq}`;
      };
      tick();
      const statusTimer = setInterval(tick, 400);

      header.appendChild(title);
      overlay.appendChild(header);
      overlay.appendChild(close);
      overlay.appendChild(statusEl);  // visible while streaming
      overlay.appendChild(headlineEl);
      overlay.appendChild(toneEl);
      overlay.appendChild(listEl);
      document.documentElement.appendChild(overlay);

      // Helper for error messages (reuses the chip styling)
      function showError(message) {
        clearInterval(statusTimer);
        statusEl.textContent = message;
        Object.assign(statusEl.style, {
          background: "#fef2f2",
          borderColor: "#fecaca",
          color: "#991b1b"
        });
      }

      // ---------- Gather page text ----------
      const article = document.querySelector("article");
      const grab = (el) =>
        (el?.innerText || el?.textContent || "").replace(/\s+\n/g, "\n").trim();
      const raw = grab(article) || grab(document.body);
      const pageText = raw.slice(0, 20000);
      if (!pageText || pageText.length < 200) {
        showError("Sorry—couldn’t read enough content from this page.");
        return;
      }

      // ---------- Request JSON summary ----------
      const PROXY_URL = "https://gtp-reader-ai-proxy.jamesschaffer.workers.dev";
      const sys = `
You are a summarizer for busy professionals. Return STRICT JSON only (no markdown, no extra keys) with:
- "headline": string — one sentence in sentence case that captures the article’s essence/thesis. If opinionated or lopsided, make that explicit (e.g., "Opinion: …", "The author argues that …"). If the argument appears weak or implausible, briefly signal that without snark.
- "bullets": array — up to 7 concise, well-written bullets. Each bullet must be a complete sentence focusing on facts, key claims, evidence, or implications. No fluff. No invented details. Attribute uncertainty or speculation (e.g., "The author suggests…", "Cites unverified claims…").
- "tone": string — 1–2 words characterizing the stance (e.g., balanced, critical, optimistic, alarmed, skeptical, concerned).
Rules:
- Do not add facts that aren’t present.
- Be clear and specific; avoid generic phrasing.
- The JSON must parse cleanly in one object. No surrounding text.
      `.trim();

      const usr = `Summarize this page content:\n\n${pageText}`;

      try {
        const res = await fetch(PROXY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Install-Token": "context-menu",
            "X-Ext-Id": chrome.runtime?.id || ""
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0.2,
            max_tokens: 700,
            messages: [
              { role: "system", content: sys },
              { role: "user", content: usr }
            ]
          })
        });

        if (!res.ok || !res.body) {
          showError(`Proxy error: ${res.status}`);
          return;
        }

        // Accumulate full SSE stream, then parse JSON once at end
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let rawText = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line || !line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") {
              buffer = "";
              break;
            }
            try {
              const json = JSON.parse(payload);
              const delta = json?.choices?.[0]?.delta?.content;
              if (typeof delta === "string") rawText += delta;
            } catch {}
          }
        }

        // Parse JSON from the accumulated text
        let data;
        try {
          const start = rawText.indexOf("{");
          const end = rawText.lastIndexOf("}");
          const jsonSlice = start !== -1 && end !== -1 ? rawText.slice(start, end + 1) : rawText;
          data = JSON.parse(jsonSlice);
        } catch {
          showError("Parsing error — showing raw text below.");
          headlineEl.textContent = "";
          toneEl.textContent = "";
          listEl.innerHTML = "";
          const rawDiv = document.createElement("div");
          rawDiv.style.whiteSpace = "pre-wrap";
          rawDiv.textContent = rawText || "(no content)";
          listEl.appendChild(rawDiv);
          return;
        }

        // Render
        clearInterval(statusTimer);
        statusEl.remove(); // hide the loader

        const headlineRaw = data?.headline || "Summary";
        headlineEl.textContent = headlineRaw.replace(/\.$/, ""); // no trailing period

        if (data?.tone) {
          toneEl.innerHTML = `<strong>tone:</strong> ${data.tone}`;
          toneEl.style.display = "inline-block";
        } else {
          toneEl.style.display = "none";
        }

        listEl.innerHTML = "";
        const bullets = Array.isArray(data?.bullets) ? data.bullets : [];
        for (const b of bullets) {
          const li = document.createElement("li");
          li.style.margin = ".25rem 0";
          li.textContent = b;
          listEl.appendChild(li);
        }
        if (!bullets.length) {
          const li = document.createElement("li");
          li.style.margin = ".25rem 0";
          li.textContent = "No bullet points returned.";
          listEl.appendChild(li);
        }
      } catch (e) {
        showError(`Error: ${e?.message || e}`);
      }
    }
  });
});
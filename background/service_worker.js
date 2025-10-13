// GTP-Reader — background/service worker (v0.3.0)
// In-page floating panel + headline/bullets/tone summary.
// Uses your Options-stored OpenAI API key (chrome.storage.local).

const MENU_ID = "gtp-reader-extract";

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Open in GTP-Reader (Summary)",
      contexts: ["all"]
    });
    console.log("[GTP-Reader] context menu registered");
  } catch (e) {
    console.error("[GTP-Reader] context menu error:", e);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;

  try {
    console.log("[GTP-Reader] starting extraction on tab", tab.id, tab.url);

    // 1) Ensure the panel content script is injected
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/panel.js"]
    });

    // 2) Tell the panel to show "Summarizing…" immediately
    chrome.tabs.sendMessage(tab.id, {
      type: "GTP_PANEL_INIT",
      url: tab.url
    });

    // 3) Extract the article text in-page (no scrolling, no overlays)
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: extractMainPayload
    });
    const payload = result || { html: "", textExact: "" };
    console.log("[GTP-Reader] extraction done, text length:", (payload.textExact || "").length);

    // 4) Get API key + model and call OpenAI for the summary
    const { openaiApiKey, openaiModel } = await chrome.storage.local.get({
      openaiApiKey: "",
      openaiModel: "gpt-4o-mini"
    });
    if (!openaiApiKey) {
      chrome.tabs.sendMessage(tab.id, {
        type: "GTP_PANEL_ERROR",
        error: "OpenAI API key not set. Open the extension's Options and save your key."
      });
      return;
    }

    const summary = await runLLMSummary(payload.textExact, openaiApiKey, openaiModel);
    console.log("[GTP-Reader] summary completed");

    // 5) Send the structured result to the panel to render
    chrome.tabs.sendMessage(tab.id, {
      type: "GTP_PANEL_SUMMARY",
      data: {
        sourceUrl: tab.url,
        raw: summary.raw // keep raw in case you want to display later
      }
    });
  } catch (err) {
    console.error("[GTP-Reader] error:", err);
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "GTP_PANEL_ERROR",
        error: String(err && err.message ? err.message : err)
      });
    }
  }
});

// ---- Extraction (verbatim text) ----
function extractMainPayload() {
  const textScore = (el) => (el.innerText || "").replace(/\s+/g, " ").trim().length;
  const candidates = [];

  const selectors = [
    "article",
    "main",
    "[role=main]",
    ".article, .post, .entry, .content, .article__body, .post__content"
  ].join(",");
  document.querySelectorAll(selectors).forEach((el) => candidates.push(el));

  const divs = Array.from(document.querySelectorAll("div"))
    .filter((d) => d.childElementCount > 0 && getComputedStyle(d).display !== "none")
    .slice(0, 2000);

  let bestDiv = null, bestScore = 0;
  for (const d of divs) {
    const score = textScore(d);
    if (score > bestScore) { bestScore = score; bestDiv = d; }
  }
  if (bestDiv) candidates.push(bestDiv);

  let best = candidates
    .map((el) => ({ el, score: textScore(el) }))
    .sort((a, b) => b.score - a.score)[0]?.el || document.body;

  // Remove obvious junk (scripts/iframes) but keep user-facing text intact
  const killSelectors = [
    "noscript, script, style, iframe",
    ".share, .comments, .newsletter, .promo, .advert, .ad, .ads, .subscribe"
  ].join(",");
  best.querySelectorAll(killSelectors).forEach((n) => n.remove());

  const textExact = best.innerText || "";
  const html = best.outerHTML || "";
  return { html, textExact };
}

// ---- LLM summary with your new prompt contract ----
async function runLLMSummary(articleText, key, model) {
  const sys =
`You are a summarizer for busy professionals. Produce:
1) A single headline sentence in sentence case that captures the article’s essence/thesis. If the piece is opinionated or lopsided, make that explicit (e.g., "Opinion: …", "The author argues that …"). If the argument appears weak or absurd, briefly signal that in the headline without snark.
2) Up to 7 concise supporting bullets, each a complete sentence that directly supports the headline and focuses on facts, key claims, evidence, or implications. No fluff, no invented details.
3) A final tone label (1–2 words) that characterizes the piece’s stance (e.g., balanced, critical, optimistic, alarmed, skeptical).

Rules:
- Do not add facts that aren’t present.
- Attribute uncertainty or speculation ("The author suggests…", "Cites unverified claims…").
- Plain text only. No code fences. Use a leading "- " for bullets.
- Output must follow this exact format:

HEADLINE: <one-sentence headline in sentence case>

- <bullet 1>
- <bullet 2>
- …
- <bullet N>

TONE: <one or two words>`;

  const usr =
`Summarize the following ARTICLE according to the format and rules you were given.
Do not rewrite the ARTICLE text itself; only produce the headline, supporting bullets, and tone label.

ARTICLE:
\`\`\`
${(articleText || "").slice(0, 20000)}
\`\`\``;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
      temperature: 0.2,
      max_tokens: 800
    })
  });

  if (!res.ok) throw new Error(`OpenAI summary failed: ${res.status}`);
  const data = await res.json();
  const raw = (data.choices?.[0]?.message?.content || "").trim();
  return { raw };
}
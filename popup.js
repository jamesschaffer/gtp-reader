// popup.js — summarize the current tab using your Cloudflare proxy (SSE parsed)
import { streamChat } from "./proxy-api.js";

const btn = document.getElementById("test");
const out = document.getElementById("output");

// Grab visible text from the active tab (runs in the page context)
async function getActiveTabText() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");
  const [{ result: text }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const article = document.querySelector("article");
      const grab = (el) =>
        (el?.innerText || el?.textContent || "").replace(/\s+\n/g, "\n").trim();
      const raw = grab(article) || grab(document.body);
      return raw.slice(0, 20000); // cap to ~20k chars
    },
  });
  return text || "";
}

btn.addEventListener("click", async () => {
  out.textContent = "Reading page…";

  try {
    const pageText = await getActiveTabText();
    if (!pageText || pageText.length < 200) {
      out.textContent =
        "Sorry—couldn’t read enough content from this page. Try a standard article.";
      return;
    }

    out.textContent = "Summarizing… (streaming)";

    const sys =
      "You are a concise news/knowledge summarizer. Write 5 crisp bullet points capturing the core ideas. Avoid fluff. If the text seems non-article (navigation, ads), say so.";
    const usr = `Summarize the following page content in 5 bullets:\n\n${pageText}`;

    const stream = await streamChat({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      max_tokens: 500,
      temperature: 0.2,
    });

    // ---- Parse SSE 'data: ...' lines from the raw chunk stream ----
    out.textContent = "";
    let buffer = "";
    let done = false;

    for await (const chunk of stream) {
      if (done) break;
      buffer += chunk;

      // Process complete lines; keep remainder in buffer
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);

        if (!line) continue; // skip blanks
        if (!line.startsWith("data:")) continue;

        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          done = true;
          break;
        }

        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content;
          if (delta) out.textContent += delta;
        } catch {
          // ignore non-JSON lines
        }
      }
    }
  } catch (err) {
    out.textContent = `Error: ${err?.message || err}`;
  }
});